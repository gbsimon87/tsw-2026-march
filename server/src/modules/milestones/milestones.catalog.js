// Player Milestones (docs/player-milestones.md §4). Every rule here is a pure
// function of (before, after, gameLine) — no database, no I/O — so the whole
// catalog is unit-testable and rarity can be re-tuned by editing this file
// alone, with no recompute pass. Same principle as the OPT-011 note on
// leaguePlayerStatsSchema: persist raw totals, derive judgement at read time.

const MILESTONE_FAMILIES = {
  CAREER_THRESHOLD: 'career_threshold',
  SINGLE_GAME_FEAT: 'single_game_feat',
  FIRST: 'first',
};

const MILESTONE_TIERS = { FEED: 'feed', PROFILE: 'profile' };

// Per-game cap on feed-tier milestone posts, mirroring AUTO_HIGHLIGHT_CAP in
// feed.service.js. The Pulse is video-first; milestones must never crowd out
// highlight clips.
const AUTO_MILESTONE_CAP = 2;

const PROFILE_RANK = 99;

const CAREER_LADDERS = [
  {
    statKey: 'points',
    noun: 'points',
    rungs: [100, 250, 500, 1000, 2000, 5000],
    feedRungs: [500, 1000, 2000, 5000],
  },
  { statKey: 'reb', noun: 'rebounds', rungs: [100, 250, 500, 1000], feedRungs: [500, 1000] },
  { statKey: 'ast', noun: 'assists', rungs: [100, 250, 500, 1000], feedRungs: [250, 500, 1000] },
  { statKey: 'fg3m', noun: 'three-pointers', rungs: [25, 50, 100, 250], feedRungs: [100, 250] },
  { statKey: 'stl', noun: 'steals', rungs: [50, 100, 250], feedRungs: [] },
  { statKey: 'blk', noun: 'blocks', rungs: [25, 50, 100], feedRungs: [] },
];

// Spec §4.4. Lower is rarer; only feed-tier ranks matter, since the cap only
// ever ranks feed-tier milestones.
function careerThresholdRank(statKey, rung) {
  if (statKey === 'points' && rung >= 2000) return 2;
  if (rung >= 1000) return 5;
  return 7;
}

const DOUBLE_CATEGORIES = ['points', 'reb', 'ast', 'stl', 'blk'];

// Single-game ladders: only the highest satisfied rung is recorded, so a
// 41-point game yields pts_40 and not also pts_30.
const FEAT_LADDERS = [
  {
    statKey: 'points',
    rungs: [
      { threshold: 30, key: 'pts_30', tier: MILESTONE_TIERS.PROFILE, rarityRank: PROFILE_RANK },
      { threshold: 40, key: 'pts_40', tier: MILESTONE_TIERS.FEED, rarityRank: 4 },
    ],
    label: (value) => `${value}-point game`,
  },
  {
    statKey: 'fg3m',
    rungs: [
      { threshold: 7, key: 'fg3m_7', tier: MILESTONE_TIERS.PROFILE, rarityRank: PROFILE_RANK },
      { threshold: 10, key: 'fg3m_10', tier: MILESTONE_TIERS.FEED, rarityRank: 3 },
    ],
    label: (value) => `${value} threes in a game`,
  },
  {
    statKey: 'stl',
    rungs: [{ threshold: 6, key: 'stl_6', tier: MILESTONE_TIERS.FEED, rarityRank: 6 }],
    label: (value) => `${value} steals in a game`,
  },
  {
    statKey: 'blk',
    rungs: [{ threshold: 5, key: 'blk_5', tier: MILESTONE_TIERS.FEED, rarityRank: 6 }],
    label: (value) => `${value} blocks in a game`,
  },
];

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// "Did this player actually do anything?" Every trackable stat event lands in
// one of these counters, so a zero across all of them means the player was on
// the roster but never recorded a stat. Used for debut detection, because
// gamesCount counts roster appearances rather than games played (spec §2).
function hasRecordedStats(line) {
  if (!line) return false;
  return (
    num(line.fg2a) +
      num(line.fg3a) +
      num(line.fta) +
      num(line.ast) +
      num(line.reb) +
      num(line.stl) +
      num(line.blk) +
      num(line.tov) +
      num(line.foul) >
    0
  );
}

function evaluateCareerThresholds(before, after) {
  const results = [];

  for (const ladder of CAREER_LADDERS) {
    const beforeValue = num(before[ladder.statKey]);
    const afterValue = num(after[ladder.statKey]);

    // Ladder suppression: take the highest rung crossed by this game, not all
    // of them. A single huge game that vaults 90 -> 260 points records the
    // 250 milestone only.
    const crossed = ladder.rungs.filter((rung) => rung > beforeValue && rung <= afterValue);
    if (crossed.length === 0) continue;

    const rung = crossed[crossed.length - 1];
    const isFeed = ladder.feedRungs.includes(rung);

    results.push({
      key: `career_${ladder.statKey}_${rung}`,
      family: MILESTONE_FAMILIES.CAREER_THRESHOLD,
      tier: isFeed ? MILESTONE_TIERS.FEED : MILESTONE_TIERS.PROFILE,
      rarityRank: isFeed ? careerThresholdRank(ladder.statKey, rung) : PROFILE_RANK,
      statKey: ladder.statKey,
      value: rung,
      label: `${rung.toLocaleString('en-US')} career ${ladder.noun}`,
    });
  }

  return results;
}

function evaluateSingleGameFeats(gameLine) {
  const results = [];

  const doubleCount = DOUBLE_CATEGORIES.filter((key) => num(gameLine[key]) >= 10).length;
  if (doubleCount >= 3) {
    results.push({
      key: 'triple_double',
      family: MILESTONE_FAMILIES.SINGLE_GAME_FEAT,
      tier: MILESTONE_TIERS.FEED,
      rarityRank: 1,
      statKey: null,
      value: doubleCount,
      label: 'Triple-double',
    });
  } else if (doubleCount === 2) {
    results.push({
      key: 'double_double',
      family: MILESTONE_FAMILIES.SINGLE_GAME_FEAT,
      tier: MILESTONE_TIERS.PROFILE,
      rarityRank: PROFILE_RANK,
      statKey: null,
      value: doubleCount,
      label: 'Double-double',
    });
  }

  for (const ladder of FEAT_LADDERS) {
    const value = num(gameLine[ladder.statKey]);
    const satisfied = ladder.rungs.filter((rung) => value >= rung.threshold);
    if (satisfied.length === 0) continue;

    const rung = satisfied[satisfied.length - 1];
    results.push({
      key: rung.key,
      family: MILESTONE_FAMILIES.SINGLE_GAME_FEAT,
      tier: rung.tier,
      rarityRank: rung.rarityRank,
      statKey: ladder.statKey,
      value,
      label: ladder.label(value),
    });
  }

  return results;
}

function evaluateFirsts(before, after, gameLine) {
  const results = [];

  // Debut is defined on recorded stats, not gamesCount, so a player who sat on
  // the bench for two games still gets their debut on the night they play.
  if (!hasRecordedStats(before) && hasRecordedStats(gameLine)) {
    results.push({
      key: 'first_career_game',
      family: MILESTONE_FAMILIES.FIRST,
      tier: MILESTONE_TIERS.PROFILE,
      rarityRank: PROFILE_RANK,
      statKey: null,
      value: 1,
      label: 'First career game',
    });
  }

  if (num(before.points) === 0 && num(after.points) > 0) {
    results.push({
      key: 'first_career_points',
      family: MILESTONE_FAMILIES.FIRST,
      tier: MILESTONE_TIERS.PROFILE,
      rarityRank: PROFILE_RANK,
      statKey: 'points',
      value: num(gameLine.points),
      label: 'First career points',
    });
  }

  if (num(before.fg3m) === 0 && num(after.fg3m) > 0) {
    results.push({
      key: 'first_career_three',
      family: MILESTONE_FAMILIES.FIRST,
      tier: MILESTONE_TIERS.PROFILE,
      rarityRank: PROFILE_RANK,
      statKey: 'fg3m',
      value: num(gameLine.fg3m),
      label: 'First career three',
    });
  }

  return results;
}

function evaluateCatalog(before, after, gameLine) {
  return [
    ...evaluateCareerThresholds(before || {}, after || {}),
    ...evaluateSingleGameFeats(gameLine || {}),
    ...evaluateFirsts(before || {}, after || {}, gameLine || {}),
  ];
}

module.exports = {
  MILESTONE_FAMILIES,
  MILESTONE_TIERS,
  AUTO_MILESTONE_CAP,
  evaluateCatalog,
  hasRecordedStats,
};
