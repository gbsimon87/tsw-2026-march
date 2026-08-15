const {
  findLeaguePlayerById,
  listLeaguePlayersByClaimedUser,
  listLeaguePlayerStatsByPlayerIds,
} = require('../leagues/leagues.repository');
const { logger } = require('../../config/logger');
const { findGameById } = require('../games/games.repository');
const { evaluateCatalog } = require('./milestones.catalog');
const { buildDedupeKey, insertMilestones } = require('./milestones.repository');

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

// Flatten a finalised game's frozen box score into one entry per league player.
// dual_team games carry two sides; one_sided games carry a single players[].
// Rows without a leaguePlayerId are standalone-roster rows and are skipped —
// milestones are league-scoped (spec §1).
function extractBoxScoreLines(game) {
  const sides =
    game.trackingMode === 'dual_team'
      ? [
          { leagueTeamId: game.homeLeagueTeamId, players: game.boxScore?.home?.players },
          { leagueTeamId: game.awayLeagueTeamId, players: game.boxScore?.away?.players },
        ]
      : [
          {
            leagueTeamId:
              game.trackedLeagueTeamId || game.homeLeagueTeamId || game.awayLeagueTeamId,
            players: game.boxScore?.players,
          },
        ];

  const lines = [];
  for (const side of sides) {
    for (const row of side.players || []) {
      if (!row.leaguePlayerId) continue;
      lines.push({
        leaguePlayerId: String(row.leaguePlayerId),
        leagueTeamId: side.leagueTeamId ? String(side.leagueTeamId) : null,
        line: row,
      });
    }
  }
  return lines;
}

// docs/player-milestones.md §5. Detection is deliberately independent of the
// public-league gate: records are written for EVERY league so private-league
// players still get profile milestones. Only publishing is gated, and that
// gate lives in feed.service.js.
async function detectForFinalizedGame(gameId, { publish = true } = {}) {
  const game = await findGameById(gameId);
  if (!game || game.status !== 'completed' || game.gameContext !== 'league') {
    return { created: [], skipped: 0 };
  }

  // Career totals are read from LeaguePlayerStats, so they must reflect THIS
  // game before we subtract it back out. recomputeLeagueAggregates coalesces
  // with the pass already in flight (recomputeInFlight), so this waits for
  // fresh data instead of duplicating the work. Required lazily to avoid a
  // require cycle — leagues.service.js pulls in games.service.js.
  const { recomputeLeagueAggregates } = require('../leagues/leagues.service');
  await recomputeLeagueAggregates(game.leagueId, game.seasonId);

  const docs = [];

  for (const entry of extractBoxScoreLines(game)) {
    const leaguePlayer = await findLeaguePlayerById(entry.leaguePlayerId);
    if (!leaguePlayer) continue;

    const { careerKey, totals } = await resolveCareerTotals(game.leagueId, leaguePlayer);
    const before = subtractGameLine(totals, entry.line);
    const earned = evaluateCatalog(before, totals, entry.line);

    for (const milestone of earned) {
      docs.push({
        leagueId: game.leagueId,
        seasonId: game.seasonId ?? null,
        careerKey,
        leaguePlayerId: leaguePlayer._id,
        leagueTeamId: entry.leagueTeamId || leaguePlayer.leagueTeamId,
        claimedByUserId: leaguePlayer.claimedByUserId ?? null,
        milestoneKey: milestone.key,
        family: milestone.family,
        tier: milestone.tier,
        statKey: milestone.statKey,
        value: milestone.value,
        label: milestone.label,
        rarityRank: milestone.rarityRank,
        sourceGameId: game._id,
        achievedAt: game.completedAt ?? new Date(),
        dedupeKey: buildDedupeKey({
          careerKey,
          milestoneKey: milestone.key,
          family: milestone.family,
          sourceGameId: game._id,
        }),
      });
    }
  }

  // Duplicates are expected on any re-run and are absorbed by the dedupeKey
  // unique index, so `created` holds only genuinely new milestones.
  const created = await insertMilestones(docs);
  const skipped = docs.length - created.length;

  logger.info(
    { gameId: String(gameId), leagueId: String(game.leagueId), created: created.length, skipped },
    'Milestones: detection complete'
  );

  if (publish && created.length > 0) {
    const { autoPublishMilestonePosts } = require('../feed/feed.service');
    await autoPublishMilestonePosts(game, created);
  }

  return { created, skipped };
}

// The set of (careerKey, milestoneKey) pairs this game earns given its current
// frozen box score. Re-evaluation uses this independently of insertion so it
// can identify existing records that no longer hold after an edit.
async function computeCurrentMilestoneKeys(gameId) {
  const game = await findGameById(gameId);
  if (!game || game.status !== 'completed' || game.gameContext !== 'league') return [];

  const results = [];
  for (const entry of extractBoxScoreLines(game)) {
    const leaguePlayer = await findLeaguePlayerById(entry.leaguePlayerId);
    if (!leaguePlayer) continue;
    const { careerKey, totals } = await resolveCareerTotals(game.leagueId, leaguePlayer);
    const before = subtractGameLine(totals, entry.line);
    for (const milestone of evaluateCatalog(before, totals, entry.line)) {
      results.push({ careerKey, key: milestone.key });
    }
  }
  return results;
}

// docs/player-milestones.md §7. Re-derive an edited completed game's
// achievements, delete records and posts that are no longer true, and record
// newly qualifying milestones without publishing them into an older feed.
//
// Accepted imprecision: editing an earlier game may shift which game crossed a
// career threshold. Reassigning that source would require replaying the league;
// the original crossing record is retained unless this game's achievement is
// itself no longer valid.
async function reevaluateMilestonesForGame(gameId) {
  const {
    listMilestonesBySourceGameId,
    deleteMilestonesByIds,
  } = require('./milestones.repository');

  const existing = await listMilestonesBySourceGameId(gameId);
  const { created } = await detectForFinalizedGame(gameId, { publish: false });
  const stillValid = new Set(
    (await computeCurrentMilestoneKeys(gameId)).map((entry) => `${entry.careerKey}|${entry.key}`)
  );
  const stale = existing.filter(
    (record) => !stillValid.has(`${record.careerKey}|${record.milestoneKey}`)
  );

  if (stale.length > 0) {
    await deleteMilestonesByIds(stale.map((record) => record._id));
    const postIds = stale.map((record) => record.postId).filter(Boolean);
    if (postIds.length > 0) {
      const { deletePostsByIds } = require('../feed/feed.service');
      await deletePostsByIds(postIds);
    }
  }

  logger.info(
    { gameId: String(gameId), removed: stale.length, created: created.length },
    'Milestones: re-evaluation after game edit complete'
  );

  return { removed: stale.length, created: created.length };
}

// docs/player-milestones.md §3.1. A claim or unclaim changes the career key
// used to find this roster row's history. Move its records to the new key and
// resolve collisions by retaining whichever achievement happened first.
async function rekeyMilestonesForPlayer(
  leaguePlayerId,
  { fromCareerKey, toCareerKey, claimedByUserId }
) {
  const {
    listMilestonesByCareerKeys,
    deleteMilestonesByIds,
    updateMilestoneCareerKey,
  } = require('./milestones.repository');

  if (fromCareerKey === toCareerKey) return { moved: 0, dropped: 0 };

  const all = await listMilestonesByCareerKeys([fromCareerKey, toCareerKey]);
  const incoming = all.filter(
    (record) =>
      record.careerKey === fromCareerKey && String(record.leaguePlayerId) === String(leaguePlayerId)
  );
  const existing = all.filter((record) => record.careerKey === toCareerKey);
  const existingByDedupe = new Map(
    existing.map((record) => [
      buildDedupeKey({
        careerKey: toCareerKey,
        milestoneKey: record.milestoneKey,
        family: record.family,
        sourceGameId: record.sourceGameId,
      }),
      record,
    ])
  );

  const toDelete = [];
  const toMove = [];

  for (const record of incoming) {
    const dedupeKey = buildDedupeKey({
      careerKey: toCareerKey,
      milestoneKey: record.milestoneKey,
      family: record.family,
      sourceGameId: record.sourceGameId,
    });
    const collision = existingByDedupe.get(dedupeKey);

    if (!collision) {
      toMove.push({ record, dedupeKey });
    } else if (new Date(record.achievedAt) < new Date(collision.achievedAt)) {
      toDelete.push(collision._id);
      toMove.push({ record, dedupeKey });
    } else {
      toDelete.push(record._id);
    }
  }

  // Delete target-side collisions before updating incoming records so the
  // unique dedupeKey index never sees both documents at once.
  if (toDelete.length > 0) {
    await deleteMilestonesByIds(toDelete);
  }
  for (const { record, dedupeKey } of toMove) {
    await updateMilestoneCareerKey(record._id, toCareerKey, dedupeKey);
  }

  const moved = toMove.length;
  const dropped = toDelete.length;
  logger.info(
    {
      leaguePlayerId: String(leaguePlayerId),
      fromCareerKey,
      toCareerKey,
      claimedByUserId: claimedByUserId ? String(claimedByUserId) : null,
      moved,
      dropped,
    },
    'Milestones: career key migration complete'
  );

  return { moved, dropped };
}

module.exports = {
  TRACKED_STATS,
  buildCareerKey,
  resolveCareerTotals,
  subtractGameLine,
  findLeaguePlayerById,
  extractBoxScoreLines,
  detectForFinalizedGame,
  reevaluateMilestonesForGame,
  rekeyMilestonesForPlayer,
};
