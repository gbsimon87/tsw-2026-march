# Merge "Highlights" and "Key Moments" into one section

## Problem

`GameRecapPanel.jsx` renders two separate sections that are conceptually the
same thing — the most notable plays of a game:

- **Highlights** (`highlights` prop): video clips built server-side by
  `buildGameHighlights` (`games.service.js`). Only populated when
  `game.videoUrl` is set and events have a `videoTimestamp`. Renders as
  YouTube-embed cards with a "Share to Pulse" button. If empty, the whole
  section (heading included) disappears.
- **Key Moments** (`recap.keyMoments`): text cards built server-side by
  `buildKeyMoments` (`gameRecap.service.js`), always available (derived from
  event stat types, no video dependency). Always renders its heading, with an
  explicit "No key moments were available for this game." empty state.

Both sit right next to each other in the recap tab, showing overlapping
information in two different visual forms. This reads as duplication to
users.

## Decision

Merge the **rendering** into a single "Highlights" section:

- If `highlights.length > 0`: render the existing video-clip cards (unchanged
  behavior — YouTube embeds, Share to Pulse button, `HIGHLIGHT_PRIORITY`
  sort, `MAX_HIGHLIGHTS` cap).
- Else if `recap.keyMoments.length > 0`: render text cards (existing Key
  Moments card markup — avatar placeholder, time, `playerName • statLabel`)
  under the same "Highlights" heading, no Share button.
- Else: render the "No highlights were available for this game." empty
  state.

Only one of the two card styles is ever shown at a time, under one heading,
with one count line.

### Why keep the two server-side selection mechanisms separate

Highlight selection (`HIGHLIGHT_PRIORITY`, `buildGameHighlights`) is going to
become manually curated per game by league owners / team managers in a
future release. Key Moments selection (`MOMENT_PRIORITY`,
`buildKeyMoments`) has no such plan. Unifying the two priority/selection
mechanisms now would couple a soon-to-change system (highlights) to a stable
one (key moments) for no benefit. So:

- `buildGameHighlights` and `buildKeyMoments` stay untouched on the server —
  same functions, same data shapes, same API payload fields
  (`data.highlights`, `data.recap.keyMoments`).
- Only the **client rendering** in `GameRecapPanel.jsx` changes: it merges
  the two visual sections into one, choosing which card style to show based
  on which data is present.

## Scope

- `client/src/features/games/components/GameRecapPanel.jsx`: merge the two
  `<section>` blocks (currently lines ~129–179 and ~181–223) into one.
  - Single heading "Highlights" with a count reflecting whichever list is
    actually rendered.
  - Video branch: unchanged `GameHighlightClip` + Share-to-Pulse logic.
  - Text-fallback branch: unchanged Key Moments card markup, no Share
    button.
  - Empty branch: single "No highlights were available for this game."
    message.
  - `HorizontalScrollRow` reused as-is for both card styles (no change).
- No server-side changes.
- No prop signature changes to `GameRecapPanel` — it already receives both
  `highlights` and `recap` (which contains `keyMoments`), so
  `GameDetailPage.jsx` needs no changes.
- Update/adjust any existing tests in `GameRecapPanel`/`GameDetailPage` test
  files that assert on the old two-section structure (e.g. asserting both
  "Highlights" and "Key Moments" headings render independently).

## Out of scope

- Any change to how highlights or key moments are selected/prioritized
  server-side.
- The future manual-curation feature for highlights.
- Adding Share-to-Pulse support for text-only key moments.
