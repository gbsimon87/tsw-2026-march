# 03 — Investigation Report

> Full root-cause findings for TSW-001 through TSW-005, produced 2026-07-07 by
> tracing each issue end-to-end through the codebase (no code changes made
> during investigation). Referenced by
> [`00_IMPLEMENTATION_TRACKER.md`](./00_IMPLEMENTATION_TRACKER.md)'s task
> cards — this is the detailed backing evidence.

---

## TSW-001 — Share to Pulse failure in production

**Reported behavior:** the "Share to Pulse" button in the Game Recap
Highlights panel fails in production. League Admin users should have
permission. The button changes to "Failed to share".

**Full call chain traced:**

1. Button: `client/src/features/games/components/GameRecapPanel.jsx:144` —
   `onClick={() => onShareHighlightClip?.(h.eventId)}`, gated by a
   `canShareHighlights` prop.
2. `canShareHighlights` is computed **server-side** in `getPublicGame()` —
   `server/src/modules/games/games.service.js:1322-1330` — via
   `canAccessGame(viewerUserId, rawGame) || isClaimedPlayerInGameSnapshot(...)`.
3. Handler: `client/src/features/games/pages/GameDetailPage.jsx:791-803`
   `shareHighlightClip()` calls
   `feedApi.createHighlightClipPost({gameId, eventId})` →
   `client/src/features/feed/api/feedApi.js:31-33` →
   `POST /feed/highlight-clip`.
4. Route/controller: `server/src/modules/feed/feed.routes.js:37` →
   `feed.controller.js:55-60` → `assertFeedPostingAllowed(userId)`
   (`billing.service.js:532-542` — checks team ownership / active league
   manager / league team membership; league admins pass via
   `LeagueManager.exists`) → `feed.service.js:726`
   `createHighlightClipPostForUser`.
5. Actual authorization gate: `feed.service.js:700-724`
   `assertCanShareHighlightClip()` calls `canAccessGame(userId, game)`
   (`games.service.js:685-695`), which for league games delegates to
   `canManageLeagueGame` (`leagues.service.js:2189-2206`) — this explicitly
   checks `league.ownerUserId` **and** `findActiveLeagueManager(...)`, i.e.
   league admins **are** covered.

**Finding: no hardcoded `ownerUserId`-only bug found.** `canAccessGame`
checks `game.ownerUserId` first but falls through to `canManageLeagueGame`
for league-context games, so a league admin who isn't the game's
`ownerUserId` should still pass — assuming `game.gameContext === 'league'`
and `game.leagueId` are populated correctly on the game in question.

**Root cause candidates, ranked by confidence:**

1. **(High confidence) Swallowed/generic error masking the real cause.**
   `GameDetailPage.jsx:797-801`:

   ```js
   } catch (err) {
     const msg = err.message?.toLowerCase().includes('already been shared')
       ? 'Already shared'
       : 'Failed to share';
     setClipShareState((s) => ({ ...s, [eventId]: msg }));
   }
   ```

   This discards the actual server `ApiError` message and does **no
   console/telemetry logging** — the true 403/400/404/409 reason is
   invisible from the client. Confirming evidence would be the actual
   response body / `requestId` (set in `apiClient.js:85-86`) for a failed
   `POST /feed/highlight-clip` call in production.

2. **(Medium confidence) Environment-specific data gap.** `feed.service.js:734`
   throws `'This game has no video linked'` if `game.videoUrl` is falsy, and
   `:738-740` throws if `event.videoTimestamp` isn't a number. If production
   games (imported/migrated data) lack `videoUrl` or per-event
   `videoTimestamp` while dev/staging fixtures always have them, the button
   would consistently fail with "Failed to share" for admins regardless of
   role. Worth checking whether the specific reported game(s) have
   `videoUrl` set and events carry `videoTimestamp`.

3. **(Lower confidence) CSRF token timing in production.**
   `client/src/lib/apiClient.js:48-49` only attaches `x-csrf-token` if
   `csrfToken` was already seeded from a cookie read at module load
   (`apiClient.js:3-7`); if production cookie settings (`COOKIE_DOMAIN`,
   `SameSite`) differ from dev such that the `XSRF-TOKEN` cookie isn't
   visible to JS at page load, mutating POSTs could 403 at the CSRF
   middleware layer before ever reaching `feed.controller.js`. This would
   affect **all** feed mutations, not just this button — cross-check whether
   other feed POSTs (image/video/card posts) also fail for the same admin in
   prod to rule this in or out.

**What would confirm the root cause:** capture the actual HTTP response
body/status for the failed `POST /feed/highlight-clip` call in production
(browser devtools Network tab) — the `error.message` and `requestId` field
would immediately reveal which of the above it is. Server-side, grep logs for
that `requestId`.

---

## TSW-002 — Key Moments doesn't scroll on mobile

**Reported behavior:** Highlights scrolls correctly on mobile; Key Moments
does not.

Both live in `client/src/features/games/components/GameRecapPanel.jsx`.

- **Highlights (works):** `GameRecapPanel.jsx:120-170`. Scroll container:
  `<div className="flex gap-3 overflow-x-auto pb-2">` (line 123), children
  `className="flex shrink-0 flex-col"` (line 129) wrapping fixed-width cards
  `className="flex w-64 shrink-0 flex-col overflow-hidden ..."` (line 52).
  This is a true horizontal flex row — `overflow-x-auto` + `shrink-0`
  children with explicit width — natively touch-scrollable.

- **Key Moments (broken):** `GameRecapPanel.jsx:172-214`. This section is
  **not a horizontal scroller at all** — it's a vertical list:
  `<ul className="mt-4 space-y-3">` (line 183) with
  `<li className="flex items-center gap-3 ... px-4 py-3">` (lines 185-187).
  There is no `overflow-x-auto`, no `flex-nowrap`, no fixed-width children,
  no horizontal container whatsoever. The heading area claims "N highlights"
  (line 175), suggesting this was meant to look/behave like the Highlights
  carousel, but the markup shipped as a plain vertical `<ul>` stack.

**Root cause:** Key Moments isn't a horizontal-scroll _regression_ — it was
never built as a horizontal scroller. If the product expectation is "swipe
sideways through key moments like Highlights," the fix is structural: change
the container to `flex gap-3 overflow-x-auto` with `shrink-0` fixed-width
item cards, mirroring lines 122-123 of the same file.

**Reuse potential:**
`client/src/features/feed/hooks/useSnapScrollAutoplay.js` (read in full) is
an `IntersectionObserver`-based video-autoplay hook keyed to
`[data-feed-slide]` elements and a `root` container — it's specific to feed
video autoplay, not general scroll-snap layout, and isn't used by either
Highlights or Key Moments today. Not directly reusable, but the _pattern_ (a
small hook/component that standardizes scroll-container semantics) is
reasonable precedent for extracting a shared `HorizontalScrollRow`
component that both Highlights (`GameRecapPanel.jsx:123`) and a corrected Key
Moments section could consume, to prevent this class of bug recurring.

---

## TSW-003 — Production navigation title

**Reported behavior:** production displays "tsw-2026-march" where it should
display "TSW".

- `client/index.html:7` already hardcodes
  `<title>The Sporty Way</title>` — the static HTML title is correct and
  **not** the problem.
- The leak: `client/src/lib/env.js:4` —
  `VITE_APP_NAME: z.string().default('tsw-2026-march')` — a Zod schema
  default that falls back to the repo/package-name-shaped string if the env
  var isn't supplied.
- This `env.appName` (`env.js:44`) is consumed via
  `import.meta.env.VITE_APP_NAME` in `client/src/pages/AboutPage.jsx:5,11,24,84`
  and `client/src/pages/ContactPage.jsx:23,30` — used as visible page
  copy/title props. `AboutPage.jsx:11` passes it as `title={appName}` into a
  page-header/meta component; `ContactPage.jsx:30` passes it into a
  `description`. If either page's header component wires that `title` prop
  into a document-title setter, the raw fallback string surfaces in the tab
  title.
- **Both env files already set the var correctly**:
  `env/client/.env.development:1` and `env/client/.env.production:2` both set
  `VITE_APP_NAME=THE SPORTY WAY`. So in a normal local dev/prod build sourced
  from these files, the fallback should never fire.
- **The actual trigger:** `render.yaml`'s prod client service declares:
  ```yaml
  envVars:
    - key: VITE_APP_NAME
    - key: VITE_APP_ENV
  ```
  — **no value, no `sync: false`.** Per this project's convention ("secrets
  injected via Render dashboard, never in render.yaml"), this means the var
  is expected to be set manually in the Render dashboard for that service.
  Zod's `.default()` only applies when the key is **completely absent**
  (`undefined`), not when it's an empty string — so if nobody has ever
  manually set `VITE_APP_NAME` in the Render dashboard for the prod client
  service, `import.meta.env.VITE_APP_NAME` is `undefined` at build time, and
  the schema falls through to the bad default.
- Confirmed the correct branding constants already exist elsewhere:
  `client/index.html:7,17,18` and `client/public/site.webmanifest`
  (`"name": "The Sporty Way"`, `"short_name": "TSW"`).

**Recommended fix:** change the Zod default at `env.js:4` from
`'tsw-2026-march'` to `'The Sporty Way'`. This removes the repo-name leak
entirely regardless of whether the Render dashboard var is ever set — a
defense-in-depth fix that doesn't depend on someone remembering to configure
Render correctly. Separately, whoever has Render dashboard access should
also set `VITE_APP_NAME` explicitly for the prod client service, to close the
actual configuration gap (not just paper over it with a better default).

---

## TSW-004 — FullScreen component stat rendering

**Reported behavior:** scores, averages, and statistics render incorrectly
across FullScreenSlide, FullScreenTeamCard, FullScreenPost,
FullScreenImagePost, FullScreenPlayerCard, FullScreenHighlightClipPost.

**Root cause (high confidence) — missing `recap` field in the game-card
snapshot.**

`server/src/modules/feed/feed.service.js:146-161` `buildGameCardSnapshot()`:

```js
function buildGameCardSnapshot(payload) {
  const isDualTeam = payload.game.trackingMode === 'dual_team';
  return {
    gameId: payload.game.id,
    gameUrl: `/games/${payload.game.id}`,
    teamId: payload.team?.id ?? null,
    teamName: isDualTeam ? `...` : (payload.team?.name ?? null),
    teamLogo: isDualTeam ? (...) : (payload.team?.logo ?? null),
    teamColors: payload.team?.colors ?? [],
    opponent: isDualTeam ? null : payload.game.opponent,
  };
}
```

**This never sets a `recap` field at all.** Yet both consumers read
scores/stats exclusively from `gameCard.recap.*`:

- `client/src/features/feed/components/posts/FullScreenGameCard.jsx:19,22,25,28-32`
  — verified directly:
  ```js
  const statusLabel = gameCard?.recap?.statusLabel || 'Final';
  const homePoints = isDualTeam
    ? (gameCard?.recap?.home?.points ?? 0)
    : (gameCard?.recap?.team?.points ?? 0);
  const awayPoints = isDualTeam
    ? (gameCard?.recap?.away?.points ?? 0)
    : (gameCard?.recap?.opponent?.points ?? 0);
  ```
- `client/src/features/feed/components/posts/GameCardPost.jsx` — same
  `gameCard.recap.*` read pattern (`topPerformers`, `teamStats.points`,
  `home.points`, etc. at lines 14,30,33,36,39-40,152-153).

Since `recap` is `undefined` on every persisted snapshot, every point/score/
top-performer field falls back to its `?? 0`/`|| 0` default — shared game
cards display **0-0 (or blank stats)** once a post goes through OPT-017's
cached `cardSnapshot` fast path (`feed.service.js:211-224`,
`resolveGameCardPayload`). This matches "scores render incorrectly" exactly.
The live, non-cached path — `getPublicGame()` (`games.service.js:1297`) —
**does** include `recap` (built via `buildGameRecap`), which is why this only
manifests for cards that have gone through snapshot persistence, not
fresh/live-rendered ones. This explains why the bug wasn't caught earlier: a
freshly-created/never-cached card would render correctly; only a card that's
hit the persisted-snapshot path shows the bug.

**Player/team cards are correctly wired — no bug found there.**
`buildPlayerCardSnapshot` (`feed.service.js:163-186`) and
`buildTeamCardSnapshot` (`feed.service.js:188-203`) both populate
`summary.{pointsPerGame,reboundsPerGame,assistsPerGame}` /
`summary.{points,fg2,fg3,ft}`, and `FullScreenPlayerCard.jsx:28-30` /
`FullScreenTeamCard.jsx:23-26` read exactly those field paths with
`formatAverage`/`formatPercentage` from `cardUtils.js`. No mismatch found.

**Secondary finding — player/team card staleness gap.** The reported
"averages/statistics render incorrectly" for player/team cards is likely
either (a) collateral confusion from the game-card bug above, or (b) genuine
staleness: `refreshGameCardPostsForGame` (`feed.service.js:276-279`) exists
to refresh **game** cards on completion/edit, but **no equivalent trigger
exists for player-card or team-card snapshots** when a player's/team's
underlying stats change after the card was shared — meaning player/team card
snapshots can go permanently stale (shows career stats at time-of-share
forever) unless `refresh: true` is explicitly passed, which nothing currently
triggers for these two card types.

**Duplicated logic found:** `homeName/awayName/homePoints/awayPoints/isWinner`
derivation (isDualTeam branching + winner comparison) is duplicated verbatim
between `GameCardPost.jsx:30-43` and `FullScreenGameCard.jsx:19-32` — a good
candidate to extract into a shared helper (e.g. a `useGameCardDisplay(gameCard)`
hook) once the recap bug itself is fixed. Note: `cardUtils.js`
(`formatAverage`, `formatPercentage`, `buildInitials`, `formatCompactDate`,
`getPlayerFallbackState`) is **already** correctly shared and reused by both
card families — no duplication there.

---

## TSW-005 — FeedComposer league scope

**Reported behavior:** FeedComposer supports one-off games/teams/players;
most users operate inside leagues. Investigate whether to extend or redesign.

`client/src/features/feed/components/FeedComposer.jsx` (490 lines, read in
full).

**Post types creatable:** video, image, game_card, player_card, team_card
(tabs at `FeedComposer.jsx:4-10`). `highlight_clip` exists in the schema but
is created elsewhere (game recap sharing, not this composer). Schema
authority: `server/src/modules/feed/feed.repository.js:83-95` — `type` enum
is `['image', 'video', 'game_card', 'player_card', 'team_card',
'highlight_clip']`.

**Data source per card type:** all three card-creating tabs call
`feedApi.listShareableGames/Players/Teams` (`FeedComposer.jsx:85,94,103`),
which hit `feed.service.js:626-688`. Every one of these functions pulls
**exclusively** from standalone collections: `listCompletedGames()` and
`listTeams()` (imported at `feed.service.js:29,32` from `games.repository`/
`teams.repository`). **There is no League/LeagueTeam/LeaguePlayer query path
in any of the three `listShareable*` functions.** Notably, `feed.service.js:31`
already imports `findLeaguePlayerById` from `leagues.repository`, but it's
used elsewhere in the file (rendering an existing highlight-clip/player-card
whose player happens to be a league player), not in the composer's own
search/browse endpoints — a small hint of partial league-awareness elsewhere
in the file, but nothing usable by the composer's list endpoints today.

**What would need to change:**

- Composer state model: `search`/`options`/`selectedX` are per-entity-type
  but **not** per-scope — there's exactly one flat games list, one teams
  list, one players list (`FeedComposer.jsx:74-82`), with no league
  filter/dimension anywhere in state.
- To support league-scoped entities: (a) new backend query params/branches
  in `listShareableGames/Teams/Players` (or new sibling endpoints) that query
  `LeagueTeam`/`LeaguePlayer`/league-scoped games instead of/in addition to
  standalone `Team`/`Game`; (b) client-side, either a league-selector
  dropdown feeding into `search.game/team/player`, or splitting each of the
  three tabs into "My Teams" vs "League" sub-scopes; (c) `game_card`/
  `team_card`/`player_card` schemas (`feed.repository.js:24-43`) reference
  `teamId`/`gameId` against standalone `Team`/`Game` collections only
  (`ref: 'Team'`, `ref: 'Game'`) — posting a league entity would require
  either resolving LeagueTeam→Team associations first, or extending the Post
  sub-schemas to optionally store a `leagueId`/`leagueTeamId`.

**Assessment: tractable as an additive change, not a rewrite.** The
component is a plain single-file form with one `activeTab` switch and three
parallel, structurally-identical search/select blocks
(`FeedComposer.jsx:359-446`) — low complexity, no deep coupling to the
standalone data shape beyond the `id`/`name` fields already normalized by the
service layer. The main real gap is the backend queries being hardcoded to
standalone collections and the Post schema's `ref: 'Team'`/`ref: 'Game'`
typing — both addable via new params/branches rather than restructuring.

**The honest risk is schema-level, not composer-level:** league
teams/players/games are stored as genuinely separate documents (not
standalone docs with a `leagueId` tag) — confirmed via
`leagues.repository.js:50,64,87` (separate `LeagueTeam`/`LeaguePlayer`
collections referencing `League`). This means card-rendering code downstream
(wherever `game_card`/`team_card`/`player_card` get hydrated for display in
the feed — the same components TSW-004 touches) will also need a
league-aware branch, not just the composer. That's a moderate, well-scoped
expansion, not an architecture rewrite.
