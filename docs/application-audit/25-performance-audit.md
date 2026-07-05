# Performance Audit

> Part of the [Application Audit](./README.md) · July 2026

Consolidated, prioritised findings across server and client. Effort/impact
scoring and sequencing live in [30-optimisation-roadmap](./30-optimisation-roadmap.md).

## Priority 1 — scales with data volume (server CPU/IO)

| #    | Finding                                                                                                                                         | Evidence                                                   | Impact                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1.1 | **Read-time recomputation of standings/player stats/leaderboards** from raw events; leaders endpoint is O(teams×games×events×roster) and public | `leagues.service.js:1713-1785, 1647-1703, 1981-2089`       | League pages get linearly slower every game tracked; cheapest DoS surface |
| P1.2 | **Full-collection game scans on public endpoints** (explore, public teams, opponents, shareable search per keystroke)                           | `teams.service.js:544-661`, `feed.service.js:500-562`      | O(total games in system) per request                                      |
| P1.3 | **Event-append hot path**: full doc load + full save + ~7–10 event-array passes + full detail response, per tracked stat                        | `games.service.js:1184-1198, 1212-1392`                    | Tracking latency grows with game length; save races between co-trackers   |
| P1.4 | **Redundant loads inside one request**: games 2–3×, teams 3× per league page; game fetched 2× on public detail                                  | `leagues.service.js:507-716`, `games.service.js:1160-1167` | Multiplies P1.1                                                           |
| P1.5 | **Feed hydration N+1**, sequential                                                                                                              | `feed.service.js:301-311`                                  | 40–80+ queries per page                                                   |

## Priority 2 — user-perceived latency

| #    | Finding                                                                                                                                                          | Evidence                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P2.1 | **No code splitting**: ~40 routes, 3,088-line tracker, recharts (~400KB) all in one bundle; stock Vite config                                                    | `client/src/app/router/AppRouter.jsx:1-41`, `vite.config.js`              |
| P2.2 | **No client cache**: refetch-on-mount everywhere; same league fetched by 6 different pages; AdminLeaguePage refetches whole league after every mutation          | `apiClient.js`, route table in [29](./29-frontend-optimisation.md)        |
| P2.3 | **Blocking third-party calls in request handlers**: OpenAI ≤8s on finish; synchronous video transcode; inline Resend sends                                       | `games.service.js:1503`, `cloudinary.client.js:61-62`, `email.service.js` |
| P2.4 | **Unoptimised images**: no `f_auto/q_auto`, no srcset, 61/64 `<img>` unlazy, no dimensions (CLS)                                                                 | [26](./26-cloudinary-optimisation.md)                                     |
| P2.5 | **Fetch waterfalls**: tracker getById → conditional teams fetch; AdminLeaguePage league → managers; AuthContext `/auth/me` gates first paint of protected routes | `GameTrackPage.jsx:411-474`, `AdminLeaguePage.jsx:152-166`                |
| P2.6 | Large payloads: full events array + recap + highlights returned on every game read and every event append                                                        | `games.service.js`                                                        |

## Priority 3 — rendering & memory

| #    | Finding                                                                                                                                 | Evidence                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| P3.1 | GameTrackPage: ~25 useState, ~1,700 JSX lines re-render per keystroke; no child memoisation; `onCourtPlayers`/`benchPlayers` unmemoised | `GameTrackPage.jsx:298-546, 1317-3088` |
| P3.2 | Feed: no windowing; all posts + `<video>` elements stay mounted; mobile onScroll handler unthrottled                                    | `FeedList.jsx:37-101`                  |
| P3.3 | GameDetailPage canvas share-card generated in effect on every data change                                                               | `GameDetailPage.jsx:413+`              |
| P3.4 | Unpaginated `.map()` lists (games, standings, rosters)                                                                                  | `GamesListPage.jsx:134` etc.           |
| P3.5 | 100MB video uploads buffered in server RAM                                                                                              | multer memoryStorage                   |
| P3.6 | 23 indexes on `games` incl. a multikey per-event index — write amplification on every append                                            | [19](./19-indexing-strategy.md)        |

## Non-issues (checked, fine)

- Feed keyset pagination design ✅
- No moment/lodash bloat ✅
- bcrypt cost 12, JWT flows — appropriate ✅
- Embedded events model itself (right choice for the access pattern) ✅
- Current dataset is tiny (17 games in dev) — nothing is slow _today_; every
  P1 item is a scaling cliff, not a fire.

## Measurement recommendations

Before/after each fix: pino request-duration logs already exist — add a p95
dashboard per route (PostHog or Render metrics); client `web-vitals` →
PostHog; `pnpm vite build --mode production` bundle-size tracking in CI.
