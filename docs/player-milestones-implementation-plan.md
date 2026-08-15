# Player Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive player milestones from finalized league games, record them durably, surface them on player profiles, and publish only the rarest ones to The Pulse.

**Architecture:** A new `milestones` server module owns a declarative rule catalog of pure functions plus an append-only `PlayerMilestone` ledger. At finalize, detection awaits the existing league-aggregate recompute, derives `before` totals by subtracting the game's frozen box-score line from the recomputed career total, runs the catalog, and inserts records whose idempotency is guaranteed by a unique `dedupeKey` index rather than by application logic. Publishing to the feed is a separate, separately-flagged step that goes through `feed.service.js` so the public-league gate stays in one place.

**Tech Stack:** Express (CommonJS), Mongoose, Zod, Jest + Supertest (server); React 18, TanStack Query, Tailwind, Vitest + React Testing Library (client).

**Spec:** [`docs/player-milestones.md`](./player-milestones.md) — read it before starting. Every task below implements a section of it, cited per task.

## Global Constraints

- **Server module layout:** `routes → controller → service → repository (+ validation.js)`, files named `<domain>.<layer>.js`. Mongoose schemas are defined **inline in the repository file**. There is no `models/` directory.
- **Business logic AND authorization live in `*.service.js`.** Controllers only validate (Zod `schema.parse`) and shape responses.
- **Errors:** `throw new ApiError(status, message, details?)` from services. Wrap route handlers in `asyncHandler`.
- **Client:** named exports everywhere, feature-local API modules, relative imports (no path aliases), Zod at boundaries, Tailwind inline.
- **Test runners are not interchangeable:** server is Jest (`pnpm --filter server test`), client is Vitest (`pnpm --filter client test`). Never use Jest on the client or Vitest on the server.
- **Server test idiom:** unit tests mock the repository layer with `jest.mock`; route tests under `tests/integration/` mock the _service_ layer and assert routing/auth. Neither hits a real database.
- **Commits:** conventional commits, enforced by commitlint + Husky. A `docs:` or `feat:` prefix is required or the commit is rejected.
- **Never delete `OPT-###` comments.**
- **Feed cap:** `AUTO_MILESTONE_CAP = 2`.
- **Env flag:** `AUTO_FEED_MILESTONES_ENABLED`, default `false`.
- **Career key format:** `user:<claimedByUserId>` when claimed, else `player:<leaguePlayerId>`.

---

### Task 1: Milestone catalog (pure rules)

Implements spec §4. Zero dependencies — pure functions, no database, no imports from other modules. This is the highest-value test surface in the feature.

**Files:**

- Create: `server/src/modules/milestones/milestones.catalog.js`
- Test: `server/src/tests/unit/milestones.catalog.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `MILESTONE_FAMILIES = { CAREER_THRESHOLD: 'career_threshold', SINGLE_GAME_FEAT: 'single_game_feat', FIRST: 'first' }`
  - `MILESTONE_TIERS = { FEED: 'feed', PROFILE: 'profile' }`
  - `evaluateCatalog(before, after, gameLine) -> Array<{ key, family, tier, rarityRank, statKey, value, label }>`
  - `hasRecordedStats(line) -> boolean`
  - `AUTO_MILESTONE_CAP = 2`

`before`/`after` are career-total objects with numeric fields `gamesCount, points, reb, ast, fg3m, stl, blk` (extra fields ignored). `gameLine` is a box-score row with `points, reb, ast, fg3m, fg3a, fg2a, fta, stl, blk, tov, foul`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.catalog.test.js`:

```js
const {
  evaluateCatalog,
  hasRecordedStats,
  MILESTONE_FAMILIES,
  MILESTONE_TIERS,
} = require('../../modules/milestones/milestones.catalog');

// Mirrors the real career-totals shape from resolveCareerTotals, INCLUDING the
// attempt counters — hasRecordedStats() reads those, so a narrower fixture
// would let a debut-detection bug pass unnoticed.
function totals(overrides = {}) {
  return {
    gamesCount: 10,
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

function keysOf(results) {
  return results.map((r) => r.key).sort();
}

describe('career thresholds', () => {
  test('awards a threshold when the total crosses a rung', () => {
    const results = evaluateCatalog(
      totals({ points: 480 }),
      totals({ points: 505 }),
      line({ points: 25 })
    );
    expect(keysOf(results)).toContain('career_points_500');
  });

  test('treats landing exactly on a rung as a crossing', () => {
    const results = evaluateCatalog(
      totals({ points: 990 }),
      totals({ points: 1000 }),
      line({ points: 10 })
    );
    expect(keysOf(results)).toContain('career_points_1000');
  });

  test('does not re-award a rung already passed', () => {
    const results = evaluateCatalog(
      totals({ points: 1001 }),
      totals({ points: 1012 }),
      line({ points: 11 })
    );
    expect(keysOf(results)).not.toContain('career_points_1000');
  });

  test('records only the highest rung when one game crosses two', () => {
    const results = evaluateCatalog(
      totals({ points: 90 }),
      totals({ points: 260 }),
      line({ points: 170 })
    );
    const pointKeys = keysOf(results).filter((k) => k.startsWith('career_points_'));
    expect(pointKeys).toEqual(['career_points_250']);
  });

  test('tiers steals and blocks thresholds as profile-only', () => {
    const results = evaluateCatalog(totals({ stl: 45 }), totals({ stl: 52 }), line({ stl: 7 }));
    const steal = results.find((r) => r.key === 'career_stl_50');
    expect(steal.tier).toBe(MILESTONE_TIERS.PROFILE);
  });

  test('tiers the 1000-point threshold as feed', () => {
    const results = evaluateCatalog(
      totals({ points: 995 }),
      totals({ points: 1005 }),
      line({ points: 10 })
    );
    const milestone = results.find((r) => r.key === 'career_points_1000');
    expect(milestone.tier).toBe(MILESTONE_TIERS.FEED);
    expect(milestone.family).toBe(MILESTONE_FAMILIES.CAREER_THRESHOLD);
    expect(milestone.value).toBe(1000);
  });
});

describe('single-game feats', () => {
  test('awards a triple-double and suppresses the double-double', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 12, reb: 11, ast: 10 }),
      line({ points: 12, reb: 11, ast: 10 })
    );
    expect(keysOf(results)).toContain('triple_double');
    expect(keysOf(results)).not.toContain('double_double');
  });

  test('awards a double-double on exactly two categories', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 20, reb: 10 }),
      line({ points: 20, reb: 10 })
    );
    expect(keysOf(results)).toContain('double_double');
  });

  test('records only the highest points rung', () => {
    const results = evaluateCatalog(totals(), totals({ points: 41 }), line({ points: 41 }));
    const pts = keysOf(results).filter((k) => k.startsWith('pts_'));
    expect(pts).toEqual(['pts_40']);
  });

  test('records only the highest threes rung', () => {
    const results = evaluateCatalog(totals(), totals({ fg3m: 11 }), line({ fg3m: 11 }));
    const threes = keysOf(results).filter((k) => k.startsWith('fg3m_'));
    expect(threes).toEqual(['fg3m_10']);
  });

  test('awards 5+ blocks as feed tier', () => {
    const results = evaluateCatalog(totals(), totals({ blk: 5 }), line({ blk: 5 }));
    expect(results.find((r) => r.key === 'blk_5').tier).toBe(MILESTONE_TIERS.FEED);
  });
});

describe('firsts', () => {
  test('awards a debut on the first game with recorded stats', () => {
    const results = evaluateCatalog(
      totals({ gamesCount: 2 }),
      totals({ gamesCount: 3, points: 4 }),
      line({ points: 4, fg2a: 3 })
    );
    expect(keysOf(results)).toContain('first_career_game');
  });

  test('does not award a debut when earlier games already had stats', () => {
    const results = evaluateCatalog(
      totals({ points: 8, fg2a: 9, foul: 2 }),
      totals({ points: 14, fg2a: 14, foul: 3 }),
      line({ points: 6, fg2a: 5, foul: 1 })
    );
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('does not award a debut to a veteran whose prior games were scoreless', () => {
    // Regression guard: `before` is a career-totals object, not a box-score
    // row. If the totals shape omits the attempt counters, hasRecordedStats
    // reads undefined for all of them and every game looks like a debut.
    const results = evaluateCatalog(
      totals({ points: 0, fg2a: 12, foul: 6 }),
      totals({ points: 2, fg2a: 15, foul: 7 }),
      line({ points: 2, fg2a: 3, foul: 1 })
    );
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('does not award a debut for a scoreless bench appearance', () => {
    const results = evaluateCatalog(totals({ gamesCount: 0 }), totals({ gamesCount: 1 }), line());
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('awards first career three', () => {
    const results = evaluateCatalog(
      totals({ points: 6 }),
      totals({ points: 9, fg3m: 1 }),
      line({ points: 3, fg3m: 1 })
    );
    expect(keysOf(results)).toContain('first_career_three');
  });
});

describe('hasRecordedStats', () => {
  test('is false for an all-zero line', () => {
    expect(hasRecordedStats(line())).toBe(false);
  });

  test('is true when only a foul was recorded', () => {
    expect(hasRecordedStats(line({ foul: 1 }))).toBe(true);
  });

  test('is true for a missed shot with no points', () => {
    expect(hasRecordedStats(line({ fg3a: 1 }))).toBe(true);
  });
});

describe('rarity ranking', () => {
  test('ranks a triple-double above a 40-point game', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 41, reb: 10, ast: 10 }),
      line({ points: 41, reb: 10, ast: 10 })
    );
    const triple = results.find((r) => r.key === 'triple_double');
    const forty = results.find((r) => r.key === 'pts_40');
    expect(triple.rarityRank).toBeLessThan(forty.rarityRank);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.catalog`
Expected: FAIL — `Cannot find module '../../modules/milestones/milestones.catalog'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/milestones/milestones.catalog.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- milestones.catalog`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/milestones/milestones.catalog.js server/src/tests/unit/milestones.catalog.test.js
git commit -m "feat: add player milestone catalog rules"
```

---

### Task 2: PlayerMilestone model and repository

Implements spec §6. The `dedupeKey` unique index is the whole idempotency mechanism — get it right here and detection can be re-run freely.

**Files:**

- Create: `server/src/modules/milestones/milestones.repository.js`
- Test: `server/src/tests/unit/milestones.repository.schema.test.js`

**Interfaces:**

- Consumes: `MILESTONE_FAMILIES`, `MILESTONE_TIERS` from Task 1.
- Produces:
  - `PlayerMilestone` (Mongoose model)
  - `buildDedupeKey({ careerKey, milestoneKey, family, sourceGameId }) -> string`
  - `insertMilestones(docs) -> Promise<Array<doc>>` — inserts unordered, swallows duplicate-key errors, returns only the docs actually inserted
  - `listMilestonesByLeaguePlayerIds(leaguePlayerIds, { limit }) -> Promise<Array<doc>>`
  - `listMilestonesByCareerKey(careerKey, { limit, cursor }) -> Promise<Array<doc>>`
  - `countMilestonesByLeaguePlayerIds(leaguePlayerIds) -> Promise<number>`
  - `listMilestonesBySourceGameId(gameId) -> Promise<Array<doc>>`
  - `deleteMilestonesByIds(ids) -> Promise<{ deletedCount: number }>`
  - `listMilestonesByCareerKeys(careerKeys) -> Promise<Array<doc>>`
  - `updateMilestoneCareerKey(id, careerKey, dedupeKey) -> Promise<void>`
  - `setMilestonePostId(id, postId) -> Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.repository.schema.test.js`:

```js
const {
  PlayerMilestone,
  buildDedupeKey,
} = require('../../modules/milestones/milestones.repository');
const { MILESTONE_FAMILIES } = require('../../modules/milestones/milestones.catalog');

describe('buildDedupeKey', () => {
  test('omits the game for once-per-career milestones', () => {
    expect(
      buildDedupeKey({
        careerKey: 'user:abc',
        milestoneKey: 'career_points_1000',
        family: MILESTONE_FAMILIES.CAREER_THRESHOLD,
        sourceGameId: 'game1',
      })
    ).toBe('user:abc|career_points_1000');
  });

  test('omits the game for firsts', () => {
    expect(
      buildDedupeKey({
        careerKey: 'player:xyz',
        milestoneKey: 'first_career_three',
        family: MILESTONE_FAMILIES.FIRST,
        sourceGameId: 'game1',
      })
    ).toBe('player:xyz|first_career_three');
  });

  test('includes the game for repeatable single-game feats', () => {
    expect(
      buildDedupeKey({
        careerKey: 'user:abc',
        milestoneKey: 'triple_double',
        family: MILESTONE_FAMILIES.SINGLE_GAME_FEAT,
        sourceGameId: 'game1',
      })
    ).toBe('user:abc|triple_double|game1');
  });
});

describe('PlayerMilestone schema', () => {
  test('declares a unique index on dedupeKey', () => {
    const indexes = PlayerMilestone.schema.indexes();
    const dedupe = indexes.find(([fields]) => fields.dedupeKey === 1);
    expect(dedupe).toBeDefined();
    expect(dedupe[1].unique).toBe(true);
  });

  test('indexes the profile and unified-profile read paths', () => {
    const indexes = PlayerMilestone.schema.indexes();
    const byPlayer = indexes.find(
      ([fields]) => fields.leaguePlayerId === 1 && fields.achievedAt === -1
    );
    const byUser = indexes.find(
      ([fields]) => fields.claimedByUserId === 1 && fields.achievedAt === -1
    );
    expect(byPlayer).toBeDefined();
    expect(byUser).toBeDefined();
  });

  test('indexes sourceGameId for edit re-evaluation', () => {
    const indexes = PlayerMilestone.schema.indexes();
    expect(indexes.find(([fields]) => fields.sourceGameId === 1)).toBeDefined();
  });

  test('rejects an unknown family', () => {
    const doc = new PlayerMilestone({
      leagueId: '507f1f77bcf86cd799439011',
      careerKey: 'user:abc',
      leaguePlayerId: '507f1f77bcf86cd799439012',
      leagueTeamId: '507f1f77bcf86cd799439013',
      milestoneKey: 'career_points_500',
      family: 'not_a_family',
      tier: 'feed',
      sourceGameId: '507f1f77bcf86cd799439014',
      achievedAt: new Date(),
      dedupeKey: 'user:abc|career_points_500',
    });
    const error = doc.validateSync();
    expect(error.errors.family).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.repository.schema`
Expected: FAIL — `Cannot find module '../../modules/milestones/milestones.repository'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/milestones/milestones.repository.js`:

```js
const mongoose = require('mongoose');
const { MILESTONE_FAMILIES, MILESTONE_TIERS } = require('./milestones.catalog');

// Player Milestones (docs/player-milestones.md §6). Append-only ledger of
// milestones a player has earned. Idempotency is a property of the dedupeKey
// unique index, NOT of application logic — re-running detection for a game is
// always safe, which is what lets finalize retries, post-completion edits and
// the backfill script all share one code path.
const playerMilestoneSchema = new mongoose.Schema(
  {
    leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', default: null },
    // `user:<id>` when the roster row is claimed, else `player:<id>`. See
    // spec §3 — LeaguePlayer.leagueTeamId never changes, so a claimed user id
    // is the only thread linking a player's rows across teams in a league.
    careerKey: { type: String, required: true, index: true },
    leaguePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaguePlayer',
      required: true,
    },
    leagueTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeagueTeam',
      required: true,
    },
    // Denormalised so the unified /players/:userId profile can read every
    // milestone for a user without first resolving their LeaguePlayer rows.
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    milestoneKey: { type: String, required: true },
    family: { type: String, enum: Object.values(MILESTONE_FAMILIES), required: true },
    tier: { type: String, enum: Object.values(MILESTONE_TIERS), required: true },
    statKey: { type: String, default: null },
    value: { type: Number, default: null },
    label: { type: String, default: null },
    // Persisted so the feed cap can rank a game's milestones without
    // re-running the catalog. Lower is rarer; 99 means profile-tier.
    rarityRank: { type: Number, default: 99 },
    sourceGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    achievedAt: { type: Date, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true }
);

playerMilestoneSchema.index({ dedupeKey: 1 }, { unique: true });
playerMilestoneSchema.index({ leaguePlayerId: 1, achievedAt: -1 });
playerMilestoneSchema.index({ claimedByUserId: 1, achievedAt: -1 });
playerMilestoneSchema.index({ sourceGameId: 1 });

const PlayerMilestone =
  mongoose.models.PlayerMilestone || mongoose.model('PlayerMilestone', playerMilestoneSchema);

// One string carries the whole idempotency rule, so a single unique index
// covers both once-per-career milestones and repeatable per-game feats.
function buildDedupeKey({ careerKey, milestoneKey, family, sourceGameId }) {
  if (family === MILESTONE_FAMILIES.SINGLE_GAME_FEAT) {
    return `${careerKey}|${milestoneKey}|${String(sourceGameId)}`;
  }
  return `${careerKey}|${milestoneKey}`;
}

// Unordered insert so one duplicate does not abort the batch. E11000 means the
// milestone was already awarded — expected on any re-run, never a failure.
async function insertMilestones(docs) {
  if (!docs || docs.length === 0) return [];
  try {
    return await PlayerMilestone.insertMany(docs, { ordered: false, rawResult: false });
  } catch (error) {
    if (error?.code === 11000 || error?.writeErrors) {
      return error.insertedDocs || [];
    }
    throw error;
  }
}

function listMilestonesByLeaguePlayerIds(leaguePlayerIds, { limit = 5 } = {}) {
  return PlayerMilestone.find({ leaguePlayerId: { $in: leaguePlayerIds } })
    .sort({ achievedAt: -1 })
    .limit(limit)
    .lean();
}

function countMilestonesByLeaguePlayerIds(leaguePlayerIds) {
  return PlayerMilestone.countDocuments({ leaguePlayerId: { $in: leaguePlayerIds } });
}

function listMilestonesByCareerKey(careerKey, { limit = 20, cursor = null } = {}) {
  const query = { careerKey };
  if (cursor) {
    query._id = { $lt: cursor };
  }
  return PlayerMilestone.find(query).sort({ _id: -1 }).limit(limit).lean();
}

function listMilestonesByCareerKeys(careerKeys) {
  return PlayerMilestone.find({ careerKey: { $in: careerKeys } })
    .sort({ achievedAt: -1 })
    .lean();
}

function listMilestonesBySourceGameId(gameId) {
  return PlayerMilestone.find({ sourceGameId: gameId }).lean();
}

async function deleteMilestonesByIds(ids) {
  if (!ids || ids.length === 0) return { deletedCount: 0 };
  return PlayerMilestone.deleteMany({ _id: { $in: ids } });
}

async function updateMilestoneCareerKey(id, careerKey, dedupeKey) {
  await PlayerMilestone.updateOne({ _id: id }, { $set: { careerKey, dedupeKey } });
}

async function setMilestonePostId(id, postId) {
  await PlayerMilestone.updateOne({ _id: id }, { $set: { postId } });
}

module.exports = {
  PlayerMilestone,
  buildDedupeKey,
  insertMilestones,
  listMilestonesByLeaguePlayerIds,
  countMilestonesByLeaguePlayerIds,
  listMilestonesByCareerKey,
  listMilestonesByCareerKeys,
  listMilestonesBySourceGameId,
  deleteMilestonesByIds,
  updateMilestoneCareerKey,
  setMilestonePostId,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- milestones.repository.schema`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/milestones/milestones.repository.js server/src/tests/unit/milestones.repository.schema.test.js
git commit -m "feat: add PlayerMilestone model and repository"
```

---

### Task 3: Career identity and totals resolution

Implements spec §3 and §5.2 steps 1–3. Pure-ish service helpers with mocked repositories.

**Files:**

- Create: `server/src/modules/milestones/milestones.service.js`
- Test: `server/src/tests/unit/milestones.identity.test.js`

**Interfaces:**

- Consumes: `listLeaguePlayersByClaimedUser`, `findLeaguePlayerById` from `leagues.repository`; `LeaguePlayerStats` via a new repository helper.
- Produces:
  - `buildCareerKey(leaguePlayer) -> string`
  - `resolveCareerTotals(leagueId, leaguePlayer) -> Promise<{ careerKey, totals, leaguePlayerIds }>` where `totals` has `{ gamesCount, points, reb, ast, fg3m, stl, blk }`
  - `subtractGameLine(totals, gameLine) -> totals` — returns `before`, clamped at zero

**Also modify:** `server/src/modules/leagues/leagues.repository.js` — add and export:

```js
function listLeaguePlayerStatsByPlayerIds(leagueId, leaguePlayerIds) {
  return LeaguePlayerStats.find({ leagueId, leaguePlayerId: { $in: leaguePlayerIds } }).lean();
}
```

Add `listLeaguePlayerStatsByPlayerIds` to that file's `module.exports`, next to `listLeaguePlayerStats`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.identity.test.js`:

```js
jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

const leaguesRepository = require('../../modules/leagues/leagues.repository');
const {
  buildCareerKey,
  resolveCareerTotals,
  subtractGameLine,
} = require('../../modules/milestones/milestones.service');

describe('buildCareerKey', () => {
  test('uses the claiming user when the roster row is claimed', () => {
    expect(buildCareerKey({ _id: 'p1', claimedByUserId: 'u9' })).toBe('user:u9');
  });

  test('falls back to the roster row when unclaimed', () => {
    expect(buildCareerKey({ _id: 'p1', claimedByUserId: null })).toBe('player:p1');
  });
});

describe('resolveCareerTotals', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sums a claimed player rows across every team and season in the league', async () => {
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p2', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p3', leagueId: 'L2', claimedByUserId: 'u9' },
    ]);
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 10,
        points: 100,
        reb: 30,
        ast: 10,
        fg3m: 5,
        stl: 4,
        blk: 1,
      },
      { leaguePlayerId: 'p2', gamesCount: 6, points: 60, reb: 20, ast: 8, fg3m: 3, stl: 2, blk: 0 },
    ]);

    const result = await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: 'u9' });

    expect(result.careerKey).toBe('user:u9');
    expect(result.leaguePlayerIds.sort()).toEqual(['p1', 'p2']);
    expect(result.totals.points).toBe(160);
    expect(result.totals.gamesCount).toBe(16);
    expect(result.totals.reb).toBe(50);
  });

  test('excludes rows from other leagues', async () => {
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
      { _id: 'p3', leagueId: 'L2', claimedByUserId: 'u9' },
    ]);
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([]);

    await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: 'u9' });

    expect(leaguesRepository.listLeaguePlayerStatsByPlayerIds).toHaveBeenCalledWith('L1', ['p1']);
  });

  test('uses only the single row for an unclaimed player', async () => {
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 3, points: 12, reb: 4, ast: 1, fg3m: 0, stl: 0, blk: 0 },
    ]);

    const result = await resolveCareerTotals('L1', { _id: 'p1', claimedByUserId: null });

    expect(result.careerKey).toBe('player:p1');
    expect(leaguesRepository.listLeaguePlayersByClaimedUser).not.toHaveBeenCalled();
    expect(result.totals.points).toBe(12);
  });
});

describe('subtractGameLine', () => {
  test('derives before totals by removing this game', () => {
    const before = subtractGameLine(
      { gamesCount: 10, points: 100, reb: 40, ast: 20, fg3m: 8, fg2a: 60, stl: 5, blk: 2 },
      { points: 22, reb: 9, ast: 4, fg3m: 3, fg2a: 12, stl: 1, blk: 1 }
    );
    expect(before).toMatchObject({
      gamesCount: 9,
      points: 78,
      reb: 31,
      ast: 16,
      fg3m: 5,
      fg2a: 48,
      stl: 4,
      blk: 1,
    });
  });

  test('carries the attempt counters that debut detection depends on', () => {
    const before = subtractGameLine(
      { gamesCount: 5, fg2a: 30, fg3a: 10, fta: 8, tov: 6, foul: 9 },
      { fg2a: 7, fg3a: 2, fta: 1, tov: 1, foul: 2 }
    );
    expect(before.fg2a).toBe(23);
    expect(before.fg3a).toBe(8);
    expect(before.fta).toBe(7);
    expect(before.tov).toBe(5);
    expect(before.foul).toBe(7);
  });

  test('clamps at zero rather than going negative', () => {
    const before = subtractGameLine(
      { gamesCount: 0, points: 2, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0 },
      { points: 5, reb: 3, ast: 0, fg3m: 0, stl: 0, blk: 0 }
    );
    expect(before.points).toBe(0);
    expect(before.reb).toBe(0);
    expect(before.gamesCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.identity`
Expected: FAIL — `Cannot find module '../../modules/milestones/milestones.service'`

- [ ] **Step 3: Add the repository helper**

In `server/src/modules/leagues/leagues.repository.js`, directly below `listLeaguePlayerStats`, add:

```js
// Player Milestones (docs/player-milestones.md §5.2): career-in-league totals
// are the sum of a player's rows across EVERY season and team, so this
// deliberately omits the seasonId filter that listLeaguePlayerStats applies.
function listLeaguePlayerStatsByPlayerIds(leagueId, leaguePlayerIds) {
  return LeaguePlayerStats.find({ leagueId, leaguePlayerId: { $in: leaguePlayerIds } }).lean();
}
```

Add `listLeaguePlayerStatsByPlayerIds,` to `module.exports` immediately after `listLeaguePlayerStats,`.

- [ ] **Step 4: Write the service implementation**

Create `server/src/modules/milestones/milestones.service.js`:

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter server test -- milestones.identity`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/milestones/milestones.service.js server/src/modules/leagues/leagues.repository.js server/src/tests/unit/milestones.identity.test.js
git commit -m "feat: resolve per-league career identity and totals for milestones"
```

---

### Task 4: Detection orchestration

Implements spec §5.1 and §5.2. Records only — publishing is Task 6. Ends with a working, testable `detectForFinalizedGame`.

**Files:**

- Modify: `server/src/modules/milestones/milestones.service.js`
- Test: `server/src/tests/unit/milestones.detection.test.js`

**Interfaces:**

- Consumes: Task 1 `evaluateCatalog`; Task 2 `insertMilestones`, `buildDedupeKey`; Task 3 `resolveCareerTotals`, `subtractGameLine`.
- Produces:
  - `extractBoxScoreLines(game) -> Array<{ leaguePlayerId, leagueTeamId, line }>`
  - `detectForFinalizedGame(gameId, { publish = true } = {}) -> Promise<{ created: Array<doc>, skipped: number }>`

`detectForFinalizedGame` awaits `recomputeLeagueAggregates(leagueId, seasonId)` before reading totals — that call coalesces with the pass already in flight via the existing `recomputeInFlight` map, so it waits for fresh data without duplicating work.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.detection.test.js`:

```js
jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  recomputeLeagueAggregates: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../modules/milestones/milestones.repository', () => {
  const actual = jest.requireActual('../../modules/milestones/milestones.repository');
  return {
    buildDedupeKey: actual.buildDedupeKey,
    insertMilestones: jest.fn((docs) => Promise.resolve(docs)),
    listMilestonesBySourceGameId: jest.fn(() => Promise.resolve([])),
    deleteMilestonesByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
    setMilestonePostId: jest.fn(() => Promise.resolve()),
  };
});

const gamesRepository = require('../../modules/games/games.repository');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const {
  extractBoxScoreLines,
  detectForFinalizedGame,
} = require('../../modules/milestones/milestones.service');

function boxScoreRow(overrides = {}) {
  return {
    playerId: 'snap1',
    leaguePlayerId: 'p1',
    displayName: 'Ana',
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

describe('extractBoxScoreLines', () => {
  test('reads a one-sided box score', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      boxScore: { players: [boxScoreRow({ points: 10 })] },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].leaguePlayerId).toBe('p1');
    expect(lines[0].leagueTeamId).toBe('T1');
  });

  test('reads both sides of a dual-team box score', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'dual_team',
      homeLeagueTeamId: 'T1',
      awayLeagueTeamId: 'T2',
      boxScore: {
        home: { players: [boxScoreRow({ leaguePlayerId: 'p1' })] },
        away: { players: [boxScoreRow({ leaguePlayerId: 'p2' })] },
      },
    });
    expect(lines.map((l) => l.leaguePlayerId)).toEqual(['p1', 'p2']);
    expect(lines.map((l) => l.leagueTeamId)).toEqual(['T1', 'T2']);
  });

  test('skips rows with no leaguePlayerId', () => {
    const lines = extractBoxScoreLines({
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      boxScore: { players: [boxScoreRow({ leaguePlayerId: null })] },
    });
    expect(lines).toHaveLength(0);
  });
});

describe('detectForFinalizedGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    leaguesRepository.findLeaguePlayerById.mockResolvedValue({
      _id: 'p1',
      leagueId: 'L1',
      leagueTeamId: 'T1',
      claimedByUserId: null,
    });
  });

  test('ignores a game that is not completed', async () => {
    gamesRepository.findGameById.mockResolvedValue({ _id: 'g1', status: 'in_progress' });
    const result = await detectForFinalizedGame('g1');
    expect(result.created).toEqual([]);
    expect(milestonesRepository.insertMilestones).not.toHaveBeenCalled();
  });

  test('ignores a standalone game', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'standalone',
    });
    const result = await detectForFinalizedGame('g1');
    expect(result.created).toEqual([]);
  });

  test('awaits the league aggregate recompute before reading totals', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 10, fg2a: 8 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 1, points: 10, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0 },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    expect(leaguesService.recomputeLeagueAggregates).toHaveBeenCalledWith('L1', 'S1');
  });

  test('writes a milestone when a career threshold is crossed', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 20, fg2a: 14 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 30,
        points: 505,
        reb: 40,
        ast: 20,
        fg3m: 10,
        fg2a: 300,
        fta: 60,
        tov: 25,
        foul: 40,
        stl: 8,
        blk: 3,
      },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    const keys = inserted.map((d) => d.milestoneKey);
    expect(keys).toContain('career_points_500');
    // A 30-game veteran must never be handed a debut milestone.
    expect(keys).not.toContain('first_career_game');
    expect(inserted.find((d) => d.milestoneKey === 'career_points_500').rarityRank).toBe(7);
    const threshold = inserted.find((d) => d.milestoneKey === 'career_points_500');
    expect(threshold.dedupeKey).toBe('player:p1|career_points_500');
    expect(threshold.careerKey).toBe('player:p1');
    expect(String(threshold.sourceGameId)).toBe('g1');
    expect(threshold.achievedAt).toEqual(new Date('2026-08-01'));
  });

  test('scopes a repeatable feat dedupe key to the game', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 12, reb: 11, ast: 10, fg2a: 9 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 30,
        points: 300,
        reb: 100,
        ast: 90,
        fg3m: 0,
        stl: 0,
        blk: 0,
      },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    const triple = inserted.find((d) => d.milestoneKey === 'triple_double');
    expect(triple.dedupeKey).toBe('player:p1|triple_double|g1');
  });

  test('carries claimedByUserId onto the record for claimed players', async () => {
    leaguesRepository.findLeaguePlayerById.mockResolvedValue({
      _id: 'p1',
      leagueId: 'L1',
      leagueTeamId: 'T1',
      claimedByUserId: 'u9',
    });
    leaguesRepository.listLeaguePlayersByClaimedUser.mockResolvedValue([
      { _id: 'p1', leagueId: 'L1', claimedByUserId: 'u9' },
    ]);
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [boxScoreRow({ points: 3, fg3m: 1, fg3a: 1 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      { leaguePlayerId: 'p1', gamesCount: 1, points: 3, reb: 0, ast: 0, fg3m: 1, stl: 0, blk: 0 },
    ]);

    await detectForFinalizedGame('g1', { publish: false });

    const inserted = milestonesRepository.insertMilestones.mock.calls[0][0];
    expect(inserted[0].careerKey).toBe('user:u9');
    expect(inserted[0].claimedByUserId).toBe('u9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.detection`
Expected: FAIL — `extractBoxScoreLines is not a function`

- [ ] **Step 3: Write the implementation**

In `server/src/modules/milestones/milestones.service.js`, add these requires at the top (below the existing ones):

```js
const { logger } = require('../../config/logger');
const { findGameById } = require('../games/games.repository');
const { evaluateCatalog } = require('./milestones.catalog');
const { buildDedupeKey, insertMilestones } = require('./milestones.repository');
```

Then add before `module.exports`:

```js
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
```

Extend `module.exports` with `extractBoxScoreLines` and `detectForFinalizedGame`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- milestones.detection`
Expected: PASS. The `publish: false` option keeps every test off the not-yet-written feed path.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/milestones/milestones.service.js server/src/tests/unit/milestones.detection.test.js
git commit -m "feat: detect player milestones for finalized league games"
```

---

### Task 5: Env flag and the milestone post type

Implements spec §5.4 and §5.5. Schema and configuration only; publishing logic is Task 6.

**Files:**

- Modify: `server/src/config/env.js`
- Modify: `env/server/.env.development`, `env/server/.env.production`
- Modify: `server/src/modules/feed/feed.repository.js`
- Test: `server/src/tests/unit/env.schema.test.js` (extend), `server/src/tests/unit/feed.repository.schema.test.js` (create)

**Interfaces:**

- Produces:
  - `env.AUTO_FEED_MILESTONES_ENABLED: boolean`
  - `Post.type` accepts `'milestone'`; `Post.milestoneCard` sub-document `{ milestoneId, leaguePlayerId, leagueTeamId, gameId, auto, cardSnapshot }`
  - `deleteAutoPostsForGameIds` also removes `milestone` posts authored by the system user (this is what makes a league going private drop its milestone cards)

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/feed.repository.schema.test.js`:

```js
const { Post, deleteAutoPostsForGameIds } = require('../../modules/feed/feed.repository');

describe('Post schema — milestone posts', () => {
  test('accepts the milestone type', () => {
    const doc = new Post({
      creatorUserId: '507f1f77bcf86cd799439011',
      type: 'milestone',
      milestoneCard: {
        milestoneId: '507f1f77bcf86cd799439012',
        leaguePlayerId: '507f1f77bcf86cd799439013',
        leagueTeamId: '507f1f77bcf86cd799439014',
        gameId: '507f1f77bcf86cd799439015',
        auto: true,
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  test('declares a unique sparse index on milestoneCard.milestoneId', () => {
    const index = Post.schema
      .indexes()
      .find(([fields]) => fields['milestoneCard.milestoneId'] === 1);
    expect(index).toBeDefined();
    expect(index[1].unique).toBe(true);
    expect(index[1].sparse).toBe(true);
  });
});

describe('deleteAutoPostsForGameIds — league going private', () => {
  afterEach(() => jest.restoreAllMocks());

  // Spec §5.4 and §10: flipping a league to private must remove its
  // system-authored milestone cards along with the game cards and highlight
  // clips. The milestone RECORDS are deliberately retained — profile links are
  // already withheld while a league is private.
  test('includes system-authored milestone posts in the deletion', async () => {
    const deleteMany = jest.spyOn(Post, 'deleteMany').mockResolvedValue({ deletedCount: 3 });

    await deleteAutoPostsForGameIds(['g1', 'g2'], 'system-user-1');

    const filter = deleteMany.mock.calls[0][0];
    const milestoneClause = filter.$or.find((clause) => clause.type === 'milestone');
    expect(milestoneClause).toEqual({
      type: 'milestone',
      'milestoneCard.gameId': { $in: ['g1', 'g2'] },
      creatorUserId: 'system-user-1',
    });
  });

  test('is a no-op for an empty game list', async () => {
    const deleteMany = jest.spyOn(Post, 'deleteMany');
    const result = await deleteAutoPostsForGameIds([], 'system-user-1');
    expect(result).toEqual({ deletedCount: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
```

Append to `server/src/tests/unit/env.schema.test.js`. That file already requires `envSchema` from `../../config/env` and defines `baseEnv(overrides = {})` as a **function** — call it, do not spread it:

```js
describe('AUTO_FEED_MILESTONES_ENABLED', () => {
  test('defaults to false when unset', () => {
    expect(envSchema.parse(baseEnv()).AUTO_FEED_MILESTONES_ENABLED).toBe(false);
  });

  test('is true only for the exact string "true"', () => {
    expect(
      envSchema.parse(baseEnv({ AUTO_FEED_MILESTONES_ENABLED: 'true' }))
        .AUTO_FEED_MILESTONES_ENABLED
    ).toBe(true);
    expect(
      envSchema.parse(baseEnv({ AUTO_FEED_MILESTONES_ENABLED: '1' })).AUTO_FEED_MILESTONES_ENABLED
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter server test -- feed.repository.schema env.schema`
Expected: FAIL — `milestone` is not a valid enum value; `AUTO_FEED_MILESTONES_ENABLED` is undefined.

- [ ] **Step 3: Add the env flag**

In `server/src/config/env.js`, directly after the `AUTO_FEED_ENABLED` entry and inside the same object:

```js
  // Player Milestones (docs/player-milestones.md §5.5): gates ONLY the feed
  // posts. Milestone records and profile surfaces are always live. Defaults
  // off so the machinery can ship dark and real volume can be observed before
  // anything reaches The Pulse.
  AUTO_FEED_MILESTONES_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
```

In `env/server/.env.development`, below `AUTO_FEED_ENABLED=true`:

```
AUTO_FEED_MILESTONES_ENABLED=true
```

In `env/server/.env.production`, add (production ships dark):

```
AUTO_FEED_MILESTONES_ENABLED=false
```

- [ ] **Step 4: Add the post type**

In `server/src/modules/feed/feed.repository.js`, add a sub-schema beside `highlightClipSchema`:

```js
// Player Milestones (docs/player-milestones.md §5.4). cardSnapshot follows the
// OPT-017 pattern so the feed read path never pays a live resolve.
const milestoneCardSchema = new mongoose.Schema(
  {
    milestoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlayerMilestone',
      required: true,
    },
    leaguePlayerId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaguePlayer', default: null },
    leagueTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeagueTeam', default: null },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
    auto: { type: Boolean, default: false },
    cardSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);
```

> Match the `{ _id: false }` option to whatever the neighbouring sub-schemas use — read `highlightClipSchema`'s options and copy them.

Add `'milestone'` to the `postSchema.type` enum, and the field:

```js
    milestoneCard: { type: milestoneCardSchema, default: null },
```

Add the index below the existing ones:

```js
// One post per milestone, even under concurrent finalise/retry.
postSchema.index({ 'milestoneCard.milestoneId': 1 }, { unique: true, sparse: true });
```

Add to `deleteAutoPostsForGameIds`'s `$or` array:

```js
      {
        type: 'milestone',
        'milestoneCard.gameId': { $in: gameIds },
        creatorUserId: systemUserId,
      },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter server test -- feed.repository.schema env.schema`
Expected: PASS

- [ ] **Step 6: Verify env templates still validate**

Run: `pnpm check-env`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/config/env.js env/server/.env.development env/server/.env.production server/src/modules/feed/feed.repository.js server/src/tests/unit/feed.repository.schema.test.js server/src/tests/unit/env.schema.test.js
git commit -m "feat: add milestone post type and feed flag"
```

---

### Task 6: Publish milestone posts

Implements spec §5.3 and §5.4. This is where the rarity gate, the cap, and the public-league gate meet.

**Files:**

- Modify: `server/src/modules/feed/feed.service.js`
- Test: `server/src/tests/unit/milestones.publish.test.js`

**Interfaces:**

- Consumes: Task 2 `setMilestonePostId`; Task 1 `AUTO_MILESTONE_CAP`, `MILESTONE_TIERS`; Task 5 `findPostByMilestoneId`, `env.AUTO_FEED_MILESTONES_ENABLED`.
- Produces:
  - `buildMilestoneCardSnapshot({ milestone, player, team, game }) -> object`
  - `autoPublishMilestonePosts(game, milestones) -> Promise<{ created: number, capped: boolean }>`
  - `resolveMilestoneCardPayload(post) -> payload` wired into `resolvePostPayload`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.publish.test.js`:

```js
jest.mock('../../config/env', () => ({
  env: { AUTO_FEED_ENABLED: true, AUTO_FEED_MILESTONES_ENABLED: true, CLOUDINARY_CLOUD_NAME: null },
}));

jest.mock('../../modules/feed/feed.repository', () => ({
  createPost: jest.fn((doc) => Promise.resolve({ _id: 'post1', ...doc })),
  findPostByMilestoneId: jest.fn(() => Promise.resolve(null)),
  listPosts: jest.fn(),
  findPostById: jest.fn(),
  deletePostById: jest.fn(),
  updatePostCardSnapshot: jest.fn(() => Promise.resolve()),
  listGameCardPostsByGameId: jest.fn(() => Promise.resolve([])),
  findAutoGameCardPost: jest.fn(() => Promise.resolve(null)),
  findPostByHighlightEventId: jest.fn(() => Promise.resolve(null)),
  findSharedEventIds: jest.fn(() => Promise.resolve([])),
  deleteAutoPostsForGameIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

jest.mock('../../modules/auth/auth.service', () => ({
  getSystemUserId: jest.fn(() => Promise.resolve('system-user-1')),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  isLeaguePublic: jest.fn(() => Promise.resolve(true)),
  listPublicLeagues: jest.fn(() => Promise.resolve({ leagues: [] })),
  getPublicLeagueTeamById: jest.fn(),
  getPublicLeaguePlayerById: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(() =>
    Promise.resolve({ _id: 'p1', displayName: 'Ana', jerseyNumber: 7 })
  ),
  findLeagueTeamById: jest.fn(() =>
    Promise.resolve({ _id: 'T1', name: 'Sharks', logo: null, colors: [] })
  ),
  listLeagueTeams: jest.fn(() => Promise.resolve([])),
  listLeaguePlayers: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/milestones/milestones.repository', () => ({
  setMilestonePostId: jest.fn(() => Promise.resolve()),
}));

const { env } = require('../../config/env');
const feedRepository = require('../../modules/feed/feed.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const { autoPublishMilestonePosts } = require('../../modules/feed/feed.service');

const GAME = {
  _id: 'g1',
  gameContext: 'league',
  leagueId: 'L1',
  title: 'Sharks vs Bears',
};

function milestone(overrides = {}) {
  return {
    _id: 'm1',
    tier: 'feed',
    rarityRank: 5,
    milestoneKey: 'career_points_1000',
    label: '1,000 career points',
    family: 'career_threshold',
    value: 1000,
    leaguePlayerId: 'p1',
    leagueTeamId: 'T1',
    ...overrides,
  };
}

describe('autoPublishMilestonePosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.AUTO_FEED_ENABLED = true;
    env.AUTO_FEED_MILESTONES_ENABLED = true;
    leaguesService.isLeaguePublic.mockResolvedValue(true);
  });

  test('publishes nothing when the milestone flag is off', async () => {
    env.AUTO_FEED_MILESTONES_ENABLED = false;
    const result = await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(result.created).toBe(0);
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('publishes nothing when auto feed is off entirely', async () => {
    env.AUTO_FEED_ENABLED = false;
    const result = await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(result.created).toBe(0);
  });

  test('publishes nothing for a private league', async () => {
    leaguesService.isLeaguePublic.mockResolvedValue(false);
    const result = await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(result.created).toBe(0);
    expect(feedRepository.createPost).not.toHaveBeenCalled();
  });

  test('skips profile-tier milestones', async () => {
    const result = await autoPublishMilestonePosts(GAME, [
      milestone({ _id: 'm2', tier: 'profile', milestoneKey: 'double_double' }),
    ]);
    expect(result.created).toBe(0);
  });

  test('caps at two posts and reports it', async () => {
    const result = await autoPublishMilestonePosts(GAME, [
      milestone({ _id: 'm1', rarityRank: 7 }),
      milestone({
        _id: 'm2',
        rarityRank: 1,
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
      }),
      milestone({ _id: 'm3', rarityRank: 4, milestoneKey: 'pts_40', family: 'single_game_feat' }),
    ]);
    expect(result.created).toBe(2);
    expect(result.capped).toBe(true);
  });

  test('publishes the rarest milestones first', async () => {
    await autoPublishMilestonePosts(GAME, [
      milestone({ _id: 'm1', rarityRank: 7 }),
      milestone({
        _id: 'm2',
        rarityRank: 1,
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
      }),
      milestone({ _id: 'm3', rarityRank: 4, milestoneKey: 'pts_40', family: 'single_game_feat' }),
    ]);
    const publishedIds = feedRepository.createPost.mock.calls.map(
      (call) => call[0].milestoneCard.milestoneId
    );
    expect(publishedIds).toEqual(['m2', 'm3']);
  });

  test('records the post id back onto the milestone', async () => {
    await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(milestonesRepository.setMilestonePostId).toHaveBeenCalledWith('m1', 'post1');
  });

  test('treats a duplicate-key race as a no-op', async () => {
    feedRepository.createPost.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 11000 })
    );
    const result = await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(result.created).toBe(0);
  });

  test('authors posts as the system user', async () => {
    await autoPublishMilestonePosts(GAME, [milestone()]);
    expect(feedRepository.createPost.mock.calls[0][0].creatorUserId).toBe('system-user-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.publish`
Expected: FAIL — `autoPublishMilestonePosts is not a function`

- [ ] **Step 3: Write the implementation**

In `server/src/modules/feed/feed.service.js`, add near the other requires:

```js
const { AUTO_MILESTONE_CAP, MILESTONE_TIERS } = require('../milestones/milestones.catalog');
```

Add before `module.exports`:

```js
// Player Milestones (docs/player-milestones.md §5.4). Denormalised display
// shape for a milestone card, snapshotted at creation like every other card
// (OPT-017) so the feed read path stays a single indexed query.
function buildMilestoneCardSnapshot({ milestone, player, team, game }) {
  return {
    milestoneId: String(milestone._id),
    milestoneKey: milestone.milestoneKey,
    family: milestone.family,
    label: milestone.label,
    value: milestone.value ?? null,
    statKey: milestone.statKey ?? null,
    achievedAt: milestone.achievedAt ?? null,
    playerName: player?.displayName ?? null,
    jerseyNumber: player?.jerseyNumber ?? null,
    playerAvatarUrl: transformCloudinaryUrl(player?.avatar?.url ?? null),
    teamName: team?.name ?? null,
    teamLogo: transformCloudinaryUrl(team?.logo?.url ?? null),
    teamColors: team?.colors ?? [],
    gameId: game?._id ? String(game._id) : null,
    gameTitle: game?.title ?? null,
    gameUrl: game?._id ? `/games/${String(game._id)}` : null,
  };
}

function resolveMilestoneCardPayload(post) {
  return {
    image: null,
    video: null,
    gameCard: null,
    playerCard: null,
    teamCard: null,
    highlightClip: null,
    milestoneCard: post.milestoneCard?.cardSnapshot ?? null,
  };
}

// Player Milestones (docs/player-milestones.md §5.3). This function is the
// milestone half of the SINGLE enforcement point for the public-league
// restriction — the same isLeaguePublic gate autoPublishForFinalizedGame
// applies. Detection deliberately runs for every league; only publishing is
// gated here.
async function autoPublishMilestonePosts(game, milestones) {
  if (!env.AUTO_FEED_ENABLED || !env.AUTO_FEED_MILESTONES_ENABLED) {
    return { created: 0, capped: false };
  }
  if (game.gameContext !== 'league' || !(await isLeaguePublic(game.leagueId))) {
    return { created: 0, capped: false };
  }

  const eligible = (milestones || [])
    .filter((milestone) => milestone.tier === MILESTONE_TIERS.FEED)
    .sort((a, b) => (a.rarityRank ?? 99) - (b.rarityRank ?? 99) || (b.value ?? 0) - (a.value ?? 0));

  const capped = eligible.length > AUTO_MILESTONE_CAP;
  const toPublish = eligible.slice(0, AUTO_MILESTONE_CAP);

  if (capped) {
    logger.info(
      { gameId: String(game._id), eligible: eligible.length, cap: AUTO_MILESTONE_CAP },
      'Auto feed: milestone posts capped for this game'
    );
  }

  const systemUserId = await getSystemUserId();
  const { setMilestonePostId } = require('../milestones/milestones.repository');
  let created = 0;

  for (const milestone of toPublish) {
    try {
      const [player, team] = await Promise.all([
        findLeaguePlayerById(milestone.leaguePlayerId),
        findLeagueTeamById(milestone.leagueTeamId),
      ]);

      const post = await createPost({
        creatorUserId: systemUserId,
        type: 'milestone',
        caption: null,
        milestoneCard: {
          milestoneId: milestone._id,
          leaguePlayerId: milestone.leaguePlayerId,
          leagueTeamId: milestone.leagueTeamId,
          gameId: game._id,
          auto: true,
          cardSnapshot: buildMilestoneCardSnapshot({ milestone, player, team, game }),
        },
      });

      await setMilestonePostId(milestone._id, post._id);
      created += 1;
    } catch (error) {
      // E11000 on the unique milestoneCard.milestoneId index — a concurrent
      // finalise/retry already published this one. Not a failure.
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  return { created, capped };
}
```

Wire the new type into `resolvePostPayload`, before the final `throw`:

```js
if (post.type === 'milestone') {
  return resolveMilestoneCardPayload(post);
}
```

Add `autoPublishMilestonePosts`, `buildMilestoneCardSnapshot` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- milestones.publish`
Expected: PASS

- [ ] **Step 5: Run the whole feed suite for regressions**

Run: `pnpm --filter server test -- feed`
Expected: PASS — the new post type must not break existing feed tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/feed/feed.service.js server/src/tests/unit/milestones.publish.test.js
git commit -m "feat: publish rare player milestones to the Pulse"
```

---

### Task 7: Wire detection into finalize and post-completion edits

Implements spec §5.1 and §7.

**Files:**

- Modify: `server/src/modules/games/games.service.js`
- Modify: `server/src/modules/milestones/milestones.service.js`
- Test: `server/src/tests/unit/milestones.reevaluate.test.js`

**Interfaces:**

- Produces:
  - `scheduleMilestoneDetectionForGame(game) -> void` (in `games.service.js`)
  - `reevaluateMilestonesForGame(gameId) -> Promise<{ removed: number, created: number }>` (in `milestones.service.js`)

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.reevaluate.test.js`:

```js
jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(() =>
    Promise.resolve({ _id: 'p1', leagueId: 'L1', leagueTeamId: 'T1', claimedByUserId: null })
  ),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  recomputeLeagueAggregates: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../modules/milestones/milestones.repository', () => {
  const actual = jest.requireActual('../../modules/milestones/milestones.repository');
  return {
    buildDedupeKey: actual.buildDedupeKey,
    insertMilestones: jest.fn((docs) => Promise.resolve(docs)),
    listMilestonesBySourceGameId: jest.fn(() => Promise.resolve([])),
    deleteMilestonesByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
    setMilestonePostId: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../../modules/feed/feed.service', () => ({
  autoPublishMilestonePosts: jest.fn(() => Promise.resolve({ created: 0, capped: false })),
  deletePostsByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

const gamesRepository = require('../../modules/games/games.repository');
const leaguesRepository = require('../../modules/leagues/leagues.repository');
const milestonesRepository = require('../../modules/milestones/milestones.repository');
const feedService = require('../../modules/feed/feed.service');
const { reevaluateMilestonesForGame } = require('../../modules/milestones/milestones.service');

function row(overrides = {}) {
  return {
    leaguePlayerId: 'p1',
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

describe('reevaluateMilestonesForGame', () => {
  beforeEach(() => jest.clearAllMocks());

  test('removes a milestone that the edit invalidated, and its post', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [row({ points: 12, reb: 4, fg2a: 9 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 90,
        ast: 40,
        fg3m: 10,
        stl: 5,
        blk: 1,
      },
    ]);
    milestonesRepository.listMilestonesBySourceGameId.mockResolvedValue([
      { _id: 'm1', milestoneKey: 'triple_double', careerKey: 'player:p1', postId: 'post1' },
    ]);

    const result = await reevaluateMilestonesForGame('g1');

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m1']);
    expect(feedService.deletePostsByIds).toHaveBeenCalledWith(['post1']);
    expect(result.removed).toBe(1);
  });

  test('keeps a milestone that still holds', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [row({ points: 12, reb: 11, ast: 10, fg2a: 9 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 90,
        ast: 40,
        fg3m: 10,
        stl: 5,
        blk: 1,
      },
    ]);
    milestonesRepository.listMilestonesBySourceGameId.mockResolvedValue([
      { _id: 'm1', milestoneKey: 'triple_double', careerKey: 'player:p1', postId: 'post1' },
    ]);

    const result = await reevaluateMilestonesForGame('g1');

    expect(milestonesRepository.deleteMilestonesByIds).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
  });

  test('never publishes newly earned milestones from an edit', async () => {
    gamesRepository.findGameById.mockResolvedValue({
      _id: 'g1',
      status: 'completed',
      gameContext: 'league',
      leagueId: 'L1',
      seasonId: 'S1',
      trackingMode: 'one_sided',
      trackedLeagueTeamId: 'T1',
      completedAt: new Date('2026-08-01'),
      boxScore: { players: [row({ points: 45, fg2a: 30 })] },
    });
    leaguesRepository.listLeaguePlayerStatsByPlayerIds.mockResolvedValue([
      {
        leaguePlayerId: 'p1',
        gamesCount: 20,
        points: 300,
        reb: 0,
        ast: 0,
        fg3m: 0,
        stl: 0,
        blk: 0,
      },
    ]);

    await reevaluateMilestonesForGame('g1');

    expect(feedService.autoPublishMilestonePosts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.reevaluate`
Expected: FAIL — `reevaluateMilestonesForGame is not a function`

- [ ] **Step 3: Add the feed helper**

In `server/src/modules/feed/feed.repository.js`:

```js
async function deletePostsByIds(ids) {
  if (!ids || ids.length === 0) return { deletedCount: 0 };
  return Post.deleteMany({ _id: { $in: ids } });
}
```

Export it. In `server/src/modules/feed/feed.service.js`, add it to the repository require list and re-export a thin wrapper:

```js
// Player Milestones (docs/player-milestones.md §7): used when a
// post-completion edit invalidates a milestone that had already been posted.
async function deletePostsByIds(ids) {
  return deletePostsByIdsRepo(ids);
}
```

Import it as `deletePostsByIds: deletePostsByIdsRepo` in the destructured require, and add `deletePostsByIds` to `module.exports`.

- [ ] **Step 4: Add re-evaluation to the milestones service**

In `server/src/modules/milestones/milestones.service.js`, add before `module.exports`:

```js
// docs/player-milestones.md §7. A completed game can be edited, refreezing its
// box score, so a milestone it produced may stop being true. Re-derive what
// this game earns now and drop the records that no longer hold, along with any
// post they created. Newly qualifying milestones are recorded but NOT posted —
// necro-posting to the feed days after a game is worse than a missing card.
//
// Accepted imprecision: if editing an EARLIER game shifts which game crossed a
// career threshold, the record stays attached to the game that originally
// crossed it. Reassignment would mean replaying the whole league.
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

// The set of (careerKey, milestoneKey) pairs this game earns given its CURRENT
// box score. Shared by re-evaluation to decide which stored records survive.
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
```

Add `reevaluateMilestonesForGame` to `module.exports`.

- [ ] **Step 5: Schedule detection from games.service**

In `server/src/modules/games/games.service.js`, add beside the other schedulers (below `scheduleAutoFeedForGame`):

```js
// Player Milestones (docs/player-milestones.md §5.1): after a game finishes,
// derive the milestones it earned. Post-response, non-blocking, errors logged
// not thrown — same shape as the other finish-time schedulers above. Detection
// runs for EVERY league; the public-league gate applies only to publishing and
// lives in feed.service.js. Lazy require to avoid a cycle.
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

// Player Milestones (docs/player-milestones.md §7): editing a completed game
// can invalidate a milestone it produced.
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
```

In `finishGameForUser`, immediately after `scheduleAutoFeedForGame(game._id);`:

```js
scheduleMilestoneDetectionForGame(game);
```

In `refreezeGameBoxScoreIfCompleted`, after `await saveGame(game);`:

```js
scheduleMilestoneReevaluationForGame(game);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter server test -- milestones`
Expected: PASS, all milestone suites.

- [ ] **Step 7: Run the games suite for regressions**

Run: `pnpm --filter server test -- game`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/games/games.service.js server/src/modules/milestones/milestones.service.js server/src/modules/feed/feed.service.js server/src/modules/feed/feed.repository.js server/src/tests/unit/milestones.reevaluate.test.js
git commit -m "feat: detect milestones on finalize and re-evaluate on edit"
```

---

### Task 8: Re-key milestones on claim and unclaim

Implements spec §3.1. Without this, claiming a profile silently blanks a player's milestone history.

**Files:**

- Modify: `server/src/modules/milestones/milestones.service.js`
- Modify: `server/src/modules/leagues/leagues.service.js`
- Test: `server/src/tests/unit/milestones.rekey.test.js`

**Interfaces:**

- Produces: `rekeyMilestonesForPlayer(leaguePlayerId, { fromCareerKey, toCareerKey, claimedByUserId }) -> Promise<{ moved: number, dropped: number }>`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/milestones.rekey.test.js`:

```js
jest.mock('../../modules/games/games.repository', () => ({ findGameById: jest.fn() }));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/milestones/milestones.repository', () => {
  const actual = jest.requireActual('../../modules/milestones/milestones.repository');
  return {
    buildDedupeKey: actual.buildDedupeKey,
    insertMilestones: jest.fn(),
    listMilestonesByCareerKeys: jest.fn(() => Promise.resolve([])),
    listMilestonesBySourceGameId: jest.fn(() => Promise.resolve([])),
    deleteMilestonesByIds: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
    updateMilestoneCareerKey: jest.fn(() => Promise.resolve()),
    setMilestonePostId: jest.fn(() => Promise.resolve()),
  };
});

const milestonesRepository = require('../../modules/milestones/milestones.repository');
const { rekeyMilestonesForPlayer } = require('../../modules/milestones/milestones.service');

describe('rekeyMilestonesForPlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  test('moves records from the player key to the user key', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|career_points_500'
    );
    expect(result.moved).toBe(1);
    expect(result.dropped).toBe(0);
  });

  test('drops the later duplicate when the target key already has the milestone', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-05-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g0',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m1']);
    expect(result.dropped).toBe(1);
    expect(result.moved).toBe(0);
  });

  test('keeps the earlier record when the incoming one predates it', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'career_points_500',
        family: 'career_threshold',
        sourceGameId: 'g0',
        achievedAt: new Date('2026-05-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(milestonesRepository.deleteMilestonesByIds).toHaveBeenCalledWith(['m2']);
    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|career_points_500'
    );
  });

  test('keeps per-game feats from both keys, since their dedupe key includes the game', async () => {
    milestonesRepository.listMilestonesByCareerKeys.mockResolvedValue([
      {
        _id: 'm1',
        careerKey: 'player:p1',
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
        sourceGameId: 'g1',
        achievedAt: new Date('2026-01-01'),
        leaguePlayerId: 'p1',
      },
      {
        _id: 'm2',
        careerKey: 'user:u9',
        milestoneKey: 'triple_double',
        family: 'single_game_feat',
        sourceGameId: 'g2',
        achievedAt: new Date('2026-02-01'),
        leaguePlayerId: 'p0',
      },
    ]);

    const result = await rekeyMilestonesForPlayer('p1', {
      fromCareerKey: 'player:p1',
      toCareerKey: 'user:u9',
      claimedByUserId: 'u9',
    });

    expect(result.dropped).toBe(0);
    expect(milestonesRepository.updateMilestoneCareerKey).toHaveBeenCalledWith(
      'm1',
      'user:u9',
      'user:u9|triple_double|g1'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.rekey`
Expected: FAIL — `rekeyMilestonesForPlayer is not a function`

- [ ] **Step 3: Write the implementation**

In `server/src/modules/milestones/milestones.service.js`, add before `module.exports`:

```js
// docs/player-milestones.md §3.1. Claiming a profile changes a player's career
// key, which would orphan every milestone recorded under the old key. Both the
// claim and unclaim paths call this. Collisions (the target key already holds
// that milestone) keep the earlier achievedAt and delete the other, because a
// career landmark belongs to the night it first happened.
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
  let moved = 0;
  let dropped = 0;

  for (const record of incoming) {
    const dedupeKey = buildDedupeKey({
      careerKey: toCareerKey,
      milestoneKey: record.milestoneKey,
      family: record.family,
      sourceGameId: record.sourceGameId,
    });

    const collision = existingByDedupe.get(dedupeKey);
    if (!collision) {
      await updateMilestoneCareerKey(record._id, toCareerKey, dedupeKey);
      moved += 1;
      continue;
    }

    if (new Date(record.achievedAt) < new Date(collision.achievedAt)) {
      toDelete.push(collision._id);
      await updateMilestoneCareerKey(record._id, toCareerKey, dedupeKey);
      moved += 1;
    } else {
      toDelete.push(record._id);
      dropped += 1;
    }
  }

  if (toDelete.length > 0) {
    await deleteMilestonesByIds(toDelete);
  }

  logger.info(
    { leaguePlayerId: String(leaguePlayerId), fromCareerKey, toCareerKey, moved, dropped },
    'Milestones: career key migration complete'
  );

  return { moved, dropped, claimedByUserId };
}
```

Add `rekeyMilestonesForPlayer` to `module.exports`.

- [ ] **Step 4: Call it from the claim and unclaim paths**

In `server/src/modules/leagues/leagues.service.js`, add a helper near the other schedulers:

```js
// Player Milestones (docs/player-milestones.md §3.1): a claim/unclaim changes
// the player's career key, so their milestone records must follow. Best-effort
// and post-response — a milestone failure must never block the claim itself.
function scheduleMilestoneRekey(leaguePlayerId, fromCareerKey, toCareerKey, claimedByUserId) {
  setImmediate(() => {
    const { rekeyMilestonesForPlayer } = require('../milestones/milestones.service');
    rekeyMilestonesForPlayer(leaguePlayerId, {
      fromCareerKey,
      toCareerKey,
      claimedByUserId,
    }).catch((error) => {
      logger.error(
        { err: error, leaguePlayerId: String(leaguePlayerId) },
        'Milestone career key migration failed'
      );
    });
  });
}
```

In the claim path (`approveLeagueJoinRequest`), immediately after `player.claimedByUserId = request.requesterUserId; await saveLeaguePlayer(player);`:

```js
scheduleMilestoneRekey(
  player._id,
  `player:${String(player._id)}`,
  `user:${String(request.requesterUserId)}`,
  request.requesterUserId
);
```

In `unclaimLeaguePlayer`, capture the previous owner before nulling it. Replace:

```js
const member = await findActiveLeagueTeamMember(leagueTeamId, player.claimedByUserId);
player.claimedByUserId = null;
await saveLeaguePlayer(player);
```

with:

```js
const previousUserId = player.claimedByUserId;
const member = await findActiveLeagueTeamMember(leagueTeamId, player.claimedByUserId);
player.claimedByUserId = null;
await saveLeaguePlayer(player);

scheduleMilestoneRekey(
  player._id,
  `user:${String(previousUserId)}`,
  `player:${String(player._id)}`,
  null
);
```

> Before editing, grep for every other assignment to `claimedByUserId` in `leagues.service.js` (`grep -n "claimedByUserId =" server/src/modules/leagues/leagues.service.js`) and add the same call at any additional write site.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter server test -- milestones.rekey`
Expected: PASS

- [ ] **Step 6: Run the leagues suites for regressions**

Run: `pnpm --filter server test -- leagues`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/milestones/milestones.service.js server/src/modules/leagues/leagues.service.js server/src/tests/unit/milestones.rekey.test.js
git commit -m "feat: migrate milestone career keys on claim and unclaim"
```

---

### Task 9: Read API

Implements spec §8 (server half).

**Files:**

- Create: `server/src/modules/milestones/milestones.controller.js`, `milestones.routes.js`, `milestones.validation.js`
- Modify: `server/src/routes/index.js`
- Modify: `server/src/modules/leagues/leagues.service.js` (extend `getPublicLeaguePlayerById`)
- Test: `server/src/tests/integration/milestones.routes.test.js`

**Interfaces:**

- Produces:
  - `GET /api/v1/public/milestones/players/:leaguePlayerId?cursor=&limit=` → `{ milestones: [...], nextCursor }`
  - `getPublicLeaguePlayerById` payload gains `milestones: { recent: [...5], total: number }`
  - `sanitizeMilestone(doc) -> object`
  - `listMilestonesForLeaguePlayer(leaguePlayerId, { limit, cursor }) -> Promise<{ milestones, nextCursor }>`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/integration/milestones.routes.test.js`:

```js
const request = require('supertest');

jest.mock('../../modules/milestones/milestones.service', () => ({
  listMilestonesForLeaguePlayer: jest.fn(),
}));

const milestonesService = require('../../modules/milestones/milestones.service');
const { createApp } = require('../../app');

describe('milestone routes', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows unauthenticated reads', async () => {
    milestonesService.listMilestonesForLeaguePlayer.mockResolvedValue({
      milestones: [],
      nextCursor: null,
    });

    const app = createApp();
    const response = await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011'
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ milestones: [], nextCursor: null });
  });

  test('rejects a limit above the maximum', async () => {
    const app = createApp();
    const response = await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011?limit=500'
    );

    expect(response.statusCode).toBe(400);
  });

  test('passes the cursor through to the service', async () => {
    milestonesService.listMilestonesForLeaguePlayer.mockResolvedValue({
      milestones: [],
      nextCursor: null,
    });

    const app = createApp();
    await request(app).get(
      '/api/v1/public/milestones/players/507f1f77bcf86cd799439011?limit=10&cursor=507f1f77bcf86cd799439099'
    );

    expect(milestonesService.listMilestonesForLeaguePlayer).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { limit: 10, cursor: '507f1f77bcf86cd799439099' }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- milestones.routes`
Expected: FAIL — 404, the route is not mounted.

- [ ] **Step 3: Write validation**

Create `server/src/modules/milestones/milestones.validation.js`:

```js
const { z } = require('zod');

const listPlayerMilestonesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().trim().min(1).optional(),
});

module.exports = { listPlayerMilestonesQuerySchema };
```

- [ ] **Step 4: Write the service read path**

In `server/src/modules/milestones/milestones.service.js`, add before `module.exports`:

```js
function sanitizeMilestone(doc) {
  return {
    id: String(doc._id),
    milestoneKey: doc.milestoneKey,
    family: doc.family,
    tier: doc.tier,
    label: doc.label,
    statKey: doc.statKey ?? null,
    value: doc.value ?? null,
    achievedAt: doc.achievedAt,
    gameId: doc.sourceGameId ? String(doc.sourceGameId) : null,
    gameUrl: doc.sourceGameId ? `/games/${String(doc.sourceGameId)}` : null,
    leaguePlayerId: String(doc.leaguePlayerId),
  };
}

async function listMilestonesForLeaguePlayer(leaguePlayerId, { limit = 20, cursor = null } = {}) {
  const { listMilestonesByCareerKey } = require('./milestones.repository');

  const leaguePlayer = await findLeaguePlayerById(leaguePlayerId);
  if (!leaguePlayer) {
    const { ApiError } = require('../../utils/apiError');
    throw new ApiError(404, 'League player not found');
  }

  const careerKey = buildCareerKey(leaguePlayer);
  // Fetch one extra to decide whether another page exists.
  const rows = await listMilestonesByCareerKey(careerKey, { limit: limit + 1, cursor });
  const page = rows.slice(0, limit);

  return {
    milestones: page.map(sanitizeMilestone),
    nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
  };
}

// docs/player-milestones.md §8: folded into the existing public player payload
// so the page that needs it does not pay an extra round trip.
async function getMilestoneSummaryForLeaguePlayer(leagueId, leaguePlayer) {
  const {
    listMilestonesByLeaguePlayerIds,
    countMilestonesByLeaguePlayerIds,
  } = require('./milestones.repository');

  const { leaguePlayerIds } = await resolveCareerTotals(leagueId, leaguePlayer);
  const [recent, total] = await Promise.all([
    listMilestonesByLeaguePlayerIds(leaguePlayerIds, { limit: 5 }),
    countMilestonesByLeaguePlayerIds(leaguePlayerIds),
  ]);

  return { recent: recent.map(sanitizeMilestone), total };
}
```

Export `sanitizeMilestone`, `listMilestonesForLeaguePlayer`, `getMilestoneSummaryForLeaguePlayer`.

- [ ] **Step 5: Write controller and routes**

Create `server/src/modules/milestones/milestones.controller.js`:

```js
const { listPlayerMilestonesQuerySchema } = require('./milestones.validation');
const { listMilestonesForLeaguePlayer } = require('./milestones.service');

async function listForLeaguePlayer(req, res) {
  const query = listPlayerMilestonesQuerySchema.parse(req.query);
  const result = await listMilestonesForLeaguePlayer(req.params.leaguePlayerId, {
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
}

module.exports = { listForLeaguePlayer };
```

Create `server/src/modules/milestones/milestones.routes.js`:

```js
const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./milestones.controller');

const publicMilestonesRouter = Router();

publicMilestonesRouter.get(
  '/players/:leaguePlayerId',
  asyncHandler(controller.listForLeaguePlayer)
);

module.exports = { publicMilestonesRouter };
```

> Confirm the `asyncHandler` import path matches the other route files — read `server/src/modules/feed/feed.routes.js` and copy its import exactly.

In `server/src/routes/index.js`, add the require and mount it beside the other public routers:

```js
const { publicMilestonesRouter } = require('../modules/milestones/milestones.routes');
```

```js
apiRouter.use('/public/milestones', publicCacheMiddleware, publicMilestonesRouter);
```

- [ ] **Step 6: Extend the public player payload**

In `getPublicLeaguePlayerById` in `server/src/modules/leagues/leagues.service.js`, replace the return with:

```js
const { getMilestoneSummaryForLeaguePlayer } = require('../milestones/milestones.service');

return {
  team: sanitizeLeagueTeam(team),
  player: sanitizeLeaguePlayer(player),
  summary: buildLeaguePlayerSummary(gameRows),
  milestones: await getMilestoneSummaryForLeaguePlayer(team.leagueId, player),
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter server test -- milestones.routes`
Expected: PASS

- [ ] **Step 8: Run the full server suite**

Run: `pnpm --filter server test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add server/src/modules/milestones server/src/routes/index.js server/src/modules/leagues/leagues.service.js server/src/tests/integration/milestones.routes.test.js
git commit -m "feat: expose player milestone read endpoints"
```

---

### Task 10: Backfill script

Implements spec §9.

**Files:**

- Create: `server/src/scripts/backfill-player-milestones.js`

**Interfaces:**

- Consumes: Task 4 `detectForFinalizedGame`.
- Produces: a CLI script supporting `--dry-run`.

- [ ] **Step 1: Read an existing script for the house pattern**

Run: `cat server/src/scripts/backfill-auto-feed.js`

Copy its connection setup, argument parsing, logging, and exit handling exactly. The steps below describe only the logic that differs.

- [ ] **Step 2: Write the script**

Create `server/src/scripts/backfill-player-milestones.js`, following the structure of `backfill-auto-feed.js`, with this core:

```js
// Player Milestones backfill (docs/player-milestones.md §9). Replays completed
// league games in chronological order through the SAME detection function used
// at finalize, with publishing disabled — backfilled and live milestones are
// therefore produced by identical code. Idempotent via the dedupeKey unique
// index, so re-running is safe.
//
// Run order matters: this must run AFTER the league seasons backfill, because
// career totals are assembled from season-scoped LeaguePlayerStats rows.
//
//   ENV_FILE=../env/server/.env.development node src/scripts/backfill-player-milestones.js --dry-run
//   ENV_FILE=../env/server/.env.development node src/scripts/backfill-player-milestones.js

async function run({ dryRun }) {
  const { listPublicLeagues, findLeagueById } = require('../modules/leagues/leagues.repository');
  const { listLeagueGamesByLeagueId } = require('../modules/games/games.repository');
  const { detectForFinalizedGame } = require('../modules/milestones/milestones.service');
  const { League } = require('../modules/leagues/leagues.repository');

  // Every league, not just public ones — milestone RECORDS are written for
  // private leagues too (spec §1); only posts are gated.
  const leagues = await League.find({}).select('_id name').lean();

  let totalGames = 0;
  let totalCreated = 0;

  for (const league of leagues) {
    const games = await listLeagueGamesByLeagueId(league._id);
    const completed = games
      .filter((game) => game.status === 'completed')
      .sort(
        (a, b) =>
          new Date(a.completedAt || a.scheduledAt || a.createdAt || 0).getTime() -
          new Date(b.completedAt || b.scheduledAt || b.createdAt || 0).getTime()
      );

    for (const game of completed) {
      totalGames += 1;
      if (dryRun) {
        // Detection is read-only until insertMilestones runs, so a dry run
        // reports the game count and skips the write entirely.
        continue;
      }
      const { created } = await detectForFinalizedGame(game._id, { publish: false });
      totalCreated += created.length;
    }

    console.log(`${league.name}: ${completed.length} completed games processed`);
  }

  console.log(
    dryRun
      ? `DRY RUN: would replay ${totalGames} completed league games`
      : `Replayed ${totalGames} games, created ${totalCreated} milestones`
  );
}
```

- [ ] **Step 3: Verify the dry run**

Run: `cd server && ENV_FILE=../env/server/.env.development node src/scripts/backfill-player-milestones.js --dry-run`
Expected: prints a per-league game count and a `DRY RUN:` summary, writes nothing.

- [ ] **Step 4: Verify the real run is idempotent**

Run the script for real, note the created count, then run it a second time.
Expected: the second run reports `created 0` — the dedupeKey index absorbs every repeat.

- [ ] **Step 5: Commit**

```bash
git add server/src/scripts/backfill-player-milestones.js
git commit -m "feat: add player milestone backfill script"
```

---

### Task 11: Milestone feed card (client)

Implements spec §8 (feed half).

**Files:**

- Create: `client/src/features/feed/components/posts/MilestonePost.jsx`
- Create: `client/src/features/feed/components/posts/MilestonePost.test.jsx`
- Modify: `client/src/features/feed/components/FeedPostCard.jsx`

**Interfaces:**

- Consumes: a post object with `type: 'milestone'` and `milestoneCard` matching `buildMilestoneCardSnapshot` from Task 6.
- Produces: `MilestonePost` (named export).

- [ ] **Step 1: Read the surrounding components**

Run: `cat client/src/features/feed/components/posts/*.jsx | head -120` and `cat client/src/features/feed/components/FeedPostCard.jsx`

Match the existing card's Tailwind vocabulary, spacing scale, and how it dispatches on `post.type`. Milestone cards live on the newer basketball/scoreboard surface, so use that style, not the slate admin style.

- [ ] **Step 2: Write the failing test**

Create `client/src/features/feed/components/posts/MilestonePost.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { MilestonePost } from './MilestonePost';

function renderCard(milestoneCard) {
  return render(
    <MemoryRouter>
      <MilestonePost post={{ id: 'p1', type: 'milestone', milestoneCard }} />
    </MemoryRouter>
  );
}

describe('MilestonePost', () => {
  test('renders the milestone label and the player', () => {
    renderCard({
      milestoneKey: 'career_points_1000',
      family: 'career_threshold',
      label: '1,000 career points',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.getByText('1,000 career points')).toBeInTheDocument();
    expect(screen.getByText(/Ana Ruiz/)).toBeInTheDocument();
    expect(screen.getByText(/Sharks/)).toBeInTheDocument();
  });

  test('links to the game it happened in', () => {
    renderCard({
      milestoneKey: 'triple_double',
      family: 'single_game_feat',
      label: 'Triple-double',
      playerName: 'Ana Ruiz',
      teamName: 'Sharks',
      gameUrl: '/games/g1',
      gameTitle: 'Sharks vs Bears',
    });

    expect(screen.getByRole('link', { name: /Sharks vs Bears/ })).toHaveAttribute(
      'href',
      '/games/g1'
    );
  });

  test('renders nothing when the snapshot is missing', () => {
    const { container } = render(
      <MemoryRouter>
        <MilestonePost post={{ id: 'p1', type: 'milestone', milestoneCard: null }} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter client test -- MilestonePost`
Expected: FAIL — cannot resolve `./MilestonePost`

- [ ] **Step 4: Write the component**

Create `client/src/features/feed/components/posts/MilestonePost.jsx`. Use the surrounding cards' Tailwind vocabulary. The structure:

```jsx
import { Link } from 'react-router-dom';

const FAMILY_LABELS = {
  career_threshold: 'Career milestone',
  single_game_feat: 'Standout game',
  first: 'First',
};

export function MilestonePost({ post }) {
  const card = post.milestoneCard;
  if (!card) {
    return null;
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
      <div className="flex items-center gap-3 px-4 pt-4">
        {card.teamLogo ? (
          <img src={card.teamLogo} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          {FAMILY_LABELS[card.family] ?? 'Milestone'}
        </p>
      </div>

      <div className="px-4 py-6 text-center">
        <p className="text-2xl font-bold text-white">{card.label}</p>
        <p className="mt-2 text-sm text-slate-300">
          {card.playerName}
          {card.jerseyNumber != null ? ` #${card.jerseyNumber}` : ''}
          {card.teamName ? ` · ${card.teamName}` : ''}
        </p>
      </div>

      {card.gameUrl && card.gameTitle ? (
        <div className="border-t border-white/10 px-4 py-3 text-center">
          <Link to={card.gameUrl} className="text-sm text-slate-400 hover:text-white">
            {card.gameTitle}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 5: Wire it into the dispatcher**

In `client/src/features/feed/components/FeedPostCard.jsx`, import `MilestonePost` and add a branch for `post.type === 'milestone'`, matching how the existing branches are written.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter client test -- MilestonePost`
Expected: PASS

- [ ] **Step 7: Run the feed client suite for regressions**

Run: `pnpm --filter client test -- Feed`
Expected: PASS. If a `FeedPage` snapshot changed, review the diff before updating it.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/feed/components/posts/MilestonePost.jsx client/src/features/feed/components/posts/MilestonePost.test.jsx client/src/features/feed/components/FeedPostCard.jsx
git commit -m "feat: render milestone posts in the Pulse"
```

---

### Task 12: Milestones on player profiles (client)

Implements spec §8 (profile half).

**Files:**

- Create: `client/src/features/players/components/PlayerMilestones.jsx`
- Create: `client/src/features/players/components/PlayerMilestones.test.jsx`
- Modify: `client/src/features/leagues/pages/PublicLeaguePlayerPage.jsx`
- Modify: `client/src/features/players/pages/PublicUserProfilePage.jsx`

**Interfaces:**

- Consumes: `milestones: { recent: [...], total: number }` from the extended public player payload (Task 9).
- Produces: `PlayerMilestones` (named export), props `{ milestones, total }`.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/players/components/PlayerMilestones.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { PlayerMilestones } from './PlayerMilestones';

const MILESTONES = [
  {
    id: 'm1',
    milestoneKey: 'career_points_1000',
    family: 'career_threshold',
    label: '1,000 career points',
    achievedAt: '2026-07-04T20:00:00.000Z',
    gameUrl: '/games/g1',
  },
  {
    id: 'm2',
    milestoneKey: 'triple_double',
    family: 'single_game_feat',
    label: 'Triple-double',
    achievedAt: '2026-06-21T20:00:00.000Z',
    gameUrl: '/games/g2',
  },
];

function renderList(props) {
  return render(
    <MemoryRouter>
      <PlayerMilestones {...props} />
    </MemoryRouter>
  );
}

describe('PlayerMilestones', () => {
  test('lists each milestone', () => {
    renderList({ milestones: MILESTONES, total: 2 });
    expect(screen.getByText('1,000 career points')).toBeInTheDocument();
    expect(screen.getByText('Triple-double')).toBeInTheDocument();
  });

  test('shows an empty state when there are none', () => {
    renderList({ milestones: [], total: 0 });
    expect(screen.getByText(/No milestones yet/i)).toBeInTheDocument();
  });

  test('indicates when more exist than are shown', () => {
    renderList({ milestones: MILESTONES, total: 9 });
    expect(screen.getByText(/9/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- PlayerMilestones`
Expected: FAIL — cannot resolve `./PlayerMilestones`

- [ ] **Step 3: Write the component**

Create `client/src/features/players/components/PlayerMilestones.jsx`:

```jsx
import { Link } from 'react-router-dom';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PlayerMilestones({ milestones = [], total = 0 }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Milestones</h2>
        {total > milestones.length ? <p className="text-xs text-slate-500">{total} total</p> : null}
      </div>

      {milestones.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No milestones yet. They appear here as this player hits career landmarks.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-white">{milestone.label}</span>
              {milestone.gameUrl ? (
                <Link
                  to={milestone.gameUrl}
                  className="shrink-0 text-xs text-slate-500 hover:text-white"
                >
                  {formatDate(milestone.achievedAt)}
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-slate-500">
                  {formatDate(milestone.achievedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire it into both profile pages**

In `PublicLeaguePlayerPage.jsx`, render it from the payload's new field:

```jsx
<PlayerMilestones
  milestones={data?.milestones?.recent ?? []}
  total={data?.milestones?.total ?? 0}
/>
```

> Read the page first — match its existing data variable name and place the section alongside the existing summary/game-log sections.

Do the same in `PublicUserProfilePage.jsx` for each claimed league profile it renders.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter client test -- PlayerMilestones`
Expected: PASS

- [ ] **Step 6: Run the affected page suites**

Run: `pnpm --filter client test -- PublicUserProfilePage`
Expected: PASS. Review any snapshot diff before updating.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/players/components client/src/features/leagues/pages/PublicLeaguePlayerPage.jsx client/src/features/players/pages/PublicUserProfilePage.jsx
git commit -m "feat: show milestones on player profiles"
```

---

### Task 13: Documentation and final verification

**Files:**

- Modify: `docs/api.md`, `docs/PROJECT-KNOWLEDGE.md`, `docs/ideas.md`, `docs/player-milestones.md`

- [ ] **Step 1: Update `docs/api.md`**

Add `GET /api/v1/public/milestones/players/:leaguePlayerId` in the section and table format that file already uses, and note that the public league player response now includes `milestones`.

- [ ] **Step 2: Update `docs/PROJECT-KNOWLEDGE.md`**

- Add `PlayerMilestone` to the Data Model table under a `Milestones` domain row.
- In "Feed And Public Profiles", add `milestone` to the list of supported `Post` types.
- In "Game Tracking", note that finishing a game also derives player milestones.

- [ ] **Step 3: Update `docs/ideas.md`**

Change the Highest Value row so it reflects what shipped:

```
| Milestones and awards    | Players, leagues  | Player milestones shipped (see docs/player-milestones.md); season awards outstanding. |
```

- [ ] **Step 4: Flip the spec's status line**

In `docs/player-milestones.md`, change the header to:

```
**Status: implemented.** Scope for the first cut of
```

- [ ] **Step 5: Run the full verification suite**

Run each and confirm it passes before claiming completion:

```bash
pnpm check-env
pnpm lint
pnpm test
pnpm build
```

Expected: all four pass. If any fail, fix the cause — do not proceed with a failing gate.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: record player milestones implementation"
```

---

## Rollout

`AUTO_FEED_MILESTONES_ENABLED` is `false` in production. After merging:

1. Run the backfill with `--dry-run`, review the counts, then run it for real.
2. Spot-check several player profiles for plausible milestone histories.
3. Let a week of real games finalize with the flag off, then query
   `db.playermilestones.countDocuments({ tier: 'feed' })` grouped by game to see
   how many posts _would_ have been created.
4. Only then set the flag to `true` in Render.
