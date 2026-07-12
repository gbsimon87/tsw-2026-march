# Public Unified Player Profiles (v1 — league profiles)

## Context

TSW has no unified player identity today. A person's basketball activity is split
across two disjoint representations:

- **Standalone team players** — embedded in `team.players[]`
  (`server/src/modules/teams/teams.repository.js`), no `User` link at all.
- **League players** — a standalone `LeaguePlayer` collection
  (`server/src/modules/leagues/leagues.repository.js`), claimable by a `User` via
  `claimedByUserId`.

The only existing cross-context view is **My Sporty** (`/my-sporty`,
`client/src/features/leagues/pages/MySportyPage.jsx`), which lists a _logged-in
user's own_ claimed league profiles as cards (name, jersey, position, team,
league, role, and a link to the per-league-player page). It does **not** show
stats/averages on the cards, and it is only visible to the owner.

There's also a public **Players** discovery tab on the homepage
(`client/src/features/players/components/DiscoverablePlayers.jsx`, wired into
`client/src/pages/HomePage.jsx`), which searches across standalone-team players
and public-league players and links each result to its per-context profile page.
It operates on individual slots, not people, and has no concept of claimed
identity today.

## Goal (this spec)

Make a **public, discoverable version of My Sporty**: a profile page at
`/players/:userId` that shows a user's claimed **league** profiles as cards —
same visual/data shape as My Sporty — reachable by anyone, not just the owner.
Add a stat line (games, PPG/RPG/APG) to these cards (both the new public page
and My Sporty). Wire the existing homepage Players discovery search to link to
this new page when a result is claimed.

**Out of scope for this spec** (explicitly deferred):

- Standalone team-player claiming (team-owner-approves flow). Team players
  still have no `User` link after this spec ships; they're a follow-up.
- Any cross-context stat merging/recomputation. Each card shows that league
  profile's own season averages — there is no "combined across all profiles"
  number.
- Development dashboards, trends over time, milestones, badges, stat correction
  workflows (all separate, larger product bets from `docs/ideas.md`).

## Design

### 1. Server — aggregation

Refactor `getMyLeagueProfiles(userId)` (`leagues.service.js:1117`) to split
shared assembly from visibility filtering and stat computation:

- **Shared assembly**: given a list of claimed `LeaguePlayer`s, resolve their
  leagues/teams/memberships and build profile card data (unchanged fields:
  `displayName`, `playerLabel`, `jerseyNumber`, `position`, `memberRole`,
  `memberRoleLabel`, `team`, `league`, `profileHref`).
- **New**: each profile also gets a `summary` (games, ppg, rpg, apg), computed
  via the existing per-league-player summary path (`buildLeaguePlayerSummary` /
  `getLeaguePlayerStats`, `leagues.service.js`). Reuse the materialized
  `LeaguePlayerStats` read-through — do not recompute from raw events.
- **`getMyLeagueProfiles(userId)`** (owner-scoped, used by My Sporty): returns
  all claimed profiles regardless of league visibility, now including
  `summary`.
- **New `getPublicUserProfiles(userId)`**: same assembly, filtered to
  `league.isPublic === true` only. Returns
  `{ user: { id, name, avatarUrl }, profiles: [...] }`. If the filtered list is
  empty, the endpoint 404s (don't leak that a userId exists with only private
  profiles).

### 2. Server — API

- `GET /public/players/:userId` (new, `leagues.routes.js` or a small dedicated
  route) → `getPublicUserProfiles`. Public, unauthenticated.
- `GET /leagues/my-profiles` (existing) — same handler, now returns `summary`
  per profile as part of this change.
- `GET /feed/discoverable/players` (existing, `feed.service.js`) — add
  `claimedByUserId` (string or null) to each league-sourced result so the
  client knows whether to route to the unified profile.

### 3. Client — page & route

- New route `/players/:userId` → `PublicUserProfilePage`
  (`client/src/features/players/pages/PublicUserProfilePage.jsx`, lazy-loaded
  in `AppRouter.jsx`). Fetches via a new `playersApi.getPublicUserProfiles(userId)`
  (or extend `leaguesApi`). Renders a user header (avatar, display name) and a
  grid of `ProfileCard`s. 404 state: "No public profiles for this player."
- `useDocumentMeta` for title/share image, matching other public pages'
  pattern.

### 4. Client — shared `ProfileCard`

- Extract the `ProfileCard` function out of `MySportyPage.jsx` into
  `client/src/features/players/components/ProfileCard.jsx` (or
  `features/leagues/components/` — colocate with existing card styling
  imports). Same props/rendering, plus a new stat line: games played and
  PPG/RPG/APG, styled consistently with existing card typography.
- Both `MySportyPage` and `PublicUserProfilePage` import this shared component.

### 5. Client — discovery linking

- `DiscoverablePlayers.jsx`: for each result, if `player.claimedByUserId` is
  present, link to `/players/${player.claimedByUserId}` instead of
  `player.profileHref`. Unclaimed results (and all standalone-team results,
  since they can't be claimed yet) keep linking to their existing per-context
  `profileHref`. No dedup of multiple slots belonging to the same claimed user
  — each slot is still its own search result, just pointed at the shared
  destination page when claimed.

### 6. Testing

- **Server** (Jest+Supertest, `server/src/tests/`):
  - `GET /public/players/:userId` returns only profiles from `isPublic`
    leagues, each with a `summary`.
  - Returns 404 when the user has no claimed profiles, or only claimed
    profiles in private leagues.
  - `GET /leagues/my-profiles` (owner) still returns private-league profiles,
    now with `summary` included.
  - `GET /feed/discoverable/players` includes `claimedByUserId` on
    league-sourced results (null for standalone-team results).
- **Client** (Vitest + RTL):
  - `PublicUserProfilePage` renders header + cards from a mocked response;
    renders not-found state on 404.
  - `ProfileCard` renders the averages stat line given a `summary`.
  - `DiscoverablePlayers` routes a claimed result to `/players/:userId` and an
    unclaimed result to its `profileHref`.

## Follow-ups (not this spec)

- Standalone team-player claiming (team-owner approves a claim request),
  extending `claimedByUserId` to `team.players[]` so non-league games appear
  on unified profiles.
- Discovery dedup: collapse multiple claimed slots for the same user into one
  search result.
- Development dashboard (trends), milestones, badges, stat correction
  workflow — separate specs per `docs/ideas.md`.
