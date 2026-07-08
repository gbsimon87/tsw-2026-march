# 05 — Testing Plan

> Per-task testing requirements for the TSW Project Improvement Initiative.
> Each task's Definition of Done (in
> [`00_IMPLEMENTATION_TRACKER.md`](./00_IMPLEMENTATION_TRACKER.md)) requires
> its testing here to pass before being marked Completed.

---

## TSW-003 — Nav title

**Automated:**

- `pnpm --filter client build` succeeds.
- If a test exists asserting `env.appName`'s default, update it to expect
  `'The Sporty Way'`; if none exists, no new test is required for a config
  default change (low enough risk/complexity to not warrant one).

**Manual:**

- After the fix, run the client locally without `VITE_APP_NAME` set (comment
  it out of the local env file temporarily) and confirm the fallback now
  shows "The Sporty Way", not "tsw-2026-march", anywhere it's consumed
  (About page, Contact page, and the tab title if wired through).
- After next production deploy: open the production site, confirm the
  browser tab title and any in-app "app name" text shows "TSW"/"The Sporty
  Way".

---

## TSW-004 — FullScreen stats bug

**Automated:**

- Check for existing tests on `buildGameCardSnapshot`/`resolveGameCardPayload`
  in `server/src/tests/`; if none exist, add one asserting the snapshot
  includes a populated `recap` field matching what `buildGameRecap` produces
  for the same game.
- Run the full server suite (`pnpm --filter server test`) to confirm no
  regression in feed/card-related tests.
- Run the full client suite (`pnpm --filter client test`) to confirm no
  regression in `GameCardPost`/`FullScreenGameCard` tests (check for existing
  test files first).

**Manual:**

- In a running dev environment: share a completed game as a card post,
  confirm the feed card shows the real score (not 0-0).
- Open the same card in full-screen view (mobile feed), confirm the same
  real score renders there too.
- Share a player card and a team card, confirm their averages/stats still
  render correctly (regression check — these were confirmed correct during
  investigation, verify the fix didn't disturb them).
- If the player/team card staleness fix is included in this pass: change an
  underlying player's/team's stats after sharing a card referencing them,
  confirm the shared card eventually reflects the update (per whatever
  refresh trigger was implemented).

---

## TSW-002 — Key Moments mobile scroll

**Automated:**

- If a test exists for `GameRecapPanel.jsx`, run it and confirm no
  regression to the Highlights section (which must keep working identically).

**Manual:**

- Chrome/Firefox devtools responsive mode, mobile viewport width: confirm
  Key Moments now scrolls horizontally by touch/drag, matching Highlights'
  behavior.
- If a real mobile device is available, verify touch-scroll feels correct
  (no jank, no accidental vertical-scroll capture) — devtools responsive
  mode doesn't perfectly simulate real touch events.
- Confirm Highlights still scrolls correctly after the shared-component
  extraction (regression check on the thing that already worked).

---

## TSW-001 — Share to Pulse failure

**Automated:**

- If a test exists for the highlight-clip sharing flow
  (`feed.service.js`/`GameDetailPage.jsx`), run it; add a test for the
  error-surfacing fix (assert the real `ApiError` message reaches the UI
  state, not a generic string).

**Manual — investigation sub-step (do first):**

- In production (or a staging env with prod-like data), attempt to
  reproduce a "Failed to share" case. Capture the actual response
  body/status and `requestId` via browser devtools Network tab.
- Cross-reference the `requestId` against server logs to see the real
  `ApiError` message and stack.

**Manual — fix verification (after root cause confirmed):**

- Reproduce the original failing case (same game/event/user role) and
  confirm it now succeeds, OR confirm the error message shown is now
  accurate and actionable if the underlying data issue can't be fixed
  immediately (e.g. "This game has no video linked" is a legitimate,
  informative failure — not a bug — once it's the message actually shown).
- As a League Admin (not the game's `ownerUserId`), share a highlight from a
  league game and confirm it succeeds.

---

## TSW-005 — FeedComposer league scope

**Automated:**

- Add server-side tests for the new league-aware query branches in
  `listShareableGames/Teams/Players` — cover: a league team/game/player is
  returned when the new scope param is used; standalone results are
  unaffected when it isn't.
- Add/update a `Post` schema test if the sub-schemas gain an optional league
  reference field.
- Run the full server + client suites to confirm no regression to existing
  standalone posting flows.

**Manual:**

- In a running dev environment, as a user who manages a league team: open
  the composer, switch to (or select) the league scope, create a game_card/
  team_card/player_card post referencing a league entity.
- Confirm the resulting post renders correctly in the feed list view.
- Confirm the same post renders correctly in full-screen mobile view (the
  TSW-004-adjacent rendering components).
- Create a standalone (non-league) post of each type and confirm existing
  behavior is completely unchanged — this is the most important regression
  check for this task, since it touches shared query functions.

---

## General regression check (run after any task in this initiative)

- `pnpm check-env && pnpm lint && pnpm test && pnpm build` from the repo
  root — the same pre-PR check this project already requires (see
  `CLAUDE.md`).
- Spot-check the feed (`/pulse`) and a game detail page in a real browser —
  these are the two areas every task in this initiative touches at least
  tangentially.
