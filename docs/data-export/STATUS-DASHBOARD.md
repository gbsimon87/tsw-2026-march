# CSV Data Export — Status Dashboard

**Feature:** CSV export from MySporty + Admin (league / team).
**Branch:** `feature/csv-data-export`
**Overall:** ✅ v1 + follow-ups complete — all phases built, verification gate green.

```
Progress  ██████████████████████  100%  (16 / 16 build tasks)
```

Follow-ups delivered 2026-07-12: per-game "Game Logs" export (`?dataset=gamelogs`),
season-filtered games, and removal of the dead `recapCardImage.js`. Only remaining
follow-up is the Tier 2 PDF report (separate initiative).

## Phases

| Phase                | Scope                                                                                               | Status |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| 1. Server util       | `csv.js` serializer + `sendCsv` attachment helper                                                   | ✅     |
| 2. Endpoints         | `export` module (routes/controller/service/validation) + `/export` mount + assert-gate exports      | ✅     |
| 3. Client plumbing   | `apiClient.getBlob`, `downloadFile.js`                                                              | ✅     |
| 4. Client feature/UI | `exportApi`, `useExportCsv`, `ExportCsvButton`; wired into MySporty + AdminLeague + AdminLeagueTeam | ✅     |
| 5. Cleanup           | Removed redundant GameDetail Share/Download image buttons; kept "Share as image"                    | ✅     |
| 6. Docs              | README, tracker, dashboard                                                                          | ✅     |

## Verification gate

| Check                       | Result                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check-env`            | ✅ Environment files are valid                                                                                                                                    |
| `pnpm lint`                 | ✅ client + server clean                                                                                                                                          |
| `pnpm --filter server test` | ✅ 439 passed / 439 (42 suites)                                                                                                                                   |
| `pnpm --filter client test` | ✅ no new failures — 19 pre-existing failures unchanged from base (GameTrackPage, GameDetailPage, CardPosts snapshot; all JSDOM/snapshot, unrelated to this work) |
| new tests added             | ✅ server: `csv.test.js` (6) + `export.test.js` (13, incl. game-logs); client: `downloadFile` (1) + `useExportCsv` (2) + `ExportCsvButton` (4)                    |
| `pnpm build`                | ✅ client + server built                                                                                                                                          |

## Test counts (this feature)

- **Server:** 17 new tests (6 unit CSV + 11 integration route/auth/dataset).
- **Client:** 7 new tests (button states, dataset selection, hook success/error, blob download).

## Blockers / notes

- None blocking. The 19 pre-existing client test failures exist on `main` too and are
  out of scope for this feature.
- Only remaining follow-up (see [IMPLEMENTATION-TRACKER.md](./IMPLEMENTATION-TRACKER.md)):
  the Tier 2 PDF post-game report — a separate initiative.
