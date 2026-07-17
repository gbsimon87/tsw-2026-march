const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { findSharedEventIds } = require('../feed/feed.repository');
const { ApiError } = require('../../utils/apiError');
const { buildCursorPage } = require('../../utils/pagination');
const { logger } = require('../../config/logger');
const { env } = require('../../config/env');
const { findTeamByIdAndOwner, findTeamById } = require('../teams/teams.repository');
const {
  createGame,
  listGamesByOwner,
  findGameById,
  saveGame,
  claimGameSummaryGeneration,
  releaseGameSummaryLock,
  saveGameSummary,
} = require('./games.repository');
const { STAT_TYPES, TEAM_SIDES } = require('../shared/stats.constants');
const {
  summarizeEvents,
  summarizeEventsBySide,
  createEmptyPlayerStatLine,
  applyEventToPlayerStatLine,
} = require('../shared/statSummary');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { getBillingSummary, getLeagueBillingSummary } = require('../billing/billing.service');
const { resolveForTeam, resolveForLeague } = require('../billing/entitlements.service');
const { buildGameRecap } = require('./gameRecap.service');
const { buildPersistedGameSummary } = require('./gameSummaryAi.service');
const {
  getLeagueContextForGame,
  getLeagueRosterSnapshotForTeam,
  getLeagueTeamRosterSnapshotForGame,
  canManageLeagueGame,
  canFinalizeLeagueGame,
  scheduleLeagueAggregateRecompute,
} = require('../leagues/leagues.service');
const { findLeagueTeamById, findLeagueById } = require('../leagues/leagues.repository');

function sanitizeEvent(event) {
  return {
    id: String(event._id),
    playerId: event.playerId ? String(event.playerId) : null,
    relatedPlayerId: event.relatedPlayerId ? String(event.relatedPlayerId) : null,
    teamSide: event.teamSide || null,
    relatedTeamSide: event.relatedTeamSide || null,
    statType: event.statType,
    zoneId: event.zoneId ?? null,
    x: event.x ?? null,
    y: event.y ?? null,
    videoTimestamp: typeof event.videoTimestamp === 'number' ? event.videoTimestamp : null,
    occurredAt: event.occurredAt,
  };
}

const HIGHLIGHT_STAT_TYPES = new Set([
  'FG2_MADE',
  'FG2_MISS',
  'FG3_MADE',
  'FG3_MISS',
  'FT_MADE',
  'FT_MISS',
  'AST',
  'STL',
  'BLK',
]);

function buildPlayersByIdMap(game, participants, teamDoc) {
  const entries = [];
  if (game.trackingMode === 'dual_team') {
    for (const side of ['home', 'away']) {
      const roster = participants?.[side]?.rosterSnapshot || participants?.[side]?.players || [];
      for (const p of roster) {
        entries.push([String(p._id || p.id), p]);
      }
    }
  } else {
    const roster = game.rosterSnapshot?.length ? game.rosterSnapshot : teamDoc?.players || [];
    for (const p of roster) {
      entries.push([String(p._id || p.id), p]);
    }
  }
  return new Map(entries);
}

function buildGameHighlights(game, playersById) {
  if (!game.videoUrl) return [];

  return (game.events || [])
    .filter(
      (ev) =>
        ev.playerId &&
        HIGHLIGHT_STAT_TYPES.has(ev.statType) &&
        typeof ev.videoTimestamp === 'number'
    )
    .map((ev) => {
      const player = playersById.get(String(ev.playerId));
      return {
        eventId: String(ev._id),
        playerId: String(ev.playerId),
        playerName: player?.displayName || null,
        leaguePlayerId: player?.leaguePlayerId ? String(player.leaguePlayerId) : null,
        teamSide: ev.teamSide || null,
        statType: ev.statType,
        videoTimestamp: ev.videoTimestamp,
        videoUrl: game.videoUrl,
        gameTitle: game.title || null,
      };
    });
}

function sanitizeLogo(logo) {
  if (!logo?.url) {
    return null;
  }

  return {
    url: transformCloudinaryUrl(logo.url),
    width: logo.width ?? null,
    height: logo.height ?? null,
  };
}

function sanitizePlayer(player) {
  const id = player._id || player.id || player.sourcePlayerId || player.leaguePlayerId;

  return {
    id: String(id),
    leaguePlayerId: player.leaguePlayerId ? String(player.leaguePlayerId) : null,
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: player.position ?? null,
    isActive: Boolean(player.isActive),
  };
}

function sanitizeParticipant(participant) {
  if (!participant) {
    return null;
  }

  return {
    side: participant.side,
    participantType: participant.participantType,
    teamId: participant.teamId ? String(participant.teamId) : null,
    leagueTeamId: participant.leagueTeamId ? String(participant.leagueTeamId) : null,
    slug: participant.slug || null,
    displayName: participant.displayName,
    logo: sanitizeLogo(participant.logo),
    colors: Array.isArray(participant.colors) ? participant.colors : [],
    billing: participant.billingSnapshot ?? null,
    entitlements: participant.entitlementsSnapshot ?? null,
  };
}

function sanitizeAiSummary(summary) {
  if (!summary?.text) {
    return null;
  }

  return {
    text: summary.text,
    source: summary.source || 'fallback',
    generatedAt: summary.generatedAt || null,
  };
}

function clearAiSummaryAfterCompletedLeagueEdit(game) {
  if (game.gameContext === 'league' && game.status === 'completed' && game.aiSummary?.text) {
    game.aiSummary = null;
  }
}

// OPT-010: after a league game's result changes, schedule a post-response
// recompute of that league's materialised aggregates (standings). No-op for
// standalone games. Only completed games affect standings, but we also trigger
// on delete/finish where the completed set changes.
function scheduleLeagueRecomputeForGame(game) {
  if (game.gameContext === 'league' && game.leagueId) {
    scheduleLeagueAggregateRecompute(game.leagueId, game.seasonId);
  }
}

// OPT-013: after a standalone one-sided game's result changes, schedule a
// post-response recompute of that team's materialised season summary.
// buildPublicTeamSummary (the compute this materialises) is scoped to
// `listGamesByTeamId` (games.teamId), which only one_sided standalone games
// populate — dual_team standalone games are looked up via homeTeamId/awayTeamId
// (listGamesByStandaloneParticipantTeamId) and never appear in that summary, so
// they're excluded here too. League games affect leaguestandings/
// leagueplayerstats instead (scheduleLeagueRecomputeForGame). Required lazily
// to avoid a require cycle — teams.service.js requires games.service.js for
// computeBoxScore.
function scheduleTeamSummaryRecomputeForGame(game) {
  if (game.gameContext === 'standalone' && game.trackingMode === 'one_sided' && game.teamId) {
    const { scheduleTeamSeasonSummaryRecompute } = require('../teams/teams.service');
    scheduleTeamSeasonSummaryRecompute(game.teamId);
  }
}

// OPT-017: after a game's result changes, refresh any shared feed cards that
// snapshot its score — otherwise a card posted before the game finished (or
// edited afterwards) shows a stale score forever. Post-response, non-blocking,
// errors logged not thrown (same shape as the other recompute schedulers).
// Lazy require to avoid a cycle — feed.service.js requires games.service.js
// for getPublicGame/canAccessGame.
function scheduleFeedCardRefreshForGame(gameId) {
  if (!gameId) return;
  setImmediate(() => {
    const { refreshGameCardPostsForGame } = require('../feed/feed.service');
    refreshGameCardPostsForGame(gameId).catch((error) => {
      logger.error(
        { err: error, gameId: String(gameId) },
        'Post-response feed card refresh failed'
      );
    });
  });
}

// Auto Feed Generation (docs/auto-feed-generation/000-TRACKER.md): after a
// game finishes, offer it to the feed's auto-publish gate. Post-response,
// non-blocking, errors logged not thrown — same shape as the other
// finish-time schedulers above. The public-league restriction and all
// publish/idempotency logic live in feed.service.js#autoPublishForFinalizedGame;
// this scheduler only decides *when* to call it. Lazy require to avoid a
// cycle — feed.service.js requires games.service.js for getPublicGame/
// canAccessGame/HIGHLIGHT_STAT_TYPES.
function scheduleAutoFeedForGame(gameId) {
  if (!env.AUTO_FEED_ENABLED || !gameId) return;
  setImmediate(() => {
    const { autoPublishForFinalizedGame } = require('../feed/feed.service');
    autoPublishForFinalizedGame(gameId).catch((error) => {
      logger.error(
        { err: error, gameId: String(gameId) },
        'Post-response auto feed publish failed'
      );
    });
  });
}

// OPT-020: generate the league AI summary AFTER the finish response is sent.
// OpenAI can take several seconds, so blocking the finish request on it made
// finishing a game feel slow. The claim is atomic (with a stale-lock TTL) so
// concurrent finishes don't double-generate; on failure the lock is released
// so a later finish can retry immediately instead of waiting out the TTL.
// `deps` is injectable purely so tests can drive this deterministically.
function scheduleGameSummaryGeneration(game, { recap, boxScore }) {
  setImmediate(async () => {
    const summaryLockId = randomUUID();
    let claimed = false;
    try {
      const claimedGame = await claimGameSummaryGeneration(game._id, summaryLockId);
      if (!claimedGame) return; // another worker owns it, or it's already done
      claimed = true;
      const summary = await buildPersistedGameSummary(game, { recap, boxScore });
      await saveGameSummary(game._id, summaryLockId, summary);
    } catch (error) {
      logger.error(
        { err: error, gameId: String(game._id) },
        'Post-response AI summary generation failed'
      );
      if (claimed) {
        // Release so a subsequent finish/retry can re-claim without waiting for
        // the lock TTL to expire.
        await releaseGameSummaryLock(game._id, summaryLockId).catch((releaseError) => {
          logger.error(
            { err: releaseError, gameId: String(game._id) },
            'Failed to release AI summary lock after generation error'
          );
        });
      }
    }
  });
}

// OPT-015: save an event mutation, translating Mongoose's optimistic-
// concurrency VersionError (thrown when another request saved this doc after
// it was loaded here — the classic co-tracker race) into a clear, retryable
// 409 instead of either a confusing 500 or a silent last-write-wins clobber.
async function saveGameEventMutation(game) {
  try {
    await saveGame(game);
  } catch (error) {
    if (error.name === 'VersionError') {
      throw new ApiError(409, 'This game was updated by someone else. Reload and try again.');
    }
    throw error;
  }
}

function sanitizeGame(game, options = {}) {
  return {
    id: String(game._id),
    ...(options.includeOwnerUserId ? { ownerUserId: String(game.ownerUserId) } : {}),
    teamId: game.teamId ? String(game.teamId) : null,
    gameContext: game.gameContext || 'standalone',
    trackingMode: game.trackingMode || 'one_sided',
    leagueId: game.leagueId ? String(game.leagueId) : null,
    seasonId: game.seasonId ? String(game.seasonId) : null,
    homeLeagueTeamId: game.homeLeagueTeamId ? String(game.homeLeagueTeamId) : null,
    awayLeagueTeamId: game.awayLeagueTeamId ? String(game.awayLeagueTeamId) : null,
    trackedLeagueTeamId: game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null,
    homeTeamId: game.homeTeamId ? String(game.homeTeamId) : null,
    awayTeamId: game.awayTeamId ? String(game.awayTeamId) : null,
    initialActiveSide: game.initialActiveSide || TEAM_SIDES.HOME,
    activeSideDefault: game.initialActiveSide || TEAM_SIDES.HOME,
    homeParticipant: sanitizeParticipant(game.homeParticipant),
    awayParticipant: sanitizeParticipant(game.awayParticipant),
    title: game.title,
    opponent: game.opponent ?? null,
    videoUrl: game.videoUrl ?? null,
    status: game.status,
    startingLineupPlayerIds: Array.isArray(game.startingLineupPlayerIds)
      ? game.startingLineupPlayerIds.map(String)
      : [],
    currentLineupPlayerIds: Array.isArray(game.currentLineupPlayerIds)
      ? game.currentLineupPlayerIds.map(String)
      : [],
    homeStartingLineupPlayerIds: Array.isArray(game.homeStartingLineupPlayerIds)
      ? game.homeStartingLineupPlayerIds.map(String)
      : [],
    homeCurrentLineupPlayerIds: Array.isArray(game.homeCurrentLineupPlayerIds)
      ? game.homeCurrentLineupPlayerIds.map(String)
      : [],
    awayStartingLineupPlayerIds: Array.isArray(game.awayStartingLineupPlayerIds)
      ? game.awayStartingLineupPlayerIds.map(String)
      : [],
    awayCurrentLineupPlayerIds: Array.isArray(game.awayCurrentLineupPlayerIds)
      ? game.awayCurrentLineupPlayerIds.map(String)
      : [],
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    events: (game.events || []).map(sanitizeEvent),
    aiSummary: sanitizeAiSummary(game.aiSummary),
  };
}

function getTeamPlayers(team, options = {}) {
  const players = Array.isArray(team?.players) ? team.players : [];
  return options.includeInactivePlayers ? players : players.filter((player) => player.isActive);
}

function findTeamPlayerById(team, playerId) {
  if (typeof team?.players?.id === 'function') {
    return team.players.id(playerId);
  }

  return (
    (Array.isArray(team?.players) ? team.players : []).find(
      (player) => String(player._id || player.id || player.sourcePlayerId) === String(playerId)
    ) || null
  );
}

// OPT-006: delegate to the shared player-line accumulator. Game box scores
// always carry a leaguePlayerId field, so include it here.
function emptyStats(playerId, displayName, options = {}) {
  return createEmptyPlayerStatLine(playerId, displayName, {
    includeLeaguePlayerId: true,
    leaguePlayerId: options.leaguePlayerId,
  });
}

function applyEventToRow(row, statType) {
  applyEventToPlayerStatLine(row, statType);
}

function isOpponentEvent(statType) {
  return (
    statType === STAT_TYPES.OPP_FT_MADE ||
    statType === STAT_TYPES.OPP_FG2_MADE ||
    statType === STAT_TYPES.OPP_FG3_MADE ||
    statType === STAT_TYPES.OPP_REB
  );
}

function validateLineupPlayers(team, playerIds) {
  const uniquePlayerIds = [...new Set(playerIds.map(String))];
  if (uniquePlayerIds.length !== 5) {
    throw new ApiError(400, 'Starting lineup must include exactly 5 unique players');
  }

  for (const playerId of uniquePlayerIds) {
    const player = findTeamPlayerById(team, playerId);
    if (!player || !player.isActive) {
      throw new ApiError(400, 'Starting lineup must use active team players');
    }
  }

  return uniquePlayerIds;
}

function getDualLineupFieldName(side, kind) {
  if (side === TEAM_SIDES.HOME) {
    return kind === 'starting' ? 'homeStartingLineupPlayerIds' : 'homeCurrentLineupPlayerIds';
  }
  return kind === 'starting' ? 'awayStartingLineupPlayerIds' : 'awayCurrentLineupPlayerIds';
}

function recalculateCurrentLineup(game) {
  if (game.trackingMode === 'dual_team') {
    for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
      const startingField = getDualLineupFieldName(side, 'starting');
      const currentField = getDualLineupFieldName(side, 'current');
      let lineup = Array.isArray(game[startingField]) ? game[startingField].map(String) : [];

      for (const event of game.events || []) {
        if (event.teamSide !== side) {
          continue;
        }
        if (event.statType === STAT_TYPES.SUB_OUT && event.playerId) {
          lineup = lineup.filter((id) => id !== String(event.playerId));
          continue;
        }
        if (event.statType === STAT_TYPES.SUB_IN && event.playerId) {
          const playerId = String(event.playerId);
          if (!lineup.includes(playerId)) {
            lineup.push(playerId);
          }
        }
      }

      game[currentField] = lineup;
    }
    return;
  }

  let lineup = Array.isArray(game.startingLineupPlayerIds)
    ? game.startingLineupPlayerIds.map(String)
    : [];

  for (const event of game.events || []) {
    if (event.statType === STAT_TYPES.SUB_OUT && event.playerId) {
      lineup = lineup.filter((id) => id !== String(event.playerId));
      continue;
    }

    if (event.statType === STAT_TYPES.SUB_IN && event.playerId) {
      const playerId = String(event.playerId);
      if (!lineup.includes(playerId)) {
        lineup.push(playerId);
      }
    }
  }

  game.currentLineupPlayerIds = lineup;
}

function buildGameSummary(game) {
  if (game.trackingMode === 'dual_team') {
    const summary = summarizeEventsBySide(game.events);
    return {
      homePoints: summary.home.points,
      awayPoints: summary.away.points,
      teamPoints: summary.home.points,
      opponentPoints: summary.away.points,
      hasOpponentScore: summary.home.points > 0 || summary.away.points > 0,
    };
  }

  const summary = summarizeEvents(game.events);
  return {
    teamPoints: summary.points,
    opponentPoints: summary.opponentPoints || 0,
    hasOpponentScore: (summary.opponentPoints || 0) > 0,
  };
}

// OPT-008: compute the denormalised {home, away} final score for either
// tracking mode. For one_sided games the tracked team is "home" and the
// opponent is "away", matching how buildGameSummary maps teamPoints/opponentPoints.
function computeGameFinalScore(game) {
  if (game.trackingMode === 'dual_team') {
    const summary = summarizeEventsBySide(game.events);
    return { home: summary.home.points, away: summary.away.points };
  }
  const summary = summarizeEvents(game.events);
  return { home: summary.points, away: summary.opponentPoints || 0 };
}

// OPT-008: keep the denormalised eventCount in lockstep with the events array.
function syncGameEventCount(game) {
  game.eventCount = Array.isArray(game.events) ? game.events.length : 0;
}

// OPT-008: refresh finalScore for a game that is (or is being) completed.
function syncGameFinalScore(game) {
  game.finalScore = computeGameFinalScore(game);
}

// OPT-024: league games can't end in a tie. Checked wherever a final score is
// about to be (re)frozen for a league game — at finish time (before any
// mutation, so a rejected finalize leaves the game untouched) and after
// editing events on an already-completed game — so a tie can never be
// persisted as a final result, regardless of which path produced it.
function assertLeagueScoreNotTied(gameContext, finalScore) {
  if (gameContext !== 'league') return;
  const { home, away } = finalScore || {};
  if (home != null && away != null && home === away) {
    throw new ApiError(422, 'League games cannot end in a tie. Check the score before finalizing.');
  }
}

// OPT-008: call after any event-array mutation. eventCount tracks the array
// length on every save; finalScore is only refreshed for already-completed
// games (in-progress games get their score frozen at finish time).
function syncGameDenormalizedAfterEventChange(game) {
  syncGameEventCount(game);
  if (game.status === 'completed') {
    syncGameFinalScore(game);
    // OPT-024: editing events on an already-completed league game can
    // retroactively create a tie — re-check every time the score is refrozen.
    assertLeagueScoreNotTied(game.gameContext, game.finalScore);
  }
}

// OPT-012: refreeze boxScore + gameSummary after an edit to an already-completed
// game. Requires resolving team context (async), so this is a separate step
// from the sync helpers above — call it after the edit's own save. Only
// touches the fields it owns; the caller is responsible for saving.
async function refreezeGameBoxScoreIfCompleted(userId, game) {
  if (game.status !== 'completed') return;
  const { teamDoc, participants } = await resolveGameTeamContext(userId, game);
  game.boxScore =
    game.trackingMode === 'dual_team'
      ? computeBoxScore(game, null, { participants })
      : computeBoxScore(game, teamDoc);
  game.gameSummary = buildGameSummary(game);
  await saveGame(game);
}

function buildBoxScoreForSide(game, team, side) {
  const basePlayers = getTeamPlayers(team, { includeInactivePlayers: true });
  const map = new Map(
    basePlayers.map((player) => [
      String(player._id || player.id || player.sourcePlayerId),
      emptyStats(String(player._id || player.id || player.sourcePlayerId), player.displayName, {
        leaguePlayerId: player.leaguePlayerId,
      }),
    ])
  );

  for (const event of game.events || []) {
    if (event.teamSide !== side || !event.playerId) {
      continue;
    }
    const key = String(event.playerId);
    if (!map.has(key)) {
      map.set(key, emptyStats(key, `Unknown (${key.slice(-6)})`));
    }
    applyEventToRow(map.get(key), event.statType);
  }

  const players = Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const summary = summarizeEventsBySide(game.events)[side];

  return {
    players,
    totals: {
      ftm: summary.ft.made,
      fta: summary.ft.attempts,
      fg2m: summary.fg2.made,
      fg2a: summary.fg2.attempts,
      fg3m: summary.fg3.made,
      fg3a: summary.fg3.attempts,
      ast: players.reduce((total, row) => total + row.ast, 0),
      oreb: players.reduce((total, row) => total + row.oreb, 0),
      dreb: players.reduce((total, row) => total + row.dreb, 0),
      stl: players.reduce((total, row) => total + row.stl, 0),
      blk: players.reduce((total, row) => total + (row.blk || 0), 0),
      tov: players.reduce((total, row) => total + row.tov, 0),
      foul: players.reduce((total, row) => total + row.foul, 0),
      reb: players.reduce((total, row) => total + row.reb, 0),
      points: summary.points,
    },
  };
}

function computeBoxScore(game, team, options = {}) {
  if (game.trackingMode === 'dual_team' && options.participants) {
    return {
      home: buildBoxScoreForSide(game, options.participants.home.teamDoc, TEAM_SIDES.HOME),
      away: buildBoxScoreForSide(game, options.participants.away.teamDoc, TEAM_SIDES.AWAY),
    };
  }

  const basePlayers = getTeamPlayers(team, options);
  const map = new Map(
    basePlayers.map((player) => [
      String(player._id || player.id),
      emptyStats(String(player._id || player.id), player.displayName, {
        leaguePlayerId: player.leaguePlayerId,
      }),
    ])
  );

  for (const event of game.events || []) {
    if (isOpponentEvent(event.statType)) {
      continue;
    }

    const key = String(event.playerId);
    if (!map.has(key)) {
      map.set(key, emptyStats(key, `Unknown (${key.slice(-6)})`));
    }
    applyEventToRow(map.get(key), event.statType);
  }

  const players = Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const summary = summarizeEvents(game.events);

  return {
    players,
    teamTotals: {
      ftm: summary.ft.made,
      fta: summary.ft.attempts,
      fg2m: summary.fg2.made,
      fg2a: summary.fg2.attempts,
      fg3m: summary.fg3.made,
      fg3a: summary.fg3.attempts,
      ast: players.reduce((total, row) => total + row.ast, 0),
      oreb: players.reduce((total, row) => total + row.oreb, 0),
      dreb: players.reduce((total, row) => total + row.dreb, 0),
      stl: players.reduce((total, row) => total + row.stl, 0),
      blk: players.reduce((total, row) => total + (row.blk || 0), 0),
      tov: players.reduce((total, row) => total + row.tov, 0),
      foul: players.reduce((total, row) => total + row.foul, 0),
      reb: players.reduce((total, row) => total + row.reb, 0),
      points: summary.points,
    },
    opponentTotals: {
      points: summary.opponentPoints || 0,
    },
  };
}

async function assertTeamOwnership(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }
  return team;
}

async function canAccessStandaloneDualGame(userId, game) {
  if (String(game.ownerUserId) === String(userId)) {
    return true;
  }
  if (game.homeTeamId) {
    const team = await findTeamByIdAndOwner(game.homeTeamId, userId);
    if (team) {
      return true;
    }
  }
  if (game.awayTeamId) {
    const team = await findTeamByIdAndOwner(game.awayTeamId, userId);
    if (team) {
      return true;
    }
  }
  return false;
}

async function canEditStandaloneDualGame(userId, game) {
  return canAccessStandaloneDualGame(userId, game);
}

async function assertGameAccess(userId, gameId) {
  if (!mongoose.Types.ObjectId.isValid(gameId)) {
    throw new ApiError(404, 'Game not found');
  }

  const game = await findGameById(gameId);
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (!userId) {
    return game;
  }

  if (String(game.ownerUserId) === String(userId)) {
    return game;
  }

  if (game.trackingMode === 'dual_team' && game.gameContext === 'standalone') {
    if (await canAccessStandaloneDualGame(userId, game)) {
      return game;
    }
  }

  if (game.gameContext === 'league' && (await canManageLeagueGame(userId, game))) {
    return game;
  }

  throw new ApiError(404, 'Game not found');
}

async function canAccessGame(userId, game) {
  if (!userId || !game) return false;
  if (String(game.ownerUserId) === String(userId)) return true;
  if (game.trackingMode === 'dual_team' && game.gameContext === 'standalone') {
    if (await canAccessStandaloneDualGame(userId, game)) return true;
  }
  if (game.gameContext === 'league') {
    if (await canManageLeagueGame(userId, game)) return true;
  }
  return false;
}

function buildParticipantFromStandaloneTeam(team, side) {
  return {
    side,
    participantType: 'team',
    teamId: team._id,
    leagueTeamId: null,
    displayName: team.name,
    logo: sanitizeLogo(team.logo),
    colors: Array.isArray(team.colors) ? team.colors : [],
    billingSnapshot: getBillingSummary(team),
    // Freeze the full resolver-derived entitlement set at record time (T-13). Old
    // participants stored only {canViewReplay, canViewShotMaps}; readers default
    // absent keys to false. A later downgrade never retroactively locks this game.
    entitlementsSnapshot: resolveForTeam(team).entitlements,
  };
}

function buildRosterSnapshotFromStandaloneTeam(team) {
  return (team?.players || [])
    .filter((player) => player.isActive)
    .map((player) => ({
      sourceType: 'team_player',
      sourcePlayerId: player._id,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: player.position ?? null,
      claimedByUserId: null,
      isClaimed: false,
      isActive: Boolean(player.isActive),
    }));
}

function hasSnapshotPlayers(snapshot) {
  return Array.isArray(snapshot) && snapshot.length > 0;
}

function fillEmptySnapshot(game, fieldName, snapshot) {
  if (hasSnapshotPlayers(game[fieldName]) || !hasSnapshotPlayers(snapshot)) {
    return false;
  }

  game[fieldName] = snapshot;
  return true;
}

async function repairGameRosterSnapshots(game) {
  if (!game || game.status !== 'in_progress') {
    return false;
  }

  let repaired = false;

  if (game.trackingMode === 'dual_team') {
    if (game.gameContext === 'league') {
      const [homeSnapshot, awaySnapshot] = await Promise.all([
        !hasSnapshotPlayers(game.homeRosterSnapshot) && game.homeLeagueTeamId
          ? getLeagueRosterSnapshotForTeam(game.homeLeagueTeamId)
          : Promise.resolve([]),
        !hasSnapshotPlayers(game.awayRosterSnapshot) && game.awayLeagueTeamId
          ? getLeagueRosterSnapshotForTeam(game.awayLeagueTeamId)
          : Promise.resolve([]),
      ]);

      repaired = fillEmptySnapshot(game, 'homeRosterSnapshot', homeSnapshot) || repaired;
      repaired = fillEmptySnapshot(game, 'awayRosterSnapshot', awaySnapshot) || repaired;
    } else {
      const [homeTeam, awayTeam] = await Promise.all([
        !hasSnapshotPlayers(game.homeRosterSnapshot) && game.homeTeamId
          ? findTeamById(game.homeTeamId)
          : Promise.resolve(null),
        !hasSnapshotPlayers(game.awayRosterSnapshot) && game.awayTeamId
          ? findTeamById(game.awayTeamId)
          : Promise.resolve(null),
      ]);

      repaired =
        fillEmptySnapshot(
          game,
          'homeRosterSnapshot',
          buildRosterSnapshotFromStandaloneTeam(homeTeam)
        ) || repaired;
      repaired =
        fillEmptySnapshot(
          game,
          'awayRosterSnapshot',
          buildRosterSnapshotFromStandaloneTeam(awayTeam)
        ) || repaired;
    }
  } else if (game.gameContext === 'league' && !hasSnapshotPlayers(game.rosterSnapshot)) {
    const snapshot = game.trackedLeagueTeamId
      ? await getLeagueRosterSnapshotForTeam(game.trackedLeagueTeamId)
      : [];
    repaired = fillEmptySnapshot(game, 'rosterSnapshot', snapshot) || repaired;
  }

  if (repaired) {
    await saveGame(game);
  }

  return repaired;
}

function buildTeamDocFromSnapshot(participant, rosterSnapshot) {
  return {
    _id: participant.teamId || participant.leagueTeamId || participant.displayName,
    id: participant.teamId || participant.leagueTeamId || participant.displayName,
    name: participant.displayName,
    logo: participant.logo,
    plan: participant.billing?.plan || 'pro',
    subscriptionStatus: participant.billing?.subscriptionStatus || 'active',
    players: (rosterSnapshot || []).map((player) => ({
      _id: player._id || player.sourcePlayerId || player.leaguePlayerId,
      id: player._id || player.sourcePlayerId || player.leaguePlayerId,
      leaguePlayerId: player.leaguePlayerId || player._id || player.sourcePlayerId,
      sourcePlayerId: player.sourcePlayerId || player.leaguePlayerId,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: player.position ?? null,
      isActive: Boolean(player.isActive),
    })),
  };
}

async function resolveDualGameParticipants(game) {
  const home = sanitizeParticipant(game.homeParticipant);
  const away = sanitizeParticipant(game.awayParticipant);

  // Backfill slug for league games whose participants predate slug storage
  if (!home.slug && home.leagueTeamId) {
    const homeTeam = await findLeagueTeamById(home.leagueTeamId).catch(() => null);
    if (homeTeam?.slug) home.slug = homeTeam.slug;
  }
  if (!away.slug && away.leagueTeamId) {
    const awayTeam = await findLeagueTeamById(away.leagueTeamId).catch(() => null);
    if (awayTeam?.slug) away.slug = awayTeam.slug;
  }

  return {
    home: {
      ...home,
      teamDoc: buildTeamDocFromSnapshot(home, game.homeRosterSnapshot),
      players: (game.homeRosterSnapshot || []).map(sanitizePlayer),
    },
    away: {
      ...away,
      teamDoc: buildTeamDocFromSnapshot(away, game.awayRosterSnapshot),
      players: (game.awayRosterSnapshot || []).map(sanitizePlayer),
    },
  };
}

async function resolveGameTeamContext(userId, game) {
  await repairGameRosterSnapshots(game);

  if (game.trackingMode === 'dual_team') {
    const participants = await resolveDualGameParticipants(game);
    const viewerSide =
      game.gameContext === 'standalone' && userId
        ? (await findTeamByIdAndOwner(game.homeTeamId, userId))
          ? TEAM_SIDES.HOME
          : TEAM_SIDES.AWAY
        : game.initialActiveSide || TEAM_SIDES.HOME;
    const primary = participants[viewerSide];
    const secondary =
      participants[viewerSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME];
    let leagueContext = null;
    if (game.gameContext === 'league' && game.leagueId) {
      const leagueDoc = await findLeagueById(game.leagueId).catch(() => null);
      if (leagueDoc) {
        leagueContext = { id: String(leagueDoc._id), slug: leagueDoc.slug, name: leagueDoc.name };
      }
    }
    return {
      team: {
        id: primary.teamId || primary.leagueTeamId,
        name: primary.displayName,
        logo: primary.logo,
        billing: primary.billing || null,
        // Read the frozen snapshot; absent keys default to false (T-13). No hard-coded
        // 'pro' fallback — a missing snapshot must not grant premium views.
        entitlements: primary.entitlements || {},
        players: primary.players,
      },
      opponentTeam: {
        id: secondary.teamId || secondary.leagueTeamId,
        name: secondary.displayName,
        logo: secondary.logo,
        billing: secondary.billing || null,
        entitlements: secondary.entitlements || {},
        players: secondary.players,
      },
      participants,
      teamDoc: primary.teamDoc,
      league: leagueContext,
    };
  }

  if (game.gameContext === 'league') {
    const { league, trackedTeam, team } = await getLeagueTeamRosterSnapshotForGame(game);
    // Live league entitlements (T-13): a lapsed/free league correctly loses premium
    // views instead of the old hard-coded 'pro'. Comp leagues resolve via billingSource.
    return {
      team: {
        id: String(trackedTeam._id),
        slug: trackedTeam.slug,
        name: trackedTeam.name,
        logo: sanitizeLogo(trackedTeam.logo),
        billing: getLeagueBillingSummary(league),
        entitlements: resolveForLeague(league).entitlements,
        players: team.players.map(sanitizePlayer),
      },
      opponentTeam: null,
      participants: null,
      teamDoc: team,
      league,
    };
  }

  const team = await assertTeamOwnership(userId || game.ownerUserId, game.teamId);
  return {
    team: {
      id: String(team._id),
      name: team.name,
      logo: sanitizeLogo(team.logo),
      billing: getBillingSummary(team),
      entitlements: resolveForTeam(team).entitlements,
      players: team.players.map(sanitizePlayer),
    },
    opponentTeam: null,
    participants: null,
    teamDoc: team,
    league: null,
  };
}

async function createGameForUser(userId, payload) {
  if (payload.trackingMode === 'dual_team' && payload.homeTeamId && payload.awayTeamId) {
    const [homeTeam, awayTeam] = await Promise.all([
      assertTeamOwnership(userId, payload.homeTeamId).catch(() => findTeamById(payload.homeTeamId)),
      findTeamById(payload.awayTeamId),
    ]);
    if (!homeTeam || !awayTeam) {
      throw new ApiError(404, 'Team not found');
    }
    if (String(homeTeam._id) === String(awayTeam._id)) {
      throw new ApiError(400, 'Home and away teams must be different');
    }
    const canOwnHome = await findTeamByIdAndOwner(homeTeam._id, userId);
    const canOwnAway = await findTeamByIdAndOwner(awayTeam._id, userId);
    if (!canOwnHome && !canOwnAway) {
      throw new ApiError(403, 'Forbidden');
    }
    const game = await createGame({
      ownerUserId: userId,
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: homeTeam._id,
      awayTeamId: awayTeam._id,
      initialActiveSide: payload.initialActiveSide || TEAM_SIDES.HOME,
      homeParticipant: buildParticipantFromStandaloneTeam(homeTeam, TEAM_SIDES.HOME),
      awayParticipant: buildParticipantFromStandaloneTeam(awayTeam, TEAM_SIDES.AWAY),
      homeRosterSnapshot: buildRosterSnapshotFromStandaloneTeam(homeTeam),
      awayRosterSnapshot: buildRosterSnapshotFromStandaloneTeam(awayTeam),
      title: payload.title?.trim() || `${awayTeam.name} at ${homeTeam.name}`,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
      status: 'in_progress',
    });

    return sanitizeGame(game);
  }

  if (payload.trackingMode === 'dual_team' && payload.gameContext === 'league') {
    const context = await getLeagueContextForGame(
      userId,
      {
        ...payload,
        trackedLeagueTeamId:
          payload.initialActiveSide === TEAM_SIDES.AWAY
            ? payload.awayLeagueTeamId
            : payload.homeLeagueTeamId,
      },
      { allowManager: true }
    );
    const [homeRosterSnapshot, awayRosterSnapshot] = await Promise.all([
      getLeagueRosterSnapshotForTeam(context.homeTeam._id),
      getLeagueRosterSnapshotForTeam(context.awayTeam._id),
    ]);

    const game = await createGame({
      ownerUserId: userId,
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: payload.leagueId,
      seasonId: context.seasonId,
      homeLeagueTeamId: payload.homeLeagueTeamId,
      awayLeagueTeamId: payload.awayLeagueTeamId,
      trackedLeagueTeamId:
        payload.initialActiveSide === TEAM_SIDES.AWAY
          ? payload.awayLeagueTeamId
          : payload.homeLeagueTeamId,
      initialActiveSide: payload.initialActiveSide || TEAM_SIDES.HOME,
      homeParticipant: {
        side: TEAM_SIDES.HOME,
        participantType: 'league_team',
        teamId: null,
        leagueTeamId: context.homeTeam._id,
        slug: context.homeTeam.slug || null,
        displayName: context.homeTeam.name,
        logo: sanitizeLogo(context.homeTeam.logo),
        colors: Array.isArray(context.homeTeam.colors) ? context.homeTeam.colors : [],
        billingSnapshot: getLeagueBillingSummary(context.league),
        entitlementsSnapshot: resolveForLeague(context.league).entitlements,
      },
      awayParticipant: {
        side: TEAM_SIDES.AWAY,
        participantType: 'league_team',
        teamId: null,
        leagueTeamId: context.awayTeam._id,
        slug: context.awayTeam.slug || null,
        displayName: context.awayTeam.name,
        logo: sanitizeLogo(context.awayTeam.logo),
        colors: Array.isArray(context.awayTeam.colors) ? context.awayTeam.colors : [],
        billingSnapshot: getLeagueBillingSummary(context.league),
        entitlementsSnapshot: resolveForLeague(context.league).entitlements,
      },
      homeRosterSnapshot,
      awayRosterSnapshot,
      title: payload.title?.trim() || `${context.awayTeam.name} at ${context.homeTeam.name}`,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
      status: 'in_progress',
    });

    return sanitizeGame(game);
  }

  if (payload.gameContext === 'league') {
    const context = await getLeagueContextForGame(userId, payload);
    const game = await createGame({
      ownerUserId: userId,
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: payload.leagueId,
      seasonId: context.seasonId,
      homeLeagueTeamId: payload.homeLeagueTeamId,
      awayLeagueTeamId: payload.awayLeagueTeamId,
      trackedLeagueTeamId: payload.trackedLeagueTeamId,
      title: payload.title?.trim() || `${context.awayTeam.name} at ${context.homeTeam.name}`,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
      status: 'in_progress',
      rosterSnapshot: context.rosterSnapshot,
    });

    return sanitizeGame(game);
  }

  // Tracking is free (T-12): ownership is still required, but no active-subscription
  // gate — a Starter team can create and track games. Starter maxTeams is a
  // config-driven fast-follow (F-02).
  await assertTeamOwnership(userId, payload.teamId);
  const game = await createGame({
    ownerUserId: userId,
    teamId: payload.teamId,
    trackingMode: 'one_sided',
    title: payload.title.trim(),
    opponent: payload.opponent?.trim() ? payload.opponent.trim() : undefined,
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
    videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
    status: 'in_progress',
  });

  return sanitizeGame(game);
}

async function listGamesForUser(userId, filter = {}) {
  const rawGames = await listGamesByOwner(userId, filter);

  // OPT-018: when the caller paginates, the repo over-fetched by one — split
  // into a bounded page + nextCursor before mapping (buildCursorPage reads the
  // raw docs' `_id`, which the mapped output no longer exposes).
  const { items: games, nextCursor } = filter.limit
    ? buildCursorPage(rawGames, filter.limit)
    : { items: rawGames, nextCursor: null };

  const standaloneTeamIds = new Set();
  const leagueTeamIds = new Set();
  for (const game of games) {
    if (game.homeTeamId) standaloneTeamIds.add(String(game.homeTeamId));
    if (game.awayTeamId) standaloneTeamIds.add(String(game.awayTeamId));
    if (game.teamId) standaloneTeamIds.add(String(game.teamId));
    if (game.homeLeagueTeamId) leagueTeamIds.add(String(game.homeLeagueTeamId));
    if (game.awayLeagueTeamId) leagueTeamIds.add(String(game.awayLeagueTeamId));
    if (game.trackedLeagueTeamId) leagueTeamIds.add(String(game.trackedLeagueTeamId));
  }

  const [standaloneTeams, leagueTeams] = await Promise.all([
    standaloneTeamIds.size > 0
      ? Promise.all([...standaloneTeamIds].map((id) => findTeamById(id).catch(() => null)))
      : [],
    leagueTeamIds.size > 0
      ? Promise.all([...leagueTeamIds].map((id) => findLeagueTeamById(id).catch(() => null)))
      : [],
  ]);

  const teamLogoById = new Map();
  for (const team of standaloneTeams) {
    if (team) teamLogoById.set(String(team._id), transformCloudinaryUrl(team.logo?.url || null));
  }
  for (const team of leagueTeams) {
    if (team) teamLogoById.set(String(team._id), transformCloudinaryUrl(team.logo?.url || null));
  }

  function resolveLogoUrl(game) {
    const homeId = game.homeTeamId || game.homeLeagueTeamId || game.teamId;
    const awayId = game.awayTeamId || game.awayLeagueTeamId;
    return {
      homeLogoUrl: homeId ? (teamLogoById.get(String(homeId)) ?? null) : null,
      awayLogoUrl: awayId ? (teamLogoById.get(String(awayId)) ?? null) : null,
    };
  }

  const mappedGames = games.map((game) => {
    const { homeLogoUrl, awayLogoUrl } = resolveLogoUrl(game);
    return {
      id: String(game._id),
      teamId: game.teamId ? String(game.teamId) : null,
      gameContext: game.gameContext || 'standalone',
      trackingMode: game.trackingMode || 'one_sided',
      leagueId: game.leagueId ? String(game.leagueId) : null,
      homeLeagueTeamId: game.homeLeagueTeamId ? String(game.homeLeagueTeamId) : null,
      awayLeagueTeamId: game.awayLeagueTeamId ? String(game.awayLeagueTeamId) : null,
      homeTeamId: game.homeTeamId ? String(game.homeTeamId) : null,
      awayTeamId: game.awayTeamId ? String(game.awayTeamId) : null,
      trackedLeagueTeamId: game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null,
      title: game.title,
      opponent: game.opponent ?? null,
      status: game.status,
      scheduledAt: game.scheduledAt ?? null,
      completedAt: game.completedAt ?? null,
      eventCount: (game.events || []).length,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      homeLogoUrl,
      awayLogoUrl,
    };
  });

  return { games: mappedGames, nextCursor };
}

async function updateGameForUser(userId, gameId, payload) {
  const game = await assertGameAccess(userId, gameId);

  if (payload.title) {
    game.title = payload.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'opponent') && game.gameContext !== 'league') {
    game.opponent = payload.opponent?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'scheduledAt')) {
    game.scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'videoUrl')) {
    game.videoUrl = payload.videoUrl?.trim() || null;
  }
  if (payload.initialActiveSide && game.trackingMode === 'dual_team') {
    game.initialActiveSide = payload.initialActiveSide;
  }

  await saveGame(game);
  return getGameForUser(userId, gameId);
}

// OPT-015: the slim response for the event-append/edit hot path. Returns only
// the fields GameTrackPage actually reads after a tracked stat (game, lineups,
// boxScore, gameSummary) — not recap/highlights/team/participants/league/
// teamEntitlements/aiSummary, which don't change per-event and the client's
// setData((current) => ({ ...current, ...response })) merge leaves untouched
// from the initial full load. Works off the ALREADY-SAVED in-memory `game`
// and the `context` the caller already resolved before mutating it (team/
// participant docs are unaffected by an event mutation) — no second DB
// round-trip the way returning getGameForUser(userId, gameId) would need.
function buildSlimGameEventDelta(userId, game, context) {
  const { teamDoc, participants } = context;
  const boxScore =
    game.status === 'completed' && game.boxScore
      ? game.boxScore
      : game.trackingMode === 'dual_team'
        ? computeBoxScore(game, null, { participants })
        : computeBoxScore(game, teamDoc);
  const gameSummary =
    game.status === 'completed' && game.gameSummary ? game.gameSummary : buildGameSummary(game);

  return {
    game: sanitizeGame(game, { includeOwnerUserId: Boolean(userId) }),
    lineups:
      game.trackingMode === 'dual_team'
        ? {
            home: {
              startingPlayerIds: (game.homeStartingLineupPlayerIds || []).map(String),
              currentPlayerIds: (game.homeCurrentLineupPlayerIds || []).map(String),
            },
            away: {
              startingPlayerIds: (game.awayStartingLineupPlayerIds || []).map(String),
              currentPlayerIds: (game.awayCurrentLineupPlayerIds || []).map(String),
            },
          }
        : null,
    boxScore,
    gameSummary,
    canEditCompletedGame: game.status === 'completed' ? Boolean(userId) : false,
  };
}

async function getGameForUser(userId, gameId) {
  const game = await assertGameAccess(userId, gameId);
  const { team, opponentTeam, teamDoc, participants, league } = await resolveGameTeamContext(
    userId,
    game
  );
  // OPT-012: serve the frozen box score/summary for completed games instead of
  // replaying the events array on every read. Falls back to live compute when
  // absent (in-progress games, or completed games from before this field
  // existed — reversible, self-correcting on the next finish/edit).
  const boxScore =
    game.status === 'completed' && game.boxScore
      ? game.boxScore
      : game.trackingMode === 'dual_team'
        ? computeBoxScore(game, null, { participants })
        : computeBoxScore(game, teamDoc);
  const gameSummary =
    game.status === 'completed' && game.gameSummary ? game.gameSummary : buildGameSummary(game);
  const canEditCompleted = game.status === 'completed' ? Boolean(userId) : false;

  // Fetch fresh logos for dual-team games so uploads after game creation are reflected
  let freshLogoByLeagueTeamId = new Map();
  if (game.trackingMode === 'dual_team') {
    const ids = [game.homeLeagueTeamId, game.awayLeagueTeamId].filter(Boolean);
    const teams = await Promise.all(ids.map((id) => findLeagueTeamById(id).catch(() => null)));
    for (const t of teams) {
      if (t)
        freshLogoByLeagueTeamId.set(String(t._id), transformCloudinaryUrl(t.logo?.url || null));
    }
  }

  function resolveParticipantLogo(participant, leagueTeamId) {
    if (leagueTeamId) {
      const fresh = freshLogoByLeagueTeamId.get(String(leagueTeamId));
      if (fresh !== undefined) return fresh ? { url: fresh } : null;
    }
    if (participant.logo?.url) {
      return { ...participant.logo, url: transformCloudinaryUrl(participant.logo.url) };
    }
    return participant.logo || null;
  }

  const aiSummary = sanitizeAiSummary(game.aiSummary);

  // T-14: light server guard on premium view data. Read the (frozen) entitlement
  // surface for the tracked team — absent keys default to false — and omit replay
  // clips / the shot-map snapshot when unentitled, so a scraper can't pull data the
  // UI hides. Downgrade-safe: for recorded games this reads the frozen snapshot.
  const viewEntitlements = team?.entitlements || {};
  const highlights = viewEntitlements.canViewReplay
    ? buildGameHighlights(game, buildPlayersByIdMap(game, participants, teamDoc))
    : [];
  const recap = buildGameRecap(
    game,
    game.trackingMode === 'dual_team' ? participants : teamDoc,
    boxScore
  );
  if (recap && !viewEntitlements.canViewShotMaps) {
    recap.shotSnapshot = null;
  }

  return {
    game: sanitizeGame(game, { includeOwnerUserId: Boolean(userId) }),
    team,
    opponentTeam,
    participants: participants
      ? {
          home: {
            id: participants.home.teamId || participants.home.leagueTeamId,
            ...participants.home,
            logo: resolveParticipantLogo(participants.home, game.homeLeagueTeamId),
          },
          away: {
            id: participants.away.teamId || participants.away.leagueTeamId,
            ...participants.away,
            logo: resolveParticipantLogo(participants.away, game.awayLeagueTeamId),
          },
        }
      : null,
    lineups:
      game.trackingMode === 'dual_team'
        ? {
            home: {
              startingPlayerIds: (game.homeStartingLineupPlayerIds || []).map(String),
              currentPlayerIds: (game.homeCurrentLineupPlayerIds || []).map(String),
            },
            away: {
              startingPlayerIds: (game.awayStartingLineupPlayerIds || []).map(String),
              currentPlayerIds: (game.awayCurrentLineupPlayerIds || []).map(String),
            },
          }
        : null,
    league: league
      ? {
          id: String(league._id),
          name: league.name,
          slug: league.slug,
          seasonLabel: league.seasonLabel ?? null,
          logo: league.logo?.url ? { url: transformCloudinaryUrl(league.logo.url) } : null,
        }
      : null,
    highlights,
    boxScore,
    replayFilters: game.trackingMode === 'dual_team' ? ['all', 'home', 'away'] : ['all'],
    teamEntitlements: team.entitlements,
    recap,
    gameSummary,
    aiSummary,
    canEditCompletedGame: canEditCompleted,
  };
}

function isClaimedPlayerInGameSnapshot(userId, game) {
  const allRosters = [
    ...(game.rosterSnapshot || []),
    ...(game.homeRosterSnapshot || []),
    ...(game.awayRosterSnapshot || []),
  ];
  return allRosters.some((p) => p.claimedByUserId && String(p.claimedByUserId) === String(userId));
}

async function getPublicGame(gameId, viewerUserId = null) {
  const result = await getGameForUser(null, gameId);

  const highlightEventIds = (result.highlights || []).map((h) => h.eventId).filter(Boolean);
  result.sharedEventIds = await findSharedEventIds(highlightEventIds);
  result.canShareHighlights = false;

  if (viewerUserId) {
    const rawGame = await findGameById(gameId);
    if (rawGame) {
      result.canShareHighlights =
        (await canAccessGame(viewerUserId, rawGame)) ||
        isClaimedPlayerInGameSnapshot(viewerUserId, rawGame);
    }
  }
  return result;
}

function getTeamDocForSide(game, participants, side, fallbackTeamDoc) {
  if (game.trackingMode !== 'dual_team') {
    return fallbackTeamDoc;
  }
  return side === TEAM_SIDES.HOME ? participants.home.teamDoc : participants.away.teamDoc;
}

function insertEvent(game, eventPayload, insertBeforeEventId) {
  if (!insertBeforeEventId) {
    game.events.push(eventPayload);
    return;
  }

  const insertIndex = (game.events || []).findIndex(
    (event) => String(event._id) === String(insertBeforeEventId)
  );
  if (insertIndex < 0) {
    throw new ApiError(404, 'Insert point not found');
  }

  game.events.splice(insertIndex, 0, eventPayload);
}

function requireBothLineups(game) {
  if (game.trackingMode !== 'dual_team') {
    return;
  }
  if (
    (game.homeCurrentLineupPlayerIds || []).length !== 5 ||
    (game.awayCurrentLineupPlayerIds || []).length !== 5
  ) {
    throw new ApiError(400, 'Set both starting fives before tracking');
  }
}

async function appendEventForUser(userId, gameId, payload, options = {}) {
  const game = await assertGameAccess(userId, gameId);

  // Tracking is free (T-12): no active-subscription gate on appending events.

  const context = await resolveGameTeamContext(userId, game);
  const insertBeforeEventId = options.insertBeforeEventId || null;

  if (
    insertBeforeEventId &&
    (payload.statType === STAT_TYPES.SUB_OUT || payload.statType === STAT_TYPES.SUB_IN)
  ) {
    throw new ApiError(400, 'Substitution events cannot be inserted');
  }

  if (game.trackingMode === 'dual_team') {
    if (!payload.teamSide) {
      throw new ApiError(400, 'teamSide is required for dual-team events');
    }
    if (isOpponentEvent(payload.statType)) {
      throw new ApiError(400, 'Opponent aggregate events are not allowed for dual-team games');
    }

    if (!insertBeforeEventId && payload.statType !== STAT_TYPES.SUB_IN) {
      requireBothLineups(game);
    }

    const teamDoc = getTeamDocForSide(game, context.participants, payload.teamSide, null);
    if (payload.playerId) {
      const player = findTeamPlayerById(teamDoc, payload.playerId);
      if (!player || !player.isActive) {
        throw new ApiError(400, 'Player is not active on this team');
      }
    }

    const currentField = getDualLineupFieldName(payload.teamSide, 'current');
    const lineupIds = (game[currentField] || []).map(String);

    if (
      !insertBeforeEventId &&
      [
        STAT_TYPES.AST,
        STAT_TYPES.OREB,
        STAT_TYPES.DREB,
        STAT_TYPES.STL,
        STAT_TYPES.BLK,
        STAT_TYPES.TOV,
        STAT_TYPES.FOUL,
      ].includes(payload.statType)
    ) {
      if (
        payload.playerId &&
        lineupIds.length > 0 &&
        !lineupIds.includes(String(payload.playerId))
      ) {
        throw new ApiError(400, 'Player is not currently on the court');
      }
    }

    if (payload.statType === STAT_TYPES.SUB_OUT || payload.statType === STAT_TYPES.SUB_IN) {
      if (lineupIds.length !== 5 && payload.statType === STAT_TYPES.SUB_OUT) {
        throw new ApiError(400, 'Set starting five before making substitutions');
      }

      if (payload.statType === STAT_TYPES.SUB_OUT) {
        if (!payload.playerId || !lineupIds.includes(String(payload.playerId))) {
          throw new ApiError(400, 'Outgoing player is not currently on the court');
        }
        game[currentField] = lineupIds.filter((id) => id !== String(payload.playerId));
      }

      if (payload.statType === STAT_TYPES.SUB_IN) {
        if (!payload.playerId) {
          throw new ApiError(400, 'Incoming player is required');
        }
        if (lineupIds.includes(String(payload.playerId))) {
          throw new ApiError(400, 'Incoming player is already on the court');
        }
        game[currentField] = [...lineupIds, String(payload.playerId)];
      }
    }

    insertEvent(
      game,
      {
        ...(payload.playerId ? { playerId: payload.playerId } : {}),
        ...(payload.relatedPlayerId ? { relatedPlayerId: payload.relatedPlayerId } : {}),
        ...(payload.teamSide ? { teamSide: payload.teamSide } : {}),
        ...(payload.relatedTeamSide ? { relatedTeamSide: payload.relatedTeamSide } : {}),
        statType: payload.statType,
        zoneId: payload.zoneId,
        x: payload.x,
        y: payload.y,
        ...(typeof payload.videoTimestamp === 'number'
          ? { videoTimestamp: payload.videoTimestamp }
          : {}),
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      },
      insertBeforeEventId
    );
    recalculateCurrentLineup(game);
    clearAiSummaryAfterCompletedLeagueEdit(game);
    syncGameDenormalizedAfterEventChange(game);
    // OPT-015: rejects a stale concurrent write instead of silently
    // clobbering another co-tracker's event.
    await saveGameEventMutation(game);
    if (game.status === 'completed') {
      // OPT-010: editing a completed league game's events changes standings.
      scheduleLeagueRecomputeForGame(game);
      // OPT-012: refreeze the box score/summary to match the edited events.
      await refreezeGameBoxScoreIfCompleted(userId, game);
    }
    // OPT-015: slim delta instead of the full getGameForUser response — see
    // buildSlimGameEventDelta for what's included/excluded and why.
    return buildSlimGameEventDelta(userId, game, context);
  }

  const { teamDoc } = context;
  if (payload.playerId) {
    const player = findTeamPlayerById(teamDoc, payload.playerId);
    if (!player || !player.isActive) {
      throw new ApiError(400, 'Player is not active on this team');
    }
  }

  if (
    !insertBeforeEventId &&
    [
      STAT_TYPES.AST,
      STAT_TYPES.OREB,
      STAT_TYPES.DREB,
      STAT_TYPES.STL,
      STAT_TYPES.BLK,
      STAT_TYPES.TOV,
      STAT_TYPES.FOUL,
    ].includes(payload.statType)
  ) {
    const lineupIds = (game.currentLineupPlayerIds || []).map(String);
    if (payload.playerId && lineupIds.length > 0 && !lineupIds.includes(String(payload.playerId))) {
      throw new ApiError(400, 'Player is not currently on the court');
    }
  }

  if (payload.statType === STAT_TYPES.SUB_OUT || payload.statType === STAT_TYPES.SUB_IN) {
    const lineupIds = (game.currentLineupPlayerIds || []).map(String);
    if (lineupIds.length !== 5 && payload.statType === STAT_TYPES.SUB_OUT) {
      throw new ApiError(400, 'Set starting five before making substitutions');
    }
    if (payload.statType === STAT_TYPES.SUB_OUT) {
      if (!payload.playerId || !lineupIds.includes(String(payload.playerId))) {
        throw new ApiError(400, 'Outgoing player is not currently on the court');
      }
      game.currentLineupPlayerIds = lineupIds.filter((id) => id !== String(payload.playerId));
    }
    if (payload.statType === STAT_TYPES.SUB_IN) {
      if (!payload.playerId) {
        throw new ApiError(400, 'Incoming player is required');
      }
      if (lineupIds.includes(String(payload.playerId))) {
        throw new ApiError(400, 'Incoming player is already on the court');
      }
      game.currentLineupPlayerIds = [...lineupIds, String(payload.playerId)];
    }
  }

  insertEvent(
    game,
    {
      ...(payload.playerId ? { playerId: payload.playerId } : {}),
      ...(payload.relatedPlayerId ? { relatedPlayerId: payload.relatedPlayerId } : {}),
      statType: payload.statType,
      zoneId: payload.zoneId,
      x: payload.x,
      y: payload.y,
      ...(typeof payload.videoTimestamp === 'number'
        ? { videoTimestamp: payload.videoTimestamp }
        : {}),
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    },
    insertBeforeEventId
  );

  recalculateCurrentLineup(game);
  clearAiSummaryAfterCompletedLeagueEdit(game);
  syncGameDenormalizedAfterEventChange(game);
  // OPT-015: rejects a stale concurrent write instead of silently clobbering
  // another co-tracker's event.
  await saveGameEventMutation(game);
  if (game.status === 'completed') {
    // OPT-010: editing a completed league game's events changes standings.
    scheduleLeagueRecomputeForGame(game);
    // OPT-013: editing a completed standalone game's events changes its team's
    // season summary.
    scheduleTeamSummaryRecomputeForGame(game);
    // OPT-017: any shared feed card for this game shows a now-stale score.
    scheduleFeedCardRefreshForGame(game._id);
    // OPT-012: refreeze the box score/summary to match the edited events.
    await refreezeGameBoxScoreIfCompleted(userId, game);
  }
  return getGameForUser(userId, gameId);
}

async function setGameLineup(userId, gameId, payloadOrPlayerIds) {
  const game = await assertGameAccess(userId, gameId);
  if (game.status !== 'in_progress') {
    throw new ApiError(400, 'Cannot change lineup on a completed game');
  }

  const payload = Array.isArray(payloadOrPlayerIds)
    ? { playerIds: payloadOrPlayerIds }
    : payloadOrPlayerIds;
  const context = await resolveGameTeamContext(userId, game);

  if (game.trackingMode === 'dual_team') {
    if (!payload.teamSide) {
      throw new ApiError(400, 'teamSide is required for dual-team lineups');
    }
    const teamDoc = getTeamDocForSide(game, context.participants, payload.teamSide, null);
    const validIds = validateLineupPlayers(teamDoc, payload.playerIds);
    game[getDualLineupFieldName(payload.teamSide, 'starting')] = validIds;
    game[getDualLineupFieldName(payload.teamSide, 'current')] = validIds;
    await saveGame(game);
    return getGameForUser(userId, gameId);
  }

  const validIds = validateLineupPlayers(context.teamDoc, payload.playerIds);
  game.startingLineupPlayerIds = validIds;
  game.currentLineupPlayerIds = validIds;
  await saveGame(game);
  return getGameForUser(userId, gameId);
}

async function removeEventForUser(userId, gameId, eventId) {
  const game = await assertGameAccess(userId, gameId);
  const event = game.events.id(eventId);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }
  event.deleteOne();
  recalculateCurrentLineup(game);
  clearAiSummaryAfterCompletedLeagueEdit(game);
  syncGameDenormalizedAfterEventChange(game);
  // OPT-015: rejects a stale concurrent write instead of silently clobbering
  // another co-tracker's event.
  await saveGameEventMutation(game);
  if (game.status === 'completed') {
    // OPT-010: editing a completed league game's events changes standings.
    scheduleLeagueRecomputeForGame(game);
    // OPT-013: editing a completed standalone game's events changes its team's
    // season summary.
    scheduleTeamSummaryRecomputeForGame(game);
    // OPT-017: any shared feed card for this game shows a now-stale score.
    scheduleFeedCardRefreshForGame(game._id);
    // OPT-012: refreeze the box score/summary to match the edited events.
    await refreezeGameBoxScoreIfCompleted(userId, game);
  }
  // OPT-015: slim delta instead of the full getGameForUser response.
  const context = await resolveGameTeamContext(userId, game);
  return buildSlimGameEventDelta(userId, game, context);
}

async function updateEventForUser(userId, gameId, eventId, patch) {
  const game = await assertGameAccess(userId, gameId);
  const event = game.events.id(eventId);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }
  if (patch.playerId !== undefined) event.playerId = patch.playerId;
  if (patch.teamSide !== undefined) event.teamSide = patch.teamSide;
  if (patch.statType !== undefined) event.statType = patch.statType;
  if (patch.zoneId !== undefined) event.zoneId = patch.zoneId;
  if (patch.x !== undefined) event.x = patch.x;
  if (patch.y !== undefined) event.y = patch.y;
  if (patch.videoTimestamp !== undefined) event.videoTimestamp = patch.videoTimestamp ?? undefined;
  recalculateCurrentLineup(game);
  clearAiSummaryAfterCompletedLeagueEdit(game);
  syncGameDenormalizedAfterEventChange(game);
  // OPT-015: rejects a stale concurrent write instead of silently clobbering
  // another co-tracker's event.
  await saveGameEventMutation(game);
  if (game.status === 'completed') {
    // OPT-010: editing a completed league game's events changes standings.
    scheduleLeagueRecomputeForGame(game);
    // OPT-013: editing a completed standalone game's events changes its team's
    // season summary.
    scheduleTeamSummaryRecomputeForGame(game);
    // OPT-017: any shared feed card for this game shows a now-stale score.
    scheduleFeedCardRefreshForGame(game._id);
    // OPT-012: refreeze the box score/summary to match the edited events.
    await refreezeGameBoxScoreIfCompleted(userId, game);
  }
  // OPT-015: slim delta instead of the full getGameForUser response.
  const context = await resolveGameTeamContext(userId, game);
  return buildSlimGameEventDelta(userId, game, context);
}

async function deleteGameForUser(userId, gameId) {
  const game = await assertGameAccess(userId, gameId);

  if (game.gameContext === 'league' && String(game.ownerUserId) !== String(userId)) {
    const canManage = await canManageLeagueGame(userId, game);
    if (!canManage) {
      throw new ApiError(403, 'Only league owners, managers, and team managers can remove games');
    }
  }

  // OPT-010/013: capture context before deletion, then recompute the relevant
  // materialised aggregate after the row is gone (deleting a completed game
  // changes league standings or the team's season summary).
  const wasLeagueGame = game.gameContext === 'league';
  const leagueId = game.leagueId;
  const seasonId = game.seasonId;
  const isStandaloneOneSided =
    game.gameContext === 'standalone' && game.trackingMode === 'one_sided';
  const teamId = game.teamId;

  await game.deleteOne();

  if (wasLeagueGame) {
    scheduleLeagueAggregateRecompute(leagueId, seasonId);
  }
  if (isStandaloneOneSided && teamId) {
    const { scheduleTeamSeasonSummaryRecompute } = require('../teams/teams.service');
    scheduleTeamSeasonSummaryRecompute(teamId);
  }
}

async function finishGameForUser(userId, gameId) {
  const game = await assertGameAccess(userId, gameId);
  if (game.status === 'completed') {
    throw new ApiError(400, 'Game is already completed');
  }

  if (game.gameContext === 'league' && String(game.ownerUserId) !== String(userId)) {
    const canFinalize = await canFinalizeLeagueGame(userId, game);
    if (!canFinalize) {
      throw new ApiError(403, 'Only league owners and league managers can finalize games');
    }
  }

  // OPT-024: validate the score against the current (still in_progress) events
  // before mutating anything — a rejected finalize must leave the game
  // untouched, not half-completed.
  const finalScore = computeGameFinalScore(game);
  assertLeagueScoreNotTied(game.gameContext, finalScore);

  game.status = 'completed';
  game.completedAt = new Date();
  // OPT-008: freeze the final score + event count on completion.
  game.finalScore = finalScore;
  syncGameEventCount(game);

  // OPT-012: freeze box score + game summary on completion (one team-context
  // resolve, reused below for the AI summary too if this is a league game).
  const { teamDoc, participants } = await resolveGameTeamContext(userId, game);
  const boxScore =
    game.trackingMode === 'dual_team'
      ? computeBoxScore(game, null, { participants })
      : computeBoxScore(game, teamDoc);
  game.boxScore = boxScore;
  game.gameSummary = buildGameSummary(game);

  await saveGame(game);

  // OPT-010/013/017: a newly completed game changes its league's standings,
  // its standalone team's season summary, and any shared feed card's score.
  // Scheduled here (before the AI-summary branch's early returns) so it fires
  // on every path.
  scheduleLeagueRecomputeForGame(game);
  scheduleTeamSummaryRecomputeForGame(game);
  scheduleFeedCardRefreshForGame(game._id);
  scheduleAutoFeedForGame(game._id);

  if (game.gameContext === 'league' && !game.aiSummary?.text) {
    // OPT-020: generate the summary off the request path (see
    // scheduleGameSummaryGeneration). The finish response no longer waits on
    // OpenAI; the client picks up the summary on a later fetch once it lands.
    const recap = buildGameRecap(
      game,
      game.trackingMode === 'dual_team' ? participants : teamDoc,
      boxScore
    );
    scheduleGameSummaryGeneration(game, { recap, boxScore });
  }

  return getGameForUser(userId, gameId);
}

module.exports = {
  createGameForUser,
  listGamesForUser,
  updateGameForUser,
  getGameForUser,
  getPublicGame,
  appendEventForUser,
  updateEventForUser,
  setGameLineup,
  removeEventForUser,
  deleteGameForUser,
  finishGameForUser,
  computeBoxScore,
  buildGameSummary,
  computeGameFinalScore,
  canAccessStandaloneDualGame,
  canEditStandaloneDualGame,
  canAccessGame,
  resolveDualGameParticipants,
  HIGHLIGHT_STAT_TYPES,
};
