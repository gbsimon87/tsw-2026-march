# Schedule Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a league owner/manager create a whole season of league games in one action instead of one at a time.

**Architecture:** A new `'scheduled'` value on `Game.status` makes a future fixture a first-class state. Round-robin suggestion and date/slot assignment are pure client-side functions feeding an editable client-only draft; committing posts the whole set to one new bulk endpoint that validates everything, optionally replaces not-yet-started games, and inserts in a single `insertMany`.

**Tech Stack:** Express + Mongoose (CommonJS) server, Jest + Supertest; React 18 + Vite client, Vitest + React Testing Library; Zod both sides; Tailwind.

**Spec:** [`../specs/2026-08-08-schedule-builder-design.md`](../specs/2026-08-08-schedule-builder-design.md)
**Tracker:** [`../../schedule-builder/IMPLEMENTATION-TRACKER.md`](../../schedule-builder/IMPLEMENTATION-TRACKER.md)

## Global Constraints

- **Never alter existing game documents.** Adding `'scheduled'` to the enum is additive; no migration, no backfill. Every existing game keeps `in_progress` or `completed`.
- Server is **CommonJS** (`require`/`module.exports`); client is **ESM** with **named exports only**.
- Server tests: **Jest only**. Client tests: **Vitest only**. Never mix.
- Services throw `ApiError(status, message)`; controllers validate with Zod `schema.parse` and wrap handlers in `asyncHandler`.
- Authorization uses the existing exported `assertLeagueManagerOrOwner` from `leagues.service.js` — never a hand-rolled role check.
- Admin pages use the **original slate/sky-blue `PageHeader` palette**, not the scoreboard redesign (PROJECT-KNOWLEDGE §9.1).
- No path aliases on the client — deep relative imports.
- Max **200** games per bulk request. Venue is free text, max **120** chars.
- Conventional commits (`feat:`, `test:`, `fix:`, `docs:`); commitlint + Husky run on every commit.
- Client baseline has ~20 pre-existing test failures (OPT-026) — judge client suites against that baseline, not against zero.

---

### Task 1: Add `'scheduled'` to the Game status enum

**Files:**

- Modify: `server/src/modules/games/games.repository.js:196-201`
- Modify: `server/src/modules/games/games.validation.js:228`
- Test: `server/src/tests/unit/game-scheduled-status.test.js` (create)

**Interfaces:**

- Produces: `Game.status` accepts `'scheduled'`; default remains `'in_progress'`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/game-scheduled-status.test.js
const mongoose = require('mongoose');
require('../../modules/games/games.repository');

const Game = mongoose.models.Game;

describe('Game.status enum', () => {
  it('accepts scheduled', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
      status: 'scheduled',
    });
    const err = game.validateSync();
    expect(err?.errors?.status).toBeUndefined();
  });

  it('still accepts in_progress and completed', () => {
    for (const status of ['in_progress', 'completed']) {
      const game = new Game({
        ownerUserId: new mongoose.Types.ObjectId(),
        title: 'Fixture',
        status,
      });
      expect(game.validateSync()?.errors?.status).toBeUndefined();
    }
  });

  it('defaults to in_progress so existing create paths are unchanged', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
    });
    expect(game.status).toBe('in_progress');
  });

  it('rejects an unknown status', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
      status: 'cancelled',
    });
    expect(game.validateSync()?.errors?.status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-scheduled-status`
Expected: FAIL — "accepts scheduled" reports a validation error on `status`.

- [ ] **Step 3: Write minimal implementation**

In `games.repository.js`, change the status field:

```js
    status: {
      type: String,
      // Schedule Builder: 'scheduled' is a future fixture — created by the bulk
      // schedule builder, carries no events, and is not yet trackable. Additive
      // to the enum; existing documents keep in_progress/completed and the
      // default is unchanged so every pre-existing create path behaves as before.
      enum: ['scheduled', 'in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },
```

In `games.validation.js:228`, widen the list-filter enum:

```js
  status: z.enum(['scheduled', 'in_progress', 'completed']).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-scheduled-status`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full server suite for regressions**

Run: `pnpm --filter server test`
Expected: same pass count as before this task. Any new failure means an existing check treated the enum as closed — fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/games/games.repository.js server/src/modules/games/games.validation.js server/src/tests/unit/game-scheduled-status.test.js
git commit -m "feat(games): add scheduled status for future fixtures"
```

---

### Task 2: Correct the two status checks that mis-handle a scheduled game

**Files:**

- Modify: `server/src/modules/games/games.service.js:1618`
- Modify: `client/src/features/leagues/pages/AdminLeaguePage.jsx:1327-1328`
- Test: `server/src/tests/unit/game-scheduled-status.test.js` (extend)

Two known sites read status in a way that is wrong for a scheduled game: `setGameLineup` calls it "completed", and the admin page counts it as "in progress". Everything else uses explicit equality and already falls through correctly.

**Interfaces:**

- Consumes: `'scheduled'` status from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `server/src/tests/unit/game-scheduled-status.test.js`:

```js
describe('scheduled games are not trackable', () => {
  it('setGameLineup rejects a scheduled game with an accurate message', async () => {
    jest.resetModules();
    const gameId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();

    jest.doMock('../../modules/games/games.repository', () => ({
      ...jest.requireActual('../../modules/games/games.repository'),
      findGameById: jest.fn().mockResolvedValue({
        _id: gameId,
        ownerUserId: userId,
        status: 'scheduled',
        gameContext: 'league',
      }),
    }));

    const service = require('../../modules/games/games.service');
    await expect(service.setGameLineup(userId, gameId, { playerIds: [] })).rejects.toThrow(
      /not started/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-scheduled-status`
Expected: FAIL — message is "Cannot change lineup on a completed game".

- [ ] **Step 3: Write minimal implementation**

`games.service.js:1618` — replace the guard:

```js
if (game.status !== 'in_progress') {
  throw new ApiError(
    400,
    game.status === 'scheduled'
      ? 'Cannot change lineup on a game that has not started'
      : 'Cannot change lineup on a completed game'
  );
}
```

`AdminLeaguePage.jsx:1327-1328` — count only genuinely in-progress games:

```jsx
          {(league.games || []).some((game) => game.status === 'in_progress')
            ? ` ${(league.games || []).filter((game) => game.status === 'in_progress').length} game(s) are still in progress and will not count toward final standings.`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter server test -- game-scheduled-status`
Expected: PASS.

Run: `pnpm --filter client test -- AdminLeaguePage`
Expected: no new failures versus the OPT-026 baseline.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/games/games.service.js client/src/features/leagues/pages/AdminLeaguePage.jsx server/src/tests/unit/game-scheduled-status.test.js
git commit -m "fix(games): handle scheduled status in lineup guard and league game count"
```

---

### Task 3: Add the `venue` field

**Files:**

- Modify: `server/src/modules/games/games.repository.js` (schema, near `scheduledAt`)
- Modify: `server/src/modules/games/games.service.js` (`sanitizeGame`)
- Test: `server/src/tests/unit/game-venue.test.js` (create)

**Interfaces:**

- Produces: `Game.venue` (optional string ≤120, trimmed); exposed on sanitized game output as `venue`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/game-venue.test.js
const mongoose = require('mongoose');
require('../../modules/games/games.repository');

const Game = mongoose.models.Game;

describe('Game.venue', () => {
  it('accepts and trims a venue', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
      venue: '  Court 1  ',
    });
    expect(game.validateSync()?.errors?.venue).toBeUndefined();
    expect(game.venue).toBe('Court 1');
  });

  it('is optional', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
    });
    expect(game.validateSync()?.errors?.venue).toBeUndefined();
  });

  it('rejects a venue longer than 120 characters', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      title: 'Fixture',
      venue: 'x'.repeat(121),
    });
    expect(game.validateSync()?.errors?.venue).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-venue`
Expected: FAIL — `game.venue` is `undefined` (field not in schema, so it is stripped).

- [ ] **Step 3: Write minimal implementation**

In `games.repository.js`, immediately after the `scheduledAt` line:

```js
    scheduledAt: { type: Date },
    // Schedule Builder: free-text location. Venue entities (with capacity and a
    // map) are a separate future feature; this is deliberately just a label.
    venue: { type: String, trim: true, maxlength: 120 },
```

In `games.service.js`, add `venue` to the object `sanitizeGame` returns, next to `scheduledAt`:

```js
    venue: game.venue ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-venue`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/games/games.repository.js server/src/modules/games/games.service.js server/src/tests/unit/game-venue.test.js
git commit -m "feat(games): add optional free-text venue field"
```

---

### Task 4: Repository helpers for bulk insert and replace

**Files:**

- Modify: `server/src/modules/games/games.repository.js` (add + export two functions)
- Test: `server/src/tests/integration/bulk-games-repository.test.js` (create)

**Interfaces:**

- Produces:
  - `insertManyGames(docs: object[]): Promise<GameDoc[]>`
  - `deleteReplaceableLeagueGames(leagueId, seasonId): Promise<number>` — deletes only games in that league+season with `status: 'scheduled'` **and** no events; returns the deleted count.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/integration/bulk-games-repository.test.js
const mongoose = require('mongoose');
const {
  insertManyGames,
  deleteReplaceableLeagueGames,
} = require('../../modules/games/games.repository');

const Game = mongoose.models.Game;

describe('bulk game repository helpers', () => {
  const leagueId = new mongoose.Types.ObjectId();
  const seasonId = new mongoose.Types.ObjectId();
  const ownerUserId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    await Game.deleteMany({});
  });

  function fixture(overrides = {}) {
    return {
      ownerUserId,
      gameContext: 'league',
      leagueId,
      seasonId,
      title: 'Fixture',
      status: 'scheduled',
      ...overrides,
    };
  }

  it('insertManyGames inserts every document', async () => {
    const created = await insertManyGames([fixture(), fixture({ title: 'Second' })]);
    expect(created).toHaveLength(2);
    expect(await Game.countDocuments({ leagueId })).toBe(2);
  });

  it('deleteReplaceableLeagueGames removes eventless scheduled games only', async () => {
    await insertManyGames([
      fixture({ title: 'Replaceable' }),
      fixture({ title: 'Completed', status: 'completed' }),
      fixture({ title: 'Live', status: 'in_progress' }),
      fixture({ title: 'Has events', events: [{ statType: 'FG2_MADE', x: 10, y: 10 }] }),
    ]);

    const deleted = await deleteReplaceableLeagueGames(leagueId, seasonId);

    expect(deleted).toBe(1);
    const remaining = await Game.find({ leagueId }).sort({ title: 1 });
    expect(remaining.map((g) => g.title)).toEqual(['Completed', 'Has events', 'Live']);
  });

  it('never touches another season', async () => {
    const otherSeasonId = new mongoose.Types.ObjectId();
    await insertManyGames([fixture({ seasonId: otherSeasonId })]);
    expect(await deleteReplaceableLeagueGames(leagueId, seasonId)).toBe(0);
    expect(await Game.countDocuments({})).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- bulk-games-repository`
Expected: FAIL — `insertManyGames is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `games.repository.js` above `module.exports`:

```js
async function insertManyGames(docs) {
  return Game.insertMany(docs);
}

// Schedule Builder: only a future fixture that nobody has started is safe to
// replace. A game with any recorded event, or one already in progress or
// completed, is real history and is never deleted by a schedule rebuild.
async function deleteReplaceableLeagueGames(leagueId, seasonId) {
  const result = await Game.deleteMany({
    leagueId,
    seasonId,
    status: 'scheduled',
    $or: [{ events: { $size: 0 } }, { events: { $exists: false } }],
  });
  return result.deletedCount ?? 0;
}
```

Add both to the `module.exports` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- bulk-games-repository`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/games/games.repository.js server/src/tests/integration/bulk-games-repository.test.js
git commit -m "feat(games): add bulk insert and replaceable-game delete helpers"
```

---

### Task 5: Zod schema for the bulk request

**Files:**

- Modify: `server/src/modules/leagues/leagues.validation.js`
- Test: `server/src/tests/unit/bulk-games-validation.test.js` (create)

**Interfaces:**

- Produces: `bulkCreateLeagueGamesSchema` — parses `{ replaceExisting?: boolean, games: Array<{ homeLeagueTeamId, awayLeagueTeamId, scheduledAt, venue? }> }`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/bulk-games-validation.test.js
const { bulkCreateLeagueGamesSchema } = require('../../modules/leagues/leagues.validation');

const validGame = {
  homeLeagueTeamId: '507f1f77bcf86cd799439011',
  awayLeagueTeamId: '507f1f77bcf86cd799439012',
  scheduledAt: '2026-09-05T10:00:00.000Z',
};

describe('bulkCreateLeagueGamesSchema', () => {
  it('accepts a valid payload and defaults replaceExisting to false', () => {
    const parsed = bulkCreateLeagueGamesSchema.parse({ games: [validGame] });
    expect(parsed.replaceExisting).toBe(false);
    expect(parsed.games).toHaveLength(1);
  });

  it('accepts an optional venue', () => {
    const parsed = bulkCreateLeagueGamesSchema.parse({
      games: [{ ...validGame, venue: 'Court 1' }],
    });
    expect(parsed.games[0].venue).toBe('Court 1');
  });

  it('rejects an empty games array', () => {
    expect(() => bulkCreateLeagueGamesSchema.parse({ games: [] })).toThrow();
  });

  it('rejects more than 200 games', () => {
    const games = Array.from({ length: 201 }, () => validGame);
    expect(() => bulkCreateLeagueGamesSchema.parse({ games })).toThrow();
  });

  it('rejects a team playing itself', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({
        games: [{ ...validGame, awayLeagueTeamId: validGame.homeLeagueTeamId }],
      })
    ).toThrow(/itself/i);
  });

  it('rejects a non-ISO scheduledAt', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({ games: [{ ...validGame, scheduledAt: 'next Saturday' }] })
    ).toThrow();
  });

  it('rejects a venue longer than 120 characters', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({ games: [{ ...validGame, venue: 'x'.repeat(121) }] })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- bulk-games-validation`
Expected: FAIL — `bulkCreateLeagueGamesSchema` is undefined.

- [ ] **Step 3: Write minimal implementation**

Add to `leagues.validation.js` and include in `module.exports`:

```js
const bulkGameRowSchema = z
  .object({
    homeLeagueTeamId: z.string().min(1),
    awayLeagueTeamId: z.string().min(1),
    scheduledAt: z.string().datetime(),
    venue: z.string().trim().max(120).optional(),
  })
  .refine((row) => row.homeLeagueTeamId !== row.awayLeagueTeamId, {
    message: 'A team cannot play itself',
    path: ['awayLeagueTeamId'],
  });

const bulkCreateLeagueGamesSchema = z.object({
  replaceExisting: z.boolean().optional().default(false),
  games: z.array(bulkGameRowSchema).min(1).max(200),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- bulk-games-validation`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/leagues.validation.js server/src/tests/unit/bulk-games-validation.test.js
git commit -m "feat(leagues): add bulk league game creation schema"
```

---

### Task 6: Bulk creation service

**Files:**

- Modify: `server/src/modules/leagues/leagues.service.js`
- Test: `server/src/tests/unit/bulk-create-league-games.test.js` (create)

**Interfaces:**

- Consumes: `insertManyGames`, `deleteReplaceableLeagueGames` (Task 4); existing `assertLeagueManagerOrOwner`, `findLeagueById`, `findActiveSeasonByLeagueId`, `listLeagueTeamsByLeagueId`.
- Produces: `bulkCreateLeagueGamesForUser(userId, leagueId, { games, replaceExisting }): Promise<{ created: number, replaced: number, games: object[] }>`

Games are created as one-sided league games mirroring the existing `gameContext: 'league'` create path in `games.service.js`, with `status: 'scheduled'`, `trackedLeagueTeamId` defaulting to the home team, and the same `"{away} at {home}"` title convention.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/unit/bulk-create-league-games.test.js
const mongoose = require('mongoose');

const leagueId = new mongoose.Types.ObjectId().toString();
const seasonId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId().toString();
const homeId = new mongoose.Types.ObjectId().toString();
const awayId = new mongoose.Types.ObjectId().toString();

const insertManyGames = jest.fn(async (docs) => docs.map((d, i) => ({ ...d, _id: `id-${i}` })));
const deleteReplaceableLeagueGames = jest.fn(async () => 3);

jest.mock('../../modules/games/games.repository', () => ({
  ...jest.requireActual('../../modules/games/games.repository'),
  insertManyGames: (...a) => insertManyGames(...a),
  deleteReplaceableLeagueGames: (...a) => deleteReplaceableLeagueGames(...a),
}));

const service = require('../../modules/leagues/leagues.service');

function payload(overrides = {}) {
  return {
    replaceExisting: false,
    games: [
      {
        homeLeagueTeamId: homeId,
        awayLeagueTeamId: awayId,
        scheduledAt: '2026-09-05T10:00:00.000Z',
        venue: 'Court 1',
      },
    ],
    ...overrides,
  };
}

describe('bulkCreateLeagueGamesForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'assertLeagueManagerOrOwner').mockResolvedValue(undefined);
  });

  it('creates games with scheduled status and the venue', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(userId, leagueId, payload());

    expect(result.created).toBe(1);
    const [docs] = insertManyGames.mock.calls[0];
    expect(docs[0]).toMatchObject({
      gameContext: 'league',
      status: 'scheduled',
      leagueId,
      seasonId,
      homeLeagueTeamId: homeId,
      awayLeagueTeamId: awayId,
      venue: 'Court 1',
    });
  });

  it('does not delete anything when replaceExisting is false', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(userId, leagueId, payload());
    expect(deleteReplaceableLeagueGames).not.toHaveBeenCalled();
    expect(result.replaced).toBe(0);
  });

  it('replaces first and reports the count when replaceExisting is true', async () => {
    const result = await service.bulkCreateLeagueGamesForUser(
      userId,
      leagueId,
      payload({ replaceExisting: true })
    );
    expect(deleteReplaceableLeagueGames).toHaveBeenCalledWith(leagueId, seasonId);
    expect(result.replaced).toBe(3);
  });

  it('rejects a team id that belongs to another league', async () => {
    const strangerId = new mongoose.Types.ObjectId().toString();
    await expect(
      service.bulkCreateLeagueGamesForUser(
        userId,
        leagueId,
        payload({
          games: [
            {
              homeLeagueTeamId: homeId,
              awayLeagueTeamId: strangerId,
              scheduledAt: '2026-09-05T10:00:00.000Z',
            },
          ],
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(insertManyGames).not.toHaveBeenCalled();
  });

  it('rejects when the league has no active season', async () => {
    // arranged via the no-active-season league fixture
    await expect(
      service.bulkCreateLeagueGamesForUser(userId, 'league-without-season', payload())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('propagates the authorization failure', async () => {
    service.assertLeagueManagerOrOwner.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { statusCode: 403 })
    );
    await expect(
      service.bulkCreateLeagueGamesForUser(userId, leagueId, payload())
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(insertManyGames).not.toHaveBeenCalled();
  });
});
```

Mock `findLeagueById`, `findActiveSeasonByLeagueId` (returning `{ _id: seasonId }`, and `null` for `'league-without-season'`), and `listLeagueTeamsByLeagueId` (returning the two teams) alongside the repository mock, following the mocking style already used in the neighbouring `leagues.service` unit tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- bulk-create-league-games`
Expected: FAIL — `bulkCreateLeagueGamesForUser is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `leagues.service.js` and export it:

```js
async function bulkCreateLeagueGamesForUser(userId, leagueId, payload) {
  await assertLeagueManagerOrOwner(leagueId, userId);

  const league = await findLeagueById(leagueId);
  if (!league) {
    throw new ApiError(404, 'League not found');
  }

  const season = await findActiveSeasonByLeagueId(leagueId);
  if (!season) {
    throw new ApiError(
      400,
      'This league has no active season. Start a season before scheduling games.'
    );
  }

  // Validate every row before writing anything — a bulk create is all-or-nothing,
  // so a single bad team id must not leave half a schedule behind.
  const teams = await listLeagueTeamsByLeagueId(leagueId);
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));

  const docs = payload.games.map((row) => {
    const home = teamsById.get(String(row.homeLeagueTeamId));
    const away = teamsById.get(String(row.awayLeagueTeamId));
    if (!home || !away) {
      throw new ApiError(400, 'Every game must be between two teams in this league');
    }

    return {
      ownerUserId: userId,
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId,
      seasonId: season._id,
      homeLeagueTeamId: row.homeLeagueTeamId,
      awayLeagueTeamId: row.awayLeagueTeamId,
      trackedLeagueTeamId: row.homeLeagueTeamId,
      title: `${away.name} at ${home.name}`,
      scheduledAt: new Date(row.scheduledAt),
      venue: row.venue?.trim() || undefined,
      status: 'scheduled',
    };
  });

  const replaced = payload.replaceExisting
    ? await deleteReplaceableLeagueGames(leagueId, season._id)
    : 0;

  const created = await insertManyGames(docs);

  return { created: created.length, replaced, games: created.map(sanitizeGame) };
}
```

Import `insertManyGames` and `deleteReplaceableLeagueGames` from `games.repository` at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- bulk-create-league-games`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/leagues.service.js server/src/tests/unit/bulk-create-league-games.test.js
git commit -m "feat(leagues): add bulk league game creation service"
```

---

### Task 7: Controller and route

**Files:**

- Modify: `server/src/modules/leagues/leagues.controller.js`
- Modify: `server/src/modules/leagues/leagues.routes.js` (near line 48)
- Test: `server/src/tests/integration/bulk-league-games.test.js` (create)

**Interfaces:**

- Produces: `POST /api/v1/leagues/:leagueId/games/bulk` → `201 { created, replaced, games }`.

- [ ] **Step 1: Write the failing test**

```js
// server/src/tests/integration/bulk-league-games.test.js
const request = require('supertest');
const { app } = require('../../app');
const { signInAsLeagueOwner, createLeagueWithTeams } = require('../helpers/leagueTestHelpers');

describe('POST /api/v1/leagues/:leagueId/games/bulk', () => {
  it('creates every game in one request', async () => {
    const { agent, leagueId, teamIds } = await createLeagueWithTeams(4);

    const res = await agent.post(`/api/v1/leagues/${leagueId}/games/bulk`).send({
      games: [
        {
          homeLeagueTeamId: teamIds[0],
          awayLeagueTeamId: teamIds[1],
          scheduledAt: '2026-09-05T10:00:00.000Z',
          venue: 'Court 1',
        },
        {
          homeLeagueTeamId: teamIds[2],
          awayLeagueTeamId: teamIds[3],
          scheduledAt: '2026-09-05T11:30:00.000Z',
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.replaced).toBe(0);
    expect(res.body.games[0].status).toBe('scheduled');
    expect(res.body.games[0].venue).toBe('Court 1');
  });

  it('rejects an unauthenticated request', async () => {
    const { leagueId, teamIds } = await createLeagueWithTeams(2);
    const res = await request(app)
      .post(`/api/v1/leagues/${leagueId}/games/bulk`)
      .send({
        games: [
          {
            homeLeagueTeamId: teamIds[0],
            awayLeagueTeamId: teamIds[1],
            scheduledAt: '2026-09-05T10:00:00.000Z',
          },
        ],
      });
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in user who does not manage the league', async () => {
    const { leagueId, teamIds } = await createLeagueWithTeams(2);
    const stranger = await signInAsLeagueOwner();
    const res = await stranger.agent.post(`/api/v1/leagues/${leagueId}/games/bulk`).send({
      games: [
        {
          homeLeagueTeamId: teamIds[0],
          awayLeagueTeamId: teamIds[1],
          scheduledAt: '2026-09-05T10:00:00.000Z',
        },
      ],
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid payload', async () => {
    const { agent, leagueId } = await createLeagueWithTeams(2);
    const res = await agent.post(`/api/v1/leagues/${leagueId}/games/bulk`).send({ games: [] });
    expect(res.status).toBe(400);
  });

  it('replaces existing scheduled games when asked', async () => {
    const { agent, leagueId, teamIds } = await createLeagueWithTeams(2);
    const body = {
      games: [
        {
          homeLeagueTeamId: teamIds[0],
          awayLeagueTeamId: teamIds[1],
          scheduledAt: '2026-09-05T10:00:00.000Z',
        },
      ],
    };

    await agent.post(`/api/v1/leagues/${leagueId}/games/bulk`).send(body);
    const res = await agent
      .post(`/api/v1/leagues/${leagueId}/games/bulk`)
      .send({ ...body, replaceExisting: true });

    expect(res.status).toBe(201);
    expect(res.body.replaced).toBe(1);
    expect(res.body.created).toBe(1);
  });
});
```

Reuse whatever league/auth helpers the existing `server/src/tests/integration/` league specs use; if no `leagueTestHelpers` module exists, inline the same setup those specs perform.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- bulk-league-games`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write minimal implementation**

`leagues.controller.js`:

```js
async function bulkCreateGames(req, res) {
  const userId = requireAuthUserId(req);
  const payload = bulkCreateLeagueGamesSchema.parse(req.body);
  const result = await service.bulkCreateLeagueGamesForUser(userId, req.params.leagueId, payload);
  res.status(201).json(result);
}
```

Import `bulkCreateLeagueGamesSchema` and add `bulkCreateGames` to the controller's exports.

`leagues.routes.js`, next to the existing games route:

```js
leaguesRouter.post('/:leagueId/games/bulk', asyncHandler(controller.bulkCreateGames));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- bulk-league-games`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole server suite**

Run: `pnpm --filter server test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/leagues/leagues.controller.js server/src/modules/leagues/leagues.routes.js server/src/tests/integration/bulk-league-games.test.js
git commit -m "feat(leagues): expose bulk league game creation endpoint"
```

---

### Task 8: Round-robin generation (pure)

**Files:**

- Create: `client/src/features/leagues/scheduleBuilder.js`
- Test: `client/src/features/leagues/scheduleBuilder.test.js`

**Interfaces:**

- Produces: `buildRoundRobin(teamIds: string[]): Round[]` where
  `Round = { round: number, games: Array<{ homeLeagueTeamId, awayLeagueTeamId }>, byeTeamId: string | null }`.

- [ ] **Step 1: Write the failing test**

```js
// client/src/features/leagues/scheduleBuilder.test.js
import { describe, expect, it } from 'vitest';
import { buildRoundRobin } from './scheduleBuilder';

function allPairs(rounds) {
  return rounds.flatMap((r) =>
    r.games.map((g) => [g.homeLeagueTeamId, g.awayLeagueTeamId].sort().join('|'))
  );
}

describe('buildRoundRobin', () => {
  it('pairs every team exactly once for an even team count', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const rounds = buildRoundRobin(teams);
    const pairs = allPairs(rounds);

    expect(rounds).toHaveLength(3);
    expect(pairs).toHaveLength(6); // n(n-1)/2
    expect(new Set(pairs).size).toBe(6);
    expect(rounds.every((r) => r.byeTeamId === null)).toBe(true);
  });

  it('gives exactly one team a bye per round for an odd team count', () => {
    const rounds = buildRoundRobin(['a', 'b', 'c', 'd', 'e']);

    expect(rounds).toHaveLength(5);
    expect(allPairs(rounds)).toHaveLength(10);
    expect(rounds.every((r) => r.games.length === 2)).toBe(true);
    expect(rounds.every((r) => r.byeTeamId !== null)).toBe(true);
    expect(new Set(rounds.map((r) => r.byeTeamId)).size).toBe(5);
  });

  it('never schedules a team twice in one round', () => {
    for (const rounds of [
      buildRoundRobin(['a', 'b', 'c', 'd', 'e', 'f']),
      buildRoundRobin(['a', 'b', 'c']),
    ]) {
      for (const round of rounds) {
        const seen = round.games.flatMap((g) => [g.homeLeagueTeamId, g.awayLeagueTeamId]);
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });

  it('alternates home and away so no team is home more than once extra', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rounds = buildRoundRobin(teams);
    const homeCounts = Object.fromEntries(teams.map((t) => [t, 0]));
    const awayCounts = Object.fromEntries(teams.map((t) => [t, 0]));

    for (const round of rounds) {
      for (const game of round.games) {
        homeCounts[game.homeLeagueTeamId] += 1;
        awayCounts[game.awayLeagueTeamId] += 1;
      }
    }

    for (const team of teams) {
      expect(Math.abs(homeCounts[team] - awayCounts[team])).toBeLessThanOrEqual(1);
    }
  });

  it('returns no rounds for fewer than two teams', () => {
    expect(buildRoundRobin([])).toEqual([]);
    expect(buildRoundRobin(['a'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- scheduleBuilder`
Expected: FAIL — cannot resolve `./scheduleBuilder`.

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/features/leagues/scheduleBuilder.js
const BYE = Symbol('bye');

/**
 * Single round-robin via the circle method: fix the first entrant, rotate the
 * rest, and pair across. An odd team count gets a BYE sentinel so exactly one
 * team sits out each round. Home/away flips on alternate rounds so no team
 * piles up home games.
 */
export function buildRoundRobin(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length < 2) return [];

  const entrants = [...teamIds];
  if (entrants.length % 2 === 1) entrants.push(BYE);

  const half = entrants.length / 2;
  const rotating = entrants.slice(1);
  const rounds = [];

  for (let round = 0; round < entrants.length - 1; round += 1) {
    const lineup = [entrants[0], ...rotating];
    const games = [];
    let byeTeamId = null;

    for (let i = 0; i < half; i += 1) {
      const first = lineup[i];
      const second = lineup[lineup.length - 1 - i];

      if (first === BYE || second === BYE) {
        byeTeamId = first === BYE ? second : first;
        continue;
      }

      // Flip sides on odd rounds so each team's home/away split stays even.
      const [home, away] = round % 2 === 0 ? [first, second] : [second, first];
      games.push({ homeLeagueTeamId: home, awayLeagueTeamId: away });
    }

    rounds.push({ round: round + 1, games, byeTeamId });
    rotating.unshift(rotating.pop());
  }

  return rounds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- scheduleBuilder`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/leagues/scheduleBuilder.js client/src/features/leagues/scheduleBuilder.test.js
git commit -m "feat(leagues): add round-robin fixture generation"
```

---

### Task 9: Date and slot assignment (pure)

**Files:**

- Modify: `client/src/features/leagues/scheduleBuilder.js`
- Modify: `client/src/features/leagues/scheduleBuilder.test.js`

**Interfaces:**

- Consumes: `buildRoundRobin` output (Task 8).
- Produces: `assignDates(rounds, { startDate: string, weekdays: number[], slots: string[], venue?: string }): { rows: DraftRow[], overflowCount: number }` where
  `DraftRow = { id, round, homeLeagueTeamId, awayLeagueTeamId, scheduledAt: Date, venue: string, overflowed: boolean, isBye: false }` plus bye rows `{ id, round, isBye: true, byeTeamId }`.
  `weekdays` are JS day numbers (0 = Sunday). `slots` are `'HH:MM'` strings.

- [ ] **Step 1: Write the failing test**

Append to `scheduleBuilder.test.js`:

```js
import { assignDates } from './scheduleBuilder';

const SATURDAY = 6;

describe('assignDates', () => {
  const rounds = buildRoundRobin(['a', 'b', 'c', 'd']); // 3 rounds x 2 games

  it('fills a game-day slot by slot, then moves to the next game-day', () => {
    const { rows, overflowCount } = assignDates(rounds, {
      startDate: '2026-09-05', // a Saturday
      weekdays: [SATURDAY],
      slots: ['10:00', '11:30'],
    });

    const games = rows.filter((r) => !r.isBye);
    expect(games).toHaveLength(6);
    expect(overflowCount).toBe(0);

    const first = games[0].scheduledAt;
    expect(first.getFullYear()).toBe(2026);
    expect(first.getMonth()).toBe(8);
    expect(first.getDate()).toBe(5);
    expect(first.getHours()).toBe(10);
    expect(games[1].scheduledAt.getHours()).toBe(11);
    expect(games[1].scheduledAt.getMinutes()).toBe(30);

    // Round 2 rolls to the following Saturday.
    expect(games[2].scheduledAt.getDate()).toBe(12);
  });

  it('flags overflow when a round needs more slots than a game-day offers', () => {
    const { rows, overflowCount } = assignDates(rounds, {
      startDate: '2026-09-05',
      weekdays: [SATURDAY],
      slots: ['10:00'],
    });

    const games = rows.filter((r) => !r.isBye);
    expect(overflowCount).toBeGreaterThan(0);
    expect(games.filter((g) => g.overflowed).length).toBe(overflowCount);
    // Each game still lands on a distinct configured weekday.
    expect(games.every((g) => g.scheduledAt.getDay() === SATURDAY)).toBe(true);
  });

  it('cycles through multiple configured weekdays in order', () => {
    const { rows } = assignDates(rounds, {
      startDate: '2026-09-05',
      weekdays: [SATURDAY, 0],
      slots: ['10:00', '11:30'],
    });

    const games = rows.filter((r) => !r.isBye);
    expect(games[0].scheduledAt.getDay()).toBe(SATURDAY);
    expect(games[2].scheduledAt.getDay()).toBe(0);
  });

  it('applies the default venue to every row', () => {
    const { rows } = assignDates(rounds, {
      startDate: '2026-09-05',
      weekdays: [SATURDAY],
      slots: ['10:00', '11:30'],
      venue: 'Main Court',
    });
    expect(rows.filter((r) => !r.isBye).every((r) => r.venue === 'Main Court')).toBe(true);
  });

  it('emits a bye row carrying the resting team', () => {
    const oddRounds = buildRoundRobin(['a', 'b', 'c']);
    const { rows } = assignDates(oddRounds, {
      startDate: '2026-09-05',
      weekdays: [SATURDAY],
      slots: ['10:00'],
    });

    const byes = rows.filter((r) => r.isBye);
    expect(byes).toHaveLength(3);
    expect(byes.every((b) => typeof b.byeTeamId === 'string')).toBe(true);
  });

  it('gives every row a unique id', () => {
    const { rows } = assignDates(rounds, {
      startDate: '2026-09-05',
      weekdays: [SATURDAY],
      slots: ['10:00', '11:30'],
    });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- scheduleBuilder`
Expected: FAIL — `assignDates` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scheduleBuilder.js`:

```js
function parseLocalDate(startDate) {
  const [year, month, day] = startDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function atSlot(date, slot) {
  const [hours, minutes] = slot.split(':').map(Number);
  const stamped = new Date(date);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped;
}

// Walk forward from `from` (inclusive) to the next date landing on one of the
// configured weekdays.
function nextGameDay(from, weekdays) {
  const cursor = new Date(from);
  for (let i = 0; i < 366; i += 1) {
    if (weekdays.includes(cursor.getDay())) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

/**
 * Lay rounds onto real calendar dates. Each round starts on a fresh game-day and
 * fills that day's slots in order; if a round has more games than the day has
 * slots, the remainder spills onto the next game-day and every spilled row is
 * marked `overflowed` so the UI can make the admin acknowledge it rather than
 * silently moving fixtures players are expecting.
 */
export function assignDates(rounds, { startDate, weekdays, slots, venue = '' }) {
  if (!rounds.length || !weekdays?.length || !slots?.length) {
    return { rows: [], overflowCount: 0 };
  }

  const rows = [];
  let overflowCount = 0;
  let day = nextGameDay(parseLocalDate(startDate), weekdays);
  let slotIndex = 0;
  let rowId = 0;

  for (const round of rounds) {
    // Every round opens on its own game-day.
    if (slotIndex > 0) {
      day = nextGameDay(new Date(day.getTime() + 86400000), weekdays);
      slotIndex = 0;
    }

    for (const game of round.games) {
      let overflowed = false;
      if (slotIndex >= slots.length) {
        day = nextGameDay(new Date(day.getTime() + 86400000), weekdays);
        slotIndex = 0;
        overflowed = true;
        overflowCount += 1;
      }

      rows.push({
        id: `row-${(rowId += 1)}`,
        round: round.round,
        isBye: false,
        homeLeagueTeamId: game.homeLeagueTeamId,
        awayLeagueTeamId: game.awayLeagueTeamId,
        scheduledAt: atSlot(day, slots[slotIndex]),
        venue,
        overflowed,
      });

      slotIndex += 1;
    }

    if (round.byeTeamId) {
      rows.push({
        id: `row-${(rowId += 1)}`,
        round: round.round,
        isBye: true,
        byeTeamId: round.byeTeamId,
      });
    }
  }

  return { rows, overflowCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- scheduleBuilder`
Expected: PASS (11 tests total in this file).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/leagues/scheduleBuilder.js client/src/features/leagues/scheduleBuilder.test.js
git commit -m "feat(leagues): assign calendar dates and time slots to fixtures"
```

---

### Task 10: API client method

**Files:**

- Modify: `client/src/features/leagues/api/leaguesApi.js`

**Interfaces:**

- Produces: `leaguesApi.bulkCreateGames(leagueId, { games, replaceExisting }): Promise<{ created, replaced, games }>`

- [ ] **Step 1: Add the method**

Follow the existing `leaguesApi` style exactly (the singleton object of thin `apiClient` wrappers):

```js
  bulkCreateGames(leagueId, payload) {
    return apiClient.post(`/leagues/${leagueId}/games/bulk`, payload);
  },
```

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm --filter client test -- leaguesApi`
Expected: no new failures (this file may have no dedicated spec; a clean run of the leagues specs is sufficient).

- [ ] **Step 3: Commit**

```bash
git add client/src/features/leagues/api/leaguesApi.js
git commit -m "feat(leagues): add bulkCreateGames api method"
```

---

### Task 11: Draft table component

**Files:**

- Create: `client/src/features/leagues/components/ScheduleDraftTable.jsx`
- Test: `client/src/features/leagues/components/ScheduleDraftTable.test.jsx`

**Interfaces:**

- Consumes: `DraftRow` shape from Task 9.
- Produces: `ScheduleDraftTable({ rows, teams, onChangeRow, onSwapSides, onRemoveRow })` — named export. `teams` is `Array<{ id, name }>`.

Renders a table at `sm` and up, stacked cards below. Bye rows render greyed with no controls except removal.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/features/leagues/components/ScheduleDraftTable.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleDraftTable } from './ScheduleDraftTable';

const teams = [
  { id: 't1', name: 'Hawks' },
  { id: 't2', name: 'Bisons' },
  { id: 't3', name: 'Owls' },
];

const rows = [
  {
    id: 'row-1',
    round: 1,
    isBye: false,
    homeLeagueTeamId: 't1',
    awayLeagueTeamId: 't2',
    scheduledAt: new Date(2026, 8, 5, 10, 0),
    venue: 'Court 1',
    overflowed: false,
  },
  { id: 'row-2', round: 1, isBye: true, byeTeamId: 't3' },
];

function setup(overrides = {}) {
  const props = {
    rows,
    teams,
    onChangeRow: vi.fn(),
    onSwapSides: vi.fn(),
    onRemoveRow: vi.fn(),
    ...overrides,
  };
  render(<ScheduleDraftTable {...props} />);
  return props;
}

describe('ScheduleDraftTable', () => {
  it('shows both team names for a game row', () => {
    setup();
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('Bisons')).toBeInTheDocument();
  });

  it('shows a bye row naming the resting team', () => {
    setup();
    expect(screen.getByText(/Owls/)).toBeInTheDocument();
    expect(screen.getByText(/bye/i)).toBeInTheDocument();
  });

  it('swaps sides when the swap control is used', async () => {
    const { onSwapSides } = setup();
    await userEvent.click(screen.getByRole('button', { name: /swap home and away/i }));
    expect(onSwapSides).toHaveBeenCalledWith('row-1');
  });

  it('removes a row', async () => {
    const { onRemoveRow } = setup();
    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect(onRemoveRow).toHaveBeenCalledWith('row-1');
  });

  it('edits the venue', async () => {
    const { onChangeRow } = setup();
    const input = screen.getByLabelText(/venue/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Court 2');
    expect(onChangeRow).toHaveBeenCalled();
  });

  it('marks an overflowed row', () => {
    setup({ rows: [{ ...rows[0], overflowed: true }] });
    expect(screen.getByText(/moved/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- ScheduleDraftTable`
Expected: FAIL — cannot resolve `./ScheduleDraftTable`.

- [ ] **Step 3: Write minimal implementation**

Build `ScheduleDraftTable.jsx` as a named export using the slate/sky-blue palette. Requirements the tests pin down:

- one block per row, keyed by `row.id`;
- game rows show home and away team names resolved from `teams`, a `datetime-local` input bound to `row.scheduledAt`, and a text input labelled "Venue";
- a button labelled "Swap home and away" calling `onSwapSides(row.id)`;
- a button labelled "Remove" calling `onRemoveRow(row.id)`;
- date and venue edits call `onChangeRow(row.id, { scheduledAt })` / `onChangeRow(row.id, { venue })`;
- an overflowed row renders a visible "Moved to a later date" badge;
- a bye row renders `"{teamName} — bye"`, greyed, with no editable inputs;
- table markup at `sm:` and up, stacked cards below (`hidden sm:table` / `sm:hidden` pair), so a phone gets cards;
- every input has an associated label (`useId` for ids) — accessibility is maintained per the project conventions.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- ScheduleDraftTable`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/leagues/components/ScheduleDraftTable.jsx client/src/features/leagues/components/ScheduleDraftTable.test.jsx
git commit -m "feat(leagues): add schedule draft table component"
```

---

### Task 12: Schedule builder page

**Files:**

- Create: `client/src/features/leagues/pages/AdminLeagueSchedulePage.jsx`
- Test: `client/src/features/leagues/pages/AdminLeagueSchedulePage.test.jsx`

**Interfaces:**

- Consumes: `buildRoundRobin`, `assignDates` (Tasks 8–9); `ScheduleDraftTable` (Task 11); `leaguesApi.bulkCreateGames` (Task 10).
- Produces: `AdminLeagueSchedulePage` — named export, default-exported nowhere (the lazy loader unwraps the named export).

Page state: selected team ids (all league teams selected by default), `startDate`, `weekdays`, `slots`, default `venue`, `rows`, `overflowAcknowledged`, `replaceExisting`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/features/leagues/pages/AdminLeagueSchedulePage.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLeagueSchedulePage } from './AdminLeagueSchedulePage';
import { leaguesApi } from '../api/leaguesApi';

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getLeague: vi.fn(),
    bulkCreateGames: vi.fn(),
  },
}));

const league = {
  id: 'league-1',
  name: 'Demo League',
  teams: [
    { id: 't1', name: 'Hawks' },
    { id: 't2', name: 'Bisons' },
    { id: 't3', name: 'Owls' },
    { id: 't4', name: 'Foxes' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/leagues/league-1/schedule']}>
      <AdminLeagueSchedulePage />
    </MemoryRouter>
  );
}

describe('AdminLeagueSchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApi.getLeague.mockResolvedValue({ league });
    leaguesApi.bulkCreateGames.mockResolvedValue({ created: 6, replaced: 0, games: [] });
  });

  it('generates a draft when pairings are suggested', async () => {
    renderPage();
    await screen.findByText('Demo League');
    await userEvent.click(screen.getByRole('button', { name: /suggest pairings/i }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /remove/i }).length).toBe(6));
  });

  it('submits only game rows, never bye rows', async () => {
    leaguesApi.getLeague.mockResolvedValue({
      league: { ...league, teams: league.teams.slice(0, 3) },
    });
    renderPage();
    await screen.findByText('Demo League');
    await userEvent.click(screen.getByRole('button', { name: /suggest pairings/i }));
    await userEvent.click(screen.getByRole('button', { name: /create \d+ games?/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());
    const [, payload] = leaguesApi.bulkCreateGames.mock.calls[0];
    expect(payload.games).toHaveLength(3);
    expect(payload.games.every((g) => g.homeLeagueTeamId && g.awayLeagueTeamId)).toBe(true);
    expect(payload.games.every((g) => !('isBye' in g))).toBe(true);
  });

  it('blocks committing while an overflow is unacknowledged', async () => {
    renderPage();
    await screen.findByText('Demo League');

    // One slot per game-day forces overflow for a 4-team round-robin.
    const slots = screen.getByLabelText(/time slots/i);
    await userEvent.clear(slots);
    await userEvent.type(slots, '10:00');
    await userEvent.click(screen.getByRole('button', { name: /suggest pairings/i }));

    expect(await screen.findByText(/couldn't fit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create \d+ games?/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /understand/i }));
    expect(screen.getByRole('button', { name: /create \d+ games?/i })).toBeEnabled();
  });

  it('asks for confirmation before replacing existing games', async () => {
    renderPage();
    await screen.findByText('Demo League');
    await userEvent.click(screen.getByRole('button', { name: /suggest pairings/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /replace/i }));
    await userEvent.click(screen.getByRole('button', { name: /create \d+ games?/i }));

    expect(await screen.findByText(/will be deleted/i)).toBeInTheDocument();
    expect(leaguesApi.bulkCreateGames).not.toHaveBeenCalled();
  });

  it('surfaces a server error message', async () => {
    leaguesApi.bulkCreateGames.mockRejectedValue(
      Object.assign(new Error('This league has no active season.'), { status: 400 })
    );
    renderPage();
    await screen.findByText('Demo League');
    await userEvent.click(screen.getByRole('button', { name: /suggest pairings/i }));
    await userEvent.click(screen.getByRole('button', { name: /create \d+ games?/i }));

    expect(await screen.findByText(/no active season/i)).toBeInTheDocument();
  });
});
```

Match `leaguesApi.getLeague`'s real name and response shape to whatever `AdminLeaguePage.jsx` already calls; adjust the mock if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- AdminLeagueSchedulePage`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Write minimal implementation**

Build the page with `useQuery` for the league (new data page ⇒ TanStack Query per the project convention) and local `useState` for all draft state. Requirements the tests pin down:

- heading shows the league name, with `Breadcrumbs` + `PageHeader` like the sibling admin pages;
- a team multi-select, all selected by default;
- inputs: start date (`date`), weekday checkboxes, "Time slots" (comma-separated `HH:MM`), default venue;
- **Suggest pairings** runs `buildRoundRobin(selectedTeamIds)` → `assignDates(...)` and stores `rows`;
- **Start empty** clears `rows` to `[]`; an "Add game" control appends a blank row;
- when `overflowCount > 0`, render a warning naming the count and the date games moved to ("3 games couldn't fit your slots and were moved to Sat 12 Sep") plus a checkbox labelled "I understand"; the commit button is disabled until it is checked;
- the commit button reads `Create {n} games` where `n` counts non-bye rows;
- a "Replace existing scheduled games" checkbox; when checked, clicking commit first shows a confirmation naming how many will be deleted, and only the confirm action calls the API;
- on submit, map non-bye rows to `{ homeLeagueTeamId, awayLeagueTeamId, scheduledAt: row.scheduledAt.toISOString(), venue }`, drop empty venues, and call `leaguesApi.bulkCreateGames(leagueId, { games, replaceExisting })`;
- on success navigate back to `/admin/leagues/{leagueId}`; on failure render `error.message` (never swallow it — see the swallowed-error note in PROJECT-KNOWLEDGE §11);
- a `beforeunload` warning while `rows.length > 0` and nothing has been committed.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- AdminLeagueSchedulePage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/leagues/pages/AdminLeagueSchedulePage.jsx client/src/features/leagues/pages/AdminLeagueSchedulePage.test.jsx
git commit -m "feat(leagues): add schedule builder page"
```

---

### Task 13: Route and entry point

**Files:**

- Modify: `client/src/app/router/AppRouter.jsx`
- Modify: `client/src/features/leagues/pages/AdminLeaguePage.jsx`

**Interfaces:**

- Consumes: `AdminLeagueSchedulePage` (Task 12).

- [ ] **Step 1: Add the lazy route**

Alongside the other admin league routes, matching the existing lazy-import style that unwraps a named export:

```jsx
const AdminLeagueSchedulePage = lazy(() =>
  import('../../features/leagues/pages/AdminLeagueSchedulePage').then((m) => ({
    default: m.AdminLeagueSchedulePage,
  }))
);
```

Register it inside the same `ProtectedRoute` group as the other `/admin/leagues/...` routes:

```jsx
<Route path="/admin/leagues/:leagueId/schedule" element={<AdminLeagueSchedulePage />} />
```

- [ ] **Step 2: Add the entry point**

On `AdminLeaguePage.jsx`, next to the existing "New game" action, add a link visible only to a league manager or owner (reuse the same `viewerContext`-derived flag the neighbouring admin actions already use):

```jsx
<Link
  to={`/admin/leagues/${league.id}/schedule`}
  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
>
  Build schedule
</Link>
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter client test -- AdminLeaguePage`
Expected: no new failures versus the OPT-026 baseline.

- [ ] **Step 4: Commit**

```bash
git add client/src/app/router/AppRouter.jsx client/src/features/leagues/pages/AdminLeaguePage.jsx
git commit -m "feat(leagues): route and entry point for the schedule builder"
```

---

### Task 14: Full verification and documentation

**Files:**

- Modify: `docs/schedule-builder/STATUS-DASHBOARD.md`
- Modify: `docs/schedule-builder/IMPLEMENTATION-TRACKER.md`
- Modify: `docs/PROJECT-KNOWLEDGE.md` (§5 status enum note, §11 feature entry)
- Modify: `docs/api.md` (the new endpoint)

- [ ] **Step 1: Run every check**

```bash
pnpm check-env && pnpm lint && pnpm test && pnpm build
```

Expected: server suite fully green; client suite no worse than the OPT-026 baseline; lint and build clean. Fix anything this surfaces before continuing.

- [ ] **Step 2: Manual pass**

With `pnpm dev` and a seeded league that has an active season and ≥4 teams:

1. `/admin/leagues/:id` → "Build schedule".
2. Suggest pairings with two slots on Saturdays; confirm dates and times look right.
3. Set a single slot; confirm the overflow warning appears and blocks commit until acknowledged.
4. Use an odd number of teams; confirm bye rows render and are not committed.
5. Commit; confirm the games appear on the league page as scheduled, not in progress.
6. Re-run with "Replace existing"; confirm only the scheduled games were replaced and any completed game survived.
7. Repeat steps 1–2 at a 375px viewport; confirm the card layout is usable.

- [ ] **Step 3: Update the docs**

- Tick every task in `IMPLEMENTATION-TRACKER.md`; set the dashboard to 14/14, 100%, phases ✅.
- `PROJECT-KNOWLEDGE.md` §5: note that `Game.status` now includes `'scheduled'` and that `venue` is a free-text field.
- `PROJECT-KNOWLEDGE.md` §11: add a "Schedule Builder" entry summarising what shipped and what was deferred (double round-robin, divisions, venue entities, blackout dates, server-persisted drafts).
- `api.md`: document `POST /leagues/:leagueId/games/bulk` — payload, validation limits, auth gate, response.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(schedule-builder): record shipped feature and update trackers"
```

---

## Self-Review

**Spec coverage:** every spec section maps to a task — §5 generation → Tasks 8–9; §6 API → Tasks 4–7; §7 venue → Task 3; §8 file list → Tasks 3–13; §9 testing → tests in every task plus Task 14; §4 user flow → Tasks 11–13. The `'scheduled'` status (Tasks 1–2) is an addition discovered during planning: the spec assumed the value already existed. The spec's §6/§7 should be read alongside Task 1.

**Placeholders:** none — every code step carries real code or an explicit, checkable requirement list.

**Type consistency:** `DraftRow` is produced by `assignDates` (Task 9) and consumed unchanged by `ScheduleDraftTable` (Task 11) and the page (Task 12). `buildRoundRobin` → `assignDates` is the only internal contract, and both signatures are pinned in their Interfaces blocks. Server side, `insertManyGames` / `deleteReplaceableLeagueGames` (Task 4) are consumed with identical names in Task 6.
