# Follow System v1.5 — Decisions, Assumptions & Open Questions

> Records decisions specific to the leagues/league-teams extension. Builds on the
> v1 decisions in [`../follow-system/decisions.md`](../follow-system/decisions.md)
> (D1–D8), which still hold.

## Confirmed decisions

### DL1 — Scope: `league` + `leagueTeam` only; standalone `Team` deferred

**Decision:** This iteration adds `league` and `leagueTeam` as follow targets.
Standalone `Team` (the billing entity) is **not** followable yet.
**Why:** `League` has `slug` + `isPublic` + a public page, and `LeagueTeam` has a
public page whose visibility inherits from the parent league — both have a real
public surface and a reusable visibility gate (`assertLeagueVisible`). Standalone
`Team` has no `slug`, no `isPublic`, and no public route, so following it would
mean inventing a public surface and a visibility model from scratch — a separate,
larger project (mirrors the already-deferred "standalone team-player claiming").
User confirmed "Leagues + League Teams".

### DL2 — Enum value is `'leagueTeam'`, not `'team'`

**Decision:** The new `targetType` values are `'league'` and `'leagueTeam'`.
**Why:** The standalone `Team` model exists in the same codebase and is a distinct
future followable concept; a bare `'team'` would be ambiguous about which model it
points to and force an awkward rename later. `'leagueTeam'` matches the existing
model/vocabulary (`LeagueTeam`, `findLeagueTeamById`, `leagueTeamSchema`) exactly,
so there's no translation layer between the follow target type and the model.

### DL3 — No self-follow block for leagues/teams

**Decision:** The self-follow guard stays user-type-only. An owner following their
own league or league team is allowed.
**Why:** Self-following your own **user account** is identity-inflation shaped and
is blocked (v1 D6-adjacent). Following your own league/team is a normal, useful
pattern (keeping it in your own Following list) with no analogous abuse vector.

### DL4 — Type-aware dispatch map, not parallel per-type functions

**Decision:** Generalize `followUser`/`unfollowUser`/`listFollowing`/
`getFollowStatuses` into type-generic functions backed by a `TARGET_HANDLERS`
dispatch map (`validateId`/`assertFollowable`/`hydrateMany` per type), rather than
adding `followLeague`/`followLeagueTeam`/… parallel functions.
**Why:** The follow/unfollow paths differ only in target validation and return
shape; `listFollowing`'s hydration is the only genuinely per-type logic. A map
keeps the controller/route surface flat (one generic `:targetType` param), keeps
`listFollowing` a single loop, and makes a future 4th type a one-entry change.
Keep thin `followUser`/`unfollowUser` back-compat wrappers.

### DL5 — Generic routes + back-compat alias

**Decision:** New `POST/DELETE /follows/:targetType/:targetId`. Keep the old
`/follows/users/:userId` path as a thin alias (sets `targetType='user'`) during
rollout; remove in a later cleanup PR once confirmed unused.
**Why:** The generic path is what makes the dispatch map pay off end-to-end.
Keeping the literal old path avoids a breaking change for any cached client bundle
mid-rollout.

### DL6 — Per-type pagination, sectioned Following page

**Decision:** `GET /follows/following` paginates per `targetType`; the client
fires three parallel `useFollowing(type)` queries and renders three sections
(Players / Leagues / Teams).
**Why:** The unique index and cursor pagination are defined per
`(followerUserId, targetType, targetId)`; merging types into one cursor page would
break stable ordering across heterogeneous `_id` distributions. Sectioning also
matches the genuinely different card content per type and reads cleaner than a
polymorphic card. User confirmed "sectioned by type".

### DL7 — Reuse `assertLeagueVisible`; degrade profileHref server-side (D8)

**Decision:** Both follow-creation and list-hydration for league/leagueTeam gate
visibility by calling `assertLeagueVisible` (for leagueTeam, on the parent via
`leagueId`), never a hand-rolled `isPublic` check. On hydration, a now-invisible
target has `profileHref` (and slug) nulled **server-side**.
**Why:** Enforces `PROJECT-KNOWLEDGE.md` §4 and the v1 D8 lesson directly — a
prior bug (`assertFeedPostingAllowed`) came from reimplementing an affiliation
check inline, and D8 established that private-target linkage must be withheld
server-side, not merely hidden client-side.

## Assumptions

- **AL1:** `leagueTeam` visibility is entirely inherited from the parent league;
  `leagueTeamSchema` has no `isPublic` field (confirmed). If that ever changes, a
  dedicated `assertLeagueTeamVisible` helper belongs in `leagues.service.js`, not
  `follows.service.js` (see Open Questions QL2).
- **AL2:** Only `followsApi.js` consumes `GET /follows/status` today — re-grep
  before landing the `userIds`→`targetIds` rename.
- **AL3:** No cascade on league/team deletion (v1 A3 pattern) — hydration tolerates
  missing targets by skipping/nulling; orphan rows are harmless.
- **AL4:** No follow cap per user (v1 A2).

## Found during the pre-merge security review (2026-07-12)

The whole-diff security review confirmed the gating model on all points (private
league/team follow → 404 via `assertLeagueVisible`; hydration nulls
`profileHref`+slugs server-side for now-private targets; unfollow never
re-checks visibility; auth/follower-identity correct; route params validated;
enum widening safe). **No actionable security findings.**

### Runtime bug found via live-DB verification (found + fixed 2026-07-12)

**Bug:** every league/leagueTeam follow returned a 500
(`assertLeagueVisible is not a function`). Root cause: `assertLeagueVisible` was
**defined** in `leagues.service.js` but never added to its `module.exports`
(only `assembleLeagueProfilesForUser` was). The follows module imported it and
got `undefined`. **Why the test suite missed it:** `follows.service.test.js`
mocks `leagues.service`, so the mock supplied a fake `assertLeagueVisible` and
every mocked path passed; the module-load smoke check imported the symbol but
never _called_ it. **Fix:** export `assertLeagueVisible` (one line).
**Regression guard added:** `server/src/tests/unit/follows.dependency-contract.test.js`
requires the REAL `leagues.service`/`leagues.repository` (unmocked) and asserts
the exact symbols the follows module imports exist as functions — verified to
fail without the export and pass with it. Lesson: when a service imports another
service's helper, a mocked unit test cannot verify the export exists; a small
unmocked dependency-contract test is the cheap guard. This surfaced during the
live `pnpm dev` verification the plan flagged as still-needed (DEP-2b).

One **non-security perf note** (accepted, not fixed): each following-list
hydration re-checks visibility with `assertLeagueVisible`, which re-fetches
league docs already loaded by `listLeaguesByIds` in the same call. This is a
bounded, per-page redundant read (not a true N+1), and reusing the canonical
helper is a deliberate correctness choice over hand-rolling the check (DL7 /
PROJECT-KNOWLEDGE §4). Revisit only if follow-list pages grow large — e.g. by
denormalizing a cached visibility flag, per the v1 `hasPublicProfile` risk note.

## Open questions (non-blocking)

- **QL1:** Merged, reverse-chronological "everything you follow" feed instead of
  sections? Deferred — needs a harder cross-type cursor design (DL6). Raise before
  Phase 2 UI if it becomes a hard product requirement.
- **QL2:** When (if ever) do league teams need visibility independent of the
  parent league? Not needed now; would add `assertLeagueTeamVisible` in
  `leagues.service.js`.
- **QL3:** Public follower/following counts per type — deferred (v1 D4 / Q3),
  likely alongside the personalized feed / notifications work.
