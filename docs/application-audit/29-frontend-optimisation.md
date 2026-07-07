# Frontend Optimisation

> Part of the [Application Audit](./README.md) · July 2026

Stack: React 18 + Vite SPA, react-router 6, Tailwind, recharts, Context-only
state, hand-rolled fetch. ~27.5k lines under `client/src`.

## 1. Code splitting (biggest bundle win, low risk)

Today `client/src/app/router/AppRouter.jsx:1-41` statically imports all ~40
pages; zero `React.lazy` exists; `vite.config.js` has no `manualChunks`.
Everything — including `GameTrackPage.jsx` (3,088 lines) and recharts
(~400KB, imported by `GameStatsCharts.jsx` / `ScoringTimelineChart.jsx`,
reachable from GameDetailPage) — ships to every visitor of the feed.

- `React.lazy` + `Suspense` per route. Highest-value boundaries:
  `GameTrackPage`, `GameDetailPage` (pulls recharts), `AdminLeaguePage`,
  `PricingPage` (stripe-js), `FeedComposer` (modal-only, 490 lines).
- Lazy-import the two chart components inside the recap panel so recharts
  loads only when a recap renders.
- `build.rollupOptions.manualChunks` for `recharts` and `posthog-js`;
  lazy-init PostHog after first paint (`AppProviders.jsx:6` currently inits at
  module load).
- Delete `DashboardPage.jsx` (385 lines) — dead duplicate of `AdminPage.jsx`.

Expected: initial JS for the default `/pulse` route drops by well over half.

## 2. React Query adoption (kills refetch storms and waterfalls)

No data cache exists; the API modules map 1:1 onto query keys, and mutations
already return full authoritative payloads — ideal React Query conditions.

| Key                               | Replaces                                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| `['auth','me']` staleTime 5m      | per-load `/auth/me`                                                         |
| `['publicLeague', slug]`          | 3 public league pages each refetching `getPublicBySlug`                     |
| `['league', id]`                  | AdminLeaguePage + AdminLeagueTeamPage + AdminNewLeagueGamePage refetches    |
| `['game', id]`                    | GameDetailPage + GameTrackPage share; mutations do `setQueryData(response)` |
| `['teams']/['games']/['leagues']` | AdminPage triple fetch                                                      |
| `useInfiniteQuery(['feed'])`      | manual cursor state in FeedPage                                             |

Also fixes: AdminLeaguePage's refetch-whole-league-after-every-mutation
(`:208, :293`) becomes targeted cache updates; the managers waterfall
(`:160-166`) becomes a parallel dependent query; request deduplication comes
free.

## 3. Hot-component rendering

**GameTrackPage.jsx** (3,088 lines, ~25 useState, ~1,700 JSX lines re-rendered
per state change):

- Split into memoised children: CourtPanel, BoxScorePanel, EventLog,
  VideoPanel; `useCallback` handlers.
- Memoise `onCourtPlayers`/`benchPlayers` (`:516-518` currently recompute per
  render); existing useMemos (`:486-546`) are good.
- Event recording is one POST per tap with an in-flight chain (`:571-597,
727-812`) — after the server's slim-delta change
  ([23-api-audit](./23-api-audit.md) #4), apply optimistic score/box updates.
- Flatten the load waterfall (`:411-474`): server should include the fallback
  roster in `GET /games/:id`.

**Feed** (`FeedList.jsx:37-101`):

- Window the list (keep ±2 slides mounted on mobile snap feed; virtualise
  desktop) — unmounts off-screen `<video>` elements, fixing DOM/memory growth.
- Throttle the mobile onScroll near-end check (`:72-79`) or use the existing
  IntersectionObserver pattern for both modes.
- `React.memo` post cards + `useCallback` for `onDelete`/`onNearEnd`
  (currently new per render, defeating memoisation).
- Pass an explicit `limit` to `listFeed`; cap retained posts.

**GameDetailPage.jsx** (1,127 lines): canvas share-card data-URL generated in
an effect on every data change (`:413+`) — generate on demand (share click) or
in an idle callback.

## 4. Media

Covered in [26-cloudinary-optimisation](./26-cloudinary-optimisation.md):
shared `<CloudinaryImage>` with `f_auto/q_auto`, srcset, `loading="lazy"`,
explicit dimensions (64 raw `<img>`, 3 lazy today); `preload="metadata"` on
feed videos.

## 5. Lists & pagination

- `gamesApi.list()`, `teamsApi.list()`, `leaguesApi.list()`, public lists —
  unpaginated full fetches (`GamesListPage.jsx:47`, `AdminPage.jsx:154`,
  `HomePage.jsx:57`). Consume server pagination once added
  ([23-api-audit](./23-api-audit.md) #9).
- AdminLeaguePage requests tab: replace per-team `getTeam` fan-out
  (`:172-204`) with one aggregate endpoint.
- Virtualise long event timelines (tracker event log, GameDetail timeline).

## 6. Misc

- `apiClient.js` parses `response.json()` before ok-check on every response —
  harmless but sloppy; XHR upload path should join the 401-refresh flow.
- Client recomputes server-derivable data (career totals
  `PublicPlayerPage.jsx:138-152`, upcoming/recent splits
  `PublicTeamPage.jsx:130-143`) — return from server once stats are
  materialised.
- Route prefetching: after code-splitting, prefetch the tracker chunk from the
  game detail page (`onMouseEnter`/visible link) to hide the lazy-load cost.
- Skeleton states exist in places; standardise with React Query `isLoading`.

## Sequencing

1. Code splitting + manualChunks + delete DashboardPage (1–2 days, zero
   behaviour change).
2. Image component + lazy loading (1 day).
3. React Query provider + migrate league/game/feed queries (incremental,
   page-by-page).
4. GameTrackPage split + memoisation (larger; do alongside the slim-delta API
   change).
5. Feed windowing.
