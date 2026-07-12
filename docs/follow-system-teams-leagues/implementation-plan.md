# Follow System v1.5 — Implementation Plan

> Phased roadmap. Task-level checklists in
> [`implementation-tracker.md`](./implementation-tracker.md); high-level progress
> in [`status-dashboard.md`](./status-dashboard.md). Design in
> [`architecture.md`](./architecture.md); decisions in [`decisions.md`](./decisions.md).

## Overview

Extend the users-only Follow System to also target `league` and `leagueTeam`,
branched on `feature/follow-teams-leagues` (off `dev`). No env flag required
(additive, low-risk). No data migration (additive `targetType` enum widen).

## Phase 0 — Documentation scaffold

Create the `docs/follow-system-teams-leagues/` set (this file included) and record
the DL1–DL7 decisions. Tracker + dashboard go live and are updated as work
progresses.

**Exit criteria:** docs scaffold committed, decisions recorded, no code touched.

## Phase 1 — Backend + API

1. Schema: widen `targetType` enum to `['user','league','leagueTeam']`
   (`follows.repository.js`); update the breaking enum assertion in
   `follows.repository.schema.test.js`.
2. Repository: confirm `targetType` plumbing already supports the new types
   (no change expected).
3. Service: `TARGET_HANDLERS` dispatch map; `followTarget`/`unfollowTarget`;
   generalized `listFollowing`/`getFollowStatuses`; per-type `assertFollowable`
   (reusing `assertLeagueVisible`) and `hydrateMany` (batched, no N+1); keep
   `followUser`/`unfollowUser` back-compat wrappers.
4. Validation: `targetTypeSchema`; add optional `targetType` to
   `followingQuerySchema`; rename `userIds`→`targetIds` in `followStatusQuerySchema`.
5. Controller: read `{targetType,targetId}` from params; pass `targetType` to
   list/status.
6. Routes: generic `POST/DELETE /:targetType/:targetId` + back-compat
   `/users/:userId` alias.
7. Run the `api-contract-changes` checklist (query-param rename + response shape).
8. Server tests: parametrize service/integration suites via `describe.each`; add
   D8 gating tests (private-league 404, member success, hydrate degradation).

**Exit criteria:** `pnpm --filter server test` green; curl checks of
`POST /follows/league/:id`, `POST /follows/leagueTeam/:id`, and both private-league
gating cases return correct status codes.

## Phase 2 — Frontend

1. `api/followsApi.js` — type-aware methods.
2. `hooks/useFollowStatus.js`, `hooks/useFollowing.js` — `targetType`-aware keys.
3. `components/FollowButton.jsx` — `targetType` prop (default `'user'`) + generic
   `targetId`; user-only `isOwnAccount` guard.
4. `pages/FollowingPage.jsx` — three sections + `FollowingLeagueCard` /
   `FollowingLeagueTeamCard`.
5. Attach `FollowButton` to `PublicLeaguePage.jsx` and `PublicLeagueTeamPage.jsx`.
6. Client tests: extend `FollowButton.test.jsx` (league/leagueTeam), rewrite
   `FollowingPage.test.jsx` for the sectioned layout.

**Exit criteria:** `pnpm --filter client test` green; in `pnpm dev`, follow a
public league + league team → they appear in `/following` sections; existing user
follow flows unaffected; anonymous visitor sees "Log in to follow".

## Phase 3 — Verify & polish

1. `/security-review` (touches visibility gating).
2. Manual D8 verification against a real private-league fixture (member vs
   non-member 404s; `profileHref` nulling after a followed league goes private).
3. `grep -rn "followUser\|unfollowUser\|USER_TARGET\|follows/status" server/src client/src`
   for stale imports / old param usage.
4. Full pre-PR gate: `pnpm check-env && pnpm lint && pnpm test && pnpm build`.

## Phase 4 — Ship & doc-sync

1. Flip tracker + dashboard to Complete.
2. Open PR `feature/follow-teams-leagues` → `dev` → `main` (normal flow).
3. Apply PROJECT-KNOWLEDGE updates (§1 follow bullet, §5 `Follow` row, §11
   follow-system entry) after ship.
4. Ticket removal of the `/follows/users/:userId` alias (non-blocking).

## Dependencies between phases

- Phase 2 depends on Phase 1 (API must exist).
- Phase 3 depends on Phases 1 & 2.
- Phase 4 depends on Phase 3 passing.
