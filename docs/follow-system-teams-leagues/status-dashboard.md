# Follow System v1.5 — Status Dashboard

> **Living document.** High-level snapshot. Task detail in
> [`implementation-tracker.md`](./implementation-tracker.md).

**Last updated:** 2026-07-12 · **Branch:** `feature/follow-teams-leagues`

## Overall progress

| Phase                     | Status         | Progress |
| ------------------------- | -------------- | -------- |
| Phase 0 — Docs scaffold   | ✅ Complete    | 100%     |
| Phase 1 — Backend + API   | ⬜ Not Started | 0%       |
| Phase 2 — Frontend        | ⬜ Not Started | 0%       |
| Phase 3 — Verify & polish | ⬜ Not Started | 0%       |
| Phase 4 — Ship & doc-sync | ⬜ Not Started | 0%       |

**Overall:** ~15% — planning + docs scaffold complete; implementation not yet started.

## Current phase

**Phase 0 → Phase 1.** Docs scaffold committed. Next: widen the `Follow.targetType`
enum and build the service-layer dispatch map.

## Completed work

- Full `docs/follow-system-teams-leagues/` planning set (README, architecture,
  decisions DL1–DL7, plan, tracker, dashboard).
- Scope + design confirmed with the user: leagues + league teams only; sectioned
  Following page.

## Work in progress

- None yet (Phase 1 about to start).

## Remaining tasks

- Phase 1: schema enum widen, dispatch-map service refactor, generic routes,
  validation, server tests.
- Phase 2: type-aware client (`FollowButton`/api/hooks), sectioned FollowingPage,
  new mounts on public league + league-team pages.
- Phase 3: security review, D8 gating verification, pre-PR gate.
- Phase 4: PR + PROJECT-KNOWLEDGE sync.

## Known blockers

- None.

## Risks

| Risk                                                          | Likelihood               | Impact | Mitigation                                                       |
| ------------------------------------------------------------- | ------------------------ | ------ | ---------------------------------------------------------------- |
| A hand-rolled `isPublic` check slips in instead of the helper | Low                      | High   | DL7 + a test asserting the gate calls `assertLeagueVisible`      |
| `userIds`→`targetIds` rename breaks a stray client caller     | Low                      | Medium | Re-grep before landing; only `followsApi.js` known to consume it |
| Per-entry re-visibility check gets expensive at scale         | Low (tiny dataset today) | Low    | Batched league fetch; denormalize a cached flag later if needed  |

## Upcoming milestones

1. **M1 — Backend + API** ⬜ (server tests green, gating verified via curl).
2. **M2 — Frontend** ⬜ (sectioned Following page + league/team follow buttons).
3. **M3 — Verify** ⬜ (security review + pre-PR gate green).
4. **M4 — Ship** ⬜ (merge + PROJECT-KNOWLEDGE sync).
