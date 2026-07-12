# Follow System — Implementation Plan

> Phased roadmap. Task-level checklists with status/owner/deps live in
> [`implementation-tracker.md`](./implementation-tracker.md); high-level progress
> in [`status-dashboard.md`](./status-dashboard.md).

## Overview

Ship a users-only, private, polymorphic-ready follow system across four phases,
branched on `feature/follow-system` (off `dev`). No env flag required (additive,
low-risk); an optional `FOLLOW_SYSTEM_ENABLED` flag could gate the nav link if a
staged rollout is later desired.

## Phase 0 — Documentation scaffold ✅

Create the `docs/follow-system/` set (this file included). Tracker + dashboard go
live and are updated as work progresses.

## Phase 1 — Backend + API

Build the `follows` module server-side, mirroring `server/src/modules/teams/`.

1. `follows.repository.js` — inline `Follow` schema + two indexes; data-access
   functions (`createFollow`, `deleteFollow`, `listFollowingByUser`, `findFollow`,
   `countFollowingStatuses`).
2. `follows.validation.js` — Zod schemas (`followStatusQuerySchema`; reuse
   `paginationQuerySchema`).
3. `follows.service.js` — authz + idempotency rules; list hydration via
   `findUsersByIds`; `hasPublicProfile` via `listLeaguePlayersByClaimedUser`.
4. `follows.controller.js` — `requireAuthUserId`, `schema.parse`, JSON shaping.
5. `follows.routes.js` — authed router, `asyncHandler` wraps.
6. Mount in `server/src/routes/index.js`.
7. Server tests (integration + unit) — green.

**Exit criteria:** `pnpm --filter server test` passes; endpoints behave per
[`architecture.md`](./architecture.md) §3.

## Phase 2 — Frontend

Build the `follows` feature client-side.

1. `api/followsApi.js`.
2. `hooks/useFollowing.js`, `hooks/useFollowStatus.js`.
3. `components/FollowButton.jsx` — auth gating, "Log in to follow" CTA, optimistic
   `setQueryData` toggle.
4. `pages/FollowingPage.jsx` — `DarkPageHeader` + scoreboard shell + card grid.
5. Wire route `/following` (protected) in `AppRouter.jsx`; add persistent nav link
   in `AppLayout.jsx` (desktop + mobile).
6. Attach `FollowButton` to `PublicUserProfilePage.jsx` and `DiscoverablePlayers.jsx`.
7. Client tests (Vitest + RTL) — green.

**Exit criteria:** `pnpm --filter client test` passes; follow toggle + Following
page work in `pnpm dev`.

## Phase 3 — Verify & polish

1. End-to-end manual verification (see [`README.md`](./README.md) user stories and
   the plan's verification section): follow from a profile → appears on
   `/following` → one-click back to profile → unfollow.
2. Accessibility pass on `FollowButton` / `FollowingPage` (aria-labels, focus,
   button semantics).
3. Full pre-PR gate: `pnpm check-env && pnpm lint && pnpm test && pnpm build`.

## Phase 4 — Ship & doc-sync

1. Merge `feature/follow-system` → `dev` → `main` (normal flow).
2. Apply [`proposed-project-knowledge-updates.md`](./proposed-project-knowledge-updates.md)
   to `PROJECT-KNOWLEDGE.md` **only after** the feature ships.
3. Flip tracker + dashboard to Complete.

## Dependencies between phases

- Phase 2 depends on Phase 1 (API must exist).
- Phase 3 depends on Phases 1 & 2.
- Phase 4 depends on Phase 3 passing.
