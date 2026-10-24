# Desktop league game tracking redesign: implementation plan

Date: 24 October 2026. Status: implemented and locally verified; live provider checks remain outstanding.

This is the third review pass, based on `GameTrackPage.jsx`, its event and playback
helpers, its regression tests, and six user-supplied desktop screenshots with video.
It records decisions for a coding model to follow without needing the conversation.
The user approved implementation after this plan was written. The desktop redesign
is now implemented; verification and remaining integration checks are recorded below.

## Desktop video and scoreboard columns

When the desktop league workspace has a playable video, put `GameTrackScoreHeader` directly above the video in the left grid column. The tracking sidebar spans the full available workspace height and begins level with the scoreboard. Keep the existing grid column widths and place the header/video in a `min-height: 0` flex column, with a nonshrinking header and flexible video region. Do not clip the score header’s overflow: Clock actions must open visibly above the video. Preserve the mounted video while switching tracking tabs. No-video, mobile, scrimmage, and explicit fullscreen layouts retain their prior score-header placement.

Verified with the real tracking component and local video fixture in Chrome at 1024, 1280, 1440, and 1920px widths: no horizontal/header overflow, matching header/video column widths, sidebar aligned with the scoreboard, visible clock actions, no video remount on tab change, and no page errors. The 768px mobile video-first route remains available.

## Foul types and statistics

Implemented across the tracking and public statistics surfaces:

- Keep `FOUL` as the persisted personal-foul type for backward compatibility. Add `TECHNICAL_FOUL` and `FLAGRANT_FOUL` to validation, storage, on-court checks, editing, and statistical accumulation. Older untyped `FOUL` events count as personal fouls.
- `foul` is the total of personal, technical, and flagrant fouls. Expose `personalFoul`, `technicalFoul`, and `flagrantFoul` individually. `FOUL_DRAWN` increments only `foulDrawn`, without adding a committed foul or points.
- Foul selection is category-first: never show type controls in the general court/stat menu. In court entry, choose the player, click Foul, then choose Personal, Technical, or Flagrant to record the selected player at the captured location. In quick entry, click Foul, choose a type, then choose the player. No manual foul is recorded or assigned a default type merely by clicking Foul. The existing mobile/fullscreen picker follows the same category-then-type order. Use explicit type buttons rather than a dropdown. Keep Back/Change type and Cancel at the top right and preserve frozen time, location, and selected team/player. Voice accepts personal foul, technical foul, and flagrant foul; unqualified foul means personal foul.
- All types retain the optional opposing-player foul-drawn question in dual-team tracking. Skipping preserves the committed foul. Existing event editing can correct its type.
- Show the breakdown and fouls drawn in league leaders, league-team statistics, standalone team statistics, both player profile routes, player game logs, game box scores, replay, and recaps. Season/category filters also apply to the new player totals. Standalone player summary cards render the new totals as integers alongside existing per-game figures.
- Persist these fields in materialised league-player stats. Recompute old league/team caches that lack the fields. Completed game box scores lacking the breakdown fall back to event replay; future completion/edit freezes the updated shape. No manual database migration is required for reads.
- Regression validation: full client suite passed (124 files, 1,308 tests); full server suite passed (125 suites, 1,840 tests; seven tests skipped). Production client build and ESLint on the affected files passed. Tests cover typed submission, opposing-player selection, foul-drawn follow-ups, voice input, validation/storage, team/player/league accumulation, old-cache fallback, and season-filtered profile display.

## Consistent desktop entry and follow-up containers

Use `DesktopEntryHeader` for court entry, quick stats, location changes, and every related-event question. Keep the title at the left and Cancel (unsaved entry) or Skip (optional follow-up) at the top right. Keep saving/saved status below the title when applicable. This includes both the missed-shot location step and subsequent shooter selection.

Keep the existing compact eligible-team player rows. Related-shot context shows the selected court location and Change location in a compact secondary row, without another point-value heading. Unassisted and Undo remain distinct secondary actions below the player rows; do not render an empty footer. Preserve saved events on Skip, original-event Undo guards, frozen event context, pending-save locks, and existing eligibility. These are desktop presentation changes only.

## Court input adjustment

Remove the arrow-key court cursor, its activation button, instructions, state, and movement handlers. Court location is selected by click/tap. Existing keyboard support for player buttons, actions, menus, Escape, and dialog focus remains. Entry focus returns to its originating control or the inline court workspace. This supersedes earlier keyboard court-selection requirements and historical verification below.

## Latest player-selection and controls adjustments

These decisions supersede earlier team-picker, action-footer, and styling instructions:

- The court entry heading shows only the selected location (for example, Mid Right), without a 2-point/3-point shot heading, because the picker also records other stats. Shot points remain inferred for scoring.
- Court has no persistent team selector. After a court click, show five compact player columns per team in two labelled rows. Each button shows jersey number and first initial plus surname; long names truncate within the column, with full name in its accessible label and hover title.
- Quick-stat player selection also uses compact rows for both teams, allowing either team’s eligible player to commit the stat. Preserve the original timestamp and free-throw basket selection; never add court coordinates to non-shot quick stats.
- Follow-up questions reuse the same compact player rows: one row for each eligible team (both teams for rebounds; only the eligible team for assists, fouls drawn, and other linked events). Preserve existing eligibility and submission rules.
- Selecting a player from either row updates the active side and captured entry's team side without replacing its clock, video timestamp, or court location. Keep eligibility and pending-save guards. Remove the redundant Selected player text.
- Give shot outcomes explicit green/red hover backgrounds with readable text. Differentiate other stat categories using coloured borders, text, and pale backgrounds; retain labels so colour is supplementary.
- Remove the automatic shot-value hint. Put No court location needed alongside the Quick stats heading.
- Court has no session footer. Options reuses mobile's Game actions: Save & Exit, plus Done Editing for completed games or Finish Game for active games. Remove the workspace team selection buttons above the tabs from Subs as well. The score header continues to provide team selection.
- Options uses a sliders/settings icon. Selecting Correct closes the compact Clock actions menu and shows the correction inputs.
- Verified opposing-team shot, foul, and rebound submission retains the selected location and original video timestamp. Targeted workflow and clock checks passed (43 cases).

## Follow-up desktop adjustments

These user-requested adjustments supersede conflicting layout instructions below:

- Keep the original four sections and icons: Court, Subs, Events, Options. Navigate directly using these tabs; omit Back to tracking buttons.
- Court selections offer inferred made/missed shots plus offensive/defensive rebounds, steals, blocks, turnovers, and fouls. Those actions preserve the selected location and the frozen event context.
- Keep compact quick stats as an optional route without a location, including calibrated free throws. A court tap is not a prerequisite for these actions.
- Remove the ready-state shot-location heading. Court rotation belongs in Options. Expansion uses an icon inside the bottom-right court corner.
- Only Court shows the compact latest-play list (one event), icon actions, a small action legend, and session footer. Subs and Options omit recent plays and Done editing.
- Events uses the complete existing event list with its inline edit/insert/delete icons. Omit the redundant On each row label and desktop show-more toggle. Mobile retains its existing behavior.
- Verification of this follow-up: 36 desktop workflow cases passed, including six location-preserving non-shot actions and four-tab visibility checks.

## Implementation and verification results

Implemented on 24 October 2026. The five desktop presentation components live in
`client/src/features/games/components/desktop/`. The page remains the event/playback
controller, and the existing sidebar views are reused rather than duplicated.

| Check                                                         | Result                                                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Full client regression suite                                  | Passed: 124 test files, 1,279 tests.                                                                                                |
| Desktop controller checks after final correction/Undo changes | Passed: 28 targeted tests.                                                                                                          |
| New court keyboard checks                                     | Passed: three tests covering normal/rotated movement, selection, cancellation, and disabled entry; also included in the full suite. |
| ESLint on changed client source and tests                     | Passed with no warnings.                                                                                                            |
| Production client build                                       | Passed; existing dependency-size/Browserslist advisories remain.                                                                    |
| Chrome desktop fixture checks                                 | Passed at 1024×768, 1280×720, 1440×900, and 1920×1080: no horizontal overflow or JavaScript page errors.                            |
| Inline entry positioning                                      | Shot, quick-stat, and follow-up states preserve the video frame and have no modal backdrop.                                         |
| Legacy width check                                            | At 768px, the existing video-first Track Stat flow remains available. Existing mobile/scrimmage/fullscreen regressions pass.        |

Browser verification used disposable local game/API/video fixtures, not production
records or real provider playback. It exercised shot entry, assist skip, free-throw
entry, foul/foul-drawn entry, recent plays, substitutions, settings, and resizing.
The temporary fixture routes were removed and the verification server stopped.

Remaining integration verification: a real Mux recording, real YouTube playback,
and a real background upload becoming ready during entry. Existing media tests and
the new context guards cover their code paths, but fixture checks do not establish
provider/network behavior. The concurrent server-side recording-replacement race
identified in section 6 is still outside this UI-only change.

Local screenshots were captured under `/tmp/desktop-tracker-*.png`; they show fixture
media and are verification artifacts, not production footage.

## 1. Scope and existing work

**Desktop only. Mobile has not been designed or approved.**

Use the existing desktop breakpoint, `min-width: 1024px`. Introduce one derived
predicate, equivalent to:

```js
const useDesktopLeagueWorkspace =
  isDesktopLayout &&
  data?.game?.gameContext === 'league' &&
  data?.game?.trackingMode === 'dual_team' &&
  !isTrackingFullscreen;
```

Declare it before effects that consume it. All hooks must remain unconditional
and before the page's loading/error early returns.

The new experience covers the normal desktop league workspace, with Mux video,
YouTube video, or no playable video. The screenshots show dual-team league games;
the explicit context/mode guard prevents accidental changes to other workflows.

Preserve these existing experiences:

- Below 1024px: video-first mobile flow, Track Stat button, entry/back navigation,
  modal chooser, mobile landscape behavior, and existing tap/voice behavior.
- Standalone and scrimmage games, including desktop scrimmages and their restricted
  stats, custom scoring, checkpoints, game navigator, and New Game controls.
- The explicitly requested fullscreen court view and its existing modal entry.
  Entering fullscreen intentionally hides the normal workspace. The new inline
  editor must not also render behind the fullscreen view.
- Server authorization, event endpoints, payload validation, court versioning,
  period rules, and optimistic concurrency.

Do not change global breakpoints, `MOBILE_LANDSCAPE_QUERY`, or shared component
defaults to achieve the desktop design. A landscape device is not permission to
redesign mobile. The existing width breakpoint remains the application contract.

### Already implemented: foul drawn

The preceding work added `FOUL_DRAWN`, its display label, API validation, schema
support, on-court validation, and separate game player/team totals. Selecting an
opposing player in “Who was fouled?” now records that event through manual or voice
entry. Skipping leaves the original `FOUL` intact. Do not recreate this work,
revert it, or credit the recipient with another personal foul.

Those changes currently exist in the working tree across client/server source and
tests. Preserve them. They are a baseline dependency, not work to overwrite while
implementing the layout. They do not add a league-season leaderboard column.

### Explicit exclusions

No new backend API, grouped-event transaction, event-linking schema, offline queue,
automatic mutation retry, video provider, dependency, court image, calibration,
season statistics UI, or new mobile behavior is required. Do not introduce a
general state-management framework or rewrite the entire page.

## 2. Findings and decisions from the deep review

| Finding                                                                                                       | Required decision                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The chooser is rendered inside the court subtree but uses `fixed inset-0`, a page backdrop, and `aria-modal`. | Render routine desktop entry as an inline region in the court workspace, without a backdrop or modal semantics. Changing positioning alone is insufficient.                                         |
| The container retains portrait-shaped sizing while the court rotates horizontally.                            | Derive the displayed aspect ratio from the resolved layout and orientation. Recover the wasted vertical space without changing image coordinates.                                                   |
| A court tap exposes shots, free throws, rebounds, steals, blocks, turnovers, and fouls together.              | Court taps open a shot-specific editor. Non-shot actions and free throws start from a persistent quick-stat menu.                                                                                   |
| Shot family inference already exists.                                                                         | Keep `inferCourtSelection` and `buildShotStatType`. Show readable inferred shot value; never ask the operator to choose 2PT versus 3PT after a court tap.                                           |
| Manual quick stats currently borrow the court tap's clock/video snapshot.                                     | A direct quick-stat click must capture its own complete entry context before anything can save.                                                                                                     |
| Direct rebounds/blocks can prompt for a missed shot; that handler currently hard-codes `FG2_MISS`.            | A new desktop related-shot path must collect the missed shot's location, infer FG2/FG3, and then collect its shooter. Do not send a shot without coordinates or assume every missed shot was a two. |
| Free throws currently derive their basket from the tapped/last-tapped hoop.                                   | Show a visible, changeable basket choice for direct free throws, including before the first court tap.                                                                                              |
| Related events are independent event records.                                                                 | Undo remains explicit and event-based. Do not silently delete multiple records to implement “Undo play.”                                                                                            |
| The video is deliberately persistent and uploads are portaled from a stable root.                             | Keep one player and one uploader mounted across sidebar view changes.                                                                                                                               |
| Existing body locks and Escape/focus effects assume a modal picker.                                           | Split inline versus modal presentation behavior; do not let the new inline editor lock the whole page or conflict with real dialogs.                                                                |

## 3. Desktop layout specification

```text
┌────────────────────────────────────────────────────────────────┐
│ Teams + score       Period / clock       Saved · Settings · Exit│
├──────────────────────────────────────┬─────────────────────────┤
│                                      │ Tracking: [Home] [Away] │
│                                      │ [Track] [Subs]          │
│                                      ├─────────────────────────┤
│                                      │                         │
│                VIDEO                 │ COURT / ENTRY WORKSPACE │
│                                      │                         │
│          Visible during entry        │ Court → Shot editor     │
│                                      │ Quick action → Player   │
│                                      │ Saved event → Follow-up │
│                                      ├─────────────────────────┤
│                                      │ Quick stats             │
│                                      │ FT made   FT missed     │
│                                      │ Off. reb  Def. reb      │
│                                      │ Steal     Block         │
│                                      │ Turnover  Foul          │
│                                      ├─────────────────────────┤
│ Playback controls                    │ Recent plays      Undo  │
│                                      │ Last 2–3 · All events   │
└──────────────────────────────────────┴─────────────────────────┘
```

### Geometry and scrolling

- Use CSS Grid for the video/workspace split. Starting point:
  `minmax(0, 1fr) clamp(380px, 34vw, 460px)`, with a 16px gap. Include
  `min-width: 0` and `min-height: 0` through the relevant grid/flex children.
- Use available desktop width with modest horizontal padding and a maximum content
  width around 1600px. Do not combine an arbitrarily narrow shell with a fixed 65%
  video column. At 1024px the sidebar must still fit its buttons and player names.
- Keep the scoreboard/header outside the scrolling body. Target roughly 88–112px
  for the normal desktop header; allow growth for correction, warnings, zoom, and
  long names rather than clipping them to enforce a fixed height.
- The right column owns one vertical scroll area below its toolbar. Avoid nested
  player-list, action-list, and recent-event scrollbars inside another scrollbar.
  The video and its controls stay visible when the right column scrolls.
- In Track view the order is work area, quick stats, recent plays. Recent plays
  never spans below the video or across the viewport.
- Give the court/editor area a shared minimum height around 280–320px. Let dense
  content grow in the sidebar scroll area. Do not force a ten-player rebound
  question or a vertical court into a clipped fixed-height box.
- Prefer a horizontal court by default. Derive its aspect ratio as
  `layout.height / layout.width` when rotated, otherwise
  `layout.width / layout.height`. Size the actual stage, not only an outer border.
  Remove desktop portrait width limits and large court minimum heights for this
  opt-in presentation only.
- Fit the video frame without cropping game action. Retain provider controls and
  fullscreen access. Letterboxing is allowed; first establish whether black bars
  come from the source or player container. Do not use `object-fit: cover` or a
  zoom/crop to make the screenshot look fuller.
- Without playable video, render the same desktop workflow in a centered column
  up to approximately 760px wide. Do not reserve an empty video column. Preserve
  access to video setup and handle an upload becoming ready while the page is open.

### Toolbar and navigation

- Keep the global teams, scores, period, and game clock. Add opt-in compact styling
  to `GameTrackScoreHeader` / `GameClockControls`, with existing defaults intact.
- Start/Pause stays prominent. Put Correct and period-ending actions in a clearly
  labelled “Clock actions” menu within the header; preserve all existing command
  handlers, state-dependent labels, short-lineup checks, and finish confirmations.
  Finish period and Finish game must remain visibly distinct actions.
- The local team selector uses the same `activeSide` as the scoreboard. Both show
  the active team; neither owns a separate team selection state.
- Retain existing `activePanel` values if practical: `court` means Track,
  `substitutions` means Subs, `events` means All events, `options` means Settings.
  A desktop label change must not rename mobile tabs or break their handlers.
- Track/Subs are primary local navigation. Settings is a secondary toolbar/header
  action. All events is reached from Recent plays. Each secondary view has an
  explicit Back to tracking control.
- Disable team and unrelated view switching during an active entry, follow-up,
  substitution draft, voice recognition, or mutation. Explain “Finish or cancel
  this entry first.” There must be no silent loss or reassignment of an entry.
- Rotation and entering the legacy fullscreen court are also ready-state actions.
  Do not transfer a desktop quick-stat draft into fullscreen or render two pickers.
- Browsing Subs, Events, or Settings alone does not pause playback. Existing
  actual entry/substitution/modal holds retain their current playback behavior.

### Other sidebar views

- Subs replaces the work area with the existing on-court/bench selection workflow.
  Keep add-player permissions, short lineups, and the atomic substitution endpoint.
  Show the selected out/in pair and Record substitution. Do not turn this into two
  independent append calls. Keep an explicit Cancel substitution control.
- All events replaces the Track work area with the full event list and a Back to
  tracking control. Hide the duplicate recent-play preview there.
- Settings replaces the work area with compact sections: entry behavior, voice
  help, video setup, session actions. Hide quick stats outside Track view.
- A normal event edit also occupies the right work area. Reuse the current edit
  fields and `saveEventEdit`; do not open its viewport modal in this desktop mode.
  Keep period correction and advanced zone/coordinate fields under “More details.”
  Editing historical events must not require a player to be in today's lineup.
- Lineup setup takes priority over normal controls. Reuse existing home-then-away
  setup, empty roster handling, Add player, and return-to-short-lineup behavior.
  Do not bypass readiness checks to make the new workspace appear sooner.

## 4. Entry flows and commit behavior

### 4.1 Shots

1. In Track/ready state, click a court location.
2. Capture the entry context and infer the location using the game's resolved
   court layout. Show the shot editor in place of the court.
3. Show “3-point shot · Left wing” or the corresponding readable value/zone,
   active team, eligible on-court players, and a clear current selection.
4. Select a player if necessary. Player selection alone does not record a shot.
5. Made / Missed commits using the inferred shot family. A standard made three
   can say “Made · +3”; a miss says “Missed.” Use existing scoring labels/rules
   rather than deriving shot type from the display text.
6. Replace the editor with the relevant follow-up, or return to the court.

Keep the last valid selected player for speed, but make the selected jersey/name
explicit above the commit buttons. Never auto-save based on that selection.

“Change location” returns to the court within the same entry: retain the team,
player, original clock/video snapshot, pause ownership, and insertion target.
The next tap changes only location/inference. It must not restart voice capture or
recapture time. Cancel before committing saves nothing.

The shot editor contains no free-throw, foul, rebound, steal, block, or turnover
buttons. Those remain in the quick-stat area when the workspace is ready.

### 4.2 Direct quick stats

Ready-state actions: FT made, FT missed, offensive rebound, defensive rebound,
steal, block, turnover, foul. Do not add a new direct Assist or Foul Drawn action
as part of this redesign; those are already handled through follow-ups.

1. Click a quick action. Capture its team and complete entry context immediately.
   A court tap is not required and no fake `selectedShot` may be created.
2. Replace the work area with “Who committed the foul?”, “Who made the free
   throw?”, or the relevant action, plus eligible on-court players.
3. A player-row click is the explicit commit. Its accessible name describes the
   action and player, e.g. “Record steal for number 19, Liam Bran.”
4. Use the existing event handlers with explicit `playerId`, captured `teamSide`,
   `shot: null` for non-shots, and captured `eventContext`.
5. Continue to a follow-up where required; otherwise return to ready state.

Do not commit immediately against the previously selected player when the quick
action is clicked. Do not make a previous shot location leak into a quick stat.
Non-shot coordinates are optional under the existing API; omit them here.

Disable unrelated quick actions while an entry/question is open. A simple “Cancel”
returns to ready state. Switching stat type must not silently save anything.

### 4.3 Free throws

- Keep made/missed free throws in quick stats. They require a player but no court
  tap. Use `buildFreeThrowPayload`, including the resolved layout calibration.
- Show a visible Basket selector before the committing player click. Default to
  `lastTappedHoop`; retain the existing `south` default before any tap. The default
  is explicit and changeable, not inferred from home/away or the period number.
- Show physical labels matching the displayed court: with the existing clockwise
  horizontal rotation, north is the right basket and south is the left; vertically,
  north is top and south is bottom. Verify this mapping against the rendered court.
- Pass the chosen hoop explicitly to free-throw construction; do not rely on a
  state update being visible to an immediately following handler call.
- The event remains `FT_MADE` / `FT_MISS`, zone `FREE_THROW_LINE`, and calibrated
  `x/y`, with the current game's `courtLayoutId` write precondition.
- Retain the existing optional rebound question after a missed free throw. Allow
  Skip for non-final attempts/dead balls. Do not invent free-throw series, bonus
  rules, automatic points, automatic extra attempts, or assist prompts for FTs.

### 4.4 Follow-up matrix

| Primary event                      | Desktop follow-up                           | Eligible players / resulting event                                                                   |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FG2/FG3 made                       | Basket saved. Who assisted?                 | Same lineup except shooter → `AST`; Unassisted or Skip adds nothing.                                 |
| FG2/FG3 missed                     | Miss saved. Who got the rebound?            | Either lineup, shooter included → `OREB` if shooter's side, otherwise `DREB`.                        |
| FT missed                          | Free throw miss saved. Who got the rebound? | Same two-team rebound rule.                                                                          |
| Offensive rebound entered directly | Rebound saved. Add the missed shot?         | Collect shot location, then a same-side on-court shooter → inferred FG2/FG3 miss. Skip adds nothing. |
| Defensive rebound entered directly | Rebound saved. Add the missed shot?         | Collect shot location, then an opposing on-court shooter → inferred FG2/FG3 miss. Skip adds nothing. |
| Steal                              | Steal saved. Who turned it over?            | Opposing lineup → `TOV`.                                                                             |
| Block                              | Block saved. Add the missed shot?           | Collect shot location, then opposing on-court shooter → inferred FG2/FG3 miss.                       |
| Turnover                           | Turnover saved. Who got the steal?          | Opposing lineup → `STL`; Skip accommodates turnovers without a steal.                                |
| Foul                               | Foul saved. Who was fouled?                 | Opposing lineup → `FOUL_DRAWN`.                                                                      |
| FT made                            | No follow-up                                | Return to ready.                                                                                     |

Implementation rules:

- A location question for a related missed shot renders an inline court with
  “Where was the missed shot?” and Skip. Its handler updates a related-shot draft;
  it must not call the primary `onCourtSelect` path that clears follow-up state.
- Once that location is chosen, show the inferred missed-shot value and shooter
  choices. Allow Change location within this follow-up. A player selection commits
  the related missed shot using that location and `buildShotStatType(..., 'miss')`.
- Never reuse a rebound/block's missing or unrelated position to invent a shot.
  Never use the old hard-coded `FG2_MISS` branch for this new desktop path.
- Keep the primary entry's frozen clock/video context throughout the chain. The
  related shot gets its own selected location, not a newly captured timestamp.
- A follow-up adds at most one event. Record it directly through the shared submit
  path; do not call a primary handler that opens another follow-up. This prevents
  miss → rebound → miss loops and duplicate related events.
- Preserve `followUpGroupsFor` as the authority for eligible players. Side-specific
  follow-ups stay tied to the primary event's team, not whatever side is displayed
  later. Dual-team rebounds show both team names and lineups clearly.
- Preserve current roster order. Do not reorder players by selected state or use
  array position as player identity. No bench/inactive player may commit a live stat.
- While the primary request is pending, say “Saving foul…” rather than “Foul saved.”
  Show the saved wording and enable related-event commit only after confirmation.
- Always provide Skip. Unassisted is a clear basketball answer; Skip means the
  operator is not adding that information. Neither removes the primary event.

### 4.5 Recent plays and Undo

- Show the last three confirmed events; two are acceptable in a short viewport.
  Keep server event-array order, reversed for display. Do not re-sort by wall-clock
  creation time, which would misrepresent historical insertions.
- Each row shows team identity, jersey/name, readable stat, period/time, and an
  overflow menu with Edit, Insert before, Delete. Include the event id in callbacks.
- Keep Undo next to the Recent plays title. Its accessible description names the
  event it will remove. Disable it when there is no confirmed event, a write is
  pending, voice is busy, or an unrelated unsaved entry/edit/substitution is open.
- In a follow-up, additionally allow an explicit “Undo basket”, “Undo foul”, etc.
  for that primary event, only once its save is confirmed and it is still the tail
  event. Capture its returned event id. Use the existing `expectedEventId` protection
  and narrowly extend the undo guard for this desktop action.
- For that action, keep the follow-up/playback hold until removal succeeds, then
  close the question and return to ready. If removal fails, show the error and do
  not lose the still-applicable question. If the tail id changed, remove nothing
  and explain that the event list changed. This check uses the latest locally
  observed state; it is not a new server-side conditional-tail transaction.
  Always delete the captured id, never a newly discovered different tail event.
  Do not bypass this with an unguarded
  `removeEvent` call or a stale closure immediately after clearing state.
- Once a related event has also saved, ordinary Undo removes that last event only.
  For example, Undo after Foul Drawn removes Foul Drawn and preserves the original
  Foul. Do not imply that the two records form an atomic “play.”
- Voice Undo retains its current rules unless explicitly using a separately tested
  desktop path. Do not broaden mobile/voice deletion permissions as a side effect.

### 4.6 Insertions, edits, and completed games

- Insert before opens Track in clearly labelled insertion mode, with a Cancel
  insertion action and the historical target visible.
- Preserve the target event's captured period/clock snapshot. A subsequent court
  or quick-stat start must not overwrite it with the current live clock.
- Route eligible quick stats and FTs through `submitEvent` with `insertBeforeId`,
  just as shots already do. Substitutions cannot be inserted.
- As today, insertions stay pending until confirmed and do not open related-event
  follow-ups. Clear the insertion flag and its historical snapshot on successful
  insertion or cancellation. Cancellation returns to All events.
- Editing keeps the existing patch semantics, court precondition for coordinate
  changes, and completed-game permission checks. Do not stamp an edit with the
  current video position or live clock.
- Preserve the completed-game warning, Done editing destination, manual correction
  behavior, and existing voice-disabled rules. Never restart a completed game or
  block a legitimate historical edit because its player is currently on the bench.

## 5. State and event-context implementation contract

Keep `GameTrackPage` as the controller of API calls and authoritative tracking
state. New components render props and call callbacks; they do not own game data,
make network requests, or maintain independent team/player selections.

Use the existing state for `selectedShot`, `pendingFollowUpPrompt`, `activeSide`,
`sideState`, `activePanel`, `editingEvent`, and `insertBeforeEventId`. Add only the
missing desktop state, conceptually:

```text
desktopQuickEntry: null | {
  statType/outcome, teamSide, hoopSide (FT only), entryId
}
desktopLocationMode: null | 'primary' | 'related'
desktopRelatedShot: null | inferred court selection
desktopEntryContextRef: null | {
  entryId,
  gameId,
  teamSide,
  clockSnapshot,
  videoTimestamp,                 // explicit number or null
  courtLayoutId,
  videoSourceKeyAtStart,
  insertBeforeId,
  primaryEventId                 // filled only after confirmed append
}
```

These names are suggested; the behavior is required. Do not create a duplicate
`desktopSelectedShot` or a second copy of server events/lineups. Store the frozen
context synchronously in a ref or pass it directly; React state alone does not
become available in the same click handler.

The location mode is reactive UI state: Change location sets it before clearing
the current location. It keeps the entry open/held while the court is shown.
Entering a location clears that mode and advances to the appropriate player/action
editor. It is distinct from an idle court with no active entry.

### Entry lifecycle

1. Check existing lineup/readiness/voice/recovery/save guards. Completed-game
   manual tracking follows existing permission rules.
2. Capture video time with `captureVideoTimestamp()` and clock time with
   `captureEntrySnapshot()`. An insertion's existing historical snapshot wins.
   Capture the game id, origin team, source key, and layout in this same entry context.
3. Claim playback/clock pause ownership through the existing helpers, respecting
   `pauseVideoOnEntry`. Then show the appropriate draft/editor.
4. At commit, pass captured context explicitly to the existing handler/submit path.
   Reject a context from another game or an entry that has already ended.
   Include `videoTimestamp: null` when unavailable so a previous entry cannot supply
   an old timestamp through fallback logic. Validate that the source/layout still
   matches the entry before starting a new write.
5. A follow-up retains the same context and playback ownership. Clear an obsolete
   quick-stat draft when transitioning, without briefly releasing the hold.
6. On full entry completion, Skip, or Cancel, clear all desktop drafts, location
   mode, related-shot state, primary id, timestamp, and snapshot through the shared cleanup path.
   Release only the video/clock state the entry actually paused.

Do not use a fabricated court selection or repeated `setTimeout` to open quick
entry. Include `desktopQuickEntry` in the appropriate derived entry-open/hold
conditions without making the legacy modal suddenly open for a desktop quick stat.
The derived desktop-entry-open flag must also include location mode and court
voice attempts. Do not use `isEventPickerOpen` alone to detect desktop entry.

### Priority and navigation rules

Use this priority table; only one primary work-area state renders at a time:

| Condition                                              | Work area                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Required lineup setup                                  | Existing setup content; tracking is unavailable.                                                  |
| Actual recovery/confirmation dialog                    | Existing dialog has priority; background commits are disabled.                                    |
| `editingEvent`                                         | Inline event edit, regardless of previous sidebar view.                                           |
| Non-Track `activePanel`                                | Subs, All events, or Settings. Entry guards prevent arriving here with an unrelated active draft. |
| Follow-up needing a location / related Change location | Related-shot court; retain the question and original context.                                     |
| Other follow-up                                        | Eligible player choices and question-specific actions.                                            |
| `desktopQuickEntry`                                    | Committing player picker / free-throw basket choice.                                              |
| Primary Change location                                | Court for the existing shot entry; retain context/selection.                                      |
| `selectedShot` and active court voice attempt          | Existing listening feedback and retained court, with one microphone owner.                        |
| `selectedShot` otherwise                               | Inline shot editor.                                                                               |
| None of the above                                      | Ready court.                                                                                      |

Insertion mode decorates the Track states with historical target/context; it must
not override the shot/quick-stat editor with a separate competing view. Prefer a
small derived helper/state table to unrelated visibility booleans.

Never enable stat commit while a true recovery/confirmation dialog is active.
Block duplicate commits synchronously, before an awaited API call; disabled
buttons after the next React render are not sufficient. Preserve the existing
`followUpSavingRef`, mutation queue, and primary/follow-up promise ordering.

### Mutation failure and save status

- Continue through `buildEventPayload`, `submitEvent`, `submitTrackingMutation`,
  `enqueueGameMutation`, and `updateData`; do not duplicate payload construction in
  presentational components or bypass the queue.
- Preserve `entryClockTransitionRef`: stat writes must await entry clock writes.
- Show Saving, Saved, and Save unconfirmed for this desktop league mode. Reset
  save status appropriately for edit/delete operations too; those currently have
  paths outside `submitTrackingMutation`. Do not report Saved after a failed write.
- A definite validation non-write can leave a follow-up answer available for a
  manual retry, retaining its original context and the confirmed primary event.
- A transport failure, 409, or server failure can mean the event was committed.
  Retain the current reconciliation behavior, close an unsafe retry path, and tell
  the operator to check Events. Never automatically replay an append/delete.
- Edit/delete currently have paths outside append reconciliation. For new desktop
  actions, refresh authoritative game data after an uncertain response before
  offering another mutation. If an uncertain primary Undo no longer leaves the
  primary event present, close its follow-up; never invite a related stat for an
  event that has already disappeared. Do not extend these changes to legacy UI.
- Do not present provisional score changes or optimistic rows as confirmed events.
  Existing optimistic transitions to a question may remain, but its commit waits
  for the primary request. A failed primary must not leave an actionable follow-up.

## 6. Playback, court, voice, and resize safeguards

### Playback and upload

- Render one persistent `GameVideoPanel`. Sidebar entry, team selection, navigation,
  edits, and settings must not change its key, parent identity, or source URL.
- Preserve Mux readiness checks before reading `currentTime`, YouTube message-source
  validation, source-key reset behavior, pause settling, and timestamp rounding.
- Preserve manual-pause ownership: finishing/cancelling entry must not start a
  video or clock that was already paused. A transient buffering pause must not
  create another clock write.
- Include quick-stat entry in `playbackHeldByUi`. Changing location within an entry
  must not briefly unpause. An inline question still holds entry playback when the
  preference is on; ordinary sidebar navigation does not.
- If the operator manually resumes the video during an open inline entry, keep the
  original captured event time. Do not recapture time or fight their input with a
  repeating pause effect; preserve the existing ownership semantics.
- Show “Paused for entry” only when entry actually owns the pause, not whenever the
  game happens to be paused. Distinguish saving failures from resume failures.
- Keep `GameVideoUploader` mounted at its stable page root and reuse its portaled
  node/slot. Navigating away from Settings must not abort a transfer or create a
  second uploader. Keep provider preference, video replacement, processing/error
  states, upload allowance, and existing media-only update handling.

### Court coordinates

- Use `useCourtLayout(game.courtLayoutId)` for the asset, dimensions, and calibration
  together. Legacy games retain `legacy-v1`; new games retain their own layout.
- Saved coordinates are percentages of that version's rendered image. The existing
  rotation-aware pointer normalization is authoritative. Resize the stage; do not
  crop, replace, stretch independently, or renormalize saved event coordinates.
- Pass the selected point to the desktop court when selecting/changing a location
  so the operator sees the selection. A decorative summary marker must not become
  another clickable coordinate surface.
- Keep coordinate-bearing write preconditions. Changing court orientation changes
  presentation only, not the game's immutable layout id.
- Keep the court opening-event/ghost-click protection for pointer-triggered shot
  entry. Do not apply its whole-panel time guard to a new quick-stat click and
  accidentally swallow the operator's legitimate next player selection.

### Voice

- Retain court-tap-to-listen behavior when voice is enabled, including fallback to
  the desktop shot editor with the original tap/time retained on rejection/cancel.
- Direct quick-stat buttons remain manual action → player controls even while voice
  is enabled; do not surprise the operator with another automatic microphone turn.
- A follow-up has one existing `VoiceTrackingControl`, never a second hidden control
  mounted in the legacy chooser. Preserve side-qualified commands, allowed player
  pools, stale-context checks, timeouts, write-failure handling, and roster recovery.
- Include desktop entry identity and any related-shot location in voice context
  invalidation where they affect eligibility/payloads. Late results must not commit
  against a changed entry, team, lineup, or source.
- For a related missed shot, require its location before enabling its shooter-answer
  microphone. Use the follow-up court handler, not automatic primary shot voice
  capture. Wrong-side answers continue to record nothing.
- “Who was fouled?” must keep its implemented manual/voice `FOUL_DRAWN` behavior.
- Update desktop voice guidance to match the desktop controls without rewriting
  mobile's Options/Court instructions. Keep audio/privacy information available.

### Breakpoint and source changes

- Resizing within desktop must not remount the player or abandon an entry.
- Crossing the existing 1024px boundary already remounts the player and clears stale
  playback/timestamp refs. Do not preserve a desktop-only quick draft in the legacy
  mobile chooser. Abort recognition and close unfinished entry/question state;
  saved primary events remain. Explain “Layout changed. Unfinished entry closed;
  saved events remain.” Test both crossing directions.
- If a mutation is already in flight during a boundary/source change, let it settle
  and apply its response exactly once before clearing transient state. Do not
  cancel an HTTP write, submit it again, or reset the mutation lock prematurely.
- If `gameVideoSourceKey` changes before commit, invalidate the unsaved draft and
  its voice context. A captured timestamp from the old recording must not silently
  be tagged onto the new recording. In-flight uncertain writes use reconciliation.
- This guard detects source changes known to the client. The current API has no
  video-source write precondition, so it cannot guarantee against a concurrent
  server-side replacement between that check and append. Do not claim the UI
  refactor solves that race or invent a new API contract; record it as a separate
  backend follow-up if required.

## 7. Accessibility, styling, and overlay boundaries

- Desktop inline entry is a labelled `section`/`region`, not an `aria-modal` dialog.
  No backdrop, page dimming, focus trap, invisible full-page dismiss button, or
  page-level `touchAction: none` belongs to it.
- Adjust the existing body-lock effect to lock for the legacy modal/fullscreen and
  actual dialogs, not simply for every truthy `isEventPickerOpen` on desktop.
- Focus the inline editor heading/container when it opens; do not focus a player
  in a way that implies selection. Return focus to the originating quick action
  after cancellation/completion or to the ready court's keyboard entry control.
- Escape cancels an unsaved inline draft; in a follow-up it skips that question;
  while saving it does not submit/cancel another mutation. A real dialog/menu gets
  first Escape handling. The current document-level picker Escape listener must
  not close an underlying entry when dismissing an Add player/recovery dialog.
- Use buttons for player choices, visible focus rings, `aria-pressed` for selected
  team/player, readable labels, and live-region feedback for saves/errors. Do not
  announce every clock tick. Do not rely on color alone for selection/outcomes.
- Provide a keyboard path for desktop shot location: a “Choose shot location”
  control focuses a court cursor; arrow keys move it, Enter selects through the
  same inference path, Escape exits. Clamp to the same normalized image bounds.
  Scope this opt-in behavior to desktop so shared mobile pointer behavior stays
  intact. Do not attach global hotkeys that fire while typing in an editor/player.
- No additional global stat/Undo shortcuts are required for this delivery.
- Remove empty avatar circles from desktop entry rows. Emphasize jersey/name;
  handle missing numbers and long names with an accessible complete name.
- Use the existing forest/ink/red/amber palette and existing type/spacing tokens.
  Prefer clear labels such as Free throw made, Defensive rebound, and Turnover.
  Keep commit and cancel positions consistent. Primary touch/click targets should
  generally be at least 40px tall; do not shrink controls to force everything to fit.
- Use a brief inline transition with reduced-motion support. Do not apply the
  viewport modal's scale/backdrop animation to the whole video/workspace.

Routine desktop shot, quick-stat, related-event, and event-edit interactions stay
inside the sidebar. Existing intentional dialogs for lineup/player recovery,
short-lineup confirmation, clock recovery, finish confirmation, and pause-and-exit
may remain modal. Their interaction/focus and playback holds must remain correct.
Voice reference can expand inside Settings. Player-native fullscreen is unaffected.

## 8. File map and component boundaries

| File                                                                                  | Responsibility in this implementation                                                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/features/games/pages/GameTrackPage.jsx`                                   | Scope predicate, desktop drafts/context, routing to existing handlers, rendering branch, cleanup/holds/focus, preserved legacy branch. |
| `client/src/features/games/components/desktop/DesktopGameTrackingWorkspace.jsx` (new) | Sidebar structure/toolbar/status and supplied work-area, quick-stat, recent-play content. No API/state duplication.                    |
| `client/src/features/games/components/desktop/DesktopShotEntry.jsx` (new)             | Inferred shot summary, eligible player choices, Made/Missed, Change location, Cancel.                                                  |
| `client/src/features/games/components/desktop/DesktopQuickStatEntry.jsx` (new)        | Action-specific committing player choices and FT basket choice.                                                                        |
| `client/src/features/games/components/desktop/DesktopFollowUpEntry.jsx` (new)         | Focused question, allowed player groups, related-shot location stage, Skip/Unassisted, supplied voice control.                         |
| `client/src/features/games/components/desktop/DesktopRecentEvents.jsx` (new)          | Compact confirmed-event preview, labelled Undo, row menus, All events.                                                                 |
| `client/src/features/games/components/GameTrackScoreHeader.jsx`                       | Optional compact desktop presentation and team-selection disabled prop, defaulting to existing behavior.                               |
| `client/src/features/games/components/GameClockControls.jsx`                          | Optional compact desktop arrangement/Clock actions menu; existing command logic remains authoritative.                                 |
| `client/src/features/games/components/InteractiveCourtImage.jsx`                      | Opt-in desktop sizing/keyboard surface if needed; preserve default rendering and coordinate normalization.                             |
| `client/src/features/games/court/courtInference.js`                                   | Reuse existing helpers; no new arc geometry.                                                                                           |
| `client/src/features/games/court/courtLayouts.js` and `courtImageCalibration.js`      | Read-only compatibility contract; no asset/calibration changes.                                                                        |
| `client/src/features/games/components/VoiceTrackingControl.jsx`                       | Reuse existing component and lifecycle; only change a prop contract if desktop integration needs it.                                   |
| `client/src/features/video/components/GameVideoUploader.jsx`                          | Preserve the persistent uploader in the video feature. No upload rewrite.                                                              |
| `client/src/features/games/pages/GameTrackPage.test.jsx`                              | Existing regression suite plus desktop controller/integration coverage.                                                                |
| New desktop component tests, court tests, score/clock tests as needed                 | Verify user-visible behavior, keyboard actions, and geometry/eligibility contracts.                                                    |

Reuse `GameVideoPanel` and the existing `GameVideoEmbed` / `MuxVideo` components;
do not implement another player.

For inline event edit, extract the existing form contents into a small shared
presentational component only if needed. Keep the legacy modal shell/labels by
default and render the same fields inside the desktop workspace.

Keep existing lineup, substitution, event-list, and settings markup reusable via
small render helpers or content slots. Avoid a giant second copy of the whole
page. Do not move business logic into six new components merely to shorten JSX.

## 9. Implementation sequence and completion gates

Do these in order. Each step must leave the legacy tests passing. Inspect the
working tree first and preserve the existing foul-drawn implementation.

### Step 1 — Establish scope and presentation boundaries

- [x] Add the derived desktop-league predicate and an opt-in desktop layout branch.
- [x] Keep the video and uploader outside changing sidebar branches.
- [x] Add the sidebar layout component and semantic work-area container.
- [x] Keep legacy markup/handlers reachable for mobile, other contexts, fullscreen.
- [x] Add tests proving the scope boundary and that ordinary desktop entry has no
      modal backdrop while the legacy modal still exists outside this scope.

Gate: a desktop league game gets the new shell; switching sidebar views does not
remount the player; no existing mobile/scrimmage workflow changes.

### Step 2 — Implement frozen entry context and direct quick stats

- [x] Add minimal desktop quick-entry/context state, guards, cleanup, and hold rules.
- [x] Capture snapshots at the originating action, preserving insertion context.
- [x] Add manual action → player commit and calibrated direct FT basket selection.
- [x] Route every write through existing mutation helpers with explicit context.
- [x] Block repeat commits and invalid/bench player choices.
- [x] Test timestamps with playback-pause preference both on and off, and FT entry
      before any court tap. Verify no stale coordinates/timestamps leak in.

Gate: direct quick stats and FTs work without a court tap, save once, and resume
only state paused by the entry.

### Step 3 — Implement inline shots and related-event entry

- [x] Correct desktop court stage sizing without changing coordinate semantics.
- [x] Add inferred shot editor and same-entry Change location.
- [x] Add inline follow-ups using the eligibility matrix and confirmation state.
- [x] Add related missed-shot location stage for direct rebounds/blocks; infer
      FG2/FG3 and use the original frozen event context.
- [x] Preserve foul drawn, Skip/Unassisted, primary-failure handling, and voice paths.
- [x] Add keyboard court selection and focus return.

Gate: primary/related events have correct player, side, stat type, position,
period, and video time; every entry finishes/cancels without blocking the next one.

### Step 4 — Corrections, navigation, and settings

- [x] Add recent plays below quick stats; All events and row menus use existing ids.
- [x] Add labelled event-level Undo and guarded Undo primary during a follow-up.
- [x] Keep insertion, inline editing, completed-game permissions, and their cleanup.
- [x] Reorganize desktop settings, rotation/voice status, Exit, and Finish game.
- [x] Add optional compact score/clock presentation and save/resume feedback.
- [x] Verify substitutions, setup, empty rosters, and background upload persistence.

Gate: the normal desktop workflow never requires leaving the sidebar to record,
review, or correct an event, except intentional confirmation/recovery dialogs.

### Step 5 — Regression and visual verification

- [x] Complete the available test/visual checks below; record actual results and the live-provider limitations above.
- [x] Remove any duplicate mounted player, microphone, chooser, or uploader.
- [x] Run formatting, lint, relevant tests, and client build.
- [x] Review the diff for accidental mobile/global style/backend changes.
- [x] Update this plan's status/checklist with completed work and remaining issues.

Gate: acceptance criteria below are met; do not mark complete from a passing build
alone. Real-provider playback checks must be distinguished from mocked tests.

## 10. Verification matrix

### Automated behavioral coverage

| Area                 | Required cases                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                | Desktop league with YouTube, ready Mux, no video; below-breakpoint legacy modal; desktop standalone/scrimmage and explicit fullscreen unchanged.                                        |
| Shot inference       | Both baskets, both court orientations, legacy/v2 layouts; known inside-arc, arc/corner three points; readable inferred value and exact payload type.                                    |
| Direct quick stats   | Every action works without a preceding court tap; selected player/side correct; non-shot fields omit stale court coordinates.                                                           |
| Free throws          | Before first court tap, after a tap, basket change, calibration per layout, made/missed, no assist, optional rebound.                                                                   |
| Captured context     | Playing/paused/unready Mux; YouTube timestamp; no video; preference on/off; time captured at entry start, not delayed player click; context cleared for the next entry.                 |
| Follow-ups           | Correct side/player pools; both-team rebounds; no self-assist; miss-location stage produces FG2 or FG3 miss; skip/unassisted; foul drawn manual/voice.                                  |
| Save safety          | Rapid repeated clicks; primary save pending/fails; definite follow-up failure and manual retry; uncertain response/reconciliation; no automatic replay and no enabled duplicate commit. |
| Playback ownership   | Already paused video/clock stay paused; entry-owned pauses resume on every exit; no pause/play flicker during Change location; settled pause rules remain intact.                       |
| Corrections          | Undo target id changed → no deletion; Undo primary while follow-up open; Undo after related event removes just the last event; delete/edit errors visible; no stale Saved label.        |
| Historical work      | Insert shot/quick stat/FT before target uses historical snapshot; cancellation clears it; no inserted substitution or follow-up; completed-game editing and permissions preserved.      |
| Roster/substitutions | Empty roster, short lineup, no bench, add-player permissions, successful atomic substitution, draft cancellation, updated eligibility.                                                  |
| Voice                | One control per turn, retained court fallback/time, correct follow-up context, wrong-side rejection, stale/late result ignored, no primary voice auto-start for related-shot location.  |
| Lifetimes            | No video remount on team/sidebar changes; uploader survives leaving Settings; source change or breakpoint crossing cannot reuse an obsolete draft/time.                                 |
| Accessibility        | Inline region has no modal lock/trap; keyboard player/action/menu/court entry; focus return; Escape priority; alert/status feedback without clock-tick announcements.                   |

Do not weaken, skip, or broadly rewrite existing tests to accommodate changed
desktop selectors. Update only expectations that intentionally exercise the new
desktop league branch. Keep meaningful mobile/fullscreen assertions intact.

### Manual visual and provider checks

Capture at least ready court, shot entry, quick FT entry, two-team rebound question,
related missed-shot location, foul-drawn selection, Subs, Events, Settings, edit,
and saving/error states in the normal desktop workspace.

Check at 1024×768, 1280×720, 1440×900, and 1920×1080. Test a short desktop window,
long team/player names, five players per side, missing jersey numbers, and browser
zoom. At 200% zoom, reflow is expected to follow the existing width breakpoint;
it must remain usable without inventing a new mobile layout.

Verify:

- No routine entry/follow-up/editor covers or dims the video.
- No horizontal overflow, clipped buttons, unreachable footer, or nested scrollers.
- The court actually fills its orientation-correct frame, not a tall empty card.
- Quick stats and recent plays stay in the right column in the specified order.
- For a short viewport, controls remain reachable by sidebar scrolling while video
  controls remain available. Do not claim all content fits without scrolling.
- Every selected team/player and inferred shot value is unambiguous.
- Provider controls still work during inline entry; normal sidebar navigation
  preserves current playback position and paused/playing state.
- A real development Mux video and a real YouTube video produce correct timestamps
  and pause/resume behavior. If credentials/fixtures are unavailable, report that
  limitation; mocked media events are not proof of provider integration.
- An upload remains in progress when navigating away from Settings and can become
  ready without breaking the entry context/source-change guard.
- Reduced motion and keyboard-only operation work without the modal backdrop.

Regression-check the existing mobile page at representative portrait/landscape
sizes solely to verify preservation. This is not authorization to redesign it.

### Commands

From the repository root, use direct runner commands so filename filters apply:

```sh
pnpm --filter client exec vitest run src/features/games/pages/GameTrackPage.test.jsx src/features/games/components/desktop src/features/games/components/GameClockControls.test.jsx src/features/games/components/InteractiveCourtImage.test.jsx src/features/games/components/CourtLayoutRendering.test.jsx src/features/games/court src/features/games/voice
pnpm --filter client build
pnpm exec prettier --check docs/game-tracking-desktop-redesign-plan.md
git diff --check
```

Run ESLint/Prettier against the actual changed client files, and run the full client
suite once the targeted tests pass. Do not append `--` to `pnpm ... test` assuming
Vitest will interpret the following paths as intended; direct `exec vitest run`
makes filtering explicit. Run server tests only if server changes become necessary
or to verify the already-present foul-drawn baseline; this layout plan requires no
new server implementation. Existing test scripts are in the package manifests.

## 11. Acceptance checklist

- [x] The new normal layout is desktop league only; mobile, standalone, scrimmage,
      and explicit fullscreen behavior is preserved.
- [x] Video remains visible and mounted throughout routine entry and corrections.
- [x] The court is correctly sized and still produces accurate versioned coordinates.
- [x] Court selection infers shot value; only player and made/missed need input.
- [x] Free throws and non-shot stats work directly from quick stats without a tap.
- [x] Related missed shots collect a real location and infer their own shot family.
- [x] Foul drawn records the selected opposing player and does not add a personal foul.
- [x] Recent plays lives below quick stats in the right column; Undo is explicit,
      guarded, and removes the event described by its label.
- [x] Save state, uncertainty, playback holds, and cancellation are understandable.
- [x] Entry context, voice eligibility, insertions, edits, and substitution integrity
      survive the new presentation without stale data or duplicate writes.
- [x] New desktop controls support keyboard use and respect true dialog focus/locks.
- [x] Tests, build, visual checks, and any real-provider limitations are recorded.

## 12. Related references

- [GameTrackPage](../client/src/features/games/pages/GameTrackPage.jsx) — current
  implementation is authoritative; helper names are more durable than line numbers.
- [Tracker regression tests](../client/src/features/games/pages/GameTrackPage.test.jsx).
- [Court asset contract](../client/src/assets/courts/README.md).
- [Court versioning plan](court-image-versioning-plan.md).
- [Game clock implementation plan](game-clock-implementation-plan.md) — historical
  implementation notes can be stale; inspect current handlers before following them.
- [Mux tracker integration](mux-video-tracker.md).
- [Existing voice plan](superpowers/plans/2026-09-06-voice-tracking.md).

Handoff instruction: implement the numbered steps in order, preserve the existing
foul-drawn work and legacy experiences, and report completed acceptance items with
actual verification. If a requirement needs a new backend contract or a mobile
redesign, stop that expansion and document it rather than inventing behavior.
