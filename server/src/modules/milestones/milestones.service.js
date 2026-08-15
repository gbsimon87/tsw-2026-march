const {
  findLeaguePlayerById,
  listLeaguePlayersByClaimedUser,
  listLeaguePlayerStatsByPlayerIds,
} = require('../leagues/leagues.repository');

// Mirrors the full LeaguePlayerStats line. This MUST include the attempt and
// foul counters (fg2a/fg3a/fta/tov/foul) even though no threshold ladder uses
// them: the catalog's hasRecordedStats() reads exactly those fields to decide
// whether a player has any career history, and it is applied to `before` as
// well as to the game line. Track only the scoring stats here and `before`
// always looks empty, which fires a spurious debut milestone every game.
const TRACKED_STATS = [
  'points',
  'reb',
  'oreb',
  'dreb',
  'ast',
  'fg2m',
  'fg2a',
  'fg3m',
  'fg3a',
  'ftm',
  'fta',
  'stl',
  'blk',
  'tov',
  'foul',
];

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyTotals() {
  return TRACKED_STATS.reduce((totals, key) => ({ ...totals, [key]: 0 }), { gamesCount: 0 });
}

// docs/player-milestones.md §3. LeaguePlayer.leagueTeamId is immutable and
// there is no transfer feature, so a claimed user id is the only thing that
// links a player's roster rows across teams within a league.
function buildCareerKey(leaguePlayer) {
  return leaguePlayer.claimedByUserId
    ? `user:${String(leaguePlayer.claimedByUserId)}`
    : `player:${String(leaguePlayer._id)}`;
}

async function resolveCareerTotals(leagueId, leaguePlayer) {
  const careerKey = buildCareerKey(leaguePlayer);

  let leaguePlayerIds = [String(leaguePlayer._id)];
  if (leaguePlayer.claimedByUserId) {
    const siblings = await listLeaguePlayersByClaimedUser(leaguePlayer.claimedByUserId);
    leaguePlayerIds = siblings
      .filter((row) => String(row.leagueId) === String(leagueId))
      .map((row) => String(row._id));
    if (!leaguePlayerIds.includes(String(leaguePlayer._id))) {
      leaguePlayerIds.push(String(leaguePlayer._id));
    }
  }

  const rows = await listLeaguePlayerStatsByPlayerIds(leagueId, leaguePlayerIds);

  const totals = rows.reduce((acc, row) => {
    acc.gamesCount += num(row.gamesCount);
    for (const key of TRACKED_STATS) {
      acc[key] += num(row[key]);
    }
    return acc;
  }, emptyTotals());

  return { careerKey, totals, leaguePlayerIds };
}

// docs/player-milestones.md §5.2. `before` is derived by subtraction rather
// than stored, so the inputs are always the frozen box score plus the freshly
// recomputed aggregate — never an incrementally-mutated counter that could
// double-count on a retry.
function subtractGameLine(totals, gameLine) {
  const before = { gamesCount: Math.max(0, num(totals.gamesCount) - 1) };
  for (const key of TRACKED_STATS) {
    before[key] = Math.max(0, num(totals[key]) - num(gameLine[key]));
  }
  return before;
}

module.exports = {
  TRACKED_STATS,
  buildCareerKey,
  resolveCareerTotals,
  subtractGameLine,
  findLeaguePlayerById,
};
