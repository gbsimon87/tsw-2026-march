const mongoose = require('mongoose');

const { ApiError } = require('../../utils/apiError');
const {
  findLeagueById,
  findActiveLeagueManager,
  findActiveLeagueTeamMember,
  listLeagueTeams,
  listLeaguePlayers,
  listLeaguePlayerStats,
} = require('./leagues.repository');
const { findSeasonById } = require('./seasons.repository');
const { listLeagueGamesByLeagueId } = require('../games/games.repository');
const {
  listDismissals,
  upsertDismissal,
  deleteDismissal,
} = require('./dataCompleteness.repository');
const {
  buildGameIssues,
  buildRosterIssues,
  groupIntoCategories,
  countBySeverity,
} = require('./dataCompleteness.checks');

const EMPTY_COUNTS = { high: 0, medium: 0, low: 0, dismissed: 0 };

function assertValidObjectId(value, message) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, message);
  }
}

async function loadLeague(leagueId) {
  assertValidObjectId(leagueId, 'Invalid league id');
  const league = await findLeagueById(leagueId);
  if (!league) {
    throw new ApiError(404, 'League not found');
  }
  return league;
}

// listLeaguePlayers(leagueTeamId) is scoped to a single team — see
// leagues.repository.js:384 (`LeaguePlayer.find({ leagueTeamId })`). There is no
// league-wide variant; every other caller (leagues.service.js, feed.service.js)
// fans this out per team and flattens, so we follow the same pattern here.
async function listAllLeaguePlayers(teams) {
  const rosters = await Promise.all(teams.map((team) => listLeaguePlayers(team._id)));
  return rosters.flat();
}

// Viewing is open to league owner/manager AND team managers (spec D2), so this
// returns the scope rather than a bare boolean: team managers see only their
// own team's roster issues.
async function resolveViewerScope(userId, league) {
  if (String(league.ownerUserId) === String(userId)) {
    return { role: 'owner', teamIds: null };
  }

  const manager = await findActiveLeagueManager(league._id, userId);
  if (manager) {
    return { role: 'league_manager', teamIds: null };
  }

  const teams = await listLeagueTeams(league._id);
  const managed = [];
  for (const team of teams) {
    const member = await findActiveLeagueTeamMember(team._id, userId);
    if (member && member.role === 'manager') {
      managed.push(String(team._id));
    }
  }

  if (managed.length === 0) {
    throw new ApiError(403, 'Forbidden');
  }

  return { role: 'team_manager', teamIds: new Set(managed) };
}

async function assertLeagueAdmin(userId, league) {
  if (String(league.ownerUserId) === String(userId)) return;
  const manager = await findActiveLeagueManager(league._id, userId);
  if (!manager) {
    throw new ApiError(403, 'Forbidden');
  }
}

function requireSeasonId(league) {
  if (!league.currentSeasonId) {
    throw new ApiError(400, 'League has no active season');
  }
  return league.currentSeasonId;
}

async function getDataCompletenessForUser(userId, leagueId) {
  const league = await loadLeague(leagueId);
  const scope = await resolveViewerScope(userId, league);
  const generatedAt = new Date();

  // No season is not an error: an admin who hasn't opened one simply has no
  // data to audit, and a 400 here would read as "something is broken".
  if (!league.currentSeasonId) {
    return {
      seasonId: null,
      seasonName: null,
      generatedAt: generatedAt.toISOString(),
      counts: { ...EMPTY_COUNTS },
      categories: [],
    };
  }

  const season = await findSeasonById(league.currentSeasonId);
  const seasonId = String(league.currentSeasonId);

  const teams = await listLeagueTeams(league._id);

  const [players, games, statsRows, dismissals] = await Promise.all([
    listAllLeaguePlayers(teams),
    // Signature is positional: (leagueId, seasonId) — not an options object.
    listLeagueGamesByLeagueId(league._id, seasonId),
    listLeaguePlayerStats(league._id, seasonId),
    listDismissals(league._id, seasonId),
  ]);

  const teamsById = new Map(
    teams.map((team) => [String(team._id), { id: String(team._id), name: team.name }])
  );

  const completedGameTeamIds = new Set();
  for (const game of games) {
    if (game.status !== 'completed') continue;
    if (game.homeLeagueTeamId) completedGameTeamIds.add(String(game.homeLeagueTeamId));
    if (game.awayLeagueTeamId) completedGameTeamIds.add(String(game.awayLeagueTeamId));
  }

  // Appearances come from the materialized LeaguePlayerStats rows, NOT from game
  // events. Events carry `playerId`, which points at a game's embedded roster
  // *snapshot* entry, and the snapshot stores `leaguePlayerId` separately (see
  // leagues.service.js:1035/1043). Deriving appearances from events would mean
  // re-implementing that indirection; the stats collection already did it, is
  // season-scoped, and is indexed on (leagueId, seasonId, leagueTeamId, leaguePlayerId).
  const statsByPlayerId = new Map(
    statsRows.map((row) => [String(row.leaguePlayerId), { gamesCount: row.gamesCount ?? 0 }])
  );

  const gameIssues = buildGameIssues({
    games: games.map((game) => ({
      id: String(game._id),
      status: game.status,
      scheduledAt: game.scheduledAt,
      venue: game.venue,
      trackingMode: game.trackingMode,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
      trackedLeagueTeamId: game.trackedLeagueTeamId,
      events: game.events ?? [],
    })),
    teamsById,
    now: generatedAt,
  });

  const rosterIssues = buildRosterIssues({
    teams: teams.map((team) => ({ id: String(team._id), name: team.name, logo: team.logo })),
    players: players.map((player) => ({
      id: String(player._id),
      leagueTeamId: String(player.leagueTeamId),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber,
      isActive: player.isActive,
      claimedByUserId: player.claimedByUserId,
    })),
    statsByPlayerId,
    completedGameTeamIds,
  });

  const dismissedKeys = new Set(dismissals.map((row) => row.issueKey));

  let issues = [...gameIssues, ...rosterIssues].map((issue) => ({
    ...issue,
    dismissed: dismissedKeys.has(issue.issueKey),
  }));

  // A team manager sees league-wide game issues but only their own roster.
  if (scope.teamIds) {
    issues = issues.filter((issue) => !issue.leagueTeamId || scope.teamIds.has(issue.leagueTeamId));
  }

  return {
    seasonId,
    seasonName: season?.name ?? null,
    generatedAt: generatedAt.toISOString(),
    counts: countBySeverity(issues),
    categories: groupIntoCategories(issues),
  };
}

async function dismissIssueForUser(userId, leagueId, payload) {
  const league = await loadLeague(leagueId);
  await assertLeagueAdmin(userId, league);
  const seasonId = requireSeasonId(league);

  await upsertDismissal({
    leagueId: league._id,
    seasonId,
    issueKey: payload.issueKey,
    dismissedByUserId: userId,
    note: payload.note ?? null,
  });

  return { issueKey: payload.issueKey, dismissed: true };
}

async function restoreIssueForUser(userId, leagueId, issueKey) {
  const league = await loadLeague(leagueId);
  await assertLeagueAdmin(userId, league);
  const seasonId = requireSeasonId(league);

  await deleteDismissal(league._id, seasonId, issueKey);

  return { issueKey, dismissed: false };
}

module.exports = {
  getDataCompletenessForUser,
  dismissIssueForUser,
  restoreIssueForUser,
};
