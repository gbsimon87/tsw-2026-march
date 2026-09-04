# UI/UX — open items

Everything the 2026-08-24 audit found or raised that is **not** fixed. Sources:
[`2026-08-24-first-game-tracked.md`](2026-08-24-first-game-tracked.md) (the
walkthrough) and [`2026-08-24-fixes.md`](2026-08-24-fixes.md) (what shipped).

Ordered by what it costs to leave alone.

---

## 1. Data — restore the Dorset Basketball Association league

**Status: needs a decision and a script.**

`pnpm seed` on 2026-08-24 wiped the shared Atlas dev database, including the
Dorset Basketball Association league. Cause: `env/server/.env.development`
declared `MONGO_URI` twice (localhost, then the Atlas cluster) and dotenv keeps
the last one, so a command that looked local was not. The duplicate is now
commented out and dev points at localhost.

`tsw_2026_prod` is a separate database and was **not** touched.

To restore:

- Snapshot: `backups/league-dorset-basketball-association-tsw_2026_dev-2026-08-22T23-37-59-668Z.json`
  (Aug 22 — anything created in dev between then and Aug 24 is not in it).
- `server/src/scripts/export-league-snapshot.js` has **no import counterpart**.
  One has to be written. The exporter's header documents the shape it captures,
  including the id→email map for remapping `ownerUserId` / `claimedByUserId` /
  `userId` after new `_id`s are minted.

Guard for next time: print the effective URI before any destructive script
rather than reading the env file top-to-bottom.

## 2. Information architecture — the "drastic" proposal

**Status: recorded for a decision, deliberately not implemented.**

The audit's conclusion was that `/admin`'s league-vs-team split models TSW's data
model rather than a coach's job, and that a single "Your basketball" surface —
one recency-sorted list, each row carrying `Track a game`, and an inline
name-and-go card for a brand-new user — would serve the primary journey better.

Implementing it supersedes the current router's assumption that
`/pricing?resourceType=…&action=create` is the canonical _creation_ entry point
for billable resources. It would stay the canonical _upgrade_ entry point.

The in-place fixes shipped instead: default tab follows what the user owns,
`Track a game` is on the team row, and team creation no longer routes through
pricing.

## 3. `/` has no statement of what TSW is

The root redirects to `/pulse`, a feed of strangers' posts. A first-time visitor
gets no value proposition and no orientation. Fixing this means designing a
marketing surface, which is new work rather than refinement.

## 4. Desktop tracker layout

**Status: partially improved.**

The court is ~2.4× its previous area and the header now aligns with the content
container, but the court panel still carries wide empty margins on desktop.
Filling them properly means moving player selection beside the court — a layout
redesign of `GameTrackPage`'s court panel, not polish. Mobile (the primary
courtside surface) is unaffected.

## 5. Mobile navigation

None of these blocked the journey, so they were left for a mobile-nav pass:

- The drawer duplicates the bottom tab bar — Pulse, Discover, My Sporty and
  Admin appear in both.
- The drawer carries no user identity (no name, email or avatar), and `Logout`
  sits in the same list as navigation, differentiated only by size.
- Drawer items are ~40px tall, below the 44px touch-target minimum.
- `FeedTabBar` is `fixed … bottom-0 … h-16` with no
  `padding-bottom: env(safe-area-inset-bottom)`, so on a device with a home
  indicator the labels sit in the gesture area
  (`client/src/features/feed/components/FeedTabBar.jsx:90`).
- The feed's floating `+` is labelled for screen readers ("Create post") but
  visually is a bare `+`.

## 6. Form controls not yet on the shared styles

`components/ui/formStyles.js` is now the single definition of an input, and
`NewTeamPage`, `NewGamePage`, `GameFormatFields` and both auth forms use it.
These still carry the old `rounded border border-slate-300 px-3 py-2` treatment:

- `features/teams/pages/EditTeamPage.jsx`
- `features/leagues/pages/AdminLeagueTeamPage.jsx`
- `features/leagues/pages/AdminNewLeaguePage.jsx`
- `features/leagues/pages/AdminNewLeagueTeamPage.jsx`
- `features/billing/pages/PricingPage.jsx`

Native checkboxes and `datetime-local` inputs are also still unstyled across the
app.

## 7. Smaller copy and polish items

- Recap header reads "1 key moments" — no singular form
  (`GameRecapPanel.jsx:232`).
- `/pricing` shows `starter · inactive` under the team selector; the label is
  internal vocabulary.
- An anonymous visitor triggers `401` on both `/auth/me` and `/auth/refresh` on
  every cold load. Harmless but a wasted round trip and permanent console noise.

## 8. Design-detector warnings knowingly left

`node <impeccable>/scripts/detect.mjs --json client/src` reports 6, all
pre-existing or deliberate:

| Finding                                         | Why it stands                                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SportsLoader.jsx:9` `animate-bounce`           | pre-existing; loader not in audit scope                                                                                                                                                                                   |
| `ScheduleDraftTable.jsx:74` slate-600 on red-50 | measured 6.6:1 — passes AA, detector heuristic false positive                                                                                                                                                             |
| `AboutPage.jsx:162` `border-l-4`                | pre-existing; About page not in audit scope                                                                                                                                                                               |
| `globals.css` Inter body face                   | changing the typeface is a rebrand, not polish                                                                                                                                                                            |
| `globals.css:25` and `:71` bounce easing        | these are transitions-dev's own `--digit-ease` and `--check-ease-bob`, kept verbatim because that skill requires its snippets unmodified. Impeccable and transitions-dev disagree here; the more specific instruction won |

## 9. Pre-existing build warning

`recharts` bundles to 534 kB (158 kB gzip) and trips Vite's 500 kB chunk
warning. Predates this work.
