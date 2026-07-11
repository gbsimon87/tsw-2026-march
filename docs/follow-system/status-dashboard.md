# Follow System — Status Dashboard

> **Living document.** High-level snapshot. Task detail in
> [`implementation-tracker.md`](./implementation-tracker.md).
> Update the "Last updated" line whenever this changes.

**Last updated:** 2026-07-11 · **Branch:** `feature/follow-system`

## Overall progress

| Phase                     | Status         | Progress |
| ------------------------- | -------------- | -------- |
| Phase 0 — Docs scaffold   | ✅ Complete    | 100%     |
| Phase 1 — Backend + API   | ⏳ Not Started | 0%       |
| Phase 2 — Frontend        | ⏳ Not Started | 0%       |
| Phase 3 — Verify & polish | ⏳ Not Started | 0%       |
| Phase 4 — Ship & doc-sync | ⏳ Not Started | 0%       |

**Overall:** ~10% (planning + docs complete; implementation pending).

## Current phase

**Phase 0 → Phase 1.** Documentation set complete; ready to build the backend
`follows` module.

## Completed work

- Requirements gathered and confirmed (scope, schema, privacy, dangling follows).
- Codebase explored (data model, backend conventions, frontend conventions).
- Architecture designed: account-level follows, polymorphic-ready `Follow`
  collection, private following list.
- Full `docs/follow-system/` set authored.

## Work in progress

- None yet (about to start Phase 1: backend module).

## Remaining tasks (high level)

- Backend `follows` module (repository/service/controller/routes/validation) + mount.
- Frontend `follows` feature (API/hooks/FollowButton/FollowingPage) + route + nav
  - attach points.
- Server + client tests.
- Verify, polish, ship, PROJECT-KNOWLEDGE sync.

## Known blockers

- None.

## Risks

| Risk                                                                             | Likelihood               | Impact | Mitigation                                                              |
| -------------------------------------------------------------------------------- | ------------------------ | ------ | ----------------------------------------------------------------------- |
| `hasPublicProfile` per-user check gets expensive at scale                        | Low (tiny dataset today) | Medium | Batch it; denormalize a cached flag/count if lists grow                 |
| Follow button placement conflicts with card `<Link>` wrappers (e.g. ProfileCard) | Low                      | Low    | Attach to page header / discovery card, not the whole-card Link         |
| Account deletion leaves orphan follow rows                                       | Low                      | Low    | v1 tolerates via `findUsersByIds` skip; cascade is a future enhancement |

## Upcoming milestones

1. **M1:** Backend + API complete, server tests green (end of Phase 1).
2. **M2:** Following page + follow buttons working in `pnpm dev`, client tests green (end of Phase 2).
3. **M3:** Pre-PR gate green, end-to-end verified (end of Phase 3).
4. **M4:** Merged to main; PROJECT-KNOWLEDGE updated (end of Phase 4).
