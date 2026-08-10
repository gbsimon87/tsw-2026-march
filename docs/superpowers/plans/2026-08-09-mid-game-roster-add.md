# Mid-Game Roster Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized user add a missed player to a team's roster from inside `GameTrackPage`, so the player becomes trackable in the game already in progress.

**Architecture:** One new game-scoped endpoint (`POST /games/:gameId/roster`) whose service delegates the durable roster write to the **existing** `leaguesService.addPlayerToLeagueTeam` / `teamsService.addPlayerToTeam` (inheriting their permission gates and duplicate-name rules), then appends the new player to the game's frozen roster snapshot when the game shape has one. The client gets a small dialog and a new `canManageRoster` flag on the game payload to gate its visibility.

**Tech Stack:** Server — Node/Express (CommonJS), Mongoose, Zod, Jest + Supertest. Client — React 18 (ESM), Vite, Tailwind 3, Vitest + React Testing Library.

**Design spec:** [`docs/superpowers/specs/2026-08-09-mid-game-roster-add-design.md`](../specs/2026-08-09-mid-game-roster-add-design.md)

## Global Constraints

- **Branch:** `feature/mid-game-roster-add` (already created from `dev`).
- **Server is module-based**: `routes → controller → service → repository`. Mongoose schemas live **inline in `*.repository.js`**; there is no `models/` directory.
- **Business logic AND authorization live in `*.service.js`.** Never add a permission check in a route or controller.
- **Errors:** `throw new ApiError(status, message)` from services. Wrap route handlers in `asyncHandler`. Validate input with Zod at the controller via `schema.parse(req.body)`.
- **Require cycle:** `teams.service.js` requires `games.service.js` (for `computeBoxScore`). Any use of `teams.service` from inside `games.service` MUST be a **function-scoped** `require(...)`, matching the existing pattern at `games.service.js:196` and `:1751`. A top-level require will break the server at boot.
- **Roster fields collected:** `displayName` (required) and `jerseyNumber` (optional, int 0–999, nullable). **No `position` field.**
- **Allowed game statuses:** `in_progress` and `scheduled` only. Completed games must be rejected.
- **Client styling:** `GameTrackPage` uses the original **slate/sky-blue** palette. Do **not** use the `#141414`/`#F4A300`/`#1B4332` "scoreboard" tokens here (per PROJECT-KNOWLEDGE §9.1 — don't spread the new palette opportunistically).
- **Client conventions:** named exports only; hand-rolled forms (no react-hook-form); no path aliases (deep relative imports); Tailwind classes inline.
- **Do NOT** decompose `GameTrackPage.jsx` or migrate it to TanStack Query — that is tracked separately as OPT-014b.
- **Test runners are not interchangeable:** Jest on the server, Vitest on the client.
- **Commits:** conventional commits (commitlint enforces this).

## File Structure

**Server**
| File | Responsibility |
|---|---|
| `server/src/modules/games/games.validation.js` | Add `addRosterPlayerSchema` (modify) |
| `server/src/modules/games/games.service.js` | Add `addPlayerToGameRoster` + `resolveRosterTargetForGame` + `canManageGameRoster`; expose `canManageRoster` on the game payload (modify) |
| `server/src/modules/games/games.controller.js` | Add `addRosterPlayer` handler (modify) |
| `server/src/modules/games/games.routes.js` | Add `POST /:gameId/roster` (modify) |
| `server/src/tests/unit/game-roster-add.test.js` | Unit tests for the service (create) |
| `server/src/tests/integration/games.roster-add.test.js` | Unmocked route + two-write invariant (create) |

**Client**
| File | Responsibility |
|---|---|
| `client/src/features/games/api/gamesApi.js` | Add `addRosterPlayer` method (modify) |
| `client/src/features/games/components/AddRosterPlayerDialog.jsx` | The add-player form dialog (create) |
| `client/src/features/games/components/AddRosterPlayerDialog.test.jsx` | Dialog tests (create) |
| `client/src/features/games/pages/GameTrackPage.jsx` | Wire dialog + two triggers + local roster state (modify) |

**Docs**
| File | Responsibility |
|---|---|
| `docs/PROJECT-KNOWLEDGE.md` | §1 capability bullet + §11 entry (modify) |
| `docs/api.md` | Document the new endpoint (modify) |

---

### Task 1: Validation schema

**Files:**

- Modify: `server/src/modules/games/games.validation.js`
- Test: `server/src/tests/unit/game-roster-add.test.js` (create)

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `addRosterPlayerSchema` — a Zod object parsing `{ side?: 'home'|'away', displayName: string, jerseyNumber?: number|null }`. Exported from `games.validation.js`. `displayName` is trimmed, 1–120 chars. `jerseyNumber` is `int().min(0).max(999).nullable().optional()`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/game-roster-add.test.js`:

```javascript
const { addRosterPlayerSchema } = require('../../modules/games/games.validation');

describe('addRosterPlayerSchema', () => {
  it('accepts a name only', () => {
    expect(addRosterPlayerSchema.parse({ displayName: 'Jordan Blake' })).toEqual({
      displayName: 'Jordan Blake',
    });
  });

  it('accepts a name with jersey number and side', () => {
    expect(
      addRosterPlayerSchema.parse({ displayName: 'Sam Reed', jerseyNumber: 23, side: 'home' })
    ).toEqual({ displayName: 'Sam Reed', jerseyNumber: 23, side: 'home' });
  });

  it('trims the display name', () => {
    expect(addRosterPlayerSchema.parse({ displayName: '  Ada  ' }).displayName).toBe('Ada');
  });

  it('accepts a null jersey number', () => {
    expect(
      addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: null }).jerseyNumber
    ).toBeNull();
  });

  it('rejects an empty display name', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: '   ' })).toThrow();
  });

  it('rejects a jersey number above 999', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: 1000 })).toThrow();
  });

  it('rejects a non-integer jersey number', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', jerseyNumber: 1.5 })).toThrow();
  });

  it('rejects an invalid side', () => {
    expect(() => addRosterPlayerSchema.parse({ displayName: 'Ada', side: 'middle' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-roster-add`
Expected: FAIL — `addRosterPlayerSchema` is undefined (not a function / cannot read property `parse`).

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/games/games.validation.js`, add near the other game schemas (the file already imports `z` and `TEAM_SIDES` at the top):

```javascript
// Mid-game roster add. Name + optional jersey only — position is deliberately
// omitted (unused by tracking, and this form is filled with a game running).
// Mirrors leagues.validation.js's jerseyNumber rules so a player added here
// validates identically to one added on the admin roster page.
const addRosterPlayerSchema = z.object({
  side: z.enum([TEAM_SIDES.HOME, TEAM_SIDES.AWAY]).optional(),
  displayName: z.string().trim().min(1).max(120),
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
});
```

Then add `addRosterPlayerSchema` to the file's `module.exports` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-roster-add`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/games/games.validation.js server/src/tests/unit/game-roster-add.test.js
git commit -m "feat(games): add mid-game roster player validation schema"
```

---

### Task 2: Service — resolve the roster target for a game

**Files:**

- Modify: `server/src/modules/games/games.service.js`
- Test: `server/src/tests/unit/game-roster-target.test.js` (create)

**Interfaces:**

- Consumes: `addRosterPlayerSchema` (Task 1) — not directly, but the `side` value it validates is this function's input.
- Produces: `resolveRosterTargetForGame(game, side)` → a plain object, exported from `games.service.js`:
  - `{ kind: 'league', leagueId: string, leagueTeamId: string, snapshotField: 'homeRosterSnapshot'|'awayRosterSnapshot'|'rosterSnapshot' }`
  - `{ kind: 'standalone', teamId: string, snapshotField: 'homeRosterSnapshot'|'awayRosterSnapshot'|null }`
  - `snapshotField` is `null` **only** for a standalone one-sided game, which reads `team.players` live and therefore needs no game write.
  - Throws `ApiError(400, 'side is required for dual-team games')` when a dual-team game is given no `side`.

**Context for the implementer:** the roster read path differs per game shape. A standalone one-sided game reads `team.players` live from the `Team` doc (see `resolveGameTeamContext`), so nothing needs writing to the game. Every other shape reads a **frozen** snapshot array on the `Game` doc and must be appended to.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/game-roster-target.test.js`:

```javascript
const { resolveRosterTargetForGame } = require('../../modules/games/games.service');

describe('resolveRosterTargetForGame', () => {
  it('maps a standalone one-sided game to the team with no snapshot field', () => {
    const game = {
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      teamId: 'team-1',
    };
    expect(resolveRosterTargetForGame(game, undefined)).toEqual({
      kind: 'standalone',
      teamId: 'team-1',
      snapshotField: null,
    });
  });

  it('maps a league one-sided game to the tracked league team and rosterSnapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    expect(resolveRosterTargetForGame(game, undefined)).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-1',
      snapshotField: 'rosterSnapshot',
    });
  });

  it('maps a league dual-team home side to the home league team and snapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(resolveRosterTargetForGame(game, 'home')).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-home',
      snapshotField: 'homeRosterSnapshot',
    });
  });

  it('maps a league dual-team away side to the away league team and snapshot', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(resolveRosterTargetForGame(game, 'away')).toEqual({
      kind: 'league',
      leagueId: 'league-1',
      leagueTeamId: 'lt-away',
      snapshotField: 'awayRosterSnapshot',
    });
  });

  it('maps a standalone dual-team away side to the away team and snapshot', () => {
    const game = {
      gameContext: 'standalone',
      trackingMode: 'dual_team',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
    };
    expect(resolveRosterTargetForGame(game, 'away')).toEqual({
      kind: 'standalone',
      teamId: 'team-away',
      snapshotField: 'awayRosterSnapshot',
    });
  });

  it('throws 400 when a dual-team game is given no side', () => {
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    expect(() => resolveRosterTargetForGame(game, undefined)).toThrow(
      /side is required for dual-team games/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-roster-target`
Expected: FAIL — `resolveRosterTargetForGame is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/games/games.service.js`, add near the other roster-snapshot helpers (close to `repairGameRosterSnapshots`, around line 763):

```javascript
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
```

Add `resolveRosterTargetForGame` to the file's `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-roster-target`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/games/games.service.js server/src/tests/unit/game-roster-target.test.js
git commit -m "feat(games): resolve roster target and snapshot field per game shape"
```

---

### Task 3: Service — `addPlayerToGameRoster`

**Files:**

- Modify: `server/src/modules/games/games.service.js`
- Test: `server/src/tests/unit/game-roster-add-service.test.js` (create)

**Interfaces:**

- Consumes: `resolveRosterTargetForGame(game, side)` (Task 2); `assertGameAccess(userId, gameId)` (existing, `games.service.js:675`); `leaguesService.addPlayerToLeagueTeam(userId, leagueId, leagueTeamId, payload)` (existing, gates `assertTeamManagerOrOwner`, throws `409` on duplicate active name); `teamsService.addPlayerToTeam(userId, teamId, payload)` (existing, gates team ownership).
- Produces: `addPlayerToGameRoster(userId, gameId, payload)` → `{ player, side }` where `player` is the sanitized player object returned by the delegated service and `side` echoes the input (`null` for one-sided games). Exported from `games.service.js`.

**Context for the implementer:**

1. **Delegate, never re-implement the permission check.** `addPlayerToLeagueTeam` and `addPlayerToTeam` each carry their own gate. Calling them is what makes this endpoint respect the existing permission matrix. PROJECT-KNOWLEDGE §4 records a real bug (TSW-001) caused by a gate rewritten from scratch that forgot an owner OR-clause — do not repeat it.
2. **Order matters: roster write first, snapshot second.** If the snapshot append fails you get a real roster player with no game row (recoverable). The reverse would create a phantom snapshot entry with no `LeaguePlayer` behind it, breaking the `leaguePlayerId` linkage `LeaguePlayerStats` and public player pages depend on.
3. **`teams.service` must be required lazily inside the function** (see Global Constraints).
4. **Snapshot entry shape** must match `buildLeagueRosterSnapshot` (`leagues.service.js:2370`): `{ leaguePlayerId, displayName, jerseyNumber, position, claimedByUserId, isClaimed, isActive }`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/game-roster-add-service.test.js`:

```javascript
jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
  saveGame: jest.fn(async (game) => game),
  createGame: jest.fn(),
  listGamesByOwner: jest.fn(),
  claimGameSummaryGeneration: jest.fn(),
  releaseGameSummaryLock: jest.fn(),
  saveGameSummary: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.service', () => ({
  addPlayerToLeagueTeam: jest.fn(),
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(async () => true),
  canFinalizeLeagueGame: jest.fn(),
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  addPlayerToTeam: jest.fn(),
  scheduleTeamSeasonSummaryRecompute: jest.fn(),
  computeBoxScore: jest.fn(),
}));

const { findGameById, saveGame } = require('../../modules/games/games.repository');
const leaguesService = require('../../modules/leagues/leagues.service');
const teamsService = require('../../modules/teams/teams.service');
const { addPlayerToGameRoster } = require('../../modules/games/games.service');

const OWNER = '507f1f77bcf86cd799439011';
const GAME_ID = '507f1f77bcf86cd799439012';

function leagueDualGame(overrides = {}) {
  return {
    _id: GAME_ID,
    ownerUserId: OWNER,
    status: 'in_progress',
    gameContext: 'league',
    trackingMode: 'dual_team',
    leagueId: '507f1f77bcf86cd799439013',
    homeLeagueTeamId: '507f1f77bcf86cd799439014',
    awayLeagueTeamId: '507f1f77bcf86cd799439015',
    homeRosterSnapshot: [],
    awayRosterSnapshot: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  leaguesService.addPlayerToLeagueTeam.mockResolvedValue({
    id: 'lp-1',
    displayName: 'Jordan Blake',
    jerseyNumber: 23,
    position: null,
    isActive: true,
  });
  teamsService.addPlayerToTeam.mockResolvedValue({
    id: 'p-1',
    displayName: 'Jordan Blake',
    jerseyNumber: 23,
  });
});

describe('addPlayerToGameRoster', () => {
  it('delegates the league roster write and appends to the correct snapshot', async () => {
    const game = leagueDualGame();
    findGameById.mockResolvedValue(game);

    const result = await addPlayerToGameRoster(OWNER, GAME_ID, {
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(leaguesService.addPlayerToLeagueTeam).toHaveBeenCalledWith(
      OWNER,
      '507f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439014',
      { displayName: 'Jordan Blake', jerseyNumber: 23 }
    );
    expect(game.homeRosterSnapshot).toHaveLength(1);
    expect(game.homeRosterSnapshot[0]).toMatchObject({
      leaguePlayerId: 'lp-1',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
      isActive: true,
      isClaimed: false,
    });
    expect(game.awayRosterSnapshot).toHaveLength(0);
    expect(saveGame).toHaveBeenCalledWith(game);
    expect(result.player.displayName).toBe('Jordan Blake');
    expect(result.side).toBe('home');
  });

  it('writes no snapshot for a standalone one-sided game', async () => {
    const game = {
      _id: GAME_ID,
      ownerUserId: OWNER,
      status: 'in_progress',
      gameContext: 'standalone',
      trackingMode: 'one_sided',
      teamId: '507f1f77bcf86cd799439016',
    };
    findGameById.mockResolvedValue(game);

    const result = await addPlayerToGameRoster(OWNER, GAME_ID, { displayName: 'Jordan Blake' });

    expect(teamsService.addPlayerToTeam).toHaveBeenCalledWith(OWNER, '507f1f77bcf86cd799439016', {
      displayName: 'Jordan Blake',
      jerseyNumber: null,
    });
    expect(saveGame).not.toHaveBeenCalled();
    expect(result.side).toBeNull();
  });

  it('rejects a completed game with 409 and writes nothing', async () => {
    findGameById.mockResolvedValue(leagueDualGame({ status: 'completed' }));

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(leaguesService.addPlayerToLeagueTeam).not.toHaveBeenCalled();
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('allows a scheduled game', async () => {
    findGameById.mockResolvedValue(leagueDualGame({ status: 'scheduled' }));

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).resolves.toBeTruthy();
  });

  it('propagates a duplicate-name 409 from the delegated service', async () => {
    findGameById.mockResolvedValue(leagueDualGame());
    const conflict = new Error('Player name is already in use on this team');
    conflict.statusCode = 409;
    leaguesService.addPlayerToLeagueTeam.mockRejectedValue(conflict);

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(saveGame).not.toHaveBeenCalled();
  });

  it('propagates a 403 from the delegated permission gate without touching the game', async () => {
    findGameById.mockResolvedValue(leagueDualGame());
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    leaguesService.addPlayerToLeagueTeam.mockRejectedValue(forbidden);

    await expect(
      addPlayerToGameRoster(OWNER, GAME_ID, { side: 'home', displayName: 'Jordan Blake' })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(saveGame).not.toHaveBeenCalled();
  });

  it('retries the snapshot append once on a VersionError', async () => {
    const stale = leagueDualGame();
    const fresh = leagueDualGame();
    findGameById.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);

    const versionError = new Error('No matching document found for id');
    versionError.name = 'VersionError';
    saveGame.mockRejectedValueOnce(versionError).mockResolvedValueOnce(fresh);

    await addPlayerToGameRoster(OWNER, GAME_ID, {
      side: 'home',
      displayName: 'Jordan Blake',
      jerseyNumber: 23,
    });

    expect(saveGame).toHaveBeenCalledTimes(2);
    expect(fresh.homeRosterSnapshot).toHaveLength(1);
    // The roster write must NOT be repeated by the retry — that would create a
    // second real player.
    expect(leaguesService.addPlayerToLeagueTeam).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-roster-add-service`
Expected: FAIL — `addPlayerToGameRoster is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/games/games.service.js`, add below `resolveRosterTargetForGame`:

```javascript
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
  const game = await assertGameAccess(userId, gameId);

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
    player = await addPlayerToTeam(userId, target.teamId, rosterPayload);
  }

  if (target.snapshotField) {
    await appendPlayerToGameSnapshot(gameId, game, target.snapshotField, player);
  }

  return { player, side };
}

// Mirrors buildLeagueRosterSnapshot's field shape (leagues.service.js) so a
// mid-game addition is indistinguishable from one frozen at game creation.
function buildSnapshotEntry(player) {
  return {
    leaguePlayerId: player.id ?? player._id,
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: player.position ?? null,
    claimedByUserId: player.claimedByUserId ?? null,
    isClaimed: Boolean(player.claimedByUserId),
    isActive: true,
  };
}

// The Game schema uses optimisticConcurrency, so a co-tracker saving an event at
// the same moment makes this save throw VersionError. The append is pure, so
// replaying it on a freshly loaded game is safe — and far better than surfacing a
// conflict to someone mid-game. The roster write above is NOT replayed.
async function appendPlayerToGameSnapshot(gameId, game, snapshotField, player) {
  const entry = buildSnapshotEntry(player);

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
```

Add `addPlayerToGameRoster` to the file's `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-roster-add-service`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole server suite to check nothing regressed**

Run: `pnpm --filter server test`
Expected: PASS. The new function is additive, so any failure here is a real regression (most likely a require-cycle break — check that `teams.service` is required _inside_ the function, not at the top of the file).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/games/games.service.js server/src/tests/unit/game-roster-add-service.test.js
git commit -m "feat(games): add player to a live game's roster and snapshot"
```

---

### Task 4: Controller + route

**Files:**

- Modify: `server/src/modules/games/games.controller.js`
- Modify: `server/src/modules/games/games.routes.js`
- Test: `server/src/tests/integration/games.roster-add.test.js` (create)

**Interfaces:**

- Consumes: `addRosterPlayerSchema` (Task 1), `gamesService.addPlayerToGameRoster` (Task 3).
- Produces: `POST /api/v1/games/:gameId/roster` → `201` with `{ player, side }`.

**Context for the implementer:** `games.routes.js` calls `gamesRouter.use(authMiddleware)` at line 19; every route below it is authenticated. Put the new route below that line. Controllers use a local `requireAuthUserId(req)` helper already defined in the file.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/integration/games.roster-add.test.js`. Read an existing integration test first (`server/src/tests/integration/leagues.bulk-games.test.js`) and copy its app/DB bootstrap and auth-cookie helpers verbatim — the harness setup differs per file and must match this repo's, not a generic Supertest example. Then assert this behaviour:

```javascript
// Using this file's established bootstrap helpers, cover:
//
// 1. A league dual-team in-progress game, requested by the league owner:
//    POST /api/v1/games/:gameId/roster  { side: 'home', displayName: 'Jordan Blake', jerseyNumber: 23 }
//    → 201, body.player.displayName === 'Jordan Blake'
//    THEN assert the TWO-WRITE INVARIANT directly against the DB:
//      - a LeaguePlayer document now exists for that leagueTeamId with that name
//      - game.homeRosterSnapshot contains an entry whose leaguePlayerId equals
//        that LeaguePlayer's _id, and awayRosterSnapshot is untouched
//    This is the assertion a mocked unit test cannot make, and the reason this
//    integration test exists (see PROJECT-KNOWLEDGE §1 v1.5 lesson: a missing
//    export 500'd every request while all mocked tests passed).
//
// 2. The same request against a COMPLETED game → 409, and neither write happens.
//
// 3. The same request from a signed-in user with no role in the league → 404 or
//    403 (assertGameAccess yields 404 for a non-participant; a league helper who
//    can track but not edit rosters yields 403 from assertTeamManagerOrOwner).
//    Assert no LeaguePlayer was created either way.
//
// 4. A dual-team game with NO `side` in the body → 400.
```

Write these as real `it(...)` blocks with real assertions — the comment above is the specification, not the deliverable.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- games.roster-add`
Expected: FAIL with `404` on the POST — the route does not exist yet.

- [ ] **Step 3: Write the controller handler**

In `server/src/modules/games/games.controller.js`, add `addRosterPlayerSchema` to the existing `require` of `./games.validation`, then add the handler alongside the others:

```javascript
async function addRosterPlayer(req, res) {
  const userId = requireAuthUserId(req);
  const payload = addRosterPlayerSchema.parse(req.body);
  const result = await gamesService.addPlayerToGameRoster(userId, req.params.gameId, payload);
  res.status(201).json(result);
}
```

Add `addRosterPlayer` to the controller's `module.exports`.

- [ ] **Step 4: Write the route**

In `server/src/modules/games/games.routes.js`, add below the existing `lineup` route (it must be **after** `gamesRouter.use(authMiddleware)` on line 19):

```javascript
gamesRouter.post('/:gameId/roster', asyncHandler(controller.addRosterPlayer));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter server test -- games.roster-add`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/games/games.controller.js server/src/modules/games/games.routes.js server/src/tests/integration/games.roster-add.test.js
git commit -m "feat(games): expose POST /games/:gameId/roster"
```

---

### Task 5: Expose `canManageRoster` on the game payload

**Files:**

- Modify: `server/src/modules/games/games.service.js`
- Test: `server/src/tests/unit/game-roster-can-manage.test.js` (create)

**Interfaces:**

- Consumes: `resolveRosterTargetForGame` (Task 2).
- Produces: `canManageRoster` — a boolean added to the object `getGameForUser` returns, at the **top level** of the response body (a sibling of `game`, not nested inside it). The client reads `data.canManageRoster`.

**Context for the implementer — why this task exists:** `GameTrackPage` needs to hide the "Add player" button from someone who can _track_ a game but cannot _edit rosters_ (a league helper). The page currently has no permission data at all — the `viewerContext` field described elsewhere in the docs belongs to `GET /leagues/:id`, **not** the game payload — so the flag must come from the server. This is UX-only; Task 3's service gate remains authoritative.

For a league game, the answer is whether the user passes `assertTeamManagerOrOwner` for the tracked/side team. Reuse it rather than re-deriving the rule (§4, TSW-001). Since it throws rather than returns a boolean, wrap it. For a standalone game, ownership of the game already implies ownership of the team, so `true` is correct for anyone who passed `assertGameAccess`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/game-roster-can-manage.test.js`:

```javascript
jest.mock('../../modules/leagues/leagues.service', () => ({
  assertTeamManagerOrOwner: jest.fn(),
  getLeagueContextForGame: jest.fn(),
  getLeagueRosterSnapshotForTeam: jest.fn(),
  getLeagueTeamRosterSnapshotForGame: jest.fn(),
  canManageLeagueGame: jest.fn(),
  canFinalizeLeagueGame: jest.fn(),
  scheduleLeagueAggregateRecompute: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const { canManageGameRoster } = require('../../modules/games/games.service');

const USER = '507f1f77bcf86cd799439011';

beforeEach(() => jest.clearAllMocks());

describe('canManageGameRoster', () => {
  it('is true for a standalone game the user already has access to', async () => {
    const game = { gameContext: 'standalone', trackingMode: 'one_sided', teamId: 'team-1' };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
    expect(leaguesService.assertTeamManagerOrOwner).not.toHaveBeenCalled();
  });

  it('is true for a league game when the roster gate passes', async () => {
    leaguesService.assertTeamManagerOrOwner.mockResolvedValue({ league: {}, role: 'manager' });
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
  });

  it('is false for a league game when the roster gate throws 403 (helper)', async () => {
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    leaguesService.assertTeamManagerOrOwner.mockRejectedValue(forbidden);
    const game = {
      gameContext: 'league',
      trackingMode: 'one_sided',
      leagueId: 'league-1',
      trackedLeagueTeamId: 'lt-1',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(false);
  });

  it('is false without a user id', async () => {
    const game = { gameContext: 'standalone', trackingMode: 'one_sided', teamId: 'team-1' };
    await expect(canManageGameRoster(null, game)).resolves.toBe(false);
  });

  it('checks both sides of a dual-team league game and is true if either passes', async () => {
    leaguesService.assertTeamManagerOrOwner
      .mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
      .mockResolvedValueOnce({ league: {}, role: 'manager' });
    const game = {
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: 'league-1',
      homeLeagueTeamId: 'lt-home',
      awayLeagueTeamId: 'lt-away',
    };
    await expect(canManageGameRoster(USER, game)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- game-roster-can-manage`
Expected: FAIL — `canManageGameRoster is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/games/games.service.js`, add below `addPlayerToGameRoster`:

```javascript
// UX-only flag for the tracking screen's "Add player" affordance. The service
// gate in addPlayerToGameRoster stays authoritative — this just avoids showing a
// button that would 403 (a league helper can track a game but not edit rosters).
//
// Reuses assertTeamManagerOrOwner rather than re-deriving the rule; it throws
// instead of returning a boolean, hence the wrapper. For a dual-team game the
// flag is true if EITHER side is manageable — the client resolves per side when
// it actually submits.
async function canManageGameRoster(userId, game) {
  if (!userId || !game) return false;

  if (game.gameContext !== 'league') {
    // Passing assertGameAccess on a standalone game already implies team
    // ownership, which is exactly what addPlayerToTeam requires.
    return true;
  }

  const { assertTeamManagerOrOwner } = require('../leagues/leagues.service');
  const sides =
    game.trackingMode === 'dual_team' ? [TEAM_SIDES.HOME, TEAM_SIDES.AWAY] : [undefined];

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
```

Add `canManageGameRoster` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- game-roster-can-manage`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the flag to the game payload**

In `games.service.js`'s `getGameForUser`, find the object it returns (around line 1300+, the one containing `game`, `boxScore`, `team`, `opponentTeam`) and add a sibling key. Compute it just above the return:

```javascript
const canManageRoster = await canManageGameRoster(userId, game);
```

then add `canManageRoster,` to the returned object literal.

- [ ] **Step 6: Verify the payload change**

Run: `pnpm --filter server test`
Expected: PASS. If a snapshot or exact-shape assertion fails because a response gained a key, update that assertion to include `canManageRoster` — the added key is intended.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/games/games.service.js server/src/tests/unit/game-roster-can-manage.test.js
git commit -m "feat(games): expose canManageRoster on the game payload"
```

---

### Task 6: Client API method

**Files:**

- Modify: `client/src/features/games/api/gamesApi.js`

**Interfaces:**

- Consumes: `POST /games/:gameId/roster` (Task 4).
- Produces: `gamesApi.addRosterPlayer(gameId, payload)` → `Promise<{ player, side }>`, where `payload` is `{ side?, displayName, jerseyNumber? }`.

- [ ] **Step 1: Add the method**

In `client/src/features/games/api/gamesApi.js`, add to the `gamesApi` object, after `setLineup`:

```javascript
  addRosterPlayer(gameId, payload) {
    return apiClient.post(`/games/${gameId}/roster`, payload);
  },
```

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm --filter client test -- gamesApi`
Expected: PASS, or "no test files found" — this file has no dedicated test, and that is fine; the method is exercised via Task 7's dialog tests. Do not add a test that asserts only that `apiClient.post` was called with a URL.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/games/api/gamesApi.js
git commit -m "feat(games): add addRosterPlayer to gamesApi"
```

---

### Task 7: `AddRosterPlayerDialog` component

**Files:**

- Create: `client/src/features/games/components/AddRosterPlayerDialog.jsx`
- Create: `client/src/features/games/components/AddRosterPlayerDialog.test.jsx`

**Interfaces:**

- Consumes: nothing from earlier tasks (the submit handler is injected, so this component is testable without the API).
- Produces: named export `AddRosterPlayerDialog`, props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onSubmit: ({ displayName, jerseyNumber }) => Promise<void>` — `jerseyNumber` is a `number` or `null`. If it rejects, the dialog displays `error.message` inline and stays open.
  - `teamName?: string` — shown in the heading for dual-team clarity.

**Context for the implementer:** forms in this codebase are hand-rolled (`useAuthForm` pattern) — do **not** add react-hook-form. Surface the server's real error message; PROJECT-KNOWLEDGE §11 flags "swallowed error replaced by a generic string" as recurring debt in exactly this kind of handler. Use the slate/sky-blue palette. Accessibility is taken seriously in this repo (`aria-label`, focus management, `useId`) — maintain it.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/games/components/AddRosterPlayerDialog.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRosterPlayerDialog } from './AddRosterPlayerDialog';

function setup(props = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = props.onClose ?? vi.fn();
  render(<AddRosterPlayerDialog isOpen onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onClose };
}

describe('AddRosterPlayerDialog', () => {
  it('renders nothing when closed', () => {
    render(<AddRosterPlayerDialog isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/player name/i)).not.toBeInTheDocument();
  });

  it('submits a name with a null jersey number when jersey is blank', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText(/player name/i), 'Jordan Blake');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ displayName: 'Jordan Blake', jerseyNumber: null })
    );
  });

  it('submits a numeric jersey number', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText(/player name/i), 'Sam Reed');
    await userEvent.type(screen.getByLabelText(/jersey/i), '23');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ displayName: 'Sam Reed', jerseyNumber: 23 })
    );
  });

  it('does not submit an empty name', async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('shows the server error message verbatim and stays open', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Player name is already in use on this team'));
    const { onClose } = setup({ onSubmit });

    await userEvent.type(screen.getByLabelText(/player name/i), 'Jordan Blake');
    await userEvent.click(screen.getByRole('button', { name: /add player/i }));

    expect(
      await screen.findByText(/player name is already in use on this team/i)
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on cancel', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the team name when provided', () => {
    setup({ teamName: 'Riverside Hawks' });
    expect(screen.getByText(/riverside hawks/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- AddRosterPlayerDialog`
Expected: FAIL — cannot resolve `./AddRosterPlayerDialog`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/features/games/components/AddRosterPlayerDialog.jsx`:

```jsx
import { useEffect, useId, useState } from 'react';

// Mid-game roster add. Name + optional jersey only: this form gets filled with a
// game running, and jersey number is the field whose absence is immediately
// visible in the tracking UI's jersey badges. Position is omitted (unused by
// tracking, fixable later on the admin roster page).
export function AddRosterPlayerDialog({ isOpen, onClose, onSubmit, teamName }) {
  const nameId = useId();
  const jerseyId = useId();
  const [displayName, setDisplayName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setJerseyNumber('');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Player name is required');
      return;
    }

    const parsedJersey = jerseyNumber.trim() === '' ? null : Number(jerseyNumber);
    if (parsedJersey !== null && !Number.isInteger(parsedJersey)) {
      setError('Jersey number must be a whole number');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onSubmit({ displayName: trimmed, jerseyNumber: parsedJersey });
    } catch (submitError) {
      // Surface the server's real message — a generic string here is the exact
      // swallowed-error pattern PROJECT-KNOWLEDGE §11 flags as recurring debt.
      setError(submitError?.message || 'Could not add the player');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add player to roster"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 className="text-base font-semibold text-slate-900">Add Player</h2>
        {teamName ? <p className="mt-0.5 text-sm text-slate-500">{teamName}</p> : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium text-slate-700">
              Player name
            </label>
            <input
              id={nameId}
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor={jerseyId} className="block text-sm font-medium text-slate-700">
              Jersey number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id={jerseyId}
              type="number"
              inputMode="numeric"
              min="0"
              max="999"
              value={jerseyNumber}
              onChange={(event) => setJerseyNumber(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- AddRosterPlayerDialog`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/games/components/AddRosterPlayerDialog.jsx client/src/features/games/components/AddRosterPlayerDialog.test.jsx
git commit -m "feat(games): add AddRosterPlayerDialog component"
```

---

### Task 8: Wire the dialog into `GameTrackPage`

**Files:**

- Modify: `client/src/features/games/pages/GameTrackPage.jsx`

**Interfaces:**

- Consumes: `gamesApi.addRosterPlayer` (Task 6); `AddRosterPlayerDialog` (Task 7); `data.canManageRoster` from the game payload (Task 5).
- Produces: no new exports — this is the integration point.

**Context for the implementer:** this file is ~3,158 lines and fetches imperatively with `useEffect` (not TanStack Query). **Do not restructure it, and do not migrate it** — that is tracked as OPT-014b. Make additive changes only.

Relevant existing landmarks:

- `LineupPicker` (from ~line 100) holds the empty-roster panel: _"No players found on this roster."_ with a link to `/teams/:teamId/edit`. That panel is the first trigger site.
- `rosterOverride` state (~line 300) and the `players` `useMemo` (~line 502) determine the roster the page renders. For a dual-team game, `players` comes from `participantsBySide[activeSide].players`; otherwise from `rosterOverride || team.players`.
- `activeSide` identifies the current side in a dual-team game.

- [ ] **Step 1: Add state and the submit handler**

Near the other `useState` declarations in the page component, add:

```jsx
const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
```

Add a handler alongside the other action handlers. It sends `side` only for dual-team games, then refetches the game so the new player flows through the page's existing roster derivation rather than being hand-patched into two different shapes:

```jsx
async function handleAddRosterPlayer({ displayName, jerseyNumber }) {
  await gamesApi.addRosterPlayer(gameId, {
    ...(isDualTeam ? { side: activeSide } : {}),
    displayName,
    jerseyNumber,
  });
  // Refetch rather than patch local state: the roster is derived from either
  // participantsBySide or team.players depending on game shape, and the server
  // is the only thing that knows which snapshot it just appended to.
  await loadGame();
  setIsAddPlayerOpen(false);
}
```

Use whatever the page's existing fetch function is actually called in place of `loadGame()` — read the `useEffect` that populates `data` and reuse its loader. If that loader is defined inline inside the effect, extract it to a `useCallback` in the same commit and have the effect call it; that is the minimal change needed and is not a restructure.

- [ ] **Step 2: Render the dialog**

Near the page's other modals/overlays in the returned JSX, add:

```jsx
<AddRosterPlayerDialog
  isOpen={isAddPlayerOpen}
  onClose={() => setIsAddPlayerOpen(false)}
  onSubmit={handleAddRosterPlayer}
  teamName={isDualTeam ? participantsBySide[activeSide]?.displayName : team?.name}
/>
```

Import it at the top: `import { AddRosterPlayerDialog } from '../components/AddRosterPlayerDialog';`

- [ ] **Step 3: Add the bench trigger**

In the bench/roster region (the section rendering bench players — search for `No bench players available.` around line 2393), add a button, rendered only when permitted:

```jsx
{
  canManageRoster ? (
    <button
      type="button"
      onClick={() => setIsAddPlayerOpen(true)}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      + Add player
    </button>
  ) : null;
}
```

Read `canManageRoster` from the fetched payload the same way the page reads its other top-level fields (e.g. alongside where it derives `isLeagueGame` from `data?.game?.gameContext` at line 486): `const canManageRoster = Boolean(data?.canManageRoster);`

- [ ] **Step 4: Turn the empty-roster dead-end into an action**

`LineupPicker` needs two new props. Add `canManageRoster` and `onAddPlayer` to its parameter list, pass them from both of its call sites (~line 1972 and the inline lineup render), and replace the empty-roster panel body so it offers the action when permitted, keeping the existing link as the fallback:

```jsx
      {players.length === 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">No players found on this roster.</p>
          {canManageRoster ? (
            <button
              type="button"
              onClick={onAddPlayer}
              className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              + Add player
            </button>
          ) : teamId ? (
            <Link to={`/teams/${teamId}/edit`} className="mt-1 inline-block underline">
              Add players to this team
            </Link>
          ) : (
            <p className="mt-1">Go to Teams to add players before tracking.</p>
          )}
        </div>
      ) : (
```

Leave the "Select exactly 5 players for the starting five" validation untouched — tracking should still be blocked with fewer than five.

- [ ] **Step 5: Verify the client suite and lint**

Run: `pnpm --filter client test`
Expected: PASS for everything related to games. Note PROJECT-KNOWLEDGE §11/OPT-026: this suite has ~20 **pre-existing** failures unrelated to this work. Compare against `git stash`-ed baseline output if unsure — do not "fix" a failure you did not cause, and do not claim a pass you did not verify.

Run: `pnpm --filter client lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/games/pages/GameTrackPage.jsx
git commit -m "feat(games): add player to roster from the tracking screen"
```

---

### Task 9: Manual verification against a real database

**Files:** none (verification only)

**Context for the implementer:** PROJECT-KNOWLEDGE §1 records that Follow System v1.5 shipped a bug where every league follow 500'd at runtime — a helper existed but was never exported — while **all mocked unit tests passed**. It was caught only by live verification. This feature has the same shape (cross-module service calls between `games`, `leagues`, and `teams`, plus a lazy require to dodge a cycle), so it gets the same treatment.

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Seed first if needed: `pnpm seed` (users `user1@user1.com` … `user10@user10.com`, password `password`).

- [ ] **Step 2: Verify the league dual-team path**

Sign in as a league owner, open a league game, and start tracking it. Confirm:

- "+ Add player" is visible.
- Adding "Test Player" with jersey `99` succeeds with no console or network error.
- The player appears on the bench for the **active side only**.
- They can be subbed in via the existing substitution flow and can record a stat.
- The player also now appears on the league admin roster page for that team — proving the durable write, not just a snapshot patch.

- [ ] **Step 3: Verify the standalone path**

Open a standalone (non-league) game, add a player, and confirm they appear on the bench and on the team's edit page.

- [ ] **Step 4: Verify the negative paths**

- A **completed** game offers no add affordance, and a direct `POST` to its `/roster` returns `409`.
- Adding a name that already exists on the roster shows the real message _"Player name is already in use on this team"_ inline, not a generic error.

- [ ] **Step 5: Record the result**

If anything failed, fix it and re-run this task from Step 2. Do not proceed to Task 10 on a partial pass — state explicitly which steps passed.

---

### Task 10: Documentation

**Files:**

- Modify: `docs/PROJECT-KNOWLEDGE.md`
- Modify: `docs/api.md`

**Context for the implementer:** `PROJECT-KNOWLEDGE.md` is the definitive reference and explicitly asks to be updated when code changes. Read the existing §1 capability bullets and §11 entries first and match their voice and density — these are dense, decision-recording paragraphs, not changelog one-liners.

- [ ] **Step 1: Add the §1 capability bullet**

Add a bullet to §1 covering: mid-game roster add from `GameTrackPage` (2026-08-09); both league and standalone games; the two-write model (durable roster row **plus** frozen-snapshot append) and why the snapshot append is required; that standalone one-sided games need no game write because they read `team.players` live; name + optional jersey only; bench-only placement; `in_progress`/`scheduled` only; permissions inherited by delegating to `addPlayerToLeagueTeam`/`addPlayerToTeam`; and the new `canManageRoster` payload flag with a note that `viewerContext` is a _league_ payload field, not a game one.

- [ ] **Step 2: Add the §11 entry**

Record the deferred scope from the spec: completed games (needs recompute + feed-card refresh triggers), mid-game edit/remove, the position field, the immediate sub-in prompt, and widening roster writes to helpers. Also record the `VersionError` retry-once decision, since a future reader will want to know it is deliberate.

- [ ] **Step 3: Document the endpoint in `docs/api.md`**

Match the file's existing entry format: method, path, auth, request body (`side?`, `displayName`, `jerseyNumber?`), `201` response (`{ player, side }`), and error statuses (`400` missing side / invalid body, `403` insufficient roster permission, `404` game not found, `409` completed game or duplicate active name).

- [ ] **Step 4: Run the full pre-PR check**

Run: `pnpm check-env && pnpm lint && pnpm test && pnpm build`
Expected: PASS, modulo the pre-existing client failures noted in Task 8 Step 5.

- [ ] **Step 5: Commit**

```bash
git add docs/PROJECT-KNOWLEDGE.md docs/api.md
git commit -m "docs: document mid-game roster add"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement                                            | Task                                  |
| ----------------------------------------------------------- | ------------------------------------- |
| Both league and standalone scope                            | 2, 3 (both branches), 9 (verified)    |
| Roster write + snapshot append                              | 3                                     |
| Standalone one-sided needs no game write                    | 2 (`snapshotField: null`), 3          |
| Existing permission gates, no widening                      | 3 (delegation), 5 (`canManageRoster`) |
| Name + optional jersey, no position                         | 1, 7                                  |
| Bench only, no `SUB_IN`                                     | 8 (refetch only, no lineup mutation)  |
| `in_progress`/`scheduled` only, `409` on completed          | 3, 4                                  |
| Roster-first ordering                                       | 3                                     |
| `VersionError` retry once                                   | 3                                     |
| Endpoint `POST /games/:gameId/roster`                       | 4                                     |
| Inline verbatim server errors                               | 7                                     |
| Slate palette, no scoreboard tokens                         | 7, 8                                  |
| Empty-roster dead-end becomes actionable                    | 8                                     |
| No `GameTrackPage` decomposition / RQ migration             | 8 (explicit constraint)               |
| Unit tests per game shape + integration two-write invariant | 3, 4                                  |
| Client dialog tests                                         | 7                                     |
| `ApiError` house pattern                                    | 3, 4                                  |

**Deviation from the spec, resolved here:** the spec assumed the client could gate the button on `viewerContext`. Exploration showed `GameTrackPage` has no permission data at all — `viewerContext` belongs to `GET /leagues/:id`. Task 5 adds a `canManageRoster` flag to the game payload instead. Task 10 Step 1 records the correction so the next reader is not misled.

**Placeholder scan:** no TBDs. Two tasks intentionally specify behaviour in prose rather than final code — Task 4 Step 1 (the integration test must copy this repo's bootstrap helpers, which differ per file, so pasting a generic harness would be wrong) and Task 10 (documentation prose). Both name exactly what must be asserted or written.

**Type consistency:** `resolveRosterTargetForGame` returns `snapshotField` — used under that name in Tasks 2, 3, 5. `addPlayerToGameRoster(userId, gameId, payload)` returns `{ player, side }` — matches the controller (Task 4) and `gamesApi` (Task 6). `canManageGameRoster` is the service function; `canManageRoster` is the payload key — deliberately different, consistently applied. The dialog's `onSubmit` receives `{ displayName, jerseyNumber }` with `jerseyNumber: number | null` in both Task 7's tests and Task 8's handler.
