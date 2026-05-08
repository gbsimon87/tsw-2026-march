const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { ApiError } = require('../../utils/apiError');
const { findTeamByIdAndOwner, findTeamById } = require('../teams/teams.repository');
const {
  createGame,
  listGamesByOwner,
  findGameById,
  saveGame,
  claimGameSummaryGeneration,
  saveGameSummary,
} = require('./games.repository');
const { STAT_TYPES, TEAM_SIDES } = require('../shared/stats.constants');
const { summarizeEvents, summarizeEventsBySide } = require('../shared/statSummary');
const { getTeamEntitlements, getBillingSummary } = require('../billing/billing.service');
const { buildGameRecap } = require('./gameRecap.service');
const { buildPersistedGameSummary } = require('./gameSummaryAi.service');
const {
  getLeagueContextForGame,
  getLeagueRosterSnapshotForTeam,
  getLeagueTeamRosterSnapshotForGame,
  canManageLeagueGame,
  canFinalizeLeagueGame,
  canEditCompletedLeagueGame,
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
    occurredAt: event.occurredAt,
  };
}

function sanitizeLogo(logo) {
  if (!logo?.url) {
    return null;
  }

  return {
    url: logo.url,
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

function sanitizeGame(game, options = {}) {
  return {
    id: String(game._id),
    ...(options.includeOwnerUserId ? { ownerUserId: String(game.ownerUserId) } : {}),
    teamId: game.teamId ? String(game.teamId) : null,
    gameContext: game.gameContext || 'standalone',
    trackingMode: game.trackingMode || 'one_sided',
    leagueId: game.leagueId ? String(game.leagueId) : null,
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

function emptyStats(playerId, displayName, options = {}) {
  return {
    playerId,
    leaguePlayerId: options.leaguePlayerId ? String(options.leaguePlayerId) : null,
    displayName,
    ftm: 0,
    fta: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ast: 0,
    oreb: 0,
    dreb: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    reb: 0,
    points: 0,
  };
}

function applyEventToRow(row, statType) {
  if (statType === STAT_TYPES.FT_MADE) {
    row.ftm += 1;
    row.fta += 1;
    row.points += 1;
    return;
  }
  if (statType === STAT_TYPES.FT_MISS) {
    row.fta += 1;
    return;
  }
  if (statType === STAT_TYPES.FG2_MADE) {
    row.fg2m += 1;
    row.fg2a += 1;
    row.points += 2;
    return;
  }
  if (statType === STAT_TYPES.FG2_MISS) {
    row.fg2a += 1;
    return;
  }
  if (statType === STAT_TYPES.FG3_MADE) {
    row.fg3m += 1;
    row.fg3a += 1;
    row.points += 3;
    return;
  }
  if (statType === STAT_TYPES.FG3_MISS) {
    row.fg3a += 1;
    return;
  }
  if (statType === STAT_TYPES.AST) {
    row.ast += 1;
    return;
  }
  if (statType === STAT_TYPES.OREB) {
    row.oreb += 1;
    row.reb += 1;
    return;
  }
  if (statType === STAT_TYPES.DREB) {
    row.dreb += 1;
    row.reb += 1;
    return;
  }
  if (statType === STAT_TYPES.STL) {
    row.stl += 1;
    return;
  }
  if (statType === STAT_TYPES.BLK) {
    row.blk += 1;
    return;
  }
  if (statType === STAT_TYPES.TOV) {
    row.tov += 1;
    return;
  }
  if (statType === STAT_TYPES.FOUL) {
    row.foul += 1;
  }
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
    entitlementsSnapshot: getTeamEntitlements(team),
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
        billing: primary.billing || { plan: 'pro', subscriptionStatus: 'active' },
        entitlements: primary.entitlements || { canViewReplay: true, canViewShotMaps: true },
        players: primary.players,
      },
      opponentTeam: {
        id: secondary.teamId || secondary.leagueTeamId,
        name: secondary.displayName,
        logo: secondary.logo,
        billing: secondary.billing || { plan: 'pro', subscriptionStatus: 'active' },
        entitlements: secondary.entitlements || { canViewReplay: true, canViewShotMaps: true },
        players: secondary.players,
      },
      participants,
      teamDoc: primary.teamDoc,
      league: leagueContext,
    };
  }

  if (game.gameContext === 'league') {
    const { league, trackedTeam, team } = await getLeagueTeamRosterSnapshotForGame(game);
    return {
      team: {
        id: String(trackedTeam._id),
        slug: trackedTeam.slug,
        name: trackedTeam.name,
        logo: sanitizeLogo(trackedTeam.logo),
        billing: {
          plan: 'pro',
          subscriptionStatus: 'active',
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
        },
        entitlements: { canViewReplay: true, canViewShotMaps: true },
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
      entitlements: getTeamEntitlements(team),
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
        billingSnapshot: { plan: 'pro', subscriptionStatus: 'active' },
        entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
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
        billingSnapshot: { plan: 'pro', subscriptionStatus: 'active' },
        entitlementsSnapshot: { canViewReplay: true, canViewShotMaps: true },
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
  const games = await listGamesByOwner(userId, filter);

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
    if (team) teamLogoById.set(String(team._id), team.logo?.url || null);
  }
  for (const team of leagueTeams) {
    if (team) teamLogoById.set(String(team._id), team.logo?.url || null);
  }

  function resolveLogoUrl(game) {
    const homeId = game.homeTeamId || game.homeLeagueTeamId || game.teamId;
    const awayId = game.awayTeamId || game.awayLeagueTeamId;
    return {
      homeLogoUrl: homeId ? (teamLogoById.get(String(homeId)) ?? null) : null,
      awayLogoUrl: awayId ? (teamLogoById.get(String(awayId)) ?? null) : null,
    };
  }

  return games.map((game) => {
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

async function getGameForUser(userId, gameId) {
  const game = await assertGameAccess(userId, gameId);
  const { team, opponentTeam, teamDoc, participants, league } = await resolveGameTeamContext(
    userId,
    game
  );
  const boxScore =
    game.trackingMode === 'dual_team'
      ? computeBoxScore(game, null, { participants })
      : computeBoxScore(game, teamDoc);
  const gameSummary = buildGameSummary(game);
  const canEditCompleted =
    game.status === 'completed' ? await canEditCompletedLeagueGame(userId, game) : false;

  // Fetch fresh logos for dual-team games so uploads after game creation are reflected
  let freshLogoByLeagueTeamId = new Map();
  if (game.trackingMode === 'dual_team') {
    const ids = [game.homeLeagueTeamId, game.awayLeagueTeamId].filter(Boolean);
    const teams = await Promise.all(ids.map((id) => findLeagueTeamById(id).catch(() => null)));
    for (const t of teams) {
      if (t) freshLogoByLeagueTeamId.set(String(t._id), t.logo?.url || null);
    }
  }

  function resolveParticipantLogo(participant, leagueTeamId) {
    if (leagueTeamId) {
      const fresh = freshLogoByLeagueTeamId.get(String(leagueTeamId));
      if (fresh !== undefined) return fresh ? { url: fresh } : null;
    }
    return participant.logo || null;
  }

  const aiSummary = sanitizeAiSummary(game.aiSummary);

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
          logo: league.logo?.url ? { url: league.logo.url } : null,
        }
      : null,
    boxScore,
    replayFilters: game.trackingMode === 'dual_team' ? ['all', 'home', 'away'] : ['all'],
    teamEntitlements: team.entitlements,
    recap: buildGameRecap(
      game,
      game.trackingMode === 'dual_team' ? participants : teamDoc,
      boxScore
    ),
    gameSummary,
    aiSummary,
    canEditCompletedGame: canEditCompleted,
  };
}

async function getPublicGame(gameId) {
  return getGameForUser(null, gameId);
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
  if (game.status !== 'in_progress') {
    if (!(await canEditCompletedLeagueGame(userId, game))) {
      throw new ApiError(400, 'Cannot track events on a completed game');
    }
  }

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
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      },
      insertBeforeEventId
    );
    recalculateCurrentLineup(game);
    clearAiSummaryAfterCompletedLeagueEdit(game);
    await saveGame(game);
    return getGameForUser(userId, gameId);
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
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    },
    insertBeforeEventId
  );

  recalculateCurrentLineup(game);
  clearAiSummaryAfterCompletedLeagueEdit(game);
  await saveGame(game);
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
  if (game.status !== 'in_progress') {
    if (!(await canEditCompletedLeagueGame(userId, game))) {
      throw new ApiError(400, 'Cannot remove events from a completed game');
    }
  }
  const event = game.events.id(eventId);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }
  event.deleteOne();
  recalculateCurrentLineup(game);
  clearAiSummaryAfterCompletedLeagueEdit(game);
  await saveGame(game);
  return getGameForUser(userId, gameId);
}

async function deleteGameForUser(userId, gameId) {
  const game = await assertGameAccess(userId, gameId);

  if (game.gameContext === 'league' && String(game.ownerUserId) !== String(userId)) {
    const canManage = await canManageLeagueGame(userId, game);
    if (!canManage) {
      throw new ApiError(403, 'Only league owners, managers, and team managers can remove games');
    }
  }

  await game.deleteOne();
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

  game.status = 'completed';
  game.completedAt = new Date();
  await saveGame(game);

  if (game.gameContext === 'league' && !game.aiSummary?.text) {
    const summaryLockId = randomUUID();
    const claimedGame = await claimGameSummaryGeneration(game._id, summaryLockId);
    if (!claimedGame) {
      return getGameForUser(userId, gameId);
    }

    const { teamDoc, participants } = await resolveGameTeamContext(userId, game);
    const boxScore =
      game.trackingMode === 'dual_team'
        ? computeBoxScore(game, null, { participants })
        : computeBoxScore(game, teamDoc);
    const recap = buildGameRecap(
      game,
      game.trackingMode === 'dual_team' ? participants : teamDoc,
      boxScore
    );
    const summary = await buildPersistedGameSummary(game, { recap, boxScore });
    await saveGameSummary(game._id, summaryLockId, summary);
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
  setGameLineup,
  removeEventForUser,
  deleteGameForUser,
  finishGameForUser,
  computeBoxScore,
  buildGameSummary,
  canAccessStandaloneDualGame,
  canEditStandaloneDualGame,
  resolveDualGameParticipants,
};
