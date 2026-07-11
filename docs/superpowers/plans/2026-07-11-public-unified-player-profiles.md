# Public Unified Player Profiles (v1 — league profiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, discoverable profile page at `/players/:userId` that shows a user's claimed **league** profiles as cards with averages (games, PPG/RPG/APG) — the public counterpart to the existing private My Sporty page — and wire the homepage player-discovery search to link claimed results there.

**Architecture:** Refactor the existing `getMyLeagueProfiles` assembly in `leagues.service.js` into a shared helper that both the existing owner-scoped endpoint and a new public endpoint use, filtering the public variant to `league.isPublic` leagues and enriching every profile with a stats summary sourced from the materialized `LeaguePlayerStats` (via `getLeaguePlayerStats` + `deriveLeaguePlayerScores`). Extract the client `ProfileCard` into a shared component used by both `MySportyPage` and a new `PublicUserProfilePage`. Extend the existing discovery-search endpoint to expose `claimedByUserId` so results can route to the new page.

**Tech Stack:** Express + Mongoose (server/src/modules/leagues, server/src/modules/feed), React 18 + Vite + TanStack Query + React Router (client/src/features/leagues, client/src/features/players), Jest + Supertest (server tests), Vitest + RTL (client tests).

## Global Constraints

- No schema changes — this spec builds entirely on the existing `LeaguePlayer.claimedByUserId` field. Do not touch `team.players[]`.
- Public endpoint filters to `league.isPublic === true` only; the existing owner-scoped `/leagues/my-profiles` endpoint keeps returning all claimed profiles (including private leagues) for the owner.
- Reuse the materialized `LeaguePlayerStats` read-through (`getLeaguePlayerStats`) for averages — do not recompute from raw game events/box scores for this card-list view.
- `GET /public/players/:userId` returns 404 when the filtered profile list is empty (don't leak that a userId exists with only private profiles).
- No dedup of discovery-search results belonging to the same claimed user — each slot stays its own search result, just routed to the shared destination when claimed.
- Follow existing module conventions: routes → controller → service → repository, `ApiError` from services, Zod validation is not needed here (no request body, only path params), named exports, Tailwind inline, no path aliases.

---

### Task 1: Server — shared profile-assembly helper with stats summary

**Files:**

- Modify: `server/src/modules/leagues/leagues.service.js:1117-1169` (existing `getMyLeagueProfiles`)
- Test: `server/src/tests/unit/leagues.service.test.js` (new `describe` block)

**Interfaces:**

- Consumes: `listLeaguePlayersByClaimedUser(userId)`, `listLeaguesByIds(leagueIds)`, `listLeagueTeamsByIds(teamIds)`, `listLeagueMembershipsForUser(userId)` (all already imported in `leagues.service.js`), `getLeaguePlayerStats(leagueId, seasonId)` (defined later in the same file at line 2178, hoisted as a function declaration so it's callable here), `deriveLeaguePlayerScores(row)` (line 2144, same-file function declaration).
- Produces: `assembleLeagueProfilesForUser(userId)` — async function returning `Array<ProfileCardData>` where each item has the existing fields (`id`, `displayName`, `playerLabel`, `jerseyNumber`, `position`, `memberRole`, `memberRoleLabel`, `team`, `league`, `profileHref`) plus a new `summary` field: `{ gamesCount, pointsPerGame, reboundsPerGame, assistsPerGame }` (all numbers, `0` when the player has no recorded games) or `null` if the league has no resolvable `currentSeasonId`. `getMyLeagueProfiles(userId)` becomes a thin wrapper: `{ profiles: await assembleLeagueProfilesForUser(userId) }`.

Both `getLeaguePlayerStats` and `deriveLeaguePlayerScores` are plain `function` declarations (not `const` arrow functions) in the same module, so they are hoisted and callable from a function defined earlier in the file — no reordering needed.

- [ ] **Step 1: Write the failing unit test**

Add this `describe` block to `server/src/tests/unit/leagues.service.test.js` (near the existing `describe('league player stats materialisation (OPT-011)', ...)` block so the surrounding mocks — `listLeaguePlayerStats`, `listLeagueGamesByLeagueId`, etc. — are already in scope):

```javascript
describe('unified profile assembly (public player profiles)', () => {
  test('getMyLeagueProfiles includes a stats summary per profile', async () => {
    listLeaguePlayersByClaimedUser.mockResolvedValue([
      {
        _id: 'lp-1',
        leagueId: 'league-1',
        leagueTeamId: 'team-1',
        displayName: 'Jamie Rivera',
        jerseyNumber: 7,
        position: 'PG',
      },
    ]);
    listLeaguesByIds.mockResolvedValue([
      { _id: 'league-1', slug: 'city-league', name: 'City League', currentSeasonId: 'season-1' },
    ]);
    listLeagueTeamsByIds.mockResolvedValue([{ _id: 'team-1', slug: 'hawks', name: 'Hawks' }]);
    listLeagueMembershipsForUser.mockResolvedValue([{ leagueTeamId: 'team-1', role: 'player' }]);
    listLeaguePlayerStats.mockResolvedValue([
      {
        leagueTeamId: 'team-1',
        leaguePlayerId: 'lp-1',
        gamesCount: 4,
        points: 40,
        reb: 20,
        ast: 8,
        stl: 4,
        blk: 0,
        tov: 4,
        foul: 8,
      },
    ]);

    const result = await getMyLeagueProfiles('user-1');

    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].summary).toEqual({
      gamesCount: 4,
      pointsPerGame: 10,
      reboundsPerGame: 5,
      assistsPerGame: 2,
    });
  });

  test('summary is zeroed when the player has no materialised games', async () => {
    listLeaguePlayersByClaimedUser.mockResolvedValue([
      {
        _id: 'lp-2',
        leagueId: 'league-1',
        leagueTeamId: 'team-1',
        displayName: 'No Games Yet',
        jerseyNumber: null,
        position: null,
      },
    ]);
    listLeaguesByIds.mockResolvedValue([
      { _id: 'league-1', slug: 'city-league', name: 'City League', currentSeasonId: 'season-1' },
    ]);
    listLeagueTeamsByIds.mockResolvedValue([{ _id: 'team-1', slug: 'hawks', name: 'Hawks' }]);
    listLeagueMembershipsForUser.mockResolvedValue([]);
    listLeaguePlayerStats.mockResolvedValue([]);

    const result = await getMyLeagueProfiles('user-1');

    expect(result.profiles[0].summary).toEqual({
      gamesCount: 0,
      pointsPerGame: 0,
      reboundsPerGame: 0,
      assistsPerGame: 0,
    });
  });
});
```

Confirm `listLeaguePlayersByClaimedUser`, `listLeaguesByIds`, `listLeagueTeamsByIds`, `listLeagueMembershipsForUser`, `listLeaguePlayerStats`, and `getMyLeagueProfiles` are already destructured from the top-of-file `require`/mock blocks in this test file (they are — `listLeaguePlayerStats` is used by the existing OPT-011 `describe` block, and `getMyLeagueProfiles` needs adding to the `require('../../modules/leagues/leagues.service')` destructure at the top if not already present).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- leagues.service.test.js -t "unified profile assembly"`
Expected: FAIL — `result.profiles[0].summary` is `undefined` (current `getMyLeagueProfiles` doesn't produce a `summary` field).

- [ ] **Step 3: Implement `assembleLeagueProfilesForUser` and rewire `getMyLeagueProfiles`**

Replace lines 1117-1169 of `server/src/modules/leagues/leagues.service.js` (the current `getMyLeagueProfiles` body) with:

```javascript
async function assembleLeagueProfilesForUser(userId) {
  const players = await listLeaguePlayersByClaimedUser(userId);
  if (players.length === 0) {
    return [];
  }

  const leagueIds = [...new Set(players.map((p) => String(p.leagueId)))];
  const teamIds = [...new Set(players.map((p) => String(p.leagueTeamId)))];

  const [leagues, teams, memberships] = await Promise.all([
    listLeaguesByIds(leagueIds),
    listLeagueTeamsByIds(teamIds),
    listLeagueMembershipsForUser(userId),
  ]);

  const leaguesById = new Map(leagues.map((l) => [String(l._id), l]));
  const teamsById = new Map(teams.map((t) => [String(t._id), t]));
  const memberRoleByTeamId = new Map(memberships.map((m) => [String(m.leagueTeamId), m.role]));

  const MEMBER_ROLE_LABELS = {
    player: 'Player',
    manager: 'Team Manager',
    helper: 'Helper',
  };

  const statsByLeagueId = new Map();
  await Promise.all(
    leagueIds.map(async (leagueId) => {
      const league = leaguesById.get(leagueId);
      if (!league?.currentSeasonId) {
        statsByLeagueId.set(leagueId, []);
        return;
      }
      const rows = await getLeaguePlayerStats(league._id, league.currentSeasonId);
      statsByLeagueId.set(leagueId, rows);
    })
  );

  return players.map((player) => {
    const team = teamsById.get(String(player.leagueTeamId));
    const league = leaguesById.get(String(player.leagueId));
    const playerLabel =
      typeof player.jerseyNumber === 'number'
        ? `#${player.jerseyNumber} ${player.displayName}`
        : player.displayName;
    const memberRole = memberRoleByTeamId.get(String(player.leagueTeamId)) ?? null;

    const statRows = statsByLeagueId.get(String(player.leagueId)) ?? [];
    const statRow = statRows.find(
      (row) =>
        String(row.leagueTeamId) === String(player.leagueTeamId) &&
        String(row.leaguePlayerId) === String(player._id)
    );
    const summary = league?.currentSeasonId
      ? statRow
        ? {
            gamesCount: statRow.gamesCount,
            pointsPerGame: deriveLeaguePlayerScores(statRow).ppg,
            reboundsPerGame: deriveLeaguePlayerScores(statRow).rpg,
            assistsPerGame: deriveLeaguePlayerScores(statRow).apg,
          }
        : { gamesCount: 0, pointsPerGame: 0, reboundsPerGame: 0, assistsPerGame: 0 }
      : null;

    return {
      id: String(player._id),
      displayName: player.displayName,
      playerLabel,
      jerseyNumber: player.jerseyNumber ?? null,
      position: normalizePosition(player.position),
      memberRole,
      memberRoleLabel: memberRole ? (MEMBER_ROLE_LABELS[memberRole] ?? memberRole) : null,
      team: team ? sanitizeLeagueTeam(team) : null,
      league: league ? sanitizeLeague(league) : null,
      profileHref:
        team && league
          ? `/league/${league.slug}/teams/${team.slug}/players/${String(player._id)}`
          : null,
      summary,
    };
  });
}

async function getMyLeagueProfiles(userId) {
  return { profiles: await assembleLeagueProfilesForUser(userId) };
}
```

Add `assembleLeagueProfilesForUser` to the `module.exports` block (near `getMyLeagueProfiles` at line 2600):

```javascript
  getMyLeagueProfiles,
  assembleLeagueProfilesForUser,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- leagues.service.test.js -t "unified profile assembly"`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full leagues service test file to check for regressions**

Run: `pnpm --filter server test -- leagues.service.test.js`
Expected: All existing tests still PASS (the public `getMyLeagueProfiles` return shape is unchanged aside from the new additive `summary` field).

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/leagues/leagues.service.js server/src/tests/unit/leagues.service.test.js
git commit -m "feat(leagues): add stats summary to claimed profile assembly"
```

---

### Task 2: Server — public `getPublicUserProfiles` service + endpoint

**Files:**

- Modify: `server/src/modules/leagues/leagues.service.js` (add new function near `getMyLeagueProfiles`, add export)
- Modify: `server/src/modules/leagues/leagues.controller.js` (add `getPublicUserProfiles` handler, add export)
- Modify: `server/src/modules/leagues/leagues.routes.js` (add `publicPlayersRouter`, export it)
- Modify: `server/src/routes/index.js` (mount `publicPlayersRouter` at `/public/players`)
- Test: `server/src/tests/integration/public-player-profiles.test.js` (new file)

**Interfaces:**

- Consumes: `assembleLeagueProfilesForUser(userId)` from Task 1, `findUserById(userId)` (already imported in `leagues.service.js` from `../auth/auth.repository`), `transformCloudinaryUrl` (already imported), `ApiError` (already imported).
- Produces: `getPublicUserProfiles(userId)` — async function. Throws `ApiError(404, 'Player not found')` if the user doesn't exist or has zero profiles in public leagues. Otherwise returns `{ user: { id, name, avatarUrl }, profiles: [...] }` (profiles filtered to `profile.league?.isPublic === true`). Controller `getPublicUserProfiles(req, res)` reads `req.params.userId`, calls the service, returns `res.status(200).json(result)`. Route: `GET /public/players/:userId`.

- [ ] **Step 1: Write the failing integration test**

Create `server/src/tests/integration/public-player-profiles.test.js`:

```javascript
const request = require('supertest');

jest.mock('../../modules/leagues/leagues.service', () => ({
  getPublicUserProfiles: jest.fn(),
}));

const leaguesService = require('../../modules/leagues/leagues.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');

describe('GET /api/v1/public/players/:userId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200 with profiles on success', async () => {
    leaguesService.getPublicUserProfiles.mockResolvedValue({
      user: { id: 'user-1', name: 'Jamie Rivera', avatarUrl: null },
      profiles: [
        {
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          playerLabel: '#7 Jamie Rivera',
          jerseyNumber: 7,
          position: 'PG',
          memberRole: 'player',
          memberRoleLabel: 'Player',
          team: { name: 'Hawks' },
          league: { name: 'City League', isPublic: true },
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/public/players/user-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'user-1', name: 'Jamie Rivera' });
    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0].summary).toEqual({
      gamesCount: 4,
      pointsPerGame: 10,
      reboundsPerGame: 5,
      assistsPerGame: 2,
    });
    expect(leaguesService.getPublicUserProfiles).toHaveBeenCalledWith('user-1');
  });

  test('404 when the service throws not found', async () => {
    leaguesService.getPublicUserProfiles.mockRejectedValue(new ApiError(404, 'Player not found'));

    const app = createApp();
    const res = await request(app).get('/api/v1/public/players/user-404');

    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- public-player-profiles.test.js`
Expected: FAIL with a 404 (route doesn't exist yet — Express's default handler returns 404 for both tests since the route isn't registered, or the mocked module errors on missing export).

- [ ] **Step 3: Implement the service function**

In `server/src/modules/leagues/leagues.service.js`, add this function directly after `getMyLeagueProfiles` (after the block added in Task 1):

```javascript
async function getPublicUserProfiles(userId) {
  const user = await findUserById(userId);
  const allProfiles = await assembleLeagueProfilesForUser(userId);
  const publicProfiles = allProfiles.filter((profile) => profile.league?.isPublic === true);

  if (!user || publicProfiles.length === 0) {
    throw new ApiError(404, 'Player not found');
  }

  return {
    user: {
      id: String(user._id),
      name: user.name,
      avatarUrl: transformCloudinaryUrl(user.avatar?.url || null),
    },
    profiles: publicProfiles,
  };
}
```

Add `getPublicUserProfiles` to `module.exports` next to `getMyLeagueProfiles`:

```javascript
  getMyLeagueProfiles,
  assembleLeagueProfilesForUser,
  getPublicUserProfiles,
```

- [ ] **Step 4: Add the controller handler**

In `server/src/modules/leagues/leagues.controller.js`, add after `getMyProfiles` (around line 45):

```javascript
async function getPublicUserProfiles(req, res) {
  const { userId } = req.params;
  const result = await leaguesService.getPublicUserProfiles(userId);
  res.status(200).json(result);
}
```

Add `getPublicUserProfiles` to the controller's `module.exports` (find the export block at the bottom of the file, add it next to `getMyProfiles`).

- [ ] **Step 5: Add the route and mount it**

In `server/src/modules/leagues/leagues.routes.js`, add after the `const publicLeaguesRouter = Router();` declaration (near line 8):

```javascript
const publicPlayersRouter = Router();
```

Add the route registration near the other `publicLeaguesRouter` registrations (after `publicLeaguesRouter.use(optionalAuthMiddleware);`):

```javascript
publicPlayersRouter.get('/:userId', asyncHandler(controller.getPublicUserProfiles));
```

Update the file's `module.exports` (near line 117-118) to also export `publicPlayersRouter`:

```javascript
module.exports = {
  leaguesRouter,
  publicLeaguesRouter,
  publicPlayersRouter,
};
```

In `server/src/routes/index.js`, update the destructure at line 16 and add the mount:

```javascript
const {
  leaguesRouter,
  publicLeaguesRouter,
  publicPlayersRouter,
} = require('../modules/leagues/leagues.routes');
```

Add the mount after line 32 (`apiRouter.use('/public/teams', publicCacheMiddleware, publicTeamsRouter);`):

```javascript
apiRouter.use('/public/players', publicCacheMiddleware, publicPlayersRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter server test -- public-player-profiles.test.js`
Expected: PASS (2 tests)

- [ ] **Step 7: Run the full server test suite to check for regressions**

Run: `pnpm --filter server test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/leagues/leagues.service.js server/src/modules/leagues/leagues.controller.js server/src/modules/leagues/leagues.routes.js server/src/routes/index.js server/src/tests/integration/public-player-profiles.test.js
git commit -m "feat(leagues): add public GET /public/players/:userId endpoint"
```

---

### Task 3: Server — expose `claimedByUserId` on discoverable-players results

**Files:**

- Modify: `server/src/modules/feed/feed.service.js:925-952` (`listDiscoverablePlayers`, league results mapping)
- Test: `server/src/tests/unit/feed.service.test.js` (add test; create the file with this one test block if it doesn't already exist — check first with `find server/src/tests -iname "feed.service.test.js"`)

**Interfaces:**

- Consumes: existing `listLeaguePlayers(leagueTeamId)` rows already include `claimedByUserId` on the raw Mongoose doc (schema field defined in `leagues.repository.js:89`).
- Produces: each league-sourced item in the array returned by `listDiscoverablePlayers` gains a `claimedByUserId` field: `String(player.claimedByUserId)` when set, else `null`. Standalone-sourced items are unaffected (no such field exists on `team.players[]`) and get `claimedByUserId: null` too, for a consistent shape across both sources.

- [ ] **Step 1: Check for an existing feed.service test file**

Run: `find server/src/tests -iname "feed.service.test.js"`

If it exists, read it first to match its existing mocking conventions before adding a new test. If it doesn't exist, create `server/src/tests/unit/feed.service.test.js` with the minimal mocks needed (see Step 2).

- [ ] **Step 2: Write the failing unit test**

If the file doesn't exist, create `server/src/tests/unit/feed.service.test.js`:

```javascript
jest.mock('../../modules/teams/teams.repository', () => ({
  listTeams: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  listAllPublicLeagues: jest.fn(),
  listLeagueTeams: jest.fn(),
  listLeaguePlayers: jest.fn(),
}));

const { listTeams } = require('../../modules/teams/teams.repository');
const {
  listAllPublicLeagues,
  listLeagueTeams,
  listLeaguePlayers,
} = require('../../modules/leagues/leagues.repository');
const { listDiscoverablePlayers } = require('../../modules/feed/feed.service');

describe('listDiscoverablePlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listTeams.mockResolvedValue([]);
  });

  test('includes claimedByUserId on league-sourced results, null when unclaimed', async () => {
    listAllPublicLeagues.mockResolvedValue([
      { id: 'league-1', slug: 'city-league', name: 'City League' },
    ]);
    listLeagueTeams.mockResolvedValue([
      { _id: 'team-1', slug: 'hawks', name: 'Hawks', status: 'active' },
    ]);
    listLeaguePlayers.mockResolvedValue([
      {
        _id: 'lp-1',
        displayName: 'Jamie Rivera',
        jerseyNumber: 7,
        position: 'PG',
        isActive: true,
        claimedByUserId: 'user-1',
      },
      {
        _id: 'lp-2',
        displayName: 'Alex Chen',
        jerseyNumber: 9,
        position: 'SG',
        isActive: true,
        claimedByUserId: null,
      },
    ]);

    const results = await listDiscoverablePlayers({});

    const claimed = results.find((r) => r.id === 'lp-1');
    const unclaimed = results.find((r) => r.id === 'lp-2');
    expect(claimed.claimedByUserId).toBe('user-1');
    expect(unclaimed.claimedByUserId).toBeNull();
  });
});
```

Note: if the file already exists with different mock setups for `listAllPublicLeagues`/`listLeagueTeams`/`listLeaguePlayers`/`listTeams`, add only the `test(...)` block above into the existing `describe('listDiscoverablePlayers', ...)` (or create that describe block) using whatever mock helper functions that file already provides, keeping the same assertions.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter server test -- feed.service.test.js -t "claimedByUserId"`
Expected: FAIL — `claimed.claimedByUserId` is `undefined`, not `'user-1'`.

- [ ] **Step 4: Implement the field addition**

In `server/src/modules/feed/feed.service.js`, in `listDiscoverablePlayers`, update the standalone results push (around line 896-910) to add `claimedByUserId: null`:

```javascript
standaloneResults.push({
  id: String(player._id),
  source: 'standalone',
  sourceLabel: 'Public team',
  displayName: player.displayName,
  jerseyNumber: player.jerseyNumber ?? null,
  position: player.position ?? null,
  claimedByUserId: null,
  profileHref: `/teams/${String(team._id)}/players/${String(player._id)}`,
  team: {
    id: String(team._id),
    name: team.name,
    profileHref: `/teams/${String(team._id)}`,
  },
  league: null,
});
```

Update the league results mapping (around line 931-951) to add `claimedByUserId`:

```javascript
      .map((player) => ({
        id: String(player._id),
        source: 'league',
        sourceLabel: 'Public league',
        leaguePlayerId: String(player._id),
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        claimedByUserId: player.claimedByUserId ? String(player.claimedByUserId) : null,
        profileHref: `/league/${league.slug}/teams/${team.slug}/players/${String(player._id)}`,
        team: {
          leagueTeamId: String(team._id),
          name: team.name,
          profileHref: `/league/${league.slug}/teams/${team.slug}`,
        },
        league: {
          id: league.id,
          name: league.name,
          slug: league.slug,
          profileHref: `/league/${league.slug}`,
        },
      }));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter server test -- feed.service.test.js -t "claimedByUserId"`
Expected: PASS

- [ ] **Step 6: Run full feed test suite for regressions**

Run: `pnpm --filter server test -- feed`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/feed/feed.service.js server/src/tests/unit/feed.service.test.js
git commit -m "feat(feed): expose claimedByUserId on discoverable player results"
```

---

### Task 4: Client — extract shared `ProfileCard` component with averages

**Files:**

- Create: `client/src/features/players/components/ProfileCard.jsx`
- Create: `client/src/features/players/components/ProfileCard.test.jsx`
- Modify: `client/src/features/leagues/pages/MySportyPage.jsx:1-104` (remove inline `ProfileCard`, import the shared one)

**Interfaces:**

- Consumes: nothing new — same imports the inline version used (`CloudinaryImage`, `getLeagueHeaderImage`, placeholder assets).
- Produces: `ProfileCard({ profile, avatarUrl })` exported from `client/src/features/players/components/ProfileCard.jsx`. Same rendering as today's inline version, plus: if `profile.summary` is present, render a stat line showing `${summary.gamesCount} GP` and `PPG / RPG / APG` values (one decimal place) between the team/league block and the "View profile" footer.

- [ ] **Step 1: Write the failing component test**

Create `client/src/features/players/components/ProfileCard.test.jsx`:

```jsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCard } from './ProfileCard';

const baseProfile = {
  id: 'lp-1',
  displayName: 'Jamie Rivera',
  jerseyNumber: 7,
  position: 'PG',
  memberRoleLabel: 'Player',
  team: { name: 'Hawks', logo: null },
  league: { name: 'City League', seasonLabel: 'Spring 2026' },
  profileHref: '/league/city-league/teams/hawks/players/lp-1',
};

function renderCard(profile) {
  return render(
    <MemoryRouter>
      <ProfileCard profile={profile} avatarUrl={null} />
    </MemoryRouter>
  );
}

describe('ProfileCard', () => {
  test('renders averages when a summary is present', () => {
    renderCard({
      ...baseProfile,
      summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
    });

    expect(screen.getByText('4 GP')).toBeInTheDocument();
    expect(screen.getByText(/10\.0 PPG/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0 RPG/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 APG/)).toBeInTheDocument();
  });

  test('renders without a stat line when summary is absent', () => {
    renderCard(baseProfile);

    expect(screen.queryByText(/GP$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test -- ProfileCard.test.jsx`
Expected: FAIL — `client/src/features/players/components/ProfileCard.jsx` doesn't exist yet.

- [ ] **Step 3: Create the shared component**

Create `client/src/features/players/components/ProfileCard.jsx`:

```jsx
import { Link } from 'react-router-dom';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { CloudinaryImage } from '../../media/CloudinaryImage';

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function ProfileCard({ profile, avatarUrl }) {
  const inner = (
    <div className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-[#F4A300]/60 hover:bg-white">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <CloudinaryImage
            src={avatarUrl || playerPlaceholder}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            srcSetWidths={[48, 96, 144]}
            sizes="48px"
            className="h-12 w-12 rounded-2xl border border-slate-200 bg-white object-cover"
          />
          {profile.jerseyNumber != null && (
            <span
              className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#141414] text-[11px] text-[#F4A300]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {profile.jerseyNumber}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{profile.displayName}</p>
            {profile.memberRoleLabel && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {profile.memberRoleLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{profile.position || 'No position set'}</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        {profile.team && (
          <div className="flex items-center gap-2 text-sm">
            <CloudinaryImage
              src={profile.team.logo?.url || teamPlaceholder}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate font-medium text-slate-700">{profile.team.name}</span>
          </div>
        )}
        {profile.league && (
          <div className="flex items-center gap-2 text-sm">
            <CloudinaryImage
              src={getLeagueHeaderImage(profile.league)}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              decoding="async"
              srcSetWidths={[20, 40, 60]}
              sizes="20px"
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate text-slate-500">{profile.league.name}</span>
            {profile.league.seasonLabel && (
              <span className="ml-auto shrink-0 text-xs text-slate-400">
                {profile.league.seasonLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {profile.summary && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm">
          <span className="font-semibold text-slate-900">{profile.summary.gamesCount} GP</span>
          <span
            className="flex gap-3 text-slate-600"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            <span>{formatAverage(profile.summary.pointsPerGame)} PPG</span>
            <span>{formatAverage(profile.summary.reboundsPerGame)} RPG</span>
            <span>{formatAverage(profile.summary.assistsPerGame)} APG</span>
          </span>
        </div>
      )}

      <div className="flex items-center justify-end">
        <span className="text-sm font-semibold text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 group-hover:text-[#1B4332]">
          View profile →
        </span>
      </div>
    </div>
  );

  if (profile.profileHref) {
    return <Link to={profile.profileHref}>{inner}</Link>;
  }

  return inner;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test -- ProfileCard.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire `MySportyPage` to use the shared component**

In `client/src/features/leagues/pages/MySportyPage.jsx`:

- Delete the inline `function ProfileCard({ profile, avatarUrl }) { ... }` block (lines 13-104).
- Delete now-unused imports that only served the inline card: `getLeagueHeaderImage` (from `../../feed/cardImage`), `teamPlaceholder`, `playerPlaceholder`, `CloudinaryImage` — but first check whether `MySportyPage.jsx` uses `CloudinaryImage` anywhere else in the file (e.g. for the user's own avatar upload UI); if it does, keep that import and only remove `teamPlaceholder`/`playerPlaceholder`/`getLeagueHeaderImage` if truly unused elsewhere.
- Add: `import { ProfileCard } from '../../players/components/ProfileCard';`

- [ ] **Step 6: Run client test suite for regressions**

Run: `pnpm --filter client test -- MySportyPage`
Expected: PASS (existing MySportyPage tests, if any, still pass — check `find client/src -iname "MySportyPage.test.jsx"` first; if no test file exists, run `pnpm --filter client test` for the full suite instead to confirm no import errors).

- [ ] **Step 7: Commit**

```bash
git add client/src/features/players/components/ProfileCard.jsx client/src/features/players/components/ProfileCard.test.jsx client/src/features/leagues/pages/MySportyPage.jsx
git commit -m "refactor(players): extract shared ProfileCard with averages stat line"
```

---

### Task 5: Client — `PublicUserProfilePage` + route + API client

**Files:**

- Create: `client/src/features/players/api/playersApi.js`
- Create: `client/src/features/players/pages/PublicUserProfilePage.jsx`
- Create: `client/src/features/players/pages/PublicUserProfilePage.test.jsx`
- Modify: `client/src/app/router/AppRouter.jsx` (add lazy import + route)

**Interfaces:**

- Consumes: `apiClient` from `client/src/lib/apiClient.js` (existing shared client, same pattern as `leaguesApi.js`), `ProfileCard` from Task 4, `SportsLoader` from `client/src/components/SportsLoader`, `useDocumentMeta` from `client/src/hooks/useDocumentMeta`, `resolveShareImage` from `client/src/hooks/resolveShareImage`, `CloudinaryImage` from `client/src/features/media/CloudinaryImage`.
- Produces: `playersApi.getPublicUserProfiles(userId)` → `GET /public/players/:userId`. `PublicUserProfilePage` component (named export), reads `userId` via `useParams()`, uses `useQuery({ queryKey: ['publicUserProfiles', userId], queryFn: () => playersApi.getPublicUserProfiles(userId) })`. Route `/players/:userId` in `AppRouter.jsx`.

- [ ] **Step 1: Create the API client**

Create `client/src/features/players/api/playersApi.js`:

```javascript
import { apiClient } from '../../../lib/apiClient';

export const playersApi = {
  getPublicUserProfiles(userId) {
    return apiClient.get(`/public/players/${userId}`);
  },
};
```

- [ ] **Step 2: Write the failing page test**

Create `client/src/features/players/pages/PublicUserProfilePage.test.jsx`:

```jsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicUserProfilePage } from './PublicUserProfilePage';
import { playersApi } from '../api/playersApi';

vi.mock('../api/playersApi', () => ({
  playersApi: { getPublicUserProfiles: vi.fn() },
}));

function renderAtUserId(userId) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/players/${userId}`]}>
        <Routes>
          <Route path="/players/:userId" element={<PublicUserProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicUserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders user header and profile cards on success', async () => {
    playersApi.getPublicUserProfiles.mockResolvedValue({
      user: { id: 'user-1', name: 'Jamie Rivera', avatarUrl: null },
      profiles: [
        {
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          position: 'PG',
          memberRoleLabel: 'Player',
          team: { name: 'Hawks', logo: null },
          league: { name: 'City League', seasonLabel: 'Spring 2026' },
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
        },
      ],
    });

    renderAtUserId('user-1');

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('4 GP')).toBeInTheDocument();
  });

  test('renders a not-found message on 404', async () => {
    const error = new Error('Player not found');
    error.status = 404;
    playersApi.getPublicUserProfiles.mockRejectedValue(error);

    renderAtUserId('user-404');

    await waitFor(() => expect(screen.getByText(/no public profiles/i)).toBeInTheDocument());
  });
});
```

`apiClient` (`client/src/lib/apiClient.js:84`) sets `error.status = response.status` on non-OK responses before throwing, which is exactly the shape mocked above (`error.status = 404`).

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter client test -- PublicUserProfilePage.test.jsx`
Expected: FAIL — `PublicUserProfilePage` module doesn't exist yet.

- [ ] **Step 4: Create the page component**

Create `client/src/features/players/pages/PublicUserProfilePage.jsx`:

```jsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SportsLoader } from '../../../components/SportsLoader';
import { ProfileCard } from '../components/ProfileCard';
import { playersApi } from '../api/playersApi';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

export function PublicUserProfilePage() {
  const { userId } = useParams();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['publicUserProfiles', userId],
    queryFn: () => playersApi.getPublicUserProfiles(userId),
    retry: false,
  });

  const isNotFound = isError && error?.status === 404;

  useDocumentMeta({
    title: data?.user ? `${data.user.name} — The Sporty Way` : 'Player Profile — The Sporty Way',
    description: data?.user
      ? `${data.user.name}'s player profiles on The Sporty Way.`
      : 'Player profile on The Sporty Way.',
    image: resolveShareImage(),
    url: window.location.href,
  });

  if (isLoading) {
    return <SportsLoader label="Loading player profile" fullPage />;
  }

  if (isNotFound) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
        >
          No public profiles for this player.
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
        >
          Failed to load player profile.
        </p>
      </main>
    );
  }

  const { user, profiles } = data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center gap-4">
        <CloudinaryImage
          src={user.avatarUrl || playerPlaceholder}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          srcSetWidths={[64, 128, 192]}
          sizes="64px"
          className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-cover"
        />
        <h1
          className="text-2xl text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {user.name}
        </h1>
      </header>

      <ul className="grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <ProfileCard profile={profile} avatarUrl={user.avatarUrl} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter client test -- PublicUserProfilePage.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Add the route**

In `client/src/app/router/AppRouter.jsx`, add the lazy import near the other `Public*Page` imports (after the `PublicPlayerPage` lazy import block, around line 58):

```javascript
const PublicUserProfilePage = lazy(() =>
  import('../../features/players/pages/PublicUserProfilePage').then((m) => ({
    default: m.PublicUserProfilePage,
  }))
);
```

Add the route near the other public player/team routes (after the `/teams/:teamId/players/:playerId` route at line 227):

```jsx
<Route path="/players/:userId" element={<PublicUserProfilePage />} />
```

- [ ] **Step 7: Run client test suite for regressions**

Run: `pnpm --filter client test`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/players/api/playersApi.js client/src/features/players/pages/PublicUserProfilePage.jsx client/src/features/players/pages/PublicUserProfilePage.test.jsx client/src/app/router/AppRouter.jsx
git commit -m "feat(players): add public unified player profile page and route"
```

---

### Task 6: Client — route discovery search to unified profiles for claimed players

**Files:**

- Modify: `client/src/features/players/components/DiscoverablePlayers.jsx:109-140` (results list rendering)
- Modify: `client/src/features/players/components/DiscoverablePlayers.test.jsx` (create if it doesn't exist, or extend — check first)

**Interfaces:**

- Consumes: `player.claimedByUserId` (added in Task 3) from each item in `feedApi.listDiscoverablePlayers()`'s response.
- Produces: each result's `<Link>` target is `/players/${player.claimedByUserId}` when `player.claimedByUserId` is truthy, else `player.profileHref` (unchanged behavior).

- [ ] **Step 1: Check for an existing test file**

Run: `find client/src -iname "DiscoverablePlayers.test.jsx"`

If it exists, read it to match its mocking conventions for `feedApi.listDiscoverablePlayers`. If not, create `client/src/features/players/components/DiscoverablePlayers.test.jsx` per Step 2.

- [ ] **Step 2: Write the failing test**

Create (or add to) `client/src/features/players/components/DiscoverablePlayers.test.jsx`:

```jsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DiscoverablePlayers } from './DiscoverablePlayers';
import { feedApi } from '../../feed/api/feedApi';

vi.mock('../../feed/api/feedApi', () => ({
  feedApi: { listDiscoverablePlayers: vi.fn() },
}));

function renderWithProviders(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DiscoverablePlayers link routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('routes a claimed result to the unified public profile', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'league',
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          claimedByUserId: 'user-1',
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          team: { name: 'Hawks' },
          league: { name: 'City League' },
        },
      ],
    });

    renderWithProviders(<DiscoverablePlayers />);

    const link = await waitFor(() => screen.getByText('Jamie Rivera').closest('a'));
    expect(link).toHaveAttribute('href', '/players/user-1');
  });

  test('routes an unclaimed result to its per-context profileHref', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'standalone',
          id: 'p-1',
          displayName: 'Alex Chen',
          jerseyNumber: 9,
          claimedByUserId: null,
          profileHref: '/teams/team-1/players/p-1',
          team: { name: 'Hawks' },
          league: null,
        },
      ],
    });

    renderWithProviders(<DiscoverablePlayers />);

    const link = await waitFor(() => screen.getByText('Alex Chen').closest('a'));
    expect(link).toHaveAttribute('href', '/teams/team-1/players/p-1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter client test -- DiscoverablePlayers.test.jsx`
Expected: FAIL — the claimed-result test expects `/players/user-1` but the current code always links to `player.profileHref` (`/league/city-league/teams/hawks/players/lp-1`).

- [ ] **Step 4: Implement the link routing**

In `client/src/features/players/components/DiscoverablePlayers.jsx`, update the `<Link>` in the results `.map()` (around line 110-113):

```jsx
{
  players.map((player) => {
    const targetHref = player.claimedByUserId
      ? `/players/${player.claimedByUserId}`
      : player.profileHref;

    return (
      <li key={`${player.source}-${player.id}`}>
        <Link
          to={targetHref}
          className="group flex h-full gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white"
        >
          <PlayerInitials name={player.displayName} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-slate-900 group-hover:text-[#1B4332]">
                {player.displayName}
              </span>
              {player.jerseyNumber ? (
                <span
                  className="text-xs font-semibold text-[#F4A300]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  #{player.jerseyNumber}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block truncate text-sm text-slate-600">
              {player.team?.name || 'Unknown team'}
            </span>
            <span className="mt-1 inline-flex rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {player.league?.name || player.sourceLabel}
            </span>
          </span>
        </Link>
      </li>
    );
  });
}
```

This replaces the existing `.map((player) => ( <li>...<Link to={player.profileHref}>...` block (lines 109-140) — same JSX body, only the `to={...}` value changes from a direct prop reference to the computed `targetHref`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter client test -- DiscoverablePlayers.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Run full client test suite for regressions**

Run: `pnpm --filter client test`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/players/components/DiscoverablePlayers.jsx client/src/features/players/components/DiscoverablePlayers.test.jsx
git commit -m "feat(players): route claimed discovery results to public unified profile"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run env/lint/test/build check across the whole repo**

Run: `pnpm check-env && pnpm lint && pnpm test && pnpm build`
Expected: All pass with no errors.

- [ ] **Step 2: Manually verify the golden path in a running app**

Run `pnpm dev`, then in a browser:

1. Log in as a user claimed to a league player in a public league (use seeded demo data — `pnpm seed`, or claim one via the existing league join-request flow if none exists).
2. Visit `/my-sporty` — confirm the profile card now shows a `GP` / `PPG` / `RPG` / `APG` stat line.
3. Note that user's `userId` (visible in the network tab response for `/leagues/my-profiles`, or from the DB).
4. Visit `/players/:userId` in an incognito/logged-out browser tab — confirm the same card renders publicly with averages.
5. Visit `/home`, open the Players tab, search for that claimed player's name — confirm the result links to `/players/:userId` and lands on the same page.
6. Search for an unclaimed player — confirm it still links to its existing per-context profile page.
7. Visit `/players/<a-random-nonexistent-id>` — confirm a "No public profiles for this player" message renders, not a crash.

- [ ] **Step 3: Report results to the user**

Summarize what was verified and any deviations from the plan encountered during implementation.
