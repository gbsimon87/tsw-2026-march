# UX audit — "Coach signs up and tracks their first game"

**Date:** 2026-08-24
**Method:** `ux-audit` skill (task-based walkthrough, live app via Playwright), then
`impeccable` for visual/UX repair and `transitions-dev` for motion.
**Build:** branch `feat/ui-ux-audit`, local `pnpm dev`, seeded dev DB.
**Viewports:** 1440×900 (desktop) and 390×844 (mobile).
**Open items:** [`OPEN-ITEMS.md`](OPEN-ITEMS.md).

---

## Task script

A basketball coach who has never seen TSW lands on a shared link. Goal: understand what
this is, sign up, get their team in, and track a game to a box score. Start: `/`.

Role-played with **zero codebase knowledge**. Every click asked: _how would I know to click
this without having read the code?_

---

## Blocker found before the walkthrough could start

`pnpm seed` **failed outright**. `Game validation failed` — the seed script's event builder
predates the game-clock feature and never sets the three required event fields
(`segmentKind`, `segmentNumber`, `clockMillisecondsRemaining`). The DB rolled back empty, so
no new developer could run the app with data. Fixed in `server/src/scripts/seed.js`
(`assignClockSnapshots`).

A second config defect surfaced during setup: `env/server/.env.development` declared
`MONGO_URI` **twice** — localhost on line 4, the shared Atlas cloud cluster on line 5.
dotenv keeps the last, so `pnpm dev` and the destructive `pnpm seed` both targeted the
cloud dev database while appearing to target localhost. Commented out, with the reason
recorded inline.

---

## The trail — counts, not adjectives

| #   | Step                                                                  | Clicks so far | Outcome                                                                                                                                         |
| --- | --------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Land on `/`                                                           | 0             | Redirects to `/pulse`, a feed of strangers' posts. No statement of what TSW is.                                                                 |
| 2   | Dismiss cookie dialog                                                 | 1             | —                                                                                                                                               |
| 3   | `Sign in / Join`                                                      | 2             | Reached `/register`.                                                                                                                            |
| 4   | Submit empty form                                                     | 3             | **Native browser tooltip** ("Please fill out this field"), not app styling.                                                                     |
| 5   | Submit 3-char password                                                | 4             | **`String must contain at least 8 character(s)`** — a raw Zod string.                                                                           |
| 6   | Submit valid                                                          | 5             | Signed in, dropped on `/pulse`. No welcome, no next step, no account confirmation.                                                              |
| 7   | `My Sporty` (guess: "my stuff")                                       | 6             | **Dead end.** Claimed-league-profiles only. Empty state has _zero_ actions.                                                                     |
| 8   | `Admin` (guess 2)                                                     | 7             | Lands on the **Managed Leagues** tab. Coach has no league. Primary content: "No leagues yet."                                                   |
| 9   | `Managed Teams` tab                                                   | 8             | Jargon. Coach thinks "my team", not "managed team".                                                                                             |
| 10  | `Create your first team →`                                            | 9             | Reached `/teams/new`.                                                                                                                           |
| 11  | Fill 1 required + 5 roster rows                                       | 9             | 1,300px form; 11 of 12 fields optional, including a full postal address.                                                                        |
| 12  | `Create Team`                                                         | 10            | **Redirected to `/pricing`.** No success confirmation. **No link to the team just created.** The free column's only button is "View The Pulse". |
| 13  | `Admin` → `Managed Teams` again                                       | 12            | Tab **resets to Managed Leagues** on every visit.                                                                                               |
| 14  | Team card                                                             | 13            | Reached the team. First sight of the thing built at step 11.                                                                                    |
| 15  | `New Game`                                                            | 14            | Good, clear primary.                                                                                                                            |
| 16  | `Create and Start Tracking`                                           | 15            | Native tooltip — **`Game Title` is required but unmarked**, while every other field says "(optional)".                                          |
| 17  | Fill title, submit                                                    | 16            | Reached the tracker.                                                                                                                            |
| 18  | Tap `Start game`                                                      | 17            | **Disabled, with no explanation.** Gate is "save a lineup first" — never stated.                                                                |
| 19  | Select 5, `Save Lineup`, `Start game`, tap court, `Make`, `No Assist` | 22            | Score 0 → 3. Event recorded correctly.                                                                                                          |

**Click cost from signup to one recorded stat: 22, with one dead end, one tab reset, and one
upsell detour.** None of the path was signposted.

---

## Copy vs mechanism

Every one of these is a software defect, not a wording preference.

1. `/pricing`, reached immediately after creating a team: _"Track for free. Live stat tracking
   and box scores are free, forever."_ The free column's only control is **View The Pulse** —
   a social feed. At the exact moment the copy promises tracking, the mechanism offers a feed
   and no route to the team.
2. `/games/new`: _"Use an unlisted YouTube link to test playback without paying for app-side
   video storage."_ A note to the team building TSW, shipped to coaches.
3. Tracker event log: `Q1 9:56 Backcourt (50.0, 50.0)` — raw coordinates in user-facing text.
4. ~~League standings hero promises "record, PF, PA, and differential" but mobile renders
   only Team / W–L / Form.~~ **Corrected:** all four render — they were scrolled off-screen
   with no scroll cue, which is a different (and real) defect. See P11.
5. Standings header reads `W–L`; the values are `2-1-1` — three segments under a two-part
   header.
6. `New Team` / `Create your first team →` and `New League` / `Start your 14-day trial →` are
   pairs of controls pointing at identical URLs, in the same panel.

---

## Findings, ranked

### Task-blocking

| ID  | Finding                                                            | Evidence                                                                          |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| B1  | `pnpm seed` crashes; DB unusable for a new dev                     | `Game validation failed`, 3 missing required event fields                         |
| B2  | Duplicate `MONGO_URI` silently repoints dev at the shared cloud DB | env lines 4 and 5                                                                 |
| B3  | Creating a team redirects to a paywall with no route to the team   | step 12                                                                           |
| B4  | Post-signup has no orientation and no first action                 | step 6; `/my-sporty` empty state has 0 controls                                   |
| B5  | `Start game` disabled with the gate unstated                       | step 18                                                                           |
| B6  | `Game Title` required but unmarked among "(optional)" siblings     | step 16                                                                           |
| B7  | Raw Zod strings shown as user errors                               | `String must contain at least 8 character(s)`                                     |
| B8  | Nested `<a>` inside `<a>` — invalid DOM                            | `BillingStatusPill` inside the team-card `Link`, React `validateDOMNesting` error |
| B9  | Escape closes no overlay (Add Event, mobile drawer)                | dialog stayed open                                                                |
| B10 | Add Event dialog never receives focus                              | `document.activeElement === BODY` with `aria-modal="true"`                        |

### Friction

| ID  | Finding                                                                                 |
| --- | --------------------------------------------------------------------------------------- |
| F1  | Admin always opens on Managed Leagues, ignoring what the user actually owns             |
| F2  | "Managed Teams" is internal jargon in the primary IA                                    |
| F3  | `Add Player` leaves focus on the button; the new row's field is not focused             |
| F4  | Create Team demands a full postal address before its one required field's payoff        |
| F5  | Error banner insertion shifts the whole form down 58px; no `role="alert"`               |
| F6  | Add Event: ~450px of dead space (desktop), ~200px gap then bottom-edge buttons (mobile) |
| F7  | "No Assist" and "Dismiss" sit adjacent with no visible difference in outcome            |
| F8  | Every state change in the app is instant — no motion anywhere                           |

### Polish / visual

| ID  | Finding                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Cream page band ends at content height, leaving a hard seam and dead grey below; 14 pages repeat the `-m-4 p-4 bg-[#F7F5F0]` hack, and pages that omit it get a different background                                                        |
| P2  | Add Event uses 7 unrelated hues. _(Corrected after measurement: only the rebound amber fails AA, at 3.19:1. The defect is incoherence, not contrast.)_                                                                                      |
| P3  | Active tab is a square-cornered black block breaking its container's radius (Admin, tracker, recap)                                                                                                                                         |
| P4  | Three different greens for three different confirm buttons                                                                                                                                                                                  |
| P5  | Player avatars are amber on the scoreboard, blue in Key Moments and Top Performers                                                                                                                                                          |
| P6  | Recap "Shooting splits" y-axis labels read `000%`, `500%`. _(Root cause found during the fix: not clipping — the client multiplied an already-0–100 percentage by 100 again, so the axis domain was `[0, 10000]`. A real correctness bug.)_ |
| P7  | Recap Top Performers row overflows and clips its third card                                                                                                                                                                                 |
| P8  | Native unstyled controls: colour inputs render as solid black bars labelled "Not set"; file input; selects; checkboxes; datetime                                                                                                            |
| P9  | Desktop tracker: the court — the product's primary target — occupies ~4% of its card                                                                                                                                                        |
| P10 | Admin stat tiles give label and value near-identical weight                                                                                                                                                                                 |
| P11 | Mobile standings: team names wrap to 2–3 lines in a 77px column while Form gets 130px; PF/PA/+− scroll off-screen with no cue; league name truncates to "Metro Spring Le…"                                                                  |
| P12 | `text-dark` is not a defined class — the Logout button has no colour rule (×2)                                                                                                                                                              |

---

## The drastic section

**Should the first-run journey exist in this shape at all?**

No. The current shape makes a coach navigate an _organisational_ hierarchy —
league vs. managed team, Admin vs. My Sporty — before they can do the one thing the product
is for. The IA is modelled on TSW's data model, not on the coach's job.

The proposal: **`/admin` becomes a single "Your basketball" surface** with no tabs. Leagues
and teams are one list, sorted by recency, each row carrying its own primary action
(`Track a game`). A user with nothing sees one card: _Add your team_ — name field and a
`Start tracking` button inline, address and colours deferred to Edit. The pricing page stops
being a redirect target for object creation and becomes reachable only from an explicit
upgrade affordance.

That supersedes the ruling implied by the current router: that `/pricing?resourceType=…&action=create`
is the canonical creation entry point for billable resources. It stays the canonical
_upgrade_ entry point; it stops being the _creation_ one.

This audit does **not** implement the drastic proposal — it is recorded for a decision.
Everything in the Findings table above is fixed in-place instead.

---

## What was fixed

See [`2026-08-24-fixes.md`](2026-08-24-fixes.md).

Two claims in this report were written from screenshots and later disproved by
measurement; both are struck through above rather than deleted, so the record of
what the walkthrough actually saw stays intact.
