# Data-Completeness Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give league admins a read-only panel listing incomplete data for the current season — unfinalised games, missing box scores, roster gaps — with dismissible items.

**Architecture:** A pure check engine (no I/O) evaluates eight rules against data loaded by the service; the service handles auth, season resolution, and dismissal merging; a new Mongoose model persists dismissals. Client renders a new tab on `AdminLeaguePage`, fetching imperatively on tab activation.

**Tech Stack:** Express + Mongoose (CommonJS) on the server, React 18 + Vite (ESM, named exports) on the client. Jest + Supertest server-side, Vitest + RTL client-side.

**Spec:** [`../specs/2026-08-09-data-completeness-dashboard-design.md`](../specs/2026-08-09-data-completeness-dashboard-design.md)

## Global Constraints

- **Server is CommonJS** (`require`/`module.exports`); **client is ESM with named exports only** — no default exports.
- **Mongoose schemas are defined inline in `*.repository.js`.** There is no `models/` directory. Do not create one.
- **Errors:** `throw new ApiError(status, message)` from services. Wrap route handlers in `asyncHandler`. Validate input with Zod at the controller via `schema.parse`.
- **Authorization lives in the service**, via `assert*` helpers — never middleware RBAC.
- **Server tests:** Jest, `pnpm --filter server test`. **Client tests:** Vitest, `pnpm --filter client test`. Never mix the two runners.
- **No live-DB tests exist in this codebase.** Unit tests mock repositories; "integration" tests mock the service and drive routes via Supertest. Follow that pattern.
- **`@testing-library/user-event` is NOT a dependency.** Use `fireEvent` + `cleanup`.
- **No `useQuery` on admin pages** — several admin test trees lack a `QueryClientProvider`. Use `useState`/`useEffect` (PROJECT-KNOWLEDGE §8).
- **Overdue threshold is exactly 48 hours**, defined once as `OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000`.
- **Minimum roster is exactly 5 active players**, defined once as `MIN_ACTIVE_ROSTER = 5`. Advisory only — never blocks any operation.
- **Commits:** conventional commits (commitlint + Husky enforce this).
- **Palette:** original slate/sky-blue `PageHeader` family, matching the rest of `AdminLeaguePage`.

---

## File Structure

**Server — new files**

| File                                                        | Responsibility                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `server/src/modules/leagues/dataCompleteness.checks.js`     | Pure check engine. No I/O, no Mongoose. Takes data in, returns items. |
| `server/src/modules/leagues/dataCompleteness.repository.js` | `LeagueDataIssueDismissal` schema + query helpers.                    |
| `server/src/modules/leagues/dataCompleteness.service.js`    | Auth, season resolution, data loading, dismissal merge.               |
| `server/src/modules/leagues/dataCompleteness.validation.js` | Zod schema for the dismissal payload.                                 |

**Server — modified**

| File                                               | Change         |
| -------------------------------------------------- | -------------- |
| `server/src/modules/leagues/leagues.controller.js` | Three handlers |
| `server/src/modules/leagues/leagues.routes.js`     | Three routes   |

Splitting the check engine from the service is the key decomposition: the engine
is where all eight rules live and where nearly all the tests point, and keeping
it I/O-free makes those tests trivial and fast.

**Client — new files**

| File                                                                    | Responsibility  |
| ----------------------------------------------------------------------- | --------------- |
| `client/src/features/leagues/components/DataCompletenessPanel.jsx`      | Panel UI        |
| `client/src/features/leagues/components/DataCompletenessPanel.test.jsx` | Component tests |

**Client — modified**

| File                                                    | Change                            |
| ------------------------------------------------------- | --------------------------------- |
| `client/src/features/leagues/api/leaguesApi.js`         | Three API functions               |
| `client/src/features/leagues/pages/AdminLeaguePage.jsx` | Tab entry, fetch, panel rendering |

---

## Task 1: Check engine — game checks

**Files:**

- Create: `server/src/modules/leagues/dataCompleteness.checks.js`
- Test: `server/src/tests/unit/data-completeness-checks.test.js`

**Interfaces:**

- Consumes: nothing (first task).
- Produces:
  - `OVERDUE_AFTER_MS: number`
  - `MIN_ACTIVE_ROSTER: number`
  - `SEVERITY: { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }`
  - `buildGameIssues({ games, teamsById, now }): Issue[]`
  - `Issue` shape: `{ issueKey, checkType, severity, label, detail, href, leagueTeamId }`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/data-completeness-checks.test.js`:

```js
const {
  buildGameIssues,
  OVERDUE_AFTER_MS,
  SEVERITY,
} = require('../../modules/leagues/dataCompleteness.checks');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const HOME_ID = '507f1f77bcf86cd799439031';
const AWAY_ID = '507f1f77bcf86cd799439032';
const GAME_ID = '507f1f77bcf86cd799439051';

const TEAMS_BY_ID = new Map([
  [HOME_ID, { id: HOME_ID, name: 'Ballers' }],
  [AWAY_ID, { id: AWAY_ID, name: 'Hoops' }],
]);

function game(overrides = {}) {
  return {
    id: GAME_ID,
    status: 'scheduled',
    scheduledAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    venue: 'Court 1',
    trackingMode: 'one_sided',
    homeLeagueTeamId: HOME_ID,
    awayLeagueTeamId: AWAY_ID,
    trackedLeagueTeamId: HOME_ID,
    events: [{ type: 'shot' }],
    ...overrides,
  };
}

function run(games) {
  return buildGameIssues({ games, teamsById: TEAMS_BY_ID, now: NOW });
}

describe('buildGameIssues', () => {
  it('does not flag a scheduled game 47 hours past tip-off', () => {
    const scheduledAt = new Date(NOW.getTime() - 47 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    expect(issues.filter((i) => i.checkType === 'overdue_game')).toHaveLength(0);
  });

  it('flags a scheduled game 49 hours past tip-off as overdue', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    const overdue = issues.filter((i) => i.checkType === 'overdue_game');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].severity).toBe(SEVERITY.HIGH);
    expect(overdue[0].issueKey).toBe(`overdue_game:${GAME_ID}`);
    expect(overdue[0].label).toBe('Hoops at Ballers');
  });

  it('flags an in_progress game past the overdue window', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ status: 'in_progress', scheduledAt })]);
    expect(issues.filter((i) => i.checkType === 'stuck_in_progress')).toHaveLength(1);
  });

  it('exports the 48 hour threshold as a constant', () => {
    expect(OVERDUE_AFTER_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('does not flag a completed one-sided game whose tracked side has events', () => {
    const issues = run([game({ status: 'completed' })]);
    expect(issues.filter((i) => i.checkType === 'missing_box_score')).toHaveLength(0);
  });

  it('flags a completed game with no events at all', () => {
    const issues = run([game({ status: 'completed', events: [] })]);
    const missing = issues.filter((i) => i.checkType === 'missing_box_score');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe(SEVERITY.HIGH);
  });

  it('flags a future scheduled game with no venue', () => {
    const scheduledAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: null })]);
    const noVenue = issues.filter((i) => i.checkType === 'no_venue');
    expect(noVenue).toHaveLength(1);
    expect(noVenue[0].severity).toBe(SEVERITY.LOW);
  });

  it('treats a blank venue string as missing', () => {
    const scheduledAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: '   ' })]);
    expect(issues.filter((i) => i.checkType === 'no_venue')).toHaveLength(1);
  });

  it('does not raise a venue warning for a game already past', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: null })]);
    expect(issues.filter((i) => i.checkType === 'no_venue')).toHaveLength(0);
  });

  it('gives every issue a link to where it gets fixed', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    expect(issues[0].href).toBe(`/admin/games/${GAME_ID}`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: FAIL — `Cannot find module '../../modules/leagues/dataCompleteness.checks'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/leagues/dataCompleteness.checks.js`:

```js
// Data-completeness check engine. Pure: no I/O, no Mongoose, no clock access —
// `now` is always injected so the 48h boundary is testable.
const OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000;
const MIN_ACTIVE_ROSTER = 5;

const SEVERITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

function teamName(teamsById, leagueTeamId) {
  if (!leagueTeamId) return 'Unknown team';
  return teamsById.get(String(leagueTeamId))?.name ?? 'Unknown team';
}

function matchupLabel(teamsById, game) {
  const home = teamName(teamsById, game.homeLeagueTeamId);
  const away = teamName(teamsById, game.awayLeagueTeamId);
  return `${away} at ${home}`;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function daysAgo(now, date) {
  const days = Math.floor((now.getTime() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function buildGameIssues({ games, teamsById, now }) {
  const issues = [];

  for (const game of games) {
    const label = matchupLabel(teamsById, game);
    const href = `/admin/games/${game.id}`;
    const scheduledAt = game.scheduledAt ? new Date(game.scheduledAt) : null;
    const isPastDue = scheduledAt && now.getTime() - scheduledAt.getTime() > OVERDUE_AFTER_MS;

    if (game.status === 'scheduled' && isPastDue) {
      issues.push({
        issueKey: `overdue_game:${game.id}`,
        checkType: 'overdue_game',
        severity: SEVERITY.HIGH,
        label,
        detail: `Scheduled ${daysAgo(now, scheduledAt)}, never started`,
        href,
        leagueTeamId: null,
      });
    }

    if (game.status === 'in_progress' && isPastDue) {
      issues.push({
        issueKey: `stuck_in_progress:${game.id}`,
        checkType: 'stuck_in_progress',
        severity: SEVERITY.HIGH,
        label,
        detail: `Started ${daysAgo(now, scheduledAt)} and never finalised`,
        href,
        leagueTeamId: null,
      });
    }

    // Only the tracked side is ever expected to carry events (spec D5): in a
    // one_sided game the opponent legitimately has none.
    if (game.status === 'completed' && (game.events?.length ?? 0) === 0) {
      issues.push({
        issueKey: `missing_box_score:${game.id}`,
        checkType: 'missing_box_score',
        severity: SEVERITY.HIGH,
        label,
        detail: 'Marked complete but no stats were recorded',
        href,
        leagueTeamId: game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null,
      });
    }

    // Venue is actionable before tip-off and pointless after, so this check is
    // deliberately future-only.
    const isFuture = scheduledAt && scheduledAt.getTime() > now.getTime();
    if (game.status === 'scheduled' && isFuture && !hasText(game.venue)) {
      issues.push({
        issueKey: `no_venue:${game.id}`,
        checkType: 'no_venue',
        severity: SEVERITY.LOW,
        label,
        detail: 'No venue set',
        href,
        leagueTeamId: null,
      });
    }
  }

  return issues;
}

module.exports = {
  OVERDUE_AFTER_MS,
  MIN_ACTIVE_ROSTER,
  SEVERITY,
  buildGameIssues,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: PASS, 11 tests.

- [ ] **Step 5: Mutation-test the 48h boundary**

Temporarily change `OVERDUE_AFTER_MS` to `24 * 60 * 60 * 1000` and re-run.
Expected: the "47 hours" and "exports the 48 hour threshold" tests FAIL.
Revert the change and confirm green again. This proves the boundary tests have teeth.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.checks.js server/src/tests/unit/data-completeness-checks.test.js
git commit -m "feat(leagues): add game checks for data completeness engine"
```

---

## Task 2: Check engine — player and team checks

**Files:**

- Modify: `server/src/modules/leagues/dataCompleteness.checks.js`
- Test: `server/src/tests/unit/data-completeness-checks.test.js`

**Interfaces:**

- Consumes: `SEVERITY`, `MIN_ACTIVE_ROSTER` from Task 1.
- Produces: `buildRosterIssues({ teams, players, statsByPlayerId, completedGameTeamIds }): Issue[]`
  - `teams`: `[{ id, name, logo }]`
  - `players`: `[{ id, leagueTeamId, displayName, jerseyNumber, isActive, claimedByUserId }]`
  - `statsByPlayerId`: `Map<string, { gamesCount: number }>`
  - `completedGameTeamIds`: `Set<string>` — teams with ≥1 completed game this season

- [ ] **Step 1: Write the failing test**

Append to `server/src/tests/unit/data-completeness-checks.test.js`:

```js
const {
  buildRosterIssues,
  MIN_ACTIVE_ROSTER,
} = require('../../modules/leagues/dataCompleteness.checks');

const TEAM_ID = '507f1f77bcf86cd799439031';
const USER_ID = '507f1f77bcf86cd799439061';

function player(index, overrides = {}) {
  return {
    id: `50000000000000000000000${index}`,
    leagueTeamId: TEAM_ID,
    displayName: `Player ${index}`,
    jerseyNumber: index,
    isActive: true,
    claimedByUserId: USER_ID,
    ...overrides,
  };
}

function roster(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => player(i + 1, overrides));
}

function runRoster({ players, teams, stats, completed } = {}) {
  const list = players ?? roster(5);
  return buildRosterIssues({
    teams: teams ?? [{ id: TEAM_ID, name: 'Ballers', logo: { url: 'x' } }],
    players: list,
    statsByPlayerId: stats ?? new Map(list.map((p) => [p.id, { gamesCount: 3 }])),
    completedGameTeamIds: completed ?? new Set([TEAM_ID]),
  });
}

describe('buildRosterIssues', () => {
  it('flags a team with 4 active players', () => {
    const issues = runRoster({ players: roster(4) });
    const small = issues.filter((i) => i.checkType === 'roster_too_small');
    expect(small).toHaveLength(1);
    expect(small[0].severity).toBe(SEVERITY.MEDIUM);
  });

  it('does not flag a team with exactly 5 active players', () => {
    const issues = runRoster({ players: roster(5) });
    expect(issues.filter((i) => i.checkType === 'roster_too_small')).toHaveLength(0);
  });

  it('exports the minimum roster size as a constant', () => {
    expect(MIN_ACTIVE_ROSTER).toBe(5);
  });

  it('ignores inactive players when counting the roster', () => {
    const players = [...roster(4), player(9, { isActive: false })];
    const issues = runRoster({ players });
    expect(issues.filter((i) => i.checkType === 'roster_too_small')).toHaveLength(1);
  });

  it('flags an active player with no recorded appearances', () => {
    const players = roster(5);
    const stats = new Map(players.map((p) => [p.id, { gamesCount: 3 }]));
    stats.set(players[0].id, { gamesCount: 0 });
    const issues = runRoster({ players, stats });
    const none = issues.filter((i) => i.checkType === 'no_appearances');
    expect(none).toHaveLength(1);
    expect(none[0].severity).toBe(SEVERITY.MEDIUM);
  });

  it('does not flag zero appearances when the team has played no completed games', () => {
    const players = roster(5);
    const stats = new Map(players.map((p) => [p.id, { gamesCount: 0 }]));
    const issues = runRoster({ players, stats, completed: new Set() });
    expect(issues.filter((i) => i.checkType === 'no_appearances')).toHaveLength(0);
  });

  it('treats a missing stats row as zero appearances', () => {
    const players = roster(5);
    const issues = runRoster({ players, stats: new Map() });
    expect(issues.filter((i) => i.checkType === 'no_appearances')).toHaveLength(5);
  });

  it('flags a player with no jersey number', () => {
    const players = [...roster(4), player(5, { jerseyNumber: null })];
    const issues = runRoster({ players });
    const noJersey = issues.filter((i) => i.checkType === 'missing_jersey');
    expect(noJersey).toHaveLength(1);
    expect(noJersey[0].severity).toBe(SEVERITY.LOW);
  });

  it('treats jersey number 0 as present', () => {
    const players = [...roster(4), player(5, { jerseyNumber: 0 })];
    const issues = runRoster({ players });
    expect(issues.filter((i) => i.checkType === 'missing_jersey')).toHaveLength(0);
  });

  it('flags an unclaimed active player', () => {
    const players = [...roster(4), player(5, { claimedByUserId: null })];
    const issues = runRoster({ players });
    const unclaimed = issues.filter((i) => i.checkType === 'unclaimed_player');
    expect(unclaimed).toHaveLength(1);
    expect(unclaimed[0].severity).toBe(SEVERITY.LOW);
  });

  it('does not flag a claimed player regardless of avatar', () => {
    const issues = runRoster({ players: roster(5) });
    expect(issues.filter((i) => i.checkType === 'unclaimed_player')).toHaveLength(0);
  });

  it('flags a team with no logo', () => {
    const teams = [{ id: TEAM_ID, name: 'Ballers', logo: null }];
    const issues = runRoster({ teams });
    const noLogo = issues.filter((i) => i.checkType === 'no_logo');
    expect(noLogo).toHaveLength(1);
    expect(noLogo[0].severity).toBe(SEVERITY.LOW);
  });

  it('tags every roster issue with its team for per-team filtering', () => {
    const issues = runRoster({ players: roster(4) });
    expect(issues.every((i) => i.leagueTeamId === TEAM_ID)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: FAIL — `buildRosterIssues is not a function`

- [ ] **Step 3: Write the implementation**

Add to `server/src/modules/leagues/dataCompleteness.checks.js`, before `module.exports`:

```js
function buildRosterIssues({ teams, players, statsByPlayerId, completedGameTeamIds }) {
  const issues = [];
  const activeByTeam = new Map();

  for (const player of players) {
    if (!player.isActive) continue;
    const teamId = String(player.leagueTeamId);
    activeByTeam.set(teamId, (activeByTeam.get(teamId) ?? 0) + 1);

    const teamHasPlayed = completedGameTeamIds.has(teamId);
    const gamesCount = statsByPlayerId.get(String(player.id))?.gamesCount ?? 0;

    // Before a team's first completed game every player has zero appearances,
    // and none of it is a problem — so this check needs the played guard.
    if (teamHasPlayed && gamesCount === 0) {
      issues.push({
        issueKey: `no_appearances:${player.id}`,
        checkType: 'no_appearances',
        severity: SEVERITY.MEDIUM,
        label: player.displayName,
        detail: 'On the roster but has no recorded appearances this season',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    // Number 0 is a legal jersey, so test for null/undefined, not falsiness.
    if (player.jerseyNumber === null || player.jerseyNumber === undefined) {
      issues.push({
        issueKey: `missing_jersey:${player.id}`,
        checkType: 'missing_jersey',
        severity: SEVERITY.LOW,
        label: player.displayName,
        detail: 'No jersey number set',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    // A league player's avatar comes from the account that claimed them
    // (claimedByUserId -> User.avatar.url), so "no picture" really means
    // "unclaimed". A claimed player who hasn't set an avatar is a personal
    // account setting no admin can act on, and is deliberately not flagged.
    if (!player.claimedByUserId) {
      issues.push({
        issueKey: `unclaimed_player:${player.id}`,
        checkType: 'unclaimed_player',
        severity: SEVERITY.LOW,
        label: player.displayName,
        detail: 'Unclaimed — no profile photo, follows, or shareable card',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }
  }

  for (const team of teams) {
    const teamId = String(team.id);
    const activeCount = activeByTeam.get(teamId) ?? 0;

    if (activeCount < MIN_ACTIVE_ROSTER) {
      issues.push({
        issueKey: `roster_too_small:${teamId}`,
        checkType: 'roster_too_small',
        severity: SEVERITY.MEDIUM,
        label: team.name,
        detail: `Only ${activeCount} active ${activeCount === 1 ? 'player' : 'players'} (needs ${MIN_ACTIVE_ROSTER})`,
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }

    if (!team.logo) {
      issues.push({
        issueKey: `no_logo:${teamId}`,
        checkType: 'no_logo',
        severity: SEVERITY.LOW,
        label: team.name,
        detail: 'No team logo',
        href: `/admin/leagues/teams/${teamId}`,
        leagueTeamId: teamId,
      });
    }
  }

  return issues;
}
```

Update the exports block:

```js
module.exports = {
  OVERDUE_AFTER_MS,
  MIN_ACTIVE_ROSTER,
  SEVERITY,
  buildGameIssues,
  buildRosterIssues,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: PASS, 24 tests total.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.checks.js server/src/tests/unit/data-completeness-checks.test.js
git commit -m "feat(leagues): add roster checks for data completeness engine"
```

---

## Task 3: Category grouping and sorting

**Files:**

- Modify: `server/src/modules/leagues/dataCompleteness.checks.js`
- Test: `server/src/tests/unit/data-completeness-checks.test.js`

**Interfaces:**

- Consumes: `SEVERITY` and the `Issue` shape from Tasks 1–2.
- Produces:
  - `CHECK_META: Record<checkType, { label, description, severity }>`
  - `groupIntoCategories(issues): Category[]` where
    `Category = { key, label, description, severity, items: Issue[] }`
  - `countBySeverity(issues): { high, medium, low, dismissed }`

- [ ] **Step 1: Write the failing test**

Append to `server/src/tests/unit/data-completeness-checks.test.js`:

```js
const {
  groupIntoCategories,
  countBySeverity,
  CHECK_META,
} = require('../../modules/leagues/dataCompleteness.checks');

function issue(checkType, severity, overrides = {}) {
  return {
    issueKey: `${checkType}:${overrides.id ?? '1'}`,
    checkType,
    severity,
    label: overrides.label ?? 'Item',
    detail: 'detail',
    href: '/x',
    leagueTeamId: null,
    dismissed: false,
    ...overrides,
  };
}

describe('groupIntoCategories', () => {
  it('orders categories high severity first', () => {
    const categories = groupIntoCategories([
      issue('no_logo', SEVERITY.LOW),
      issue('overdue_game', SEVERITY.HIGH),
      issue('roster_too_small', SEVERITY.MEDIUM),
    ]);
    expect(categories.map((c) => c.key)).toEqual(['overdue_game', 'roster_too_small', 'no_logo']);
  });

  it('groups issues of the same type together', () => {
    const categories = groupIntoCategories([
      issue('overdue_game', SEVERITY.HIGH, { id: '1' }),
      issue('overdue_game', SEVERITY.HIGH, { id: '2' }),
    ]);
    expect(categories).toHaveLength(1);
    expect(categories[0].items).toHaveLength(2);
  });

  it('omits categories that have no issues', () => {
    const categories = groupIntoCategories([issue('overdue_game', SEVERITY.HIGH)]);
    expect(categories.map((c) => c.key)).toEqual(['overdue_game']);
  });

  it('sorts dismissed items last within a category', () => {
    const categories = groupIntoCategories([
      issue('overdue_game', SEVERITY.HIGH, { id: '1', dismissed: true, label: 'Dismissed' }),
      issue('overdue_game', SEVERITY.HIGH, { id: '2', dismissed: false, label: 'Active' }),
    ]);
    expect(categories[0].items.map((i) => i.label)).toEqual(['Active', 'Dismissed']);
  });

  it('carries a human label and description onto each category', () => {
    const categories = groupIntoCategories([issue('overdue_game', SEVERITY.HIGH)]);
    expect(categories[0].label).toBe(CHECK_META.overdue_game.label);
    expect(categories[0].description).toBe(CHECK_META.overdue_game.description);
  });

  it('has metadata for every check type the engine can emit', () => {
    const emitted = [
      'overdue_game',
      'stuck_in_progress',
      'missing_box_score',
      'no_venue',
      'no_appearances',
      'missing_jersey',
      'unclaimed_player',
      'roster_too_small',
      'no_logo',
    ];
    for (const checkType of emitted) {
      expect(CHECK_META[checkType]).toBeDefined();
      expect(typeof CHECK_META[checkType].label).toBe('string');
    }
  });
});

describe('countBySeverity', () => {
  it('counts active issues by severity and dismissed separately', () => {
    const counts = countBySeverity([
      issue('overdue_game', SEVERITY.HIGH),
      issue('missing_box_score', SEVERITY.HIGH),
      issue('roster_too_small', SEVERITY.MEDIUM),
      issue('no_logo', SEVERITY.LOW, { dismissed: true }),
    ]);
    expect(counts).toEqual({ high: 2, medium: 1, low: 0, dismissed: 1 });
  });

  it('returns zeroes for an empty list', () => {
    expect(countBySeverity([])).toEqual({ high: 0, medium: 0, low: 0, dismissed: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: FAIL — `groupIntoCategories is not a function`

- [ ] **Step 3: Write the implementation**

Add to `server/src/modules/leagues/dataCompleteness.checks.js`:

```js
// Severity is "does this corrupt the competition record?" — high means the
// standings are wrong until it is fixed.
const CHECK_META = {
  overdue_game: {
    label: 'Overdue games',
    description: 'Scheduled more than 48 hours ago but never started.',
    severity: SEVERITY.HIGH,
  },
  stuck_in_progress: {
    label: 'Unfinalised games',
    description: 'Started but never finalised, so they are missing from standings.',
    severity: SEVERITY.HIGH,
  },
  missing_box_score: {
    label: 'Missing box scores',
    description: 'Marked complete but no stats were recorded.',
    severity: SEVERITY.HIGH,
  },
  no_appearances: {
    label: 'Players with no appearances',
    description: 'On an active roster but never recorded in a completed game.',
    severity: SEVERITY.MEDIUM,
  },
  roster_too_small: {
    label: 'Rosters below minimum',
    description: `Fewer than ${MIN_ACTIVE_ROSTER} active players.`,
    severity: SEVERITY.MEDIUM,
  },
  missing_jersey: {
    label: 'Missing jersey numbers',
    description: 'Harder to identify these players in a box score.',
    severity: SEVERITY.LOW,
  },
  unclaimed_player: {
    label: 'Unclaimed players',
    description: 'Resolved when the player claims their account — not by admin entry.',
    severity: SEVERITY.LOW,
  },
  no_venue: {
    label: 'Games without a venue',
    description: 'Upcoming games with no location set.',
    severity: SEVERITY.LOW,
  },
  no_logo: {
    label: 'Teams without a logo',
    description: 'Affects public league and team pages.',
    severity: SEVERITY.LOW,
  },
};

const SEVERITY_ORDER = [SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW];
const CATEGORY_ORDER = Object.keys(CHECK_META).sort(
  (a, b) =>
    SEVERITY_ORDER.indexOf(CHECK_META[a].severity) - SEVERITY_ORDER.indexOf(CHECK_META[b].severity)
);

function groupIntoCategories(issues) {
  const byType = new Map();

  for (const issue of issues) {
    if (!byType.has(issue.checkType)) byType.set(issue.checkType, []);
    byType.get(issue.checkType).push(issue);
  }

  return CATEGORY_ORDER.filter((key) => byType.has(key)).map((key) => ({
    key,
    label: CHECK_META[key].label,
    description: CHECK_META[key].description,
    severity: CHECK_META[key].severity,
    // Dismissed items stay visible but always sink to the bottom.
    items: byType
      .get(key)
      .slice()
      .sort((a, b) => Number(a.dismissed) - Number(b.dismissed)),
  }));
}

function countBySeverity(issues) {
  const counts = { high: 0, medium: 0, low: 0, dismissed: 0 };

  for (const issue of issues) {
    if (issue.dismissed) {
      counts.dismissed += 1;
      continue;
    }
    counts[issue.severity] += 1;
  }

  return counts;
}
```

Update the exports block:

```js
module.exports = {
  OVERDUE_AFTER_MS,
  MIN_ACTIVE_ROSTER,
  SEVERITY,
  CHECK_META,
  buildGameIssues,
  buildRosterIssues,
  groupIntoCategories,
  countBySeverity,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-checks`
Expected: PASS, 32 tests total.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.checks.js server/src/tests/unit/data-completeness-checks.test.js
git commit -m "feat(leagues): group completeness issues into ordered categories"
```

---

## Task 4: Dismissal model and repository

**Files:**

- Create: `server/src/modules/leagues/dataCompleteness.repository.js`
- Test: `server/src/tests/unit/data-completeness-repository.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `LeagueDataIssueDismissal` (Mongoose model)
  - `listDismissals(leagueId, seasonId): Promise<Doc[]>`
  - `upsertDismissal({ leagueId, seasonId, issueKey, dismissedByUserId, note }): Promise<Doc>`
  - `deleteDismissal(leagueId, seasonId, issueKey): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/data-completeness-repository.test.js`:

```js
const LEAGUE_ID = '507f1f77bcf86cd799439011';
const SEASON_ID = '507f1f77bcf86cd799439021';
const USER_ID = '507f1f77bcf86cd799439041';

describe('dataCompleteness.repository', () => {
  let repository;

  beforeAll(() => {
    repository = require('../../modules/leagues/dataCompleteness.repository');
  });

  it('defines a unique index on league + season + issueKey', () => {
    const indexes = repository.LeagueDataIssueDismissal.schema.indexes();
    const unique = indexes.find(([, options]) => options.unique);
    expect(unique).toBeDefined();
    expect(unique[0]).toEqual({ leagueId: 1, seasonId: 1, issueKey: 1 });
  });

  it('requires the fields that make a dismissal meaningful', () => {
    const { paths } = repository.LeagueDataIssueDismissal.schema;
    expect(paths.leagueId.isRequired).toBe(true);
    expect(paths.seasonId.isRequired).toBe(true);
    expect(paths.issueKey.isRequired).toBe(true);
    expect(paths.dismissedByUserId.isRequired).toBe(true);
  });

  it('defaults the note to null', () => {
    const doc = new repository.LeagueDataIssueDismissal({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
      dismissedByUserId: USER_ID,
    });
    expect(doc.note).toBeNull();
  });

  it('queries dismissals scoped to one league and season', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const find = jest.spyOn(repository.LeagueDataIssueDismissal, 'find').mockReturnValue({ lean });

    await repository.listDismissals(LEAGUE_ID, SEASON_ID);

    expect(find).toHaveBeenCalledWith({ leagueId: LEAGUE_ID, seasonId: SEASON_ID });
    find.mockRestore();
  });

  it('upserts so dismissing the same issue twice keeps one record', async () => {
    const findOneAndUpdate = jest
      .spyOn(repository.LeagueDataIssueDismissal, 'findOneAndUpdate')
      .mockResolvedValue({});

    await repository.upsertDismissal({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
      dismissedByUserId: USER_ID,
      note: 'known',
    });

    const [filter, , options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      leagueId: LEAGUE_ID,
      seasonId: SEASON_ID,
      issueKey: 'overdue_game:1',
    });
    expect(options.upsert).toBe(true);
    findOneAndUpdate.mockRestore();
  });

  it('reports how many dismissals were removed', async () => {
    const deleteOne = jest
      .spyOn(repository.LeagueDataIssueDismissal, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 });

    const removed = await repository.deleteDismissal(LEAGUE_ID, SEASON_ID, 'overdue_game:1');

    expect(removed).toBe(1);
    deleteOne.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-repository`
Expected: FAIL — `Cannot find module '../../modules/leagues/dataCompleteness.repository'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/leagues/dataCompleteness.repository.js`:

```js
const mongoose = require('mongoose');

// A dismissal records an admin's judgement that a flagged issue is fine. It is
// scoped to a season, so next season every check runs fresh without anyone
// having to clean up.
const leagueDataIssueDismissalSchema = new mongoose.Schema(
  {
    leagueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'League',
      required: true,
      index: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Season',
      required: true,
      index: true,
    },
    // Stable identity of the flagged item, `<checkType>:<targetId>`. Contains no
    // mutable data — a rescheduled game keeps the same key, so the dismissal
    // survives, which is what the admin meant.
    issueKey: { type: String, required: true, trim: true, maxlength: 200 },
    dismissedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

leagueDataIssueDismissalSchema.index({ leagueId: 1, seasonId: 1, issueKey: 1 }, { unique: true });

const LeagueDataIssueDismissal = mongoose.model(
  'LeagueDataIssueDismissal',
  leagueDataIssueDismissalSchema
);

async function listDismissals(leagueId, seasonId) {
  return LeagueDataIssueDismissal.find({ leagueId, seasonId }).lean();
}

async function upsertDismissal({ leagueId, seasonId, issueKey, dismissedByUserId, note }) {
  return LeagueDataIssueDismissal.findOneAndUpdate(
    { leagueId, seasonId, issueKey },
    { $set: { dismissedByUserId, note: note ?? null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function deleteDismissal(leagueId, seasonId, issueKey) {
  const result = await LeagueDataIssueDismissal.deleteOne({ leagueId, seasonId, issueKey });
  return result?.deletedCount ?? 0;
}

module.exports = {
  LeagueDataIssueDismissal,
  listDismissals,
  upsertDismissal,
  deleteDismissal,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-repository`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.repository.js server/src/tests/unit/data-completeness-repository.test.js
git commit -m "feat(leagues): add dismissal model for data completeness issues"
```

---

## Task 5: Validation schema

**Files:**

- Create: `server/src/modules/leagues/dataCompleteness.validation.js`
- Test: `server/src/tests/unit/data-completeness-validation.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces: `dismissIssueSchema` — Zod schema parsing `{ issueKey: string, note?: string|null }`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/data-completeness-validation.test.js`:

```js
const { dismissIssueSchema } = require('../../modules/leagues/dataCompleteness.validation');

describe('dismissIssueSchema', () => {
  it('accepts a well-formed issue key', () => {
    const parsed = dismissIssueSchema.parse({ issueKey: 'overdue_game:507f1f77bcf86cd799439051' });
    expect(parsed.issueKey).toBe('overdue_game:507f1f77bcf86cd799439051');
    expect(parsed.note).toBeNull();
  });

  it('trims and keeps a note', () => {
    const parsed = dismissIssueSchema.parse({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      note: '  logo coming later  ',
    });
    expect(parsed.note).toBe('logo coming later');
  });

  it('rejects an empty issue key', () => {
    expect(() => dismissIssueSchema.parse({ issueKey: '' })).toThrow();
  });

  it('rejects an issue key with no check type prefix', () => {
    expect(() => dismissIssueSchema.parse({ issueKey: 'justsomething' })).toThrow();
  });

  it('rejects an unreasonably long note', () => {
    expect(() =>
      dismissIssueSchema.parse({ issueKey: 'no_logo:1', note: 'x'.repeat(501) })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-validation`
Expected: FAIL — `Cannot find module '../../modules/leagues/dataCompleteness.validation'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/leagues/dataCompleteness.validation.js`:

```js
const { z } = require('zod');

// Issue keys are always `<checkType>:<targetId>`. Requiring the colon keeps
// malformed keys — which would silently never match a real issue — out of the
// dismissal collection.
const issueKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[a-z_]+:[A-Za-z0-9]+$/, 'issueKey must look like "<checkType>:<id>"');

const dismissIssueSchema = z.object({
  issueKey: issueKeySchema,
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => value ?? null),
});

module.exports = { dismissIssueSchema, issueKeySchema };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-validation`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.validation.js server/src/tests/unit/data-completeness-validation.test.js
git commit -m "feat(leagues): add validation for completeness dismissals"
```

---

## Task 6: Service — report assembly and auth

**Files:**

- Create: `server/src/modules/leagues/dataCompleteness.service.js`
- Test: `server/src/tests/unit/data-completeness-service.test.js`

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces:
  - `getDataCompletenessForUser(userId, leagueId): Promise<Report>`
  - `dismissIssueForUser(userId, leagueId, payload): Promise<{ issueKey, dismissed: true }>`
  - `restoreIssueForUser(userId, leagueId, issueKey): Promise<{ issueKey, dismissed: false }>`
  - `Report = { seasonId, seasonName, generatedAt, counts, categories }`

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/data-completeness-service.test.js`:

```js
const LEAGUE_ID = '507f1f77bcf86cd799439011';
const SEASON_ID = '507f1f77bcf86cd799439021';
const TEAM_ID = '507f1f77bcf86cd799439031';
const OTHER_TEAM_ID = '507f1f77bcf86cd799439032';
const OWNER_ID = '507f1f77bcf86cd799439041';
const STRANGER_ID = '507f1f77bcf86cd799439042';
const MANAGER_ID = '507f1f77bcf86cd799439043';

jest.mock('../../modules/leagues/leagues.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/leagues.repository');
  return {
    ...actual,
    findLeagueById: jest.fn(),
    findActiveLeagueManager: jest.fn(),
    findActiveLeagueTeamMember: jest.fn(),
    listLeagueTeams: jest.fn(),
    listLeaguePlayers: jest.fn(),
    listLeaguePlayerStats: jest.fn(),
  };
});

jest.mock('../../modules/leagues/seasons.repository', () => {
  const actual = jest.requireActual('../../modules/leagues/seasons.repository');
  return { ...actual, findSeasonById: jest.fn() };
});

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesByLeagueId: jest.fn(),
}));

jest.mock('../../modules/leagues/dataCompleteness.repository', () => ({
  listDismissals: jest.fn(),
  upsertDismissal: jest.fn(),
  deleteDismissal: jest.fn(),
}));

const leaguesRepository = require('../../modules/leagues/leagues.repository');
const seasonsRepository = require('../../modules/leagues/seasons.repository');
const gamesRepository = require('../../modules/games/games.repository');
const dismissalRepository = require('../../modules/leagues/dataCompleteness.repository');
const service = require('../../modules/leagues/dataCompleteness.service');

function activeRoster(teamId, count) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `5000000000000000000000${teamId.slice(-2)}${i}`,
    leagueTeamId: teamId,
    displayName: `Player ${i}`,
    jerseyNumber: i + 1,
    isActive: true,
    claimedByUserId: OWNER_ID,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();

  leaguesRepository.findLeagueById.mockResolvedValue({
    _id: LEAGUE_ID,
    ownerUserId: OWNER_ID,
    status: 'active',
    currentSeasonId: SEASON_ID,
  });
  seasonsRepository.findSeasonById.mockResolvedValue({
    _id: SEASON_ID,
    name: 'Spring 2026',
    status: 'active',
  });
  leaguesRepository.listLeagueTeams.mockResolvedValue([
    { _id: TEAM_ID, name: 'Ballers', logo: { url: 'x' } },
  ]);
  leaguesRepository.listLeaguePlayers.mockResolvedValue(activeRoster(TEAM_ID, 5));
  leaguesRepository.listLeaguePlayerStats.mockResolvedValue([]);
  gamesRepository.listLeagueGamesByLeagueId.mockResolvedValue([]);
  dismissalRepository.listDismissals.mockResolvedValue([]);
});

describe('getDataCompletenessForUser', () => {
  it('rejects a user who is neither owner, league manager, nor team manager', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockResolvedValue(null);

    await expect(service.getDataCompletenessForUser(STRANGER_ID, LEAGUE_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('returns an empty report when the league has no active season', async () => {
    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: null,
    });

    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);

    expect(report.seasonId).toBeNull();
    expect(report.categories).toEqual([]);
    expect(report.counts).toEqual({ high: 0, medium: 0, low: 0, dismissed: 0 });
  });

  it('marks dismissed issues rather than hiding them', async () => {
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      { _id: TEAM_ID, name: 'Ballers', logo: null },
    ]);
    dismissalRepository.listDismissals.mockResolvedValue([{ issueKey: `no_logo:${TEAM_ID}` }]);

    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);
    const logoCategory = report.categories.find((c) => c.key === 'no_logo');

    expect(logoCategory.items[0].dismissed).toBe(true);
    expect(report.counts.dismissed).toBe(1);
    expect(report.counts.low).toBe(0);
  });

  it('limits a team manager to their own team roster issues', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockImplementation((teamId) =>
      String(teamId) === TEAM_ID ? { role: 'manager' } : null
    );
    leaguesRepository.listLeagueTeams.mockResolvedValue([
      { _id: TEAM_ID, name: 'Ballers', logo: null },
      { _id: OTHER_TEAM_ID, name: 'Hoops', logo: null },
    ]);
    leaguesRepository.listLeaguePlayers.mockResolvedValue([]);

    const report = await service.getDataCompletenessForUser(MANAGER_ID, LEAGUE_ID);
    const teamIds = report.categories
      .flatMap((c) => c.items)
      .map((i) => i.leagueTeamId)
      .filter(Boolean);

    expect(teamIds.every((id) => id === TEAM_ID)).toBe(true);
    expect(teamIds).not.toContain(OTHER_TEAM_ID);
  });

  it('includes the season name so the panel can say which season it audited', async () => {
    const report = await service.getDataCompletenessForUser(OWNER_ID, LEAGUE_ID);
    expect(report.seasonName).toBe('Spring 2026');
  });
});

describe('dismissIssueForUser', () => {
  it('rejects a team manager — dismissal is a league-wide judgement', async () => {
    leaguesRepository.findActiveLeagueManager.mockResolvedValue(null);
    leaguesRepository.findActiveLeagueTeamMember.mockResolvedValue({ role: 'manager' });

    await expect(
      service.dismissIssueForUser(MANAGER_ID, LEAGUE_ID, { issueKey: 'no_logo:1', note: null })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('stores a dismissal scoped to the current season', async () => {
    dismissalRepository.upsertDismissal.mockResolvedValue({});

    await service.dismissIssueForUser(OWNER_ID, LEAGUE_ID, {
      issueKey: `no_logo:${TEAM_ID}`,
      note: null,
    });

    expect(dismissalRepository.upsertDismissal).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: SEASON_ID, issueKey: `no_logo:${TEAM_ID}` })
    );
  });

  it('refuses to dismiss when there is no active season', async () => {
    leaguesRepository.findLeagueById.mockResolvedValue({
      _id: LEAGUE_ID,
      ownerUserId: OWNER_ID,
      status: 'active',
      currentSeasonId: null,
    });

    await expect(
      service.dismissIssueForUser(OWNER_ID, LEAGUE_ID, { issueKey: 'no_logo:1', note: null })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('restoreIssueForUser', () => {
  it('removes the dismissal', async () => {
    dismissalRepository.deleteDismissal.mockResolvedValue(1);

    const result = await service.restoreIssueForUser(OWNER_ID, LEAGUE_ID, `no_logo:${TEAM_ID}`);

    expect(result).toEqual({ issueKey: `no_logo:${TEAM_ID}`, dismissed: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- data-completeness-service`
Expected: FAIL — `Cannot find module '../../modules/leagues/dataCompleteness.service'`

- [ ] **Step 3: Write the implementation**

Create `server/src/modules/leagues/dataCompleteness.service.js`:

```js
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

  const [teams, players, games, statsRows, dismissals] = await Promise.all([
    listLeagueTeams(league._id),
    listLeaguePlayers(league._id),
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter server test -- data-completeness-service`
Expected: PASS, 9 tests.

`listLeagueGamesByLeagueId(leagueId, seasonId)` is **positional** — verified at
`server/src/modules/games/games.repository.js:359`. It already filters
`gameContext: 'league'`, so no extra guard is needed. Do not change its
signature; other callers depend on it.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/leagues/dataCompleteness.service.js server/src/tests/unit/data-completeness-service.test.js
git commit -m "feat(leagues): add data completeness service with scoped access"
```

---

## Task 7: Controller and routes

**Files:**

- Modify: `server/src/modules/leagues/leagues.controller.js`
- Modify: `server/src/modules/leagues/leagues.routes.js`
- Test: `server/src/tests/integration/leagues.data-completeness.test.js`

**Interfaces:**

- Consumes: `getDataCompletenessForUser`, `dismissIssueForUser`, `restoreIssueForUser` (Task 6); `dismissIssueSchema` (Task 5).
- Produces: three HTTP routes.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/integration/leagues.data-completeness.test.js`. Mirror
the mocking style of `server/src/tests/integration/leagues.bulk-games.test.js` —
read that file first and copy its app bootstrap and auth-stub approach exactly.

```js
const request = require('supertest');

jest.mock('../../modules/leagues/dataCompleteness.service', () => ({
  getDataCompletenessForUser: jest.fn(),
  dismissIssueForUser: jest.fn(),
  restoreIssueForUser: jest.fn(),
}));

const dataCompletenessService = require('../../modules/leagues/dataCompleteness.service');
const { buildTestApp, authCookies } = require('../helpers/testApp');

const LEAGUE_ID = '507f1f77bcf86cd799439011';

describe('data completeness routes', () => {
  let app;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the report', async () => {
    dataCompletenessService.getDataCompletenessForUser.mockResolvedValue({
      seasonId: '507f1f77bcf86cd799439021',
      seasonName: 'Spring 2026',
      generatedAt: '2026-08-09T12:00:00.000Z',
      counts: { high: 1, medium: 0, low: 0, dismissed: 0 },
      categories: [],
    });

    const response = await request(app)
      .get(`/api/leagues/${LEAGUE_ID}/data-completeness`)
      .set('Cookie', authCookies());

    expect(response.status).toBe(200);
    expect(response.body.seasonName).toBe('Spring 2026');
  });

  it('dismisses an issue', async () => {
    dataCompletenessService.dismissIssueForUser.mockResolvedValue({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      dismissed: true,
    });

    const response = await request(app)
      .post(`/api/leagues/${LEAGUE_ID}/data-completeness/dismissals`)
      .set('Cookie', authCookies())
      .send({ issueKey: 'no_logo:507f1f77bcf86cd799439031' });

    expect(response.status).toBe(201);
    expect(response.body.dismissed).toBe(true);
  });

  it('rejects a malformed issue key with 400', async () => {
    const response = await request(app)
      .post(`/api/leagues/${LEAGUE_ID}/data-completeness/dismissals`)
      .set('Cookie', authCookies())
      .send({ issueKey: 'nope' });

    expect(response.status).toBe(400);
    expect(dataCompletenessService.dismissIssueForUser).not.toHaveBeenCalled();
  });

  it('restores a dismissed issue', async () => {
    dataCompletenessService.restoreIssueForUser.mockResolvedValue({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      dismissed: false,
    });

    const response = await request(app)
      .delete(
        `/api/leagues/${LEAGUE_ID}/data-completeness/dismissals/no_logo:507f1f77bcf86cd799439031`
      )
      .set('Cookie', authCookies());

    expect(response.status).toBe(200);
    expect(response.body.dismissed).toBe(false);
  });

  it('propagates a service 403', async () => {
    const { ApiError } = require('../../utils/apiError');
    dataCompletenessService.getDataCompletenessForUser.mockRejectedValue(
      new ApiError(403, 'Forbidden')
    );

    const response = await request(app)
      .get(`/api/leagues/${LEAGUE_ID}/data-completeness`)
      .set('Cookie', authCookies());

    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server test -- leagues.data-completeness`
Expected: FAIL — 404 on every route.

- [ ] **Step 3: Add the controller handlers**

In `server/src/modules/leagues/leagues.controller.js`, add to the requires at the top:

```js
const dataCompletenessService = require('./dataCompleteness.service');
const { dismissIssueSchema } = require('./dataCompleteness.validation');
```

Then add these handlers alongside the other league handlers:

```js
async function dataCompleteness(req, res) {
  const userId = requireAuthUserId(req);
  const report = await dataCompletenessService.getDataCompletenessForUser(
    userId,
    req.params.leagueId
  );
  res.json(report);
}

async function dismissDataIssue(req, res) {
  const userId = requireAuthUserId(req);
  const payload = dismissIssueSchema.parse(req.body);
  const result = await dataCompletenessService.dismissIssueForUser(
    userId,
    req.params.leagueId,
    payload
  );
  res.status(201).json(result);
}

async function restoreDataIssue(req, res) {
  const userId = requireAuthUserId(req);
  const result = await dataCompletenessService.restoreIssueForUser(
    userId,
    req.params.leagueId,
    req.params.issueKey
  );
  res.json(result);
}
```

Add `dataCompleteness`, `dismissDataIssue`, and `restoreDataIssue` to the file's
`module.exports` object.

- [ ] **Step 4: Add the routes**

In `server/src/modules/leagues/leagues.routes.js`, add before the `module.exports` block:

```js
leaguesRouter.get('/:leagueId/data-completeness', asyncHandler(controller.dataCompleteness));
leaguesRouter.post(
  '/:leagueId/data-completeness/dismissals',
  asyncHandler(controller.dismissDataIssue)
);
leaguesRouter.delete(
  '/:leagueId/data-completeness/dismissals/:issueKey',
  asyncHandler(controller.restoreDataIssue)
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter server test -- leagues.data-completeness`
Expected: PASS, 5 tests.

- [ ] **Step 6: Mutation-test the route wiring**

Comment out the GET route, re-run, and confirm the first test fails with 404.
Restore it and confirm green. This proves the test exercises real wiring rather
than the mock alone.

- [ ] **Step 7: Run the whole server suite**

Run: `pnpm --filter server test`
Expected: all suites pass. Baseline before this feature was 592 passing.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/leagues/leagues.controller.js server/src/modules/leagues/leagues.routes.js server/src/tests/integration/leagues.data-completeness.test.js
git commit -m "feat(leagues): expose data completeness endpoints"
```

---

## Task 8: Client API functions

**Files:**

- Modify: `client/src/features/leagues/api/leaguesApi.js`

**Interfaces:**

- Consumes: the three routes from Task 7.
- Produces, as methods on the existing `leaguesApi` object:
  - `leaguesApi.fetchDataCompleteness(leagueId): Promise<Report>`
  - `leaguesApi.dismissDataIssue(leagueId, payload): Promise<{ issueKey, dismissed }>`
  - `leaguesApi.restoreDataIssue(leagueId, issueKey): Promise<{ issueKey, dismissed }>`

**Important:** `leaguesApi` is a single exported **object with methods** — it is
NOT a set of standalone exported functions. Add methods to that object; do not
write `export function`. Verified against `bulkCreateGames` at
`client/src/features/leagues/api/leaguesApi.js:113`.

- [ ] **Step 1: Read the existing file**

Open `client/src/features/leagues/api/leaguesApi.js` and look at
`bulkCreateGames` (line 113). Note the shape:

```js
bulkCreateGames(leagueId, payload) {
  return apiClient.post(`/leagues/${leagueId}/games/bulk`, payload);
},
```

`apiClient` exposes `.get(url)` / `.post(url, payload)` / `.delete(url)` — the
payload is a second positional argument, not an options object.

- [ ] **Step 2: Add the three methods**

Add these as members of the `leaguesApi` object, next to `bulkCreateGames`:

```js
  fetchDataCompleteness(leagueId) {
    return apiClient.get(`/leagues/${leagueId}/data-completeness`);
  },
  dismissDataIssue(leagueId, payload) {
    return apiClient.post(`/leagues/${leagueId}/data-completeness/dismissals`, payload);
  },
  restoreDataIssue(leagueId, issueKey) {
    return apiClient.delete(
      `/leagues/${leagueId}/data-completeness/dismissals/${encodeURIComponent(issueKey)}`
    );
  },
```

`encodeURIComponent` matters: issue keys contain a colon.

- [ ] **Step 3: Lint**

Run: `pnpm --filter client lint`
Expected: clean.

(`apiClient.delete(path, body)` is verified present at
`client/src/lib/apiClient.js:249`, alongside `get` at :169 and `post` at :178.)

- [ ] **Step 4: Commit**

```bash
git add client/src/features/leagues/api/leaguesApi.js
git commit -m "feat(leagues): add data completeness api client functions"
```

---

## Task 9: Panel component

**Files:**

- Create: `client/src/features/leagues/components/DataCompletenessPanel.jsx`
- Test: `client/src/features/leagues/components/DataCompletenessPanel.test.jsx`

**Interfaces:**

- Consumes: the `Report` shape from Task 6.
- Produces: `DataCompletenessPanel` — named export. Props:
  - `report: Report | null`
  - `isLoading: boolean`
  - `error: string | null`
  - `canDismiss: boolean`
  - `onDismiss(issueKey): void`
  - `onRestore(issueKey): void`

- [ ] **Step 1: Write the failing test**

Create `client/src/features/leagues/components/DataCompletenessPanel.test.jsx`:

```jsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataCompletenessPanel } from './DataCompletenessPanel';

afterEach(cleanup);

function report(overrides = {}) {
  return {
    seasonId: '507f1f77bcf86cd799439021',
    seasonName: 'Spring 2026',
    generatedAt: '2026-08-09T12:00:00.000Z',
    counts: { high: 1, medium: 1, low: 0, dismissed: 1 },
    categories: [
      {
        key: 'overdue_game',
        label: 'Overdue games',
        description: 'Scheduled more than 48 hours ago but never started.',
        severity: 'high',
        items: [
          {
            issueKey: 'overdue_game:1',
            label: 'Hoops at Ballers',
            detail: 'Scheduled 3 days ago, never started',
            href: '/admin/games/1',
            dismissed: false,
          },
        ],
      },
      {
        key: 'roster_too_small',
        label: 'Rosters below minimum',
        description: 'Fewer than 5 active players.',
        severity: 'medium',
        items: [
          {
            issueKey: 'roster_too_small:2',
            label: 'Ballers',
            detail: 'Only 3 active players (needs 5)',
            href: '/admin/leagues/teams/2',
            dismissed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return render(
    <DataCompletenessPanel
      report={report()}
      isLoading={false}
      error={null}
      canDismiss
      onDismiss={() => {}}
      onRestore={() => {}}
      {...props}
    />
  );
}

describe('DataCompletenessPanel', () => {
  it('renders categories with their counts', () => {
    renderPanel();
    expect(screen.getByText('Overdue games')).toBeInTheDocument();
    expect(screen.getByText('Hoops at Ballers')).toBeInTheDocument();
  });

  it('orders high severity categories before medium', () => {
    renderPanel();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Overdue games');
  });

  it('separates dismissed items from active ones', () => {
    renderPanel();
    expect(screen.getByText(/Dismissed \(1\)/i)).toBeInTheDocument();
  });

  it('links each item to where it gets fixed', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /Hoops at Ballers/i });
    expect(link).toHaveAttribute('href', '/admin/games/1');
  });

  it('calls onDismiss with the issue key', () => {
    const onDismiss = vi.fn();
    renderPanel({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /Dismiss Hoops at Ballers/i }));
    expect(onDismiss).toHaveBeenCalledWith('overdue_game:1');
  });

  it('calls onRestore for a dismissed item', () => {
    const onRestore = vi.fn();
    renderPanel({ onRestore });
    fireEvent.click(screen.getByRole('button', { name: /Restore Ballers/i }));
    expect(onRestore).toHaveBeenCalledWith('roster_too_small:2');
  });

  it('hides dismiss controls when the viewer cannot dismiss', () => {
    renderPanel({ canDismiss: false });
    expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
  });

  it('reassures when nothing is wrong', () => {
    renderPanel({
      report: report({ categories: [], counts: { high: 0, medium: 0, low: 0, dismissed: 0 } }),
    });
    expect(screen.getByText(/Everything looks complete/i)).toBeInTheDocument();
  });

  it('explains when the league has no active season', () => {
    renderPanel({
      report: report({
        seasonId: null,
        seasonName: null,
        categories: [],
        counts: { high: 0, medium: 0, low: 0, dismissed: 0 },
      }),
    });
    expect(screen.getByText(/no active season/i)).toBeInTheDocument();
  });

  it('surfaces the real error message', () => {
    renderPanel({ report: null, error: 'League has no active season' });
    expect(screen.getByText('League has no active season')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderPanel({ report: null, isLoading: true });
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter client test -- DataCompletenessPanel`
Expected: FAIL — cannot resolve `./DataCompletenessPanel`

- [ ] **Step 3: Write the component**

Create `client/src/features/leagues/components/DataCompletenessPanel.jsx`:

```jsx
const SEVERITY_STYLES = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const SEVERITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

function SeverityBadge({ severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low
      }`}
    >
      {SEVERITY_LABELS[severity] ?? 'Low'}
    </span>
  );
}

function IssueRow({ item, canDismiss, onDismiss, onRestore }) {
  return (
    <li className="flex flex-col gap-2 border-t border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <a
          href={item.href}
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {item.label}
        </a>
        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
      </div>
      {canDismiss ? (
        <button
          type="button"
          onClick={() => (item.dismissed ? onRestore(item.issueKey) : onDismiss(item.issueKey))}
          className="shrink-0 self-start rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:self-auto"
        >
          {item.dismissed ? `Restore ${item.label}` : `Dismiss ${item.label}`}
        </button>
      ) : null}
    </li>
  );
}

function Category({ category, canDismiss, onDismiss, onRestore }) {
  const active = category.items.filter((item) => !item.dismissed);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{category.label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={category.severity} />
          <span className="text-sm font-semibold text-slate-700">{active.length}</span>
        </div>
      </div>
      <ul className="mt-2">
        {category.items.map((item) => (
          <IssueRow
            key={item.issueKey}
            item={item}
            canDismiss={canDismiss}
            onDismiss={onDismiss}
            onRestore={onRestore}
          />
        ))}
      </ul>
    </section>
  );
}

export function DataCompletenessPanel({
  report,
  isLoading,
  error,
  canDismiss,
  onDismiss,
  onRestore,
}) {
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">Checking league data…</p>;
  }

  if (error) {
    return (
      <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
        {error}
      </p>
    );
  }

  if (!report) return null;

  if (!report.seasonId) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        This league has no active season, so there is nothing to check yet.
      </p>
    );
  }

  const dismissedCount = report.counts?.dismissed ?? 0;

  // A clean league should feel reassuring, not blank.
  if (report.categories.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-medium text-slate-900">Everything looks complete</p>
        <p className="mt-1 text-xs text-slate-500">No data gaps found in {report.seasonName}.</p>
      </div>
    );
  }

  const withActive = report.categories.filter((category) =>
    category.items.some((item) => !item.dismissed)
  );
  const onlyDismissed = report.categories.filter((category) =>
    category.items.every((item) => item.dismissed)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>
          <span className="font-semibold text-slate-900">{report.counts.high}</span> high
        </span>
        <span>
          <span className="font-semibold text-slate-900">{report.counts.medium}</span> medium
        </span>
        <span>
          <span className="font-semibold text-slate-900">{report.counts.low}</span> low
        </span>
        <span className="text-slate-400">·</span>
        <span>{report.seasonName}</span>
      </div>

      {withActive.map((category) => (
        <Category
          key={category.key}
          category={category}
          canDismiss={canDismiss}
          onDismiss={onDismiss}
          onRestore={onRestore}
        />
      ))}

      {dismissedCount > 0 ? (
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Dismissed ({dismissedCount})
          </summary>
          <div className="mt-3 space-y-3">
            {onlyDismissed.map((category) => (
              <Category
                key={category.key}
                category={category}
                canDismiss={canDismiss}
                onDismiss={onDismiss}
                onRestore={onRestore}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter client test -- DataCompletenessPanel`
Expected: PASS, 11 tests.

Note: a dismissed item inside a category that also has active items renders in
the main list (sorted last by the server), while a category whose items are all
dismissed renders inside the collapsed section. Both are covered above.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/leagues/components/DataCompletenessPanel.jsx client/src/features/leagues/components/DataCompletenessPanel.test.jsx
git commit -m "feat(leagues): add data completeness panel component"
```

---

## Task 10: Wire the tab into AdminLeaguePage

**Files:**

- Modify: `client/src/features/leagues/pages/AdminLeaguePage.jsx`

**Interfaces:**

- Consumes: `DataCompletenessPanel` (Task 9); `leaguesApi.fetchDataCompleteness`, `leaguesApi.dismissDataIssue`, `leaguesApi.restoreDataIssue` (Task 8) — methods on the `leaguesApi` object, called as `leaguesApi.fetchDataCompleteness(...)`.
- Produces: a `completeness` tab.

- [ ] **Step 1: Read the existing tab machinery**

Open `client/src/features/leagues/pages/AdminLeaguePage.jsx` and read:

- the `TABS` array at line 25,
- `const [activeTab, setActiveTab] = useState('games')` at line 126,
- the lazy-fetch effects at lines 191 and 199 (`if (activeTab !== 'settings') return;`).

Copy that effect pattern exactly. **Do not use `useQuery`** — this page's test
tree has no `QueryClientProvider` and it will throw "No QueryClient set".

- [ ] **Step 2: Add the tab definition**

Add an entry to the `TABS` array, matching the shape of the existing entries
(each has `id`, `label`, and an inline `icon` SVG). Use `id: 'completeness'` and
`label: 'Data health'`. For the icon, reuse the same `viewBox="0 0 16 16"`,
`className="h-4 w-4 shrink-0"` conventions as its neighbours:

```jsx
{
  id: 'completeness',
  label: 'Data health',
  icon: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 1.5 2.5 4v4c0 3.2 2.3 5.6 5.5 6.5 3.2-.9 5.5-3.3 5.5-6.5V4L8 1.5Z" />
      <path d="M8 5.5v3.5" strokeLinecap="round" />
      <path d="M8 11h.01" strokeLinecap="round" />
    </svg>
  ),
},
```

- [ ] **Step 3: Add imports and state**

Add to the imports:

```jsx
import { DataCompletenessPanel } from '../components/DataCompletenessPanel';
```

`leaguesApi` is already imported by this page as a single object, so no import
change is needed for the API — the new methods are reached as
`leaguesApi.fetchDataCompleteness(...)`.

Add state alongside the page's other `useState` declarations:

```jsx
const [completenessReport, setCompletenessReport] = useState(null);
const [completenessLoading, setCompletenessLoading] = useState(false);
const [completenessError, setCompletenessError] = useState(null);
```

- [ ] **Step 4: Add the lazy fetch effect**

Place it next to the existing tab-scoped effects:

```jsx
useEffect(() => {
  if (activeTab !== 'completeness' || !leagueId) return;

  let cancelled = false;
  setCompletenessLoading(true);
  setCompletenessError(null);

  leaguesApi
    .fetchDataCompleteness(leagueId)
    .then((report) => {
      if (!cancelled) setCompletenessReport(report);
    })
    .catch((error) => {
      // Surface the server's message — "League has no active season" is far more
      // useful than a generic failure string.
      if (!cancelled) setCompletenessError(error?.message ?? 'Could not load data health');
    })
    .finally(() => {
      if (!cancelled) setCompletenessLoading(false);
    });

  return () => {
    cancelled = true;
  };
}, [activeTab, leagueId]);
```

- [ ] **Step 5: Add the dismiss and restore handlers**

```jsx
async function handleDismissIssue(issueKey) {
  try {
    await leaguesApi.dismissDataIssue(leagueId, { issueKey, note: null });
    const report = await leaguesApi.fetchDataCompleteness(leagueId);
    setCompletenessReport(report);
  } catch (error) {
    setCompletenessError(error?.message ?? 'Could not dismiss this item');
  }
}

async function handleRestoreIssue(issueKey) {
  try {
    await leaguesApi.restoreDataIssue(leagueId, issueKey);
    const report = await leaguesApi.fetchDataCompleteness(leagueId);
    setCompletenessReport(report);
  } catch (error) {
    setCompletenessError(error?.message ?? 'Could not restore this item');
  }
}
```

- [ ] **Step 6: Render the panel**

Alongside the other `activeTab === '...'` blocks:

```jsx
{
  activeTab === 'completeness' ? (
    <DataCompletenessPanel
      report={completenessReport}
      isLoading={completenessLoading}
      error={completenessError}
      canDismiss
      onDismiss={handleDismissIssue}
      onRestore={handleRestoreIssue}
    />
  ) : null;
}
```

- [ ] **Step 7: Run the page's existing tests**

Run: `pnpm --filter client test -- AdminLeaguePage`
Expected: no NEW failures. Compare against the pre-existing OPT-026 baseline —
some failures in this tree predate this work. If a test fails because the tab
count changed (e.g. a grid-columns snapshot), update the snapshot; if one fails
with "No QueryClient set", you used `useQuery` — go back to Step 4.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/leagues/pages/AdminLeaguePage.jsx
git commit -m "feat(leagues): add data health tab to admin league page"
```

---

## Task 11: Full verification and documentation

**Files:**

- Modify: `docs/PROJECT-KNOWLEDGE.md`
- Modify: `docs/api.md`
- Modify: `docs/data-completeness/STATUS-DASHBOARD.md`
- Modify: `docs/data-completeness/README.md`

- [ ] **Step 1: Run every check**

```bash
pnpm check-env && pnpm lint && pnpm --filter server test && pnpm --filter client test && pnpm build
```

Expected: server suite fully green; client shows only the pre-existing OPT-026
failures (17 at the time of writing) and none from the new files; lint and build
clean.

- [ ] **Step 2: Manual pass**

Start `pnpm dev`, open a seeded league at `/admin/leagues/:leagueId`, click
**Data health**, and confirm:

- a league whose fixtures are all in the future shows **no** overdue warnings;
- counts match the listed items;
- dismissing an item moves it into the collapsed **Dismissed** section;
- restoring brings it back;
- a league with no active season shows the explanatory message, not an error;
- the panel is usable at a 375px viewport.

- [ ] **Step 3: Document the endpoints**

In `docs/api.md`, add a section for the three routes following the format of the
existing `POST /leagues/:leagueId/games/bulk` entry: payload, validation rules,
auth requirements, response shape, and error codes (400 malformed key / no active
season, 403 non-admin, 404 unknown league).

- [ ] **Step 4: Update PROJECT-KNOWLEDGE**

Add: a §1 capabilities bullet; the new `LeagueDataIssueDismissal` model in the §5
data-model table; and a §11 feature entry summarising the check engine, the 48h
rule, and the dismissal model.

- [ ] **Step 5: Update the feature trackers**

In `docs/data-completeness/STATUS-DASHBOARD.md`, set every phase to ✅, fill in
the commit table, and record the final suite numbers. In `README.md`, change the
status line from "in design" to shipped and add a code-location table.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: document the data completeness dashboard"
```

---

## Self-review notes

**Spec coverage.** All eight checks are in Tasks 1–2; severities and ordering in
Task 3; dismissal persistence in Task 4; validation in Task 5; auth, the D2 team
manager scope, and the no-season case in Task 6; the three endpoints in Task 7;
client API in Task 8; panel and empty states in Task 9; the tab in Task 10;
verification and docs in Task 11.

**Two assumptions were wrong on first draft and are now corrected against the
code** — both would have cost the implementer a debugging cycle:

1. `listLeagueGamesByLeagueId(leagueId, seasonId)` is **positional**
   (`games.repository.js:359`), not `{ seasonId }`. It already filters
   `gameContext: 'league'`.
2. `leaguesApi` is a **single exported object with methods**
   (`leaguesApi.js:113`), not standalone exported functions, and `apiClient`
   exposes `.get(path)` / `.post(path, body)` / `.delete(path, body)` — payload
   positional, not an options object. Verified at `apiClient.js:169/178/249`.

**Remaining judgement call for the implementer.** `SEVERITY_STYLES` in Task 9
uses rose/amber/slate. If `AdminLeaguePage` already has a badge component for
status colours, prefer it over these literals — the goal is consistency with the
page, not with this plan.

**Appearance counting — corrected in pre-flight.** An earlier draft derived
`gamesCount` by counting `event.leaguePlayerId` across game events. **No such
field exists.** Events carry `playerId`, which references a game's embedded
roster _snapshot_ entry; the snapshot stores `leaguePlayerId` separately
(`leagues.service.js:1035` and `:1043` show the two-step match). Counting the
wrong field would have produced an empty map and flagged **every rostered player**
as having no appearances — a silent, plausible-looking wrong answer.

Task 6 now reads `listLeaguePlayerStats(leagueId, seasonId)`
(`leagues.repository.js:499`), which is already materialized per season and
indexed on `(leagueId, seasonId, leagueTeamId, leaguePlayerId)`. `buildRosterIssues`
is unaffected — it only ever needed a `Map<playerId, { gamesCount }>`, which is
why its Task 2 tests never had to change.
