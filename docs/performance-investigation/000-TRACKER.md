# 000 — Performance Investigation Tracker

> Living tracker for the Pulse slow-load initiative. Update after every task,
> same rules as `docs/application-audit/000-OPTIMISATION-TRACKER.md`.
> Findings: [`001-INVESTIGATION.md`](./001-INVESTIGATION.md).
> Plan detail: [`002-IMPROVEMENT-PLAN.md`](./002-IMPROVEMENT-PLAN.md).

## 📊 Executive dashboard (2026-07-12)

- **Investigation completion**: ~90% — root cause attributed with evidence;
  4 unknowns remain (all external checks, no code reading left).
- **Implementation completion**: 0% — no fixes shipped yet (investigation
  was deliberately read-only).
- **Root cause**: infrastructure — **prod API is on Render's free plan**
  (`render.yaml:4`) → spin-down + 10–50 s cold boot; amplified by Atlas M0
  (shared with dev) and a self-healing game_card snapshot N+1 on first read.
- **Remaining critical issues**: 1 (PERF-001 — Render plan).
- **High-risk items**: PERF-006 (prod DB migration — backup + dry-run
  playbook required).
- **Blockers**: PERF-001 needs the Render **dashboard** checked (blueprint
  may not reflect actual plan); PERF-008 needs a product decision on
  enabling prod analytics.
- **Next recommended action**: check the Render dashboard plan for
  `tsw-2026-march-api-prod`; if free, upgrade to Starter (or add an uptime
  ping as a stopgap). Then ship PERF-002+003 together as one small PR.

## Status board

| ID       | Task                                             | Priority | Effort | Status      | Owner | Completed | Notes                                                            |
| -------- | ------------------------------------------------ | -------- | ------ | ----------- | ----- | --------- | ---------------------------------------------------------------- |
| PERF-001 | Render prod plan: verify → upgrade or keep-alive | Critical | XS     | Not started | —     | —         | Dashboard check first; `render.yaml:4` says `free`               |
| PERF-002 | Persist game_card `cardSnapshot` at creation     | High     | S      | Not started | —     | —         | Both manual + auto paths; key-set snapshot test (TSW-004 lesson) |
| PERF-003 | Parallelize feed hydration loop (bounded)        | High     | XS     | Not started | —     | —         | Bound ≤5, pool is 10                                             |
| PERF-004 | `.lean()` + events projection on feed reads      | Medium   | S      | Not started | —     | —         | Verify sanitizers don't need Mongoose docs                       |
| PERF-005 | Non-blocking Google Fonts                        | Medium   | XS     | Not started | —     | —         | Self-host preferred                                              |
| PERF-006 | Prod DB off shared M0 cluster (Flex tier)        | High     | M      | Not started | —     | —         | After PERF-001; mongodump backup first                           |
| PERF-007 | Bound discoverable/shareable fan-out ($in batch) | Medium   | M      | Not started | —     | —         | Scaling cliff, not current pain                                  |
| PERF-008 | Real-user perf telemetry (PostHog or pino p95)   | Medium   | S      | Not started | —     | —         | Needs analytics decision                                         |
| PERF-009 | Feed list virtualization                         | Low      | M      | Not started | —     | —         | Coordinate with OPT-021                                          |
| PERF-010 | Feed payload slimming (107 kB/20 posts)          | Low      | S      | Not started | —     | —         | Only after PERF-008 data                                         |

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
