# GameTrackPage: Lineup Gating, Desktop Video Layout, More Tab Additions

## Context

`GameTrackPage.jsx` (`client/src/features/games/pages/GameTrackPage.jsx`, ~2624 lines) is where stats are recorded for a live game. Today, for league (dual-team) games, the starting-lineup picker is shown inline inside the Court tab whenever a team's lineup isn't complete — but nothing stops the user from switching to the Subs/Events/More tabs before finishing it. This is confusing at the start of a brand-new league game: the user should be walked through setting the home lineup, then the away lineup, before anything else is available.

Separately, on desktop, the video (when present) is buried inside the Court tab and users have to scroll past it to reach the stat-entry controls. We want video and entry controls side-by-side on desktop so nothing needs to be scrolled.

On mobile specifically, the video and the stat-entry controls are stacked vertically, forcing the user to scroll up and down between watching a play and tagging it — the single biggest friction point during live tracking. We want the tab bar and score header to stay pinned at the top, with the video filling the rest of the screen by default, and a clearly-separate button (not overlapping the video, to avoid intercepting YouTube's own click handling) that switches into the stat-entry UI. Opening entry mode should pause the video; successfully logging a stat should resume playback and automatically return to the video view, so the user never has to manually scroll or juggle two views.

Finally, the More tab is underused — we want to add three self-service actions there: rotating the court image orientation (vertical/horizontal) for easier viewing, adding/updating the game's video URL (which already exists as a feature but is currently tucked inside the Court tab), and toggling whether the video auto-pauses during stat entry.

Exploration confirmed the underlying lineup-saving, video-URL-saving, and video pause/resume logic **already exists and works** (`saveLineup`, `requireLineup`, `gamesApi.setLineup`, `gamesApi.update`, `saveVideoUrl`, `pauseVideo`, `playVideo`) — this work is primarily a UI/flow restructuring, not new backend functionality. Notably, `pauseVideo()`/`playVideo()` are already called today around the court-tap event picker (`onCourtSelect` pauses; `clearEventPicker(..., { resume: true })` resumes after every successful stat save) — the new mobile flow extends this exact mechanism rather than inventing a new one.

## Decisions from clarification

- Lineup gating fully blocks all tabs (a full-screen-style step replaces the tab UI) until both lineups are set, for league dual-team games only. Non-league/one-sided games keep today's inline-in-Court-tab picker, unchanged.
- "Rotate court" means a manual vertical/horizontal orientation toggle (distinct from the existing automatic mobile-landscape `rotate90` behavior), local-only state (resets each session, not persisted server-side).
- Desktop two-column video layout applies to all games with a video, league or standalone.
- To avoid two simultaneously-mounted YouTube iframes fighting over the single `videoIframeRef` (used to capture playback timestamp when tagging a stat), use a small `window.matchMedia('(min-width: 1024px)')`-driven boolean (mirroring the existing pattern in `InteractiveCourtImage.jsx`) to decide the single mount point for the video, while column layout/spacing stays pure Tailwind `lg:` classes.
- After both lineups are set, default `activeSide` back to Home entering normal tracking.
- Mobile video-first mode: the entry-mode trigger is a standalone button positioned above the video (not an overlay on top of it), to avoid intercepting the iframe's own click handling and to avoid obscuring any part of the video.
- Returning from stat-entry back to video view happens automatically once a stat is successfully logged (not on a manual "back" tap).
- Pause/resume-on-stat-entry applies to both mobile and desktop, gated by a user-toggleable preference (default: on/paused), added to the More tab, persisted via `localStorage` (a personal workflow preference, not tied to a specific game).

## Implementation

### 1. Sequential lineup gating (league, dual-team games only)

Add a derived value (not `useState`, purely computed from `data` each render) right after the existing `const isCompleted = game?.status === 'completed';` derived line (near the other `isDualTeam`/`isLeagueGame`/`participantsBySide` derivations):

```js
const homeLineupReady = (data?.lineups?.[TEAM_SIDES.HOME]?.currentPlayerIds || []).length === 5;
const awayLineupReady = (data?.lineups?.[TEAM_SIDES.AWAY]?.currentPlayerIds || []).length === 5;
const lineupSetupStep =
  isLeagueGame && isDualTeam
    ? !homeLineupReady
      ? 'home'
      : !awayLineupReady
        ? 'away'
        : null
    : null;
```

This naturally handles every case: brand-new game → `'home'`; home done → `'away'`; both done (including on reload mid-tracking) → `null` (normal flow, no separate "seen intro" flag needed); non-league/one-sided games → always `null` (zero behavior change for them).

Add a `useEffect` to snap `activeSide` to the step being configured, and back to Home once gating completes (track the previous step via a `useRef` to detect the `'away' -> null` transition):

```js
const prevLineupStepRef = useRef(lineupSetupStep);
useEffect(() => {
  if (lineupSetupStep === 'home' && activeSide !== TEAM_SIDES.HOME) {
    setActiveSide(TEAM_SIDES.HOME);
  } else if (lineupSetupStep === 'away' && activeSide !== TEAM_SIDES.AWAY) {
    setActiveSide(TEAM_SIDES.AWAY);
  } else if (prevLineupStepRef.current === 'away' && lineupSetupStep === null) {
    setActiveSide(TEAM_SIDES.HOME);
  }
  prevLineupStepRef.current = lineupSetupStep;
}, [lineupSetupStep]);
```

No changes needed to `saveLineup` (the `async function saveLineup() { ... }` that calls `gamesApi.setLineup`) — it already reads `activeSide`/`activeKey` reactively, so once `activeSide` is synced to the current gating step, calling the existing `saveLineup` "just works" for whichever side is being configured.

**Extract the existing lineup-picker JSX into a local component** — find it by searching for the `{lineupIds.length < 5 ? (` block (contains the "Starting Lineup" heading, the "Save Lineup" button, and the player checkbox grid) — into a component `LineupPicker({ side, isDualTeam, teamDisplayName, players, lineupDraft, onToggle, onSave, isSaving, teamId, variant })`, where `variant` (`'inline' | 'fullscreen'`) only changes the outer wrapper chrome:

- `'inline'`: same `rounded-xl border border-slate-200 bg-slate-50 p-4` box as today — used for the existing Court-tab call site (unchanged condition `lineupIds.length < 5`), so non-league/one-sided games look identical to before.
- `'fullscreen'`: a full-height centered card (e.g. `flex min-h-0 flex-1 flex-col items-center justify-center p-4` wrapping a `w-full max-w-lg` card) with a heading like "Set {Home/Away} Team Starting Lineup" and a step indicator ("Step 1 of 2" / "Step 2 of 2").

At the top-level return, find the wrapper div `<div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">` (the direct parent of the error banner and the tab-nav/tab-content block) and wrap the existing tab-nav-plus-content block in a conditional:

```jsx
{lineupSetupStep ? (
  <div className="flex min-h-0 flex-1 flex-col border-x border-slate-200 bg-white shadow-sm">
    <LineupPicker
      side={lineupSetupStep === 'home' ? TEAM_SIDES.HOME : TEAM_SIDES.AWAY}
      isDualTeam
      teamDisplayName={participantsBySide[lineupSetupStep]?.displayName}
      players={participantsBySide[lineupSetupStep]?.players || []}
      lineupDraft={sideState[lineupSetupStep]?.lineupDraft || []}
      onToggle={/* same logic as existing checkbox onChange, keyed to lineupSetupStep */}
      onSave={saveLineup}
      isSaving={isSaving}
      teamId={teamId}
      variant="fullscreen"
    />
  </div>
) : (
  <div className="flex min-h-0 flex-1 flex-col border-x border-slate-200 bg-white shadow-sm">
    {/* existing tab nav + tab content, unchanged */}
  </div>
)}
```

Keep the dual-team score header (the `{isDualTeam ? (<div className="flex border-b border-slate-200 bg-white shadow-sm">...` block showing both teams' logos/scores, rendered above the `max-w-5xl` wrapper) rendering above this regardless of `lineupSetupStep` — it's outside this wrapper already, and showing "Home 0 — Away 0" during setup is harmless context.

### 2. Desktop two-column layout (video left, entry right)

Add a display-only local component:

```js
function GameVideoPanel({ videoUrl, title, videoIframeRef }) {
  if (!videoUrl) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-base font-semibold text-slate-900 mb-3">Game Video</h2>
      <GameVideoEmbed ref={videoIframeRef} videoUrl={videoUrl} title={title} />
    </div>
  );
}
```

Add a small breakpoint-driven boolean (mirrors `InteractiveCourtImage.jsx`'s existing `isMobileLandscape` pattern — this is the codebase's own precedent for this exact need):

```js
const [isDesktopLayout, setIsDesktopLayout] = useState(
  () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
);
useEffect(() => {
  const mq = window.matchMedia('(min-width: 1024px)');
  const update = () => setIsDesktopLayout(mq.matches);
  update();
  mq.addEventListener('change', update);
  return () => mq.removeEventListener('change', update);
}, []);
```

This boolean decides the _single_ mount point for `GameVideoPanel`, preventing two simultaneous YouTube iframes from fighting over `videoIframeRef`. Layout column widths/spacing remain pure Tailwind `lg:` classes.

**Stale-ref hazard on remount:** flipping `isDesktopLayout` unmounts the old iframe and mounts a fresh one elsewhere in the tree — a real unmount/remount, not a reuse, since there's no stable `key` bridging the two render branches. The new iframe reloads from `src` (restarting playback) and takes real time (network + player boot) before it starts sending `infoDelivery` messages again. `videoCurrentTimeRef.current` is a plain `useRef` that is **not** cleared on remount, so it keeps holding the old iframe's last-known position during that boot window. If the user pauses/logs a stat in that window (very plausible right after rotating a tablet mid-action), `onCourtSelect` reads the stale value and silently persists a wrong `videoTimestamp`. Fix: add an effect that clears the ref on every layout-mode change, so the existing `typeof videoCurrentTimeRef.current === 'number' ? ... : null` fallback in `onCourtSelect` correctly reports "unknown" instead of a stale number during the gap:

```js
useEffect(() => {
  videoCurrentTimeRef.current = null;
}, [isDesktopLayout]);
```

Restructure the outer shell (the `<div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">` wrapper identified above):

```js
const trackingShellClassName = game.videoUrl
  ? 'mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col lg:flex-row lg:gap-4'
  : 'mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col';
```

```jsx
<div className={trackingShellClassName}>
  {game.videoUrl && isDesktopLayout ? (
    <div className="lg:flex lg:w-[26rem] lg:shrink-0 lg:flex-col lg:self-start">
      <GameVideoPanel videoUrl={game.videoUrl} title={game.title} videoIframeRef={videoIframeRef} />
    </div>
  ) : null}

  <div className="flex min-h-0 flex-1 flex-col">
    {error ? (/* existing error banner, moved inside this column */) : null}
    {lineupSetupStep ? (/* fullscreen LineupPicker, as above */) : (/* existing tab nav + content */)}
  </div>
</div>
```

Remove the old inline video block from the Court tab entirely — find it by searching for the card containing `{game.videoUrl ? 'Game Video' : 'Add Video'}` (the "Edit URL"/"Add URL" toggle button, the URL input, and the embedded `<GameVideoEmbed>` display). It becomes purely a display concern handled by `GameVideoPanel`; the "Add/Edit URL" affordance moves to the More tab (see below). On mobile, the video is no longer just a compact block at the top of the Court tab — see Requirement 3 below, which replaces the Court tab's mobile content with a dedicated video-first / entry-mode toggle.

Verify after implementation: games without video are visually unchanged (single column); games with video show the persistent left column across all tabs on desktop (≥1024px), and drive the new video-first mobile flow described next.

### 3. Mobile video-first tracking flow (avoids scrolling between video and stat entry)

This only applies when `game.videoUrl` is set and `!isDesktopLayout` (reuses the `isDesktopLayout` boolean from Requirement 2). It only affects the **Court tab** — Subs/Events/More keep their normal content regardless of this mode, since "watch and tag" is specifically a Court-tab concern.

**New state:**

```js
const [isMobileEntryMode, setIsMobileEntryMode] = useState(false);
```

This is a plain session-local boolean (no persistence needed — it should always start in video-first view when arriving at the Court tab). Reset it to `false` whenever `activePanel` changes away from `'court'` (e.g. in the existing tab-click handler or a small `useEffect` keyed on `activePanel`), so switching to Subs/Events/More and back always re-lands on video-first view, not stranded in entry mode.

**New localStorage-backed preference** (default on): read/write via a small helper, e.g.:

```js
const [pauseVideoOnEntry, setPauseVideoOnEntry] = useState(() => {
  const stored = localStorage.getItem('gameTrack.pauseVideoOnEntry');
  return stored === null ? true : stored === 'true';
});
function togglePauseVideoOnEntry() {
  setPauseVideoOnEntry((prev) => {
    const next = !prev;
    localStorage.setItem('gameTrack.pauseVideoOnEntry', String(next));
    return next;
  });
}
```

**Rendering the Court tab on mobile when video is present:**

```jsx
{activePanel === 'court' && game.videoUrl && !isDesktopLayout ? (
  isMobileEntryMode ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => setIsMobileEntryMode(false)}
        className="mb-2 flex shrink-0 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {/* back-to-video icon */}
        Back to Video
      </button>
      {/* existing Court tab entry content: InteractiveCourtImage, eventPicker, last-action footer, etc. — unchanged */}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => setIsMobileEntryMode(true)}
        className="mb-2 flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        {/* court/whistle icon */}
        Track Stat
      </button>
      <div className="min-h-0 flex-1">
        <GameVideoPanel videoUrl={game.videoUrl} title={game.title} videoIframeRef={videoIframeRef} fill />
      </div>
    </div>
  )
) : (
  /* existing Court tab content unchanged — used when: not mobile, no video, or isDesktopLayout (video already shown in left column) */
)}
```

`GameVideoPanel` gets an optional `fill` prop for this usage — when true, it drops the `aspect-video` sizing constraint from `GameVideoEmbed`'s wrapper and instead stretches to fill the available flex space (`h-full`), since here we want the video to consume all remaining vertical space below the tab bar/score header/Track-Stat button, not a fixed 16:9 box. (`GameVideoEmbed.jsx` itself does not need to change — `fill` only affects the wrapping `<div>`'s classes in `GameVideoPanel`.)

**Wiring pause/resume:**

- `onClick` of "Track Stat": call `setIsMobileEntryMode(true)`, and if `pauseVideoOnEntry` is true, call the existing `pauseVideo()`.
- The existing `clearEventPicker(reason, { resume })` function already calls `playVideo()` when `resume: true` — extend it to also call `setIsMobileEntryMode(false)` when `resume` is true (matching the requirement that logging a stat both resumes playback and auto-returns to video view). Since `resume: true` is already passed on every successful stat-save path (11 call sites found during exploration) and `resume: false`/`undefined` on cancel/dismiss/error paths, this single change in `clearEventPicker` gives the exact desired behavior with no changes needed at any of its call sites.
- Respect `pauseVideoOnEntry`: gate the `pauseVideo()` call in the "Track Stat" button's `onClick`, and gate `playVideo()` inside `clearEventPicker` similarly (if the preference is off, don't pause OR resume — leave playback exactly as the user left it). This keeps the toggle's behavior symmetric.
- This same `pauseVideoOnEntry` gate should also wrap the _existing_ `pauseVideo()` call inside `onCourtSelect` (the function that runs when the user taps the court, which currently calls `pauseVideo()` unconditionally right before `setCurrentVideoTimestamp(...)`) and the desktop flow generally, per the decision that "pause/resume applies to both mobile and desktop" — i.e. `onCourtSelect`'s unconditional `pauseVideo()` becomes `if (pauseVideoOnEntry) pauseVideo();`. Leave the `setCurrentVideoTimestamp` read immediately below it unconditional either way — the captured timestamp is frozen at tap time regardless of the toggle, so it stays correct whether or not the video keeps playing afterward; only the visual "does the video keep advancing while I pick a stat" behavior changes.

**Order-of-events note:** `isMobileEntryMode` only exists/matters on mobile without desktop layout; on desktop, both video (left column) and entry controls (right column) are simultaneously visible, so there is nothing to "return to" — the pause/resume-on-entry behavior still fires (per the toggle), but no view-switching state applies there.

### 4. More tab additions

**Rotate Court** — new local-only state (not persisted, resets each session):

```js
const [courtOrientation, setCourtOrientation] = useState('vertical'); // 'vertical' | 'horizontal'
const rotateCourt = courtOrientation === 'horizontal';
```

Thread `rotate90={rotateCourt}` into both existing `<InteractiveCourtImage>` usages — one inside the Court tab's entry content, one inside the fullscreen tracking overlay (search for `<InteractiveCourtImage` — there are exactly two call sites) — this prop already exists and already drives the CSS rotation transform, so no changes needed to `InteractiveCourtImage.jsx` itself.

Add a new button to the More tab (find the `{activePanel === 'more' ? (` block, which currently contains "Save & Exit" and "Done Editing"/"Finish Game"), placed first (most frequently toggled in-session preference), following the existing icon-circle + title + subtitle pattern used by "Save & Exit" etc.:

```jsx
<button
  type="button"
  onClick={() => setCourtOrientation((o) => (o === 'vertical' ? 'horizontal' : 'vertical'))}
  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
>
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
    {/* rotate icon, matching sibling icon style: viewBox 0 0 20 20, stroke="currentColor" strokeWidth="1.8", fill="none" */}
  </span>
  <div>
    <p className="text-sm font-semibold text-slate-900">Rotate Court</p>
    <p className="text-xs text-slate-500">
      Currently {courtOrientation} — tap to rotate{' '}
      {courtOrientation === 'vertical' ? 'horizontal' : 'vertical'}
    </p>
  </div>
</button>
```

**Add/Update Video** — relocate the existing, already-functional video URL edit UI (the block removed from the Court tab in Requirement 2 above, using `videoUrlDraft`/`isVideoUrlEditOpen`/`saveVideoUrl` — none of which need to change) into the More tab as a second new entry, restyled to match the button pattern:

```jsx
<div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
  <button
    type="button"
    onClick={() => {
      if (isVideoUrlEditOpen) {
        setIsVideoUrlEditOpen(false);
        return;
      }
      setVideoUrlDraft(game.videoUrl || '');
      setIsVideoUrlEditOpen(true);
    }}
    className="flex w-full items-center gap-3 text-left"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
      {/* video/film icon, same style */}
    </span>
    <div>
      <p className="text-sm font-semibold text-slate-900">
        {game.videoUrl ? 'Update Video' : 'Add Video'}
      </p>
      <p className="text-xs text-slate-500">
        {game.videoUrl
          ? 'Change the linked game video URL.'
          : 'Link a YouTube video to sync with tracking.'}
      </p>
    </div>
  </button>
  {isVideoUrlEditOpen ? (
    <div className="mt-3 space-y-2">
      {/* same input + Save/Cancel block as the old Court-tab version, unchanged logic */}
    </div>
  ) : null}
</div>
```

**Pause Video During Stat Entry** — new toggle button using the `pauseVideoOnEntry`/`togglePauseVideoOnEntry` state and helper from Requirement 3, only rendered when `game.videoUrl` is set (no reason to show it for games without video):

```jsx
{
  game.videoUrl ? (
    <button
      type="button"
      onClick={togglePauseVideoOnEntry}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        {/* pause/play icon, same style */}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-900">Pause Video During Stat Entry</p>
        <p className="text-xs text-slate-500">
          {pauseVideoOnEntry
            ? 'On — video pauses while you tag a stat, resumes after.'
            : 'Off — video keeps playing while you tag a stat.'}
        </p>
      </div>
      <span
        className={`ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${pauseVideoOnEntry ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {pauseVideoOnEntry ? 'On' : 'Off'}
      </span>
    </button>
  ) : null;
}
```

## Progress checklist

**How to use this section**: this is the single source of truth for "what is this, what's done, what's left." A future session (or a resumed me) should be able to read _only_ this section and correctly continue the work without re-reading the rest of the plan or re-deriving state from `git diff`. The rest of the plan document above is the design reference to consult _when a checklist item needs implementation detail_ — this section is the map of where we are.

Update this section every time you complete a checklist item, discover a new sub-task, or change an approach mid-implementation. If reality diverges from what a step says (e.g. you find a better approach while coding), edit the step's text to match reality — don't leave it stale. Keep both copies in sync: `~/.claude/plans/i-want-to-work-robust-glacier.md` and `docs/game-track-lineup-video-plan.md` in the repo.

### What we're building (one-paragraph refresher)

Four related changes to `client/src/features/games/pages/GameTrackPage.jsx` (the live game-stat-tracking page): (1) league dual-team games force the user through a full-screen "set home lineup, then away lineup" flow before normal tracking unlocks; (2) on desktop, a game's video shows in a persistent left column so entry controls never need scrolling past it; (3) on mobile, the video fills the screen by default with a "Track Stat" button to switch into entry mode, auto-pausing/resuming and auto-returning to video on a successful stat log; (4) the More tab gains three new self-service actions: Rotate Court (vertical/horizontal), Add/Update Video, and a Pause-Video-During-Stat-Entry toggle. See `## Context` and `## Decisions from clarification` above for the full why; see `## Implementation` above for exact code/JSX per step.

### Current state of the codebase (as of last update to this checklist)

- Branch: `dev`. Nothing in this effort has been committed yet — check `git status`/`git diff` on `client/src/features/games/pages/GameTrackPage.jsx` to see the live in-progress diff before assuming anything below is accurate; this checklist describes intent, git is ground truth for what's actually in the file.
- **All 5 core implementation steps (1–5) are complete, test-covered, and lint/format-clean.** Only the optional postMessage hardening and the final end-to-end manual browser verification pass remain — see "When all steps are checked off" below.
- `GameTrackPage.jsx` has these pieces of state, all declared near the top of the component and now fully wired end-to-end: `courtOrientation`/`rotateCourt` (Step 1), `isDesktopLayout` (Step 3), `isMobileEntryMode` (Step 4), `pauseVideoOnEntry` (Step 4, toggled via `togglePauseVideoOnEntry` from the More tab), `videoUrlDraft`/`isVideoUrlEditOpen` (relocated to the More tab in Step 5). Module-level additions: `readLocalStorageFlag`/`writeLocalStorageFlag` (Step 1), `LineupPicker` component (Step 2), `GameVideoPanel` component (Step 3). `GameVideoEmbed.jsx` gained a `fill` prop (Step 3).
- `homeLineupReady`/`awayLineupReady`/`lineupSetupStep` derived consts and the `activeSide`-sync effect (with `prevLineupStepRef`) gate league dual-team games. `trackingShellClassName` and the two-column shell restructure handle desktop layout. The Court tab branches: mobile video-first (video+Track-Stat or entry+Back-to-Video, when `game.videoUrl && !isDesktopLayout`), or the original single-column Court content otherwise. The More tab has entries in order: Rotate Court (always), Pause Video During Stat Entry (only if `game.videoUrl` is set), Add/Update Video (always — the button label itself flips between "Add Video"/"Update Video" based on whether `game.videoUrl` is set), Save & Exit, Finish Game/Done Editing.
- **Zero lint errors, prettier-clean** across `GameTrackPage.jsx`, `GameTrackPage.test.jsx`, `GameVideoEmbed.jsx` — confirmed via `npx eslint` and `npx prettier --check`. No dangling unused state or half-wired code remains.
- This plan already went through one adversarial security/bug review (see `## Files touched` below for the two standing caveats it surfaced). The stale-ref-on-remount fix it called for is implemented and has a dedicated regression test (Step 3). Do not re-run that full review from scratch on resume — only re-review the specific delta if something changes materially from what's documented here.
- **Read the "Important test-infrastructure finding" note at the end of the Step 3 section before writing any more tests that involve tapping the court** — jsdom in this project doesn't implement `PointerEvent`, so `fireEvent.click(court, ...)` never works; use `fireEvent.pointerDown(...)` instead, and account for the 350ms ghost-click guard before clicking a subsequent stat button. Also note: `GameVideoPanel`'s `fill` variant (Step 4's mobile view) renders no "Game Video" text — assert on Track-Stat/Back-to-Video button presence there instead.
- Automated tests: `client/src/features/games/pages/GameTrackPage.test.jsx`. After the post-review fixes (M1/M2/L2), the file has **25 tests total: 18 passing** (13 feature tests across Steps 1–5, 3 for the M1/M2/L2 fixes, plus 2 originally-passing), 7 failing due to **pre-existing, unrelated** environment issues (confirmed via `git stash` A/B against clean `dev` — same 7 tests fail identically with or without this plan's changes; root cause: the `--localstorage-file` jsdom quirk plus jsdom's missing `PointerEvent`, both explained in Step 3's notes). Do not treat those 7 as regressions introduced by this work — they're a pre-existing, separate cleanup opportunity. A new shared `PlayerSelectionPanel` component (from the L2 fix) now backs the player-selection UI in both the mobile entry-mode and single-column Court branches.

### Setup — done

- [x] Plan reviewed adversarially for security/bugs; findings folded into this document (stale-ref-on-remount fix in Step 3, `SUB_IN` server-gap caveat, postMessage hardening note, anchor-based citations instead of raw line numbers so they don't drift as the file changes).
- [x] Confirmed working on `dev` branch (not `main` — this was originally caught and fixed mid-session).
- [x] New state variables added to `GameTrackPage.jsx` (see "Current state of the codebase" above).

### Step 1 — Rotate Court toggle — DONE

Why: lets the user flip the court image between vertical/horizontal for easier viewing; fully isolated from every other step, good smoke test that the More-tab button pattern works before bigger changes.

- [x] Threaded `rotate90={rotateCourt}` into both `<InteractiveCourtImage>` usages (Court tab entry content + fullscreen tracking overlay).
- [x] Added "Rotate Court" button to the More tab (first position, before "Save & Exit"), matching the existing icon-circle + title + subtitle pattern.
- [x] Added a test to `GameTrackPage.test.jsx` (`'rotates the court orientation from the More tab and applies it in both Court and fullscreen views'`): clicking "Rotate Court" toggles the transform on both the Court-tab and fullscreen `InteractiveCourtImage` instances. Passes.
- [ ] Manually verify in a real browser: toggling flips the court between vertical/horizontal in both the Court tab and fullscreen mode; resets to vertical on page reload. (Not yet done — automated test covers the logic; still do a real-browser pass per the "When all steps are checked off" section.)

**Bug fixed along the way (not scoped to Step 1, but blocking it):** the `pauseVideoOnEntry` state's init read `window.localStorage.getItem(...)` directly, which throws in this project's test environment (`vitest`/`jsdom` — a pre-existing `--localstorage-file` config quirk makes `window.localStorage` an object without working methods) — this was crashing **every single test** in `GameTrackPage.test.jsx`, not just new ones. Fixed by adding `readLocalStorageFlag`/`writeLocalStorageFlag` module-level helpers (defined near `createEmptySideState`) that wrap `localStorage` access in try/catch and fall back to a default value. `pauseVideoOnEntry`'s `useState` initializer now calls `readLocalStorageFlag('gameTrack.pauseVideoOnEntry', true)`. `writeLocalStorageFlag` is not yet consumed anywhere — it's wired up in Step 4 by `togglePauseVideoOnEntry`; until then it correctly shows as an unused-var lint error, same as the other Step 3/4 state.

**Pre-existing test failures found (NOT caused by this plan, confirmed via `git stash` A/B comparison against clean `dev`):** 7 of the 10 tests in `GameTrackPage.test.jsx` fail both before and after this plan's changes, with identical error messages, due to the same underlying `localStorage`/jsdom environment issue affecting other parts of the test file (e.g. `getEventPicker()`'s helper, dual-team side-switching test) that this plan doesn't touch. Do not treat these as something this plan broke — they were already broken on `dev`. Out of scope to fix as part of this plan; worth a separate ticket if someone wants full green CI on this file. The baseline failing test names (for reference, so future-you can confirm nothing new broke): `inserts a missed quick stat before a selected recent event`, `records modal quick stats without coordinates and modal opponent scoring without player selection`, `renders the score summary and tracking quick actions`, `shows all five on-court players for rebound follow-up and logs opponent rebound`, `shows only on-court players for assist follow-up and includes No Assist`, `switches active side in fullscreen and clears transient event state for dual-team games`, `updates on-court and bench lists after a substitution`.

### Step 2 — Sequential lineup gating (league, dual-team games only) — DONE (pending manual browser verification)

Why: brand-new league games currently let users skip past an incomplete lineup into other tabs; this forces home-lineup-then-away-lineup before anything else unlocks. Does not affect standalone/one-sided games at all.

- [x] Added `homeLineupReady` / `awayLineupReady` / `lineupSetupStep` derived consts (right after `isCompleted`).
- [x] Added the `activeSide`-sync `useEffect` with `prevLineupStepRef` (declared as `useRef(lineupSetupStep)` right where the effect lives, per the security review's confirmation that this correctly evaluates to `null` on true first render since `data` starts null — no bug).
- [x] Extracted the lineup-picker JSX into a `LineupPicker({ isDualTeam, teamDisplayName, players, lineupDraft, onToggle, onSave, isSaving, teamId, variant, stepLabel })` component defined above `GameTrackPage`. `variant="inline"` reproduces the exact original markup; `variant="fullscreen"` wraps it in a centered card with a step heading ("Set {Team} Starting Lineup") and `stepLabel` ("Step 1 of 2" / "Step 2 of 2").
- [x] Updated the inline Court-tab call site to `<LineupPicker variant="inline" .../>` — confirmed pixel-equivalent via passing pre-existing tests for non-league games.
- [x] Wrapped the top-level tab-nav-plus-content block in `{lineupSetupStep ? <fullscreen LineupPicker /> : <existing tab block>}`.
- [x] Added 3 new tests to `GameTrackPage.test.jsx` (all passing): `'gates a brand-new league dual-team game through home lineup then away lineup before showing normal tabs'` (full walk: home step → save → away step → save → normal tabs, asserts `setLineup` called with correct `teamSide` each time), `'resumes at the away lineup step when the home lineup is already set on load'`, `'skips gating and shows normal tabs immediately when both lineups are already set'`. Confirmed the two pre-existing lineup tests (`'blocks full-screen tracking...'`, `'saves the starting five...'`) still pass unchanged for non-league fixtures — no regression.
- [ ] Manually verify all four scenarios in a real browser (automated tests cover the logic; still do a real-browser pass per "When all steps are checked off"): brand-new league dual-team game; reload mid-setup with home set/away not; reload with both already set; non-league/one-sided game visually unchanged.

### Step 3 — Desktop two-column layout (video left, entry right) — DONE (pending manual browser verification)

Why: on desktop, video is currently buried in the Court tab requiring scroll-past; this pins it in a persistent left column across all tabs whenever `game.videoUrl` is set, on screens ≥1024px.

- [x] Added the `GameVideoPanel` display-only local component (supports an optional `fill` prop — used starting in Step 4's mobile view; `GameVideoEmbed.jsx` itself also got a `fill` prop added, since it owns the `aspect-video` vs `h-full` sizing decision).
- [x] Added the `isDesktopLayout` `matchMedia('(min-width: 1024px)')` `change`-listener effect (this state existed since Step 1 setup but had no listener wiring it up until now) and the `videoCurrentTimeRef.current = null` reset effect keyed on `isDesktopLayout` — the security-review fix for stale video timestamps across a breakpoint-triggered iframe remount. Both effects live right after the existing `onMessage` window-listener effect.
- [x] Computed `trackingShellClassName` and restructured the outer shell into the two-column layout: left column (`GameVideoPanel`, rendered only when `game.videoUrl && isDesktopLayout`) + right column (wraps the error banner and the `lineupSetupStep`-or-tabs block). `editingEvent`/`showFinishConfirm`/`isTrackingFullscreen` overlays stay as direct siblings of the two-column row, not nested inside the right column, since they're full-viewport overlays.
- [x] Removed the old inline video block from the Court tab entirely (the `{game.videoUrl ? 'Game Video' : 'Add Video'}` card, including its edit-URL UI) — `videoUrlDraft`/`isVideoUrlEditOpen`/`saveVideoUrl` are now temporarily unused (expected; Step 5 relocates that UI to the More tab).
- [x] Added 3 new tests to `GameTrackPage.test.jsx` (all passing): renders the video panel in the left column on desktop when a video URL is set; renders no video panel when there's no video URL; clears the captured video timestamp when the layout mode changes (a dedicated regression test for the security-review fix — walks through: dispatch a fake `infoDelivery` message setting the ref to 42, flip the mocked `matchMedia` to simulate crossing the breakpoint, then tag a stat and assert the saved event's `videoTimestamp` is `undefined`, not the stale `42`).
- [ ] Manually verify: no-video games are visually unchanged (single column, no left column); desktop with video shows the persistent left column across all four tabs without scrolling past it; resizing the window across the 1024px breakpoint keeps exactly one live YouTube iframe mounted at a time (check browser dev tools) and tapping the court to tag a stat right after a resize still captures a sane (not stale) timestamp.

**Important test-infrastructure finding from writing Step 3's tests (read this before writing more tests that involve tapping the court):** this project's jsdom version (25.0.1) does not implement the `PointerEvent` constructor at all (confirmed directly: `typeof new JSDOM().window.PointerEvent === 'undefined'`). `InteractiveCourtImage.jsx` only listens for `onPointerDown` (not `onClick`/`onMouseDown`), so `fireEvent.click(court, ...)` — the pattern used by every pre-existing court-tap test in this file — can **never** actually trigger a court selection in this environment; those tests were already broken before this plan (they're among the "7 pre-existing failures" noted in Step 1, and it's now confirmed _why_: not just the localStorage issue, but this PointerEvent gap too). The fix for new tests: use `fireEvent.pointerDown(court, { clientX, clientY })` instead of `fireEvent.click(...)`. Separately, after a pointerdown opens the event picker, there's a real 350ms "ghost click" guard (`ghostClickGuardRef` in `GameTrackPage.jsx`) that swallows any click on the picker's backdrop/contents within 350ms of the pointerdown — tests that click a stat button immediately after opening the picker need a short real delay (e.g. `await new Promise(r => setTimeout(r, 400))`) before that click, or they'll silently do nothing. Neither of these is a production bug — both only affect test authoring. Consider fixing the 7 pre-existing tests as a separate, out-of-scope cleanup ticket now that the root causes (localStorage + PointerEvent) are both identified.

### Step 4 — Mobile video-first tracking flow — DONE (pending manual browser verification)

Why: on narrow screens, this is the core UX fix requested — video fills the screen by default (below the pinned tab bar/score header), a "Track Stat" button switches to entry mode, and successfully logging a stat auto-resumes video and auto-returns to video view, eliminating the scroll-between-video-and-controls friction.

- [x] Added a `useEffect` keyed on `activePanel` that resets `isMobileEntryMode` to `false` whenever `activePanel !== 'court'`, so navigating to Subs/Events/More and back to Court always re-lands on video-first view.
- [x] Rendered the Court tab's mobile video-first / entry-mode toggle: `activePanel === 'court' && game.videoUrl && !isDesktopLayout` branches into `isMobileEntryMode` (Back-to-Video button + the original Court tab entry content, duplicated inline since the two variants share content but differ in wrapper chrome — see note below) vs. the default (Track Stat button + `GameVideoPanel` with `fill`). The original non-mobile-video-first Court tab branch (no video, or desktop layout) is preserved unchanged via an `else if activePanel === 'court'` fallback.
- [x] Wired `pauseVideoOnEntry` gating into both the "Track Stat" button's `pauseVideo()` call and the existing `pauseVideo()` call inside `onCourtSelect` (both now `if (pauseVideoOnEntry) pauseVideo();`).
- [x] Extended `clearEventPicker` to also call `setIsMobileEntryMode(false)` when `resume: true` — confirmed safe per the security review's exhaustive call-site audit; no call-site changes needed.
- [x] Added `togglePauseVideoOnEntry` (uses `writeLocalStorageFlag`) and the "Pause Video During Stat Entry" toggle button to the More tab (only rendered when `game.videoUrl` is set), matching the existing button pattern with an On/Off pill.
- [x] Added 4 new tests to `GameTrackPage.test.jsx` (all passing): full Track-Stat → pause → tag-a-stat → auto-resume-and-return-to-video flow; cancelling the event picker stays in entry mode; switching tabs away from Court and back resets to video-first; toggling "Pause Video During Stat Entry" off in the More tab still allows manual Track-Stat/Back-to-Video switching while suppressing pause/resume. (Note: could not test actual cross-reload `localStorage` persistence in this environment, since `window.localStorage.getItem`/`setItem` both throw here — see the Step 1/3 notes on the pre-existing jsdom environment gap. `readLocalStorageFlag`/`writeLocalStorageFlag`'s try/catch guards were exercised indirectly by every test in the file passing without throwing.)
- [ ] Manually verify: tapping Track Stat pauses (if preference on) and switches to entry view; logging a stat successfully auto-resumes playback and auto-returns to video view; cancelling/dismissing the event picker instead stays in entry mode (does not auto-return); switching tabs away from Court and back always lands on video-first, never stranded in entry mode; toggling the preference off in the More tab disables both pause-on-entry and resume-on-log, and the toggle's state survives a real page reload (localStorage) — this last part specifically needs real-browser verification since it couldn't be tested in this jsdom environment.

**Known tradeoff accepted for Step 4:** the mobile video-first Court-tab content (court image, event picker, player-selection list) is duplicated inline rather than extracted into a shared sub-component with the original Court-tab branch, since the two variants differ in wrapper chrome (a Back-to-Video button wrapping one, nothing wrapping the other) and extracting would require threading many props for marginal benefit at this file's current size. If this file grows further, consider extracting a `CourtTabContent` component to de-duplicate.

### Step 5 — Add/Update Video in More tab — DONE (pending manual browser verification)

Why: the video-URL editing feature already exists and works today, just buried inside the Court tab; this purely relocates its UI to the More tab (alongside the two new toggles above) since Step 3 removes it from the Court tab.

- [x] Moved the video-URL-edit trigger + expansion UI into the More tab (between "Pause Video During Stat Entry" and "Save & Exit"), restyled to match the icon+title+subtitle button pattern. Reuses `videoUrlDraft`/`isVideoUrlEditOpen`/`saveVideoUrl` completely unchanged — this was a pure JSX relocation, no logic changes. No pre-existing test referenced the old Court-tab location, so nothing needed updating there.
- [x] Added `gamesApi.update` to the test file's mocked API surface (it wasn't mocked before this step) with a `mockImplementation` that merges the payload into `currentResponse.game`, matching the pattern of the other mocked endpoints.
- [x] Added 2 new tests to `GameTrackPage.test.jsx` (both passing): adding a video URL from the More tab on a game with no video calls `gamesApi.update` with the right payload, flips the button to "Update Video", and the Court tab's video panel reflects it; updating an already-set video URL pre-fills the input with the current URL and persists the change on save.
- [ ] Manually verify: "Add Video" (or "Update Video" if one's already set) opens the URL input, Save persists via the existing unchanged `saveVideoUrl` → `gamesApi.update`, and the video panel (desktop left column or mobile video-first view) reflects the new URL immediately.

**Lint/format status:** `npx eslint` on `GameTrackPage.jsx`, `GameTrackPage.test.jsx`, and `GameVideoEmbed.jsx` returns zero errors — every piece of state/helper added since Step 1 is now fully wired and consumed. `npx prettier --check` passes on all three files. This is the first point since Step 1 where the file has no lint placeholders at all.

### Optional hardening (bundle opportunistically while touching this file; not blockers for shipping the above)

- [x] Added an `event.source` guard at the top of the `onMessage` listener. Final form (tightened after a post-implementation security pass): `if (!videoIframeRef.current || event.source !== videoIframeRef.current.contentWindow) return;` — rejects messages both when the source isn't our iframe AND when no iframe is mounted (an earlier `videoIframeRef.current && ...` form left a gap where any message was accepted when no video existed). The Step 3 stale-timestamp test sets `source: iframe?.contentWindow` on its synthetic `MessageEvent` so it still exercises the real code path (verified meaningful: the test fails as expected when the reset effect is temporarily disabled). No regressions; lint/prettier clean.
- [ ] Consider a follow-up ticket (separate from this plan) for the pre-existing server-side gap where `SUB_IN` events bypass `requireBothLineups` in `games.service.js`'s `appendEventForUser` — see `## Files touched` below for full detail. Not required for this plan to ship since it's a standing gap this plan doesn't worsen. **Still open — not addressed by this plan.**

## Post-implementation review (after all 5 steps + hardening)

Two independent agents reviewed the finished work: a completeness pass (plan vs. actual code) and a fresh adversarial security/bug pass.

**Completeness: COMPLETE.** Every checked-off item across all 5 steps + the hardening was verified present at exact line refs; all 13 new tests map to their steps; no orphaned state; overlays correctly positioned as siblings of the two-column row. No gaps.

**Security/bug pass — outcomes:**

- Both previously-fixed issues (stale `videoCurrentTimeRef` reset; postMessage `event.source` guard) verified correctly implemented.
- **H1 (FIXED):** the guard's `videoIframeRef.current && ...` short-circuit accepted any message when no iframe was mounted (spoofable `videoTimestamp` poisoning on no-video games — data-only, needs a malicious same-page script, low real-world risk). Tightened to `!videoIframeRef.current || ...`. Done.
- **M1 (FIXED):** toggling "Pause Video During Stat Entry" OFF while a video was auto-paused would strand it paused (resume gated off). Fixed in `togglePauseVideoOnEntry`: when flipping the pref to off, call `playVideo()` (no-op if already playing) so the video is released. Investigation clarified this trap is **desktop-only** — on desktop the video lives in the persistent left column (stays mounted across tabs), so it can genuinely be stranded; on mobile the video iframe unmounts when you leave the Court tab and remounts fresh (playing) on return, so there's nothing to strand. New test (`toggling "Pause Video During Stat Entry" off resumes the video`) spies on the iframe's postMessage and asserts a `playVideo` command fires; deliberately uses desktop layout where the trap is reachable.
- **M2 (FIXED):** `saveVideoUrl` now sends `videoUrl: trimmed || null` so an empty/whitespace input detaches the video (server accepts `null`, rejects `''`). New test asserts a whitespace input calls `gamesApi.update` with `{ videoUrl: null }`.
- **L1 (pre-existing, untouched):** a commented-out avatar initial in the event-picker player list — exists in `HEAD`, unrelated to this work, cosmetic. Left as-is.
- **L2 (FIXED, and de-duplicated):** extracted a shared `PlayerSelectionPanel` local component (on-court list + collapsible Bench) and used it in BOTH the mobile entry-mode branch and the original single-column Court branch. This closes the gap (mobile entry mode now exposes bench players for stat attribution on non-league standalone video games) AND removes the duplication that caused the divergence in the first place, so the two can't drift again. New test asserts the Bench section + a bench player button appear in mobile entry mode. The other omissions (last-action footer, fullscreen button, inline LineupPicker) were left out of entry mode intentionally — accepted as fine: the fullscreen button is redundant in an already-focused entry view, and for league games lineup gating guarantees a complete lineup before tracking; a standalone game with an incomplete lineup still surfaces the picker via the non-video / desktop court branch.

## Post-review layout amendments (user-requested, after the fixes above)

- **Mobile video fills remaining space:** in the mobile video-first "watch" view, the tab-content wrapper now drops its `p-4`/scroll (`isMobileVideoWatchView` derived flag → `flex flex-col overflow-hidden`), so the video (`fill`) stretches edge-to-edge below the pinned team header, tabs, and Track-Stat button. The Track-Stat button keeps a small `m-3` margin so it isn't cramped. Mobile-only; entry-mode view still padded/scrollable.
- **No border radius on videos:** removed `rounded-xl` from both `GameVideoEmbed` container variants (fill + aspect-video).
- **Desktop video ~65% of width:** the desktop left video column is now `lg:w-[65%]` (was a fixed `lg:w-[26rem]`), the shell widened to `max-w-7xl` (was `max-w-6xl`), and `lg:self-start` removed so the video column fills the column height. The right column (`flex-1`) takes the remaining ~35% for stat tracking.
- **`GameVideoPanel` simplified:** now always renders `GameVideoEmbed` in `fill` mode (edge-to-edge, no card/heading/border). The old non-fill "Game Video" card variant became dead code once both call sites (desktop column + mobile watch view) switched to fill, so it was removed along with the vestigial `fill` prop at the call sites. Tests that asserted on the `"Game Video"` heading were updated to assert on the iframe (`getByTitle('Dev Scrimmage')`) instead; the stale-timestamp test's post-flip check now waits for the mobile "Track Stat" button to confirm the layout flip. Suite: 18 passing / 7 pre-existing failures, lint + prettier clean.

## Bug fix: mobile video restarted on every tab switch / stat entry

**Symptom (mobile only):** leaving the Court tab and returning, or entering stat-entry mode, restarted the video from the beginning — losing the user's place. Desktop was fine.

**Root cause:** on mobile the video iframe was mounted _inside_ the Court tab's conditional content (specifically the video-first watch sub-branch). Any state change that stopped rendering that sub-branch — switching tabs (whole `activePanel === 'court'` block unmounts) or entering entry mode (renders the sibling entry sub-branch instead) — unmounted the iframe. Returning remounted a fresh `<iframe src=...>`, which reloads YouTube from the start. Desktop was unaffected because its video lives in the persistent left column that never unmounts.

**Fix:** restructured the mobile tab-content region so the video is a **persistent layer that stays mounted** across all tab/entry-mode changes and is merely CSS-`hidden` (not unmounted) when not in the watch view — so the iframe (and its playback position) survives. Details:

- The tab-content wrapper is now `flex min-h-0 flex-1 flex-col overflow-hidden`, containing (1) a persistent mobile video layer rendered whenever `game.videoUrl && !isDesktopLayout`, shown (`flex min-h-0 flex-1 flex-col`) only when `isMobileVideoWatchView` else `hidden`; and (2) an inner scrollable region (`overflow-y-auto p-4`, itself `hidden` during the watch view) holding all tab content.
- The mobile watch sub-branch's inline `GameVideoPanel` was removed (the persistent layer now owns it). The old single-column court fallback branch's condition was tightened to `activePanel === 'court' && !(game.videoUrl && !isDesktopLayout)` so it no longer redundantly mounts a second court underneath the hidden region for mobile-video games.
- Still exactly one live iframe: the persistent mobile layer is gated on `!isDesktopLayout` and the desktop left column on `isDesktopLayout`, so only one ever renders at a session's viewport size.
- **Behavioral note:** a backgrounded mobile video keeps _playing_ (audio too) while on other tabs — same as desktop, and required to preserve position. If muting/pausing-on-background is wanted later, that's a separate follow-up.
- **Tests:** the "Track Stat pauses and switches" mobile test was updated from presence-based to persistence-aware assertions (jsdom doesn't load Tailwind CSS, so `toBeVisible()` can't detect the `hidden` class — assertions check the entry UI's mount/unmount + the video layer's `hidden` class via `toHaveClass`). Suite still 18 passing / 7 pre-existing failures; lint + prettier clean.

## Accessibility pass (user-requested, from BrowserStack a11y devtools)

The a11y extension flagged a large batch. Triaged into real issues (fixed) vs. static-analyzer false positives:

- **Form controls (real):** added `aria-label` to the edit-event modal's 3 `<select>`s (Player/Stat type/Court zone) and its 2 number inputs (X/Y, also `autoComplete="off"`); `aria-label` + `autoComplete="off"` on the video-URL input; `aria-label` on the lineup checkbox.
- **Dialogs (real):** added `aria-label` (accessible name) + an Escape-to-close `onKeyDown` to all three modal/dialog backdrops — the event picker (`role="dialog"`), the edit-event modal, and the finish-confirm modal (the latter two also gained `role="dialog"`/`aria-modal`). This satisfies `aria-dialog-name` + `click-events-have-key-events`/`no-static-element-interactions` (backdrop click-to-close now has keyboard parity via Escape, alongside the existing in-dialog Close buttons).
- **Buttons (mostly false positives, labeled anyway):** the many `button-name` flags were dynamic-text buttons (player-select, tab bar, team-toggle, More-tab actions) the static analyzer can't see text in. Added explicit `aria-label` (+ `aria-pressed` for toggle-state buttons) to the player-selection buttons (`PlayerSelectionPanel` on-court + bench), the two follow-up player lists, the dual-team header side-toggle, the tab-bar buttons, and the substitution player cards — both silencing the tool and giving screen readers cleaner labels than concatenated spans.
- **`react-hooks/exhaustive-deps` "rule not found" (not a code issue):** the extension's linter lacks the `react-hooks` plugin, so it can't resolve the intentional `// eslint-disable-next-line react-hooks/exhaustive-deps` on the `activeSide`-sync effect. The project's own ESLint recognizes it and passes clean; the disable is required (the effect intentionally omits `activeSide` from deps). Left as-is.
- **Verification:** project `npx eslint` passes with 0 issues; 18 passing / 7 pre-existing test failures (unchanged — no aria-label broke a role/name query); prettier clean.

### When all steps are checked off

- [ ] Run the full existing test command for this file (check `client/package.json` for the exact script, e.g. `npm test` or `npx vitest run GameTrackPage`) and confirm everything passes, including the new tests added per-step above and the pre-existing tests that Step 2 required reviewing.
- [ ] Full pass through the `## Verification` section below end-to-end in a real browser (not just per-step spot checks) before considering this plan complete.
- [ ] Decide with the user whether/how to commit (this plan's instructions have not included a commit step — confirm before committing, per standard git-safety practice).

## Files touched

- `client/src/features/games/pages/GameTrackPage.jsx` — all changes above.
- No server-side changes required for this feature — `gamesApi.setLineup`, `gamesApi.update`, and the underlying game schema already support everything needed. `pauseVideoOnEntry` is a `localStorage`-only client preference.

**Known pre-existing server gap (not introduced by this plan, not fixed by it):** `games.service.js`'s `appendEventForUser` already calls `requireBothLineups(game)` before accepting most stat events on dual-team games (`if (!insertBeforeEventId && payload.statType !== STAT_TYPES.SUB_IN) { requireBothLineups(game); }`) — so a direct API call attempting to record a shot/rebound/etc. on a league dual-team game with incomplete lineups is already correctly rejected with a 400, both before and after this plan. However, `SUB_IN` events are explicitly exempted from that check, meaning a direct API call (bypassing the UI) can establish a partial "lineup" via a raw `SUB_IN` event without ever calling `setGameLineup` — undermining the invariant this plan's client-side gating assumes. This is a standing gap unrelated to and not worsened by this plan; it's called out here so nobody concludes the server is fully airtight. Consider a follow-up ticket to close the `SUB_IN` exemption, but it's out of scope for this plan.

**Postmessage hardening opportunity (pre-existing, optional, low-cost to bundle):** the existing `onMessage` listener (the `window.addEventListener('message', onMessage)` effect near the top of the component, handling `infoDelivery` events to update `videoCurrentTimeRef`) accepts messages from any origin/source with no `event.source` check. Blast radius is narrow (it can only corrupt `videoCurrentTimeRef`, a cosmetic value not used for authorization), but since this plan is already touching this exact code area, consider adding a one-line guard while here: `if (event.source !== videoIframeRef.current?.contentWindow) return;` at the top of `onMessage`. Optional, not a blocker.

## Verification

- Manually run the app (`npm run dev` or equivalent) and open a **new league, dual-team game**: confirm the tab bar is replaced by a full "Set Home Team Starting Lineup" step, then after saving, "Set Away Team Starting Lineup", then normal tabs appear with Home as the active side.
- Reload mid-setup (home set, away not) — confirm it resumes directly at the away step.
- Reload with both lineups already set — confirm normal tabs appear immediately, no gating flicker.
- Open a **standalone/one-sided game** — confirm lineup picker behavior in the Court tab is unchanged from before.
- On a desktop-width browser window, open a game with a video URL set — confirm video renders in a persistent left column while Court/Subs/Events/More remain usable on the right without scrolling past the video. Resize across the 1024px breakpoint and confirm only one video iframe is ever mounted (check dev tools) and playback/timestamp capture still works when tagging a shot.
- On a narrow/mobile-width window with a video set, open the Court tab: confirm it shows the video filling the space below the tab bar/score header with a "Track Stat" button above it (not overlapping the video). Tap "Track Stat": confirm the video pauses (when the preference is on) and the normal court/entry UI appears with a "Back to Video" button. Log a stat: confirm the view automatically returns to video and playback resumes. Cancel/dismiss the event picker instead: confirm it stays in entry mode (does not auto-return to video).
- Switch from Court tab to Subs/Events/More and back to Court: confirm it lands back on video-first view, not stranded in entry mode.
- In the More tab: toggle "Pause Video During Stat Entry" off, then repeat the Track Stat flow — confirm the video is not paused/resumed and the view still switches manually via Track Stat/Back to Video. Reload the page and confirm the toggle's state persisted (localStorage).
- In the More tab: tap "Rotate Court", confirm the court image flips between vertical and horizontal in both the Court tab and fullscreen tracking mode; confirm it resets to vertical on page reload (local-only, not persisted).
- In the More tab: tap "Add/Update Video" (or "Update Video" if already set), enter/change a URL, save, and confirm `game.videoUrl` updates and the video panel reflects the new URL.
