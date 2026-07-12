# 000 — Performance Investigation Tracker

> Living tracker for the Pulse slow-load initiative. Update after every task,
> same rules as `docs/application-audit/000-OPTIMISATION-TRACKER.md`.
> Findings: [`001-INVESTIGATION.md`](./001-INVESTIGATION.md).
> Plan detail: [`002-IMPROVEMENT-PLAN.md`](./002-IMPROVEMENT-PLAN.md).

## 📊 Executive dashboard (2026-07-12, updated same day)

- **Investigation completion**: ~95% — root cause attributed and **confirmed**:
  PERF-001 resolved (user upgraded the Render prod plan; loads reported
  "much much faster"). U2/U3 telemetry checks now moot for the acute issue.
- **Implementation completion**: 5/10 — PERF-001 (infra, by user) +
  PERF-002/003/004/005 shipped on this branch; server suite 421/421, lint
  clean, client build clean, feed smoke-tested live (72–163 ms local).
- **Root cause**: infrastructure — **prod API is on Render's free plan**
  (`render.yaml:4`) → spin-down + 10–50 s cold boot; amplified by Atlas M0
  (shared with dev) and a self-healing game_card snapshot N+1 on first read.
- **Remaining critical issues**: none — PERF-001 resolved (2026-07-12:
  both `tsw-2026-march-api-prod` and `tsw-2026-march-client-prod` confirmed
  on Starter plans). ⚠️ `render.yaml:4` still says `plan: free` and is
  policy-locked against automated edits (see `docs/security.md`) — change it
  to `plan: starter` **by hand** so a future blueprint sync can't silently
  downgrade the API. (Static sites take no `plan` key, so the client block
  needs no change.)
- **High-risk items**: PERF-006 (prod DB migration — backup + dry-run
  playbook required).
- **Blockers**: PERF-008 needs a product decision on enabling prod analytics.
- **Next recommended action**: PERF-006 (move prod DB off the shared free
  Atlas cluster) — the last infra-tier item; then PERF-008 (telemetry) to
  measure everything shipped so far. PERF-007/009/010 are scaling-cliff work,
  not current pain.

## Status board

| ID       | Task                                             | Priority | Effort | Status               | Owner | Completed  | Notes                                                                                                                                                                            |
| -------- | ------------------------------------------------ | -------- | ------ | -------------------- | ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-001 | Render prod plan: verify → upgrade or keep-alive | Critical | XS     | **Done**             | user  | 2026-07-12 | Prod upgraded to a paid instance; loads confirmed much faster                                                                                                                    |
| PERF-002 | Persist game_card `cardSnapshot` at creation     | High     | S      | **Done**             | AI    | 2026-07-12 | `tryBuildGameCardSnapshot` in both manual + auto paths; 3 new unit tests incl. key-set assert (TSW-004 lesson) and resolve-failure fallback                                      |
| PERF-003 | Parallelize feed hydration loop (bounded)        | High     | XS     | **Done**             | AI    | 2026-07-12 | Worker-pool of 5 in `listFeedPosts`, order + cursor semantics preserved                                                                                                          |
| PERF-004 | `.lean()` + events projection on feed reads      | Medium   | S      | **Done** (lean half) | AI    | 2026-07-12 | `.lean()` on `listPosts` + `findUsersByIds` (both callers read-only). Events projection in the card fallback deliberately skipped — PERF-002 removes almost all fallback traffic |
| PERF-005 | Non-blocking Google Fonts                        | Medium   | XS     | **Done**             | AI    | 2026-07-12 | `media="print"`+onload swap with noscript fallback; self-hosting still an option later                                                                                           |
| PERF-006 | Prod DB off shared M0 cluster (Flex tier)        | High     | M      | Not started          | —     | —          | After PERF-001; mongodump backup first                                                                                                                                           |
| PERF-007 | Bound discoverable/shareable fan-out ($in batch) | Medium   | M      | Not started          | —     | —          | Scaling cliff, not current pain                                                                                                                                                  |
| PERF-008 | Real-user perf telemetry (PostHog or pino p95)   | Medium   | S      | Not started          | —     | —          | Needs analytics decision                                                                                                                                                         |
| PERF-009 | Feed list virtualization                         | Low      | M      | Not started          | —     | —          | Coordinate with OPT-021                                                                                                                                                          |
| PERF-010 | Feed payload slimming (107 kB/20 posts)          | Low      | S      | Not started          | —     | —          | Only after PERF-008 data                                                                                                                                                         |

## Open investigation unknowns

| #   | Unknown                                 | How to resolve                                  |
| --- | --------------------------------------- | ----------------------------------------------- |
| U1  | Actual Render dashboard plan (prod API) | Render dashboard → service → plan               |
| U2  | True cold-start duration                | curl prod `/health` after verified >15 min idle |
| U3  | Atlas M0 pause/throttle telemetry       | Atlas UI → cluster Metrics                      |
| U4  | Real-user frequency of the cold path    | PERF-008                                        |

## Decisions log

- 2026-07-12 — Investigation ran read-only (no code/index/config changes),
  per plan. Branch `chore/performance-investigation`.
- 2026-07-12 — No new indexes proposed: feed query is `_id`-covered; the 5
  open candidates remain with OPT-007's `$indexStats` observation.
- 2026-07-12 — Redis/caching stays deferred; nothing measured justifies it.
