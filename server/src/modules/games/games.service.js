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
const {
  getBillingSummary,
  getLeagueBillingSummary,
  assertTeamManagementAllowed,
} = require('../billing/billing.service');
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
const {
  SPORTS,
  CLOCK_STATUSES,
  SEGMENT_KINDS,
  createReadyClock,
  normalizeClock,
  regulationSegmentCount,
  segmentDurationMilliseconds,
  validateSnapshot,
} = require('../shared/gameClock');

function sanitizeEvent(event, { includePremiumMedia = true } = {}) {
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
    videoTimestamp:
      includePremiumMedia && typeof event.videoTimestamp === 'number' ? event.videoTimestamp : null,
    segmentKind: event.segmentKind,
    segmentNumber: event.segmentNumber,
    clockMillisecondsRemaining: event.clockMillisecondsRemaining,
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

// Auto Feed Generation (docs/auto-feed.md): after a
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

// Player Milestones (docs/PROJECT-KNOWLEDGE.md#player-milestones): detection runs after a
// league game finishes. It is deliberately independent of league visibility;
// feed.service owns the public-league publishing gate.
function scheduleMilestoneDetectionForGame(game) {
  if (!game || game.gameContext !== 'league') return;
  setImmediate(() => {
    const { detectForFinalizedGame } = require('../milestones/milestones.service');
    detectForFinalizedGame(game._id).catch((error) => {
      logger.error(
        { err: error, gameId: String(game._id) },
        'Post-response milestone detection failed'
      );
    });
  });
}

// Player Milestones (docs/PROJECT-KNOWLEDGE.md#player-milestones): editing a completed game
// can invalidate an achievement produced by its previous frozen box score.
function scheduleMilestoneReevaluationForGame(game) {
  if (!game || game.gameContext !== 'league' || game.status !== 'completed') return;
  setImmediate(() => {
    const { reevaluateMilestonesForGame } = require('../milestones/milestones.service');
    reevaluateMilestonesForGame(game._id).catch((error) => {
      logger.error(
        { err: error, gameId: String(game._id) },
        'Post-response milestone re-evaluation failed'
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
  const includePremiumMedia = options.includePremiumMedia !== false;
  return {
    id: String(game._id),
    ...(options.includeOwnerUserId ? { ownerUserId: String(game.ownerUserId) } : {}),
    teamId: game.teamId ? String(game.teamId) : null,
    gameContext: game.gameContext || 'standalone',
    trackingMode: game.trackingMode || 'one_sided',
    sport: game.sport,
    gameFormat: game.gameFormat?.toObject?.() || game.gameFormat,
    clock: game.clock?.toObject?.() || game.clock,
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
    videoUrl: includePremiumMedia ? (game.videoUrl ?? null) : null,
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
    venue: game.venue ?? null,
    venueAddress: normalizeVenueAddress(game.venueAddress),
    completedAt: game.completedAt ?? null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    events: (game.events || []).map((event) => sanitizeEvent(event, { includePremiumMedia })),
    aiSummary: sanitizeAiSummary(game.aiSummary),
  };
}

function normalizeVenueAddress(value) {
  if (!value || typeof value !== 'object') return null;
  const address = {
    addressLine1: String(value.addressLine1 || '').trim(),
    addressLine2: String(value.addressLine2 || '').trim(),
    city: String(value.city || '').trim(),
    state: String(value.state || '').trim(),
    postalCode: String(value.postalCode || '').trim(),
    country: String(value.country || '').trim(),
  };
  return Object.values(address).some(Boolean) ? address : null;
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
  if (uniquePlayerIds.length !== playerIds.length) {
    throw new ApiError(400, 'Starting lineup must use unique players');
  }
  if (uniquePlayerIds.length === 0 || uniquePlayerIds.length > 5) {
    throw new ApiError(400, 'Starting lineup must include between 1 and 5 unique players');
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
  scheduleMilestoneReevaluationForGame(game);
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

async function assertGameBillingWriteAllowed(userId, game) {
  if (game.gameContext === 'league') {
    const league = await findLeagueById(game.leagueId);
    if (!league || !resolveForLeague(league).entitlements.canManageLeague) {
      throw new ApiError(402, 'An active League subscription is required to make changes');
    }
    return;
  }

  const candidateIds = [game.teamId, game.homeTeamId, game.awayTeamId].filter(Boolean);
  const ownedTeams = [];
  for (const teamId of candidateIds) {
    const ownedTeam = await findTeamByIdAndOwner(teamId, userId);
    if (ownedTeam) {
      ownedTeams.push(ownedTeam);
    }
  }
  if (ownedTeams.length === 0) throw new ApiError(403, 'Forbidden');
  for (const team of ownedTeams) assertTeamManagementAllowed(team);
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

async function assertGameAccess(userId, gameId, { requireWritable = false } = {}) {
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
    if (requireWritable) await assertGameBillingWriteAllowed(userId, game);
    return game;
  }

  if (game.trackingMode === 'dual_team' && game.gameContext === 'standalone') {
    if (await canAccessStandaloneDualGame(userId, game)) {
      if (requireWritable) await assertGameBillingWriteAllowed(userId, game);
      return game;
    }
  }

  if (game.gameContext === 'league' && (await canManageLeagueGame(userId, game))) {
    if (requireWritable) await assertGameBillingWriteAllowed(userId, game);
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

// Mid-game roster add: which roster does this game's players actually come from?
//
// A standalone one-sided game reads team.players live from the Team doc (see
// resolveGameTeamContext), so it needs NO game write — snapshotField is null.
// Every other shape reads a frozen snapshot array on the Game doc, which must be
// appended to or the new player stays invisible in the game they were added for.
function resolveRosterTargetForGame(game, side) {
  const isDual = game.trackingMode === 'dual_team';

  if (isDual && !side) {
    throw new ApiError(400, 'side is required for dual-team games');
  }

  const snapshotField = isDual
    ? side === TEAM_SIDES.HOME
      ? 'homeRosterSnapshot'
      : 'awayRosterSnapshot'
    : null;

  if (game.gameContext === 'league') {
    const leagueTeamId = isDual
      ? side === TEAM_SIDES.HOME
        ? game.homeLeagueTeamId
        : game.awayLeagueTeamId
      : game.trackedLeagueTeamId;

    return {
      kind: 'league',
      leagueId: String(game.leagueId),
      leagueTeamId: String(leagueTeamId),
      // A one-sided league game freezes its tracked roster in `rosterSnapshot`.
      snapshotField: snapshotField || 'rosterSnapshot',
    };
  }

  const teamId = isDual
    ? side === TEAM_SIDES.HOME
      ? game.homeTeamId
      : game.awayTeamId
    : game.teamId;

  return { kind: 'standalone', teamId: String(teamId), snapshotField };
}

const ROSTER_EDITABLE_STATUSES = new Set(['in_progress', 'scheduled']);

// Mid-game roster add. Two writes, deliberately ordered:
//
//   1. the durable roster row, delegated to the module that owns it, and
//   2. this game's frozen roster snapshot (skipped when the game reads live).
//
// Delegating (1) is load-bearing: addPlayerToLeagueTeam/addPlayerToTeam carry
// their own permission gates and duplicate-name rules, so this endpoint inherits
// the existing matrix rather than re-deriving it. PROJECT-KNOWLEDGE §4 (TSW-001)
// records what re-deriving an affiliation gate from scratch actually costs.
//
// Roster-first ordering means a failed snapshot append leaves a real player with
// no game row (recoverable, adjacent to repairGameRosterSnapshots). The reverse
// would leave a phantom snapshot entry with no LeaguePlayer behind it, breaking
// the leaguePlayerId linkage LeaguePlayerStats and public player pages rely on.
async function addPlayerToGameRoster(userId, gameId, payload) {
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });

  if (!ROSTER_EDITABLE_STATUSES.has(game.status)) {
    throw new ApiError(409, 'Cannot add a player to a completed game');
  }

  const side = payload.side ?? null;
  const target = resolveRosterTargetForGame(game, side);
  const rosterPayload = {
    displayName: payload.displayName,
    jerseyNumber: payload.jerseyNumber ?? null,
  };

  let player;
  if (target.kind === 'league') {
    const { addPlayerToLeagueTeam } = require('../leagues/leagues.service');
    player = await addPlayerToLeagueTeam(
      userId,
      target.leagueId,
      target.leagueTeamId,
      rosterPayload
    );
  } else {
    // Lazily required to avoid a require cycle — teams.service.js requires
    // games.service.js for computeBoxScore.
    const { addPlayerToTeam } = require('../teams/teams.service');
    // addPlayerToTeam returns sanitizeTeam's output (the WHOLE team), not the
    // added player. Pull the just-added player back out of team.players,
    // matching on the trimmed name we sent and preferring the last match so an
    // existing inactive same-name row can't shadow the one we just appended.
    const team = await addPlayerToTeam(userId, target.teamId, rosterPayload);
    player = findLastAddedPlayer(team, rosterPayload.displayName);
  }

  if (target.snapshotField) {
    await appendPlayerToGameSnapshot(gameId, game, target.snapshotField, target.kind, player);
  }

  return { player, side };
}

// UX-only flag for the tracking screen's "Add player" affordance. The service
// gate in addPlayerToGameRoster stays authoritative — this just avoids showing a
// button that would 403. The case that matters here is a dual-team league game:
// canManageLeagueGame lets a manager of EITHER side track the game, but
// assertTeamManagerOrOwner is scoped to one team, so a home-team manager can
// legitimately track the game while being forbidden from editing the away
// roster (and vice versa). The flag is true if either side is manageable; the
// client still resolves per side when it actually submits.
//
// Reuses assertTeamManagerOrOwner rather than re-deriving the rule; it throws
// instead of returning a boolean, hence the wrapper.
async function canManageGameRoster(userId, game) {
  if (!userId || !game) return false;

  const sides =
    game.trackingMode === 'dual_team' ? [TEAM_SIDES.HOME, TEAM_SIDES.AWAY] : [undefined];

  if (game.gameContext !== 'league') {
    // Standalone: the durable write gate is addPlayerToTeam's team ownership.
    // A one-sided game's owner always owns its team, but a DUAL-TEAM standalone
    // game is accessible to the owner of EITHER team (canAccessStandaloneDualGame),
    // so ownership of the side being tracked is not implied — check it per side
    // rather than assuming access means ownership.
    if (game.trackingMode !== 'dual_team') {
      return true;
    }

    for (const side of sides) {
      const target = resolveRosterTargetForGame(game, side);
      if (!target.teamId) continue;
      const owned = await findTeamByIdAndOwner(target.teamId, userId).catch(() => null);
      if (owned) return true;
    }

    return false;
  }

  const { assertTeamManagerOrOwner } = require('../leagues/leagues.service');

  for (const side of sides) {
    let target;
    try {
      target = resolveRosterTargetForGame(game, side);
    } catch {
      continue;
    }

    const allowed = await assertTeamManagerOrOwner(userId, target.leagueId, target.leagueTeamId)
      .then(() => true)
      .catch(() => false);

    if (allowed) return true;
  }

  return false;
}

function findLastAddedPlayer(team, displayName) {
  const targetName = displayName.trim();
  const players = Array.isArray(team?.players) ? team.players : [];
  for (let i = players.length - 1; i >= 0; i -= 1) {
    if (players[i]?.displayName === targetName) {
      return players[i];
    }
  }

  // The delegate's own contract changed underneath us if we get here — fail
  // loudly rather than returning undefined to the caller.
  throw new ApiError(500, 'Added player could not be located on the team');
}

// Mirrors buildLeagueRosterSnapshot's field shape (leagues.service.js) for a
// league target, and buildRosterSnapshotFromStandaloneTeam's field shape
// (above) for a standalone target, so a mid-game addition is indistinguishable
// from one frozen at game creation or one read live off a standalone Team.
// These two source functions use genuinely different shapes (leaguePlayerId
// vs sourceType/sourcePlayerId) — see PROJECT-KNOWLEDGE §5 (TSW-004) — so this
// must branch on target kind rather than emit one shape for both.
function buildSnapshotEntry(targetKind, player) {
  if (targetKind === 'standalone') {
    return {
      sourceType: 'team_player',
      sourcePlayerId: player.id ?? player._id,
      leaguePlayerId: null,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: player.position ?? null,
      claimedByUserId: null,
      isClaimed: false,
      isActive: true,
    };
  }

  const claimedUserId = player.claimedUserId ?? player.claimedByUserId ?? null;
  return {
    leaguePlayerId: player.id ?? player._id,
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: player.position ?? null,
    claimedByUserId: claimedUserId,
    isClaimed: Boolean(claimedUserId),
    isActive: true,
  };
}

// The Game schema uses optimisticConcurrency, so a co-tracker saving an event at
// the same moment makes this save throw VersionError. The append is pure, so
// replaying it on a freshly loaded game is safe — and far better than surfacing a
// conflict to someone mid-game. The roster write above is NOT replayed.
async function appendPlayerToGameSnapshot(gameId, game, snapshotField, targetKind, player) {
  const entry = buildSnapshotEntry(targetKind, player);

  try {
    game[snapshotField] = [...(game[snapshotField] || []), entry];
    await saveGame(game);
  } catch (error) {
    if (error?.name !== 'VersionError') {
      throw error;
    }

    const fresh = await findGameById(gameId);
    if (!fresh) {
      throw new ApiError(404, 'Game not found');
    }
    fresh[snapshotField] = [...(fresh[snapshotField] || []), entry];
    await saveGame(fresh);
  }
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
    // Audit L4: no hard-coded 'pro'/'active' fallback — this doc feeds only
    // roster/box-score, never entitlement resolution. A truthy default here is the
    // always-premium footgun class T-13 removed.
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

async function resolveDualGameParticipants(game, rosters = {}) {
  const home = sanitizeParticipant(game.homeParticipant);
  const away = sanitizeParticipant(game.awayParticipant);
  // A scheduled fixture passes live rosters here (see resolveGameTeamContext).
  // Defaulting to the frozen snapshots keeps every other caller unchanged.
  const homeRoster = rosters.home ?? game.homeRosterSnapshot;
  const awayRoster = rosters.away ?? game.awayRosterSnapshot;

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
      teamDoc: buildTeamDocFromSnapshot(home, homeRoster),
      players: (homeRoster || []).map(sanitizePlayer),
    },
    away: {
      ...away,
      teamDoc: buildTeamDocFromSnapshot(away, awayRoster),
      players: (awayRoster || []).map(sanitizePlayer),
    },
  };
}

// rosterSnapshotPlayerSchema is declared { _id: true }, so Mongoose mints a fresh
// _id for every entry each time the array is replaced — and sanitizePlayer exposes
// _id as the player's id, falling back to leaguePlayerId only when _id is absent.
// A live read therefore exposes leaguePlayerId while a frozen snapshot exposes the
// minted _id, so without this a player's id would change at tip-off and orphan a
// starting lineup saved beforehand. Pinning _id to the LeaguePlayer id keeps one
// player's id identical across the whole fixture lifecycle.
function withStableSnapshotIds(entries) {
  return (entries || []).map((entry) =>
    entry?.leaguePlayerId ? { ...entry, _id: entry.leaguePlayerId } : entry
  );
}

// A scheduled fixture has not been played, so its roster is not history yet: the
// players shown must be the league team's CURRENT ones. Players added through the
// admin pages, or through a DIFFERENT fixture, live on the LeagueTeam and never
// reach this game's snapshot — reading the snapshot made them invisible here,
// which in turn made re-adding one collide on the duplicate-name rule.
//
// Returned rather than written onto the game. resolveGameTeamContext is also
// reached from write paths that call saveGame, so mutating the document here
// would freeze the roster weeks before tip-off — the very thing the Schedule
// Builder leaves empty snapshots to avoid. The freeze happens once, when the
// clock starts (updateClockForUser).
async function resolveLiveRostersForScheduledGame(game) {
  if (!game || game.status !== 'scheduled' || game.gameContext !== 'league') {
    return {};
  }

  if (game.trackingMode !== 'dual_team') {
    return {};
  }

  const [home, away] = await Promise.all([
    game.homeLeagueTeamId ? getLeagueRosterSnapshotForTeam(game.homeLeagueTeamId) : [],
    game.awayLeagueTeamId ? getLeagueRosterSnapshotForTeam(game.awayLeagueTeamId) : [],
  ]);

  return { home: withStableSnapshotIds(home), away: withStableSnapshotIds(away) };
}

// Tip-off is where a league fixture's roster stops being live and becomes the
// record of who played, so later league-roster edits must not rewrite it.
// Overwrites outright rather than filling only when empty: mid-game adds and
// pre-match adds leave a PARTIAL snapshot, and repairGameRosterSnapshots skips
// anything non-empty, so a fill-if-empty freeze would lock in the partial list.
async function freezeLeagueRosterSnapshots(game) {
  if (!game || game.gameContext !== 'league') return;

  if (game.trackingMode === 'dual_team') {
    const [home, away] = await Promise.all([
      game.homeLeagueTeamId ? getLeagueRosterSnapshotForTeam(game.homeLeagueTeamId) : [],
      game.awayLeagueTeamId ? getLeagueRosterSnapshotForTeam(game.awayLeagueTeamId) : [],
    ]);
    game.homeRosterSnapshot = withStableSnapshotIds(home);
    game.awayRosterSnapshot = withStableSnapshotIds(away);
    return;
  }

  if (game.trackedLeagueTeamId) {
    game.rosterSnapshot = withStableSnapshotIds(
      await getLeagueRosterSnapshotForTeam(game.trackedLeagueTeamId)
    );
  }
}

async function resolveGameTeamContext(userId, game) {
  await repairGameRosterSnapshots(game);

  if (game.trackingMode === 'dual_team') {
    const participants = await resolveDualGameParticipants(
      game,
      await resolveLiveRostersForScheduledGame(game)
    );
    let leagueContext = null;
    if (game.gameContext === 'league' && game.leagueId) {
      leagueContext = await findLeagueById(game.leagueId).catch(() => null);
      const billing = getLeagueBillingSummary(leagueContext);
      const entitlements = resolveForLeague(leagueContext).entitlements;
      for (const participant of [participants.home, participants.away]) {
        participant.billing = billing;
        participant.entitlements = entitlements;
      }
    } else {
      const [homeTeam, awayTeam] = await Promise.all([
        game.homeTeamId ? findTeamById(game.homeTeamId) : null,
        game.awayTeamId ? findTeamById(game.awayTeamId) : null,
      ]);
      const liveBySide = {
        [TEAM_SIDES.HOME]: homeTeam,
        [TEAM_SIDES.AWAY]: awayTeam,
      };
      for (const side of [TEAM_SIDES.HOME, TEAM_SIDES.AWAY]) {
        const liveTeam = liveBySide[side];
        participants[side].billing = getBillingSummary(liveTeam || {});
        participants[side].entitlements = resolveForTeam(liveTeam).entitlements;
      }
    }
    const viewerSide =
      game.gameContext === 'standalone' && userId
        ? (await findTeamByIdAndOwner(game.homeTeamId, userId))
          ? TEAM_SIDES.HOME
          : TEAM_SIDES.AWAY
        : game.initialActiveSide || TEAM_SIDES.HOME;
    const primary = participants[viewerSide];
    const secondary =
      participants[viewerSide === TEAM_SIDES.HOME ? TEAM_SIDES.AWAY : TEAM_SIDES.HOME];
    return {
      team: {
        id: primary.teamId || primary.leagueTeamId,
        name: primary.displayName,
        logo: primary.logo,
        billing: primary.billing || null,
        // Billing snapshots preserve history, but current billing state always
        // authorizes premium reads so cancellation removes access immediately.
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
  const entitlements = resolveForTeam(team).entitlements;
  return {
    team: {
      id: String(team._id),
      name: team.name,
      logo: sanitizeLogo(team.logo),
      billing: getBillingSummary(team),
      entitlements,
      players: team.players.map(sanitizePlayer),
    },
    opponentTeam: null,
    participants: null,
    teamDoc: team,
    league: null,
  };
}

function clockAwareGameFields(format) {
  const gameFormat = { ...format };
  return { sport: SPORTS.BASKETBALL, gameFormat, clock: createReadyClock(gameFormat) };
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
    assertTeamManagementAllowed(canOwnHome || canOwnAway);
    const game = await createGame({
      ...clockAwareGameFields(payload.gameFormat),
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
      venue: payload.venue?.trim() ? payload.venue.trim() : undefined,
      venueAddress: normalizeVenueAddress(payload.venueAddress) || undefined,
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
      ...clockAwareGameFields(payload.gameFormat || context.league.defaultGameFormat),
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
      venue: payload.venue?.trim() ? payload.venue.trim() : undefined,
      venueAddress: normalizeVenueAddress(payload.venueAddress) || undefined,
      videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
      // A league game starts life as a fixture, not a live game: nothing is in
      // progress until someone starts the clock, which promotes 'scheduled' →
      // 'in_progress' (runClockCommand / appendEventForUser below). Creating it
      // 'in_progress' marked it live with zero events, so it was
      // indistinguishable from a game actually being played.
      status: 'scheduled',
    });

    return sanitizeGame(game);
  }

  if (payload.gameContext === 'league') {
    const context = await getLeagueContextForGame(userId, payload);
    const game = await createGame({
      ...clockAwareGameFields(payload.gameFormat || context.league.defaultGameFormat),
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
      venue: payload.venue?.trim() ? payload.venue.trim() : undefined,
      venueAddress: normalizeVenueAddress(payload.venueAddress) || undefined,
      videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
      // A league game starts life as a fixture, not a live game: nothing is in
      // progress until someone starts the clock, which promotes 'scheduled' →
      // 'in_progress' (runClockCommand / appendEventForUser below). Creating it
      // 'in_progress' marked it live with zero events, so it was
      // indistinguishable from a game actually being played.
      status: 'scheduled',
      rosterSnapshot: context.rosterSnapshot,
    });

    return sanitizeGame(game);
  }

  // Tracking is free (T-12): ownership is still required, but no active-subscription
  // gate — a Starter team can create and track games. Starter maxTeams is a
  // config-driven fast-follow (F-02).
  const team = await assertTeamOwnership(userId, payload.teamId);
  assertTeamManagementAllowed(team);
  const game = await createGame({
    ...clockAwareGameFields(payload.gameFormat),
    ownerUserId: userId,
    teamId: payload.teamId,
    trackingMode: 'one_sided',
    title: payload.title.trim(),
    opponent: payload.opponent?.trim() ? payload.opponent.trim() : undefined,
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
    venue: payload.venue?.trim() ? payload.venue.trim() : undefined,
    venueAddress: normalizeVenueAddress(payload.venueAddress) || undefined,
    videoUrl: payload.videoUrl?.trim() ? payload.videoUrl.trim() : undefined,
    status: 'in_progress',
    // Kept as an audit snapshot only. Current billing state authorizes reads.
    entitlementsSnapshot: resolveForTeam(team).entitlements,
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
      venue: game.venue ?? null,
      venueAddress: normalizeVenueAddress(game.venueAddress),
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
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });

  if (payload.title) {
    game.title = payload.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'opponent') && game.gameContext !== 'league') {
    game.opponent = payload.opponent?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'scheduledAt')) {
    game.scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'venue')) {
    game.venue = payload.venue?.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'venueAddress')) {
    game.venueAddress = normalizeVenueAddress(payload.venueAddress);
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
    game: sanitizeGame(game, {
      includeOwnerUserId: Boolean(userId),
      includePremiumMedia: Boolean(context.team?.entitlements?.canViewReplay),
    }),
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
  const responseTime = new Date();
  if (game.clock) game.clock = normalizeClock(game.clock.toObject?.() || game.clock, responseTime);
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

  // Current billing state is the authorization source. Stored snapshots preserve
  // history but never keep premium reads alive after cancellation or non-payment.
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

  const canManageRoster = await canManageGameRoster(userId, game);

  return {
    serverTime: responseTime.toISOString(),
    game: sanitizeGame(game, {
      includeOwnerUserId: Boolean(userId),
      includePremiumMedia: Boolean(viewEntitlements.canViewReplay),
    }),
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
    canManageRoster,
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
  result.canManageGame = false;

  if (viewerUserId) {
    const rawGame = await findGameById(gameId);
    if (rawGame) {
      result.canManageGame = await canAccessGame(viewerUserId, rawGame);
      result.canShareHighlights =
        result.canManageGame || isClaimedPlayerInGameSnapshot(viewerUserId, rawGame);
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
    (game.homeCurrentLineupPlayerIds || []).length === 0 ||
    (game.awayCurrentLineupPlayerIds || []).length === 0
  ) {
    throw new ApiError(400, 'Set a starting lineup for both teams before tracking');
  }
}

async function appendEventForUser(userId, gameId, payload, options = {}) {
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
  const gameFormat = game.gameFormat;
  const eventSnapshot = payload;
  const insertBeforeEventId = options.insertBeforeEventId || null;

  if (
    !insertBeforeEventId &&
    game.status !== 'completed' &&
    game.clock?.status === CLOCK_STATUSES.READY
  ) {
    throw new ApiError(400, 'Start the game clock before recording an event');
  }

  if (!validateSnapshot(gameFormat, eventSnapshot)) {
    throw new ApiError(400, 'Event period and clock time are invalid for this game');
  }

  // Tracking is free (T-12): no active-subscription gate on appending events.

  const context = await resolveGameTeamContext(userId, game);

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
      if (lineupIds.length === 0 && payload.statType === STAT_TYPES.SUB_OUT) {
        throw new ApiError(400, 'Set a starting lineup before making substitutions');
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
        segmentKind: eventSnapshot.segmentKind,
        segmentNumber: eventSnapshot.segmentNumber,
        clockMillisecondsRemaining: eventSnapshot.clockMillisecondsRemaining,
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
    if (lineupIds.length === 0 && payload.statType === STAT_TYPES.SUB_OUT) {
      throw new ApiError(400, 'Set a starting lineup before making substitutions');
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
      segmentKind: eventSnapshot.segmentKind,
      segmentNumber: eventSnapshot.segmentNumber,
      clockMillisecondsRemaining: eventSnapshot.clockMillisecondsRemaining,
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
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
  if (!['scheduled', 'in_progress'].includes(game.status)) {
    throw new ApiError(
      400,
      game.status === 'scheduled'
        ? 'Cannot change lineup on a game that has not started'
        : 'Cannot change lineup on a completed game'
    );
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

function requireStartingLineups(game) {
  if (game.trackingMode === 'dual_team') {
    requireBothLineups(game);
    return;
  }
  if ((game.currentLineupPlayerIds || []).length === 0) {
    throw new ApiError(400, 'Set a starting lineup before starting the game');
  }
}

async function updateClockForUser(userId, gameId, command, now = new Date()) {
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
  if (game.status === 'completed') throw new ApiError(400, 'Cannot operate a completed game clock');

  const normalized = normalizeClock(game.clock.toObject?.() || game.clock, now);
  game.clock = normalized;

  switch (command.action) {
    case 'start':
      requireStartingLineups(game);
      if (![CLOCK_STATUSES.READY, CLOCK_STATUSES.PAUSED].includes(normalized.status)) {
        throw new ApiError(400, 'Clock cannot be started in its current state');
      }
      if (game.status === 'scheduled') {
        game.status = 'in_progress';
        // Reads were live up to this point; capture the roster now that the game
        // is being played. Saved by the saveGame below, with the clock change.
        await freezeLeagueRosterSnapshots(game);
      }
      game.clock.status = CLOCK_STATUSES.RUNNING;
      game.clock.runningSince = now;
      break;
    case 'pause':
      if (normalized.status !== CLOCK_STATUSES.RUNNING) {
        throw new ApiError(400, 'Clock is not running');
      }
      game.clock.status = CLOCK_STATUSES.PAUSED;
      game.clock.runningSince = null;
      break;
    case 'finish_segment':
      if (
        ![CLOCK_STATUSES.RUNNING, CLOCK_STATUSES.PAUSED, CLOCK_STATUSES.SEGMENT_COMPLETE].includes(
          normalized.status
        )
      ) {
        throw new ApiError(400, 'Start the period before finishing it');
      }
      game.clock.status = CLOCK_STATUSES.SEGMENT_COMPLETE;
      game.clock.remainingMilliseconds = 0;
      game.clock.runningSince = null;
      break;
    case 'correct': {
      const snapshot = {
        segmentKind: command.segmentKind,
        segmentNumber: command.segmentNumber,
        clockMillisecondsRemaining: command.remainingMilliseconds,
      };
      if (!validateSnapshot(game.gameFormat, snapshot))
        throw new ApiError(400, 'Invalid clock correction');
      game.clock = {
        status:
          command.remainingMilliseconds === 0
            ? CLOCK_STATUSES.SEGMENT_COMPLETE
            : CLOCK_STATUSES.PAUSED,
        segmentKind: command.segmentKind,
        segmentNumber: command.segmentNumber,
        remainingMilliseconds: command.remainingMilliseconds,
        runningSince: null,
      };
      break;
    }
    case 'next_segment': {
      if (
        normalized.status !== CLOCK_STATUSES.SEGMENT_COMPLETE ||
        normalized.segmentKind !== SEGMENT_KINDS.REGULATION
      ) {
        throw new ApiError(400, 'The current regulation segment is not complete');
      }
      if (normalized.segmentNumber >= regulationSegmentCount(game.gameFormat)) {
        throw new ApiError(400, 'Regulation is complete');
      }
      game.clock = {
        status: CLOCK_STATUSES.READY,
        segmentKind: SEGMENT_KINDS.REGULATION,
        segmentNumber: normalized.segmentNumber + 1,
        remainingMilliseconds: segmentDurationMilliseconds(
          game.gameFormat,
          SEGMENT_KINDS.REGULATION
        ),
        runningSince: null,
      };
      break;
    }
    case 'start_overtime': {
      const regulationComplete =
        normalized.segmentKind === SEGMENT_KINDS.REGULATION &&
        normalized.segmentNumber === regulationSegmentCount(game.gameFormat);
      const overtimeComplete = normalized.segmentKind === SEGMENT_KINDS.OVERTIME;
      if (
        normalized.status !== CLOCK_STATUSES.SEGMENT_COMPLETE ||
        (!regulationComplete && !overtimeComplete)
      ) {
        throw new ApiError(400, 'Regulation or the current overtime must be complete');
      }
      game.clock = {
        status: CLOCK_STATUSES.READY,
        segmentKind: SEGMENT_KINDS.OVERTIME,
        segmentNumber: overtimeComplete ? normalized.segmentNumber + 1 : 1,
        remainingMilliseconds: segmentDurationMilliseconds(game.gameFormat, SEGMENT_KINDS.OVERTIME),
        runningSince: null,
      };
      break;
    }
    default:
      throw new ApiError(400, 'Unsupported clock action');
  }

  await saveGameEventMutation(game);
  const result = await getGameForUser(userId, gameId);
  return { ...result, serverTime: now.toISOString() };
}

async function removeEventForUser(userId, gameId, eventId) {
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
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
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
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
  if (patch.segmentKind !== undefined) {
    if (!validateSnapshot(game.gameFormat, patch)) {
      throw new ApiError(400, 'Event period and clock time are invalid for this game');
    }
    event.segmentKind = patch.segmentKind;
    event.segmentNumber = patch.segmentNumber;
    event.clockMillisecondsRemaining = patch.clockMillisecondsRemaining;
  }
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
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });

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
  const game = await assertGameAccess(userId, gameId, { requireWritable: true });
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
  if (game.clock)
    game.clock = normalizeClock(game.clock.toObject?.() || game.clock, game.completedAt);
  if (game.clock?.status === CLOCK_STATUSES.RUNNING) {
    game.clock.status = CLOCK_STATUSES.PAUSED;
    game.clock.runningSince = null;
  }
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

  await saveGameEventMutation(game);

  // OPT-010/013/017: a newly completed game changes its league's standings,
  // its standalone team's season summary, and any shared feed card's score.
  // Scheduled here (before the AI-summary branch's early returns) so it fires
  // on every path.
  scheduleLeagueRecomputeForGame(game);
  scheduleTeamSummaryRecomputeForGame(game);
  scheduleFeedCardRefreshForGame(game._id);
  scheduleAutoFeedForGame(game._id);
  scheduleMilestoneDetectionForGame(game);

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
  resolveRosterTargetForGame,
  addPlayerToGameRoster,
  canManageGameRoster,
  updateClockForUser,
  HIGHLIGHT_STAT_TYPES,
};
