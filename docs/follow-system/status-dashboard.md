# Follow System — Status Dashboard

> **Living document.** High-level snapshot. Task detail in
> [`implementation-tracker.md`](./implementation-tracker.md).

**Last updated:** 2026-07-11 · **Branch:** `feature/follow-system`

## Overall progress

| Phase                     | Status         | Progress |
| ------------------------- | -------------- | -------- |
| Phase 0 — Docs scaffold   | ✅ Complete    | 100%     |
| Phase 1 — Backend + API   | ✅ Complete    | 100%     |
| Phase 2 — Frontend        | ✅ Complete    | 100%     |
| Phase 3 — Verify & polish | ✅ Complete    | 100%     |
| Phase 4 — Ship & doc-sync | 🟡 In Progress | 60%      |

**Overall:** ~90% — feature is code-complete, tested, and verified end-to-end.
Remaining: merge feature → dev → main and post-deploy verification.

## Current phase

**Phase 4 — Ship & doc-sync.** Code complete on `feature/follow-system`;
PROJECT-KNOWLEDGE updates applied. Awaiting merge to `dev`/`main`.

## Completed work

- Full `docs/follow-system/` planning set.
- Backend `follows` module: `Follow` collection (polymorphic-ready, 2 indexes),
  service (idempotent follow/unfollow, self-follow 400, list hydration,
  `hasPublicProfile`, batch status), controller, routes, validation; mounted at
  `/api/v1/follows`.
- Server tests: 24 new (integration + unit); full suite **388/388** green.
- Frontend `follows` feature: `followsApi`, `useFollowing`, `useFollowStatus`,
  `FollowButton` (auth-gated, "Log in to follow" CTA, optimistic toggle),
  `FollowingPage` (DarkPageHeader + scoreboard shell). Route `/following`
  (protected), persistent nav link (desktop + mobile), FollowButton attached to
  `/players/:userId` and player discovery.
- Client tests: 9 new (FollowButton + FollowingPage) green; existing
  DiscoverablePlayers/PublicUserProfilePage tests updated + green.
- End-to-end verified vs the live dev server: follow → status → hydrated list →
  unfollow, idempotency, self-follow 400.
- Pre-PR gate: check-env ✓, lint ✓, build ✓.
- PROJECT-KNOWLEDGE.md updated (§1, §3, §5, §11) per the proposed-updates note.

## Work in progress

- Deployment: merge `feature/follow-system` → `dev` → `main` (DEP-2..4).

## Remaining tasks

- Open PR / merge to `dev`, then `dev` → `main` (manual deploy).
- Post-deploy smoke check (the unique + listing indexes auto-build on model
  registration; no migration).

## Known blockers

- None.

## Risks

| Risk                                                      | Likelihood               | Impact | Mitigation                                                             |
| --------------------------------------------------------- | ------------------------ | ------ | ---------------------------------------------------------------------- |
| `hasPublicProfile` per-user check gets expensive at scale | Low (tiny dataset today) | Medium | Batched; denormalize a cached flag/count if lists grow                 |
| Client suite has 19 pre-existing failures (OPT-026)       | N/A (pre-existing)       | Low    | Unrelated to follows; identical set on `dev`, none in follow files     |
| Account deletion leaves orphan follow rows                | Low                      | Low    | List hydration skips missing users via `findUsersByIds`; cascade later |

## Upcoming milestones

1. **M1 — Backend + API** ✅ (server tests green).
2. **M2 — Frontend** ✅ (Following page + follow buttons; client tests green).
3. **M3 — Verify** ✅ (pre-PR gate green, end-to-end verified).
4. **M4 — Ship** 🟡 (merge to main; PROJECT-KNOWLEDGE updated — done ahead of merge).
