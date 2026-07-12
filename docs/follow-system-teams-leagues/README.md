# Follow System v1.5 — Leagues & League Teams

> **Status:** Planned — implementation in progress on
> `feature/follow-teams-leagues`. Living trackers:
> [`implementation-tracker.md`](./implementation-tracker.md),
> [`status-dashboard.md`](./status-dashboard.md). Decisions & open questions:
> [`decisions.md`](./decisions.md). Full design: [`architecture.md`](./architecture.md).
> Builds directly on [`../follow-system/`](../follow-system/) (v1, users-only).

## Feature overview

Extends the [User Follow System](../follow-system/) so a signed-in user can also
**follow and unfollow Leagues and League Teams** — not just user accounts — and
see them in their private **"Following"** area, grouped by type. This delivers the
teams/leagues half of the #2 product-ideas opportunity (Parents/Fans/Community:
_"Follow teams/players/leagues"_) that v1 deliberately deferred.

It is a genuine quick win: v1 was built **polymorphic-ready** — the `Follow`
schema already stores `{ followerUserId, targetType, targetId }` and the
repository layer already accepts `targetType` — so this is mostly generalizing
user-specific code into type-aware dispatch, with **no data migration**
(additive enum widen only).

## Scope

**In scope:** following `league` and `leagueTeam` (a team scoped within a league)
targets, alongside the existing `user` target.

**Out of scope (deferred, unchanged from v1):**

- **Standalone `Team`** (the billing entity a coach owns). It has no `slug`, no
  `isPublic` flag, and no public route — there is nothing to link to and no
  visibility gate to reuse. Deferred until standalone teams get a public surface
  (mirrors the already-deferred "standalone team-player claiming").
- Public follower/following counts.
- A personalized "Following" feed on The Pulse.
- Notifications about followed leagues/teams.

## User stories

- As a fan, I can follow a public league from its page so I can find it again.
- As a fan, I can follow a specific team within a league.
- As a fan, I can open my Following page and see Players, Leagues, and Teams in
  separate sections, each with one-click links to the public page.
- As a fan, I can unfollow a league/team from its page or my Following list.
- As a logged-out visitor, I see a "Log in to follow" prompt on league/team pages.
- As a league owner, I can follow my own league/team (no self-follow block for
  these types — see [`decisions.md`](./decisions.md) DL3).

## Privacy / security

Same guarantees as v1, extended to the new types: only public leagues (and teams
whose parent league is public) are followable, enforced by **reusing**
`assertLeagueVisible` — never a hand-rolled `isPublic` check
(`PROJECT-KNOWLEDGE.md` §4 / follow-system decision D8). A followed league that
later goes private has its profile link degraded server-side (`profileHref: null`,
no leaked slug), the follow row itself persists.

## Where things live

| Layer                | Location                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Backend module       | `server/src/modules/follows/` (extended)                                                               |
| API base path        | `/api/v1/follows` (generic `:targetType/:targetId` routes)                                             |
| Frontend feature     | `client/src/features/follows/` (extended)                                                              |
| Following page route | `/following` (protected, now sectioned by type)                                                        |
| New follow surfaces  | `/league/:leagueSlug` (PublicLeaguePage), `/league/:leagueSlug/teams/:teamSlug` (PublicLeagueTeamPage) |

See [`architecture.md`](./architecture.md) for the full design.
