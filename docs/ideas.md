# Product Backlog

Most entries in this file are unbuilt ideas, checked against the code on the date
below. **Delete an item when it ships**, except in the Prioritised Social Asset
Backlog: that table keeps completed rows so we can work through it one idea at a
time.

Last reviewed against the code: 12 September 2026.

## Start Here — Highest Value Now

Ranked across every section below, for the situation the product is actually in:
a handful of live leagues, roughly two dozen completed production games, billing
code-ready but not launched, Instagram publishing in flight, and league
acquisition gated by season timing. That state argues for **not losing the
leagues already here**, then **converting the next season window**, ahead of
anything that assumes scale the product does not yet have.

|  Rank | Do this                                      | Where         | Size   | Why it is worth more than the rest right now                                                                                                                                                               |
| ----: | -------------------------------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Error monitoring                             | P4            | S      | The cheapest item on this page, and everything else is guesswork without it. Billing and outbound Instagram publishing are both about to go live with no way to see a failure.                             |
| **2** | Offline-tolerant live tracking               | P1            | L      | At this league count a single lost game is a meaningful share of all data in the product — and it is the churn event for the volunteer who lost it. Reliability outranks features.                         |
| **3** | Social attribution and join landing          | Social #5     | XS     | A season's worth of social effort is about to be spent. Without first-touch attribution there is no way to tell which half worked, and every later social item inherits that blindness.                    |
| **4** | Per-game player stat card + milestone export | Social #2, #3 | S each | The two assets players share about themselves. Both data sources are already frozen and queryable — the box score and the `PlayerMilestone` ledger — so this is the highest share-per-hour work available. |
| **5** | Crawler-visible link previews                | P8            | M      | Every TSW link shared to WhatsApp, Instagram, or Facebook previews identically today. This silently taxes every share the items above generate.                                                            |
| **6** | Job runner, then notifications               | P2 → P3       | M → L  | Nothing brings a user back between games. This is the retention floor, and the job runner also unblocks digests, reminders, token renewal, and delivery retries.                                           |
| **7** | Personalized Pulse                           | Product       | M      | Follows for users, leagues, and league teams already exist and nothing ranks the feed by them. Unusually cheap for the engagement it should return.                                                        |
| **8** | End-to-end coverage of checkout and tracking | P5            | M      | Before live payments, not after. These are the two flows where a silent regression costs money or data.                                                                                                    |
| **9** | Account deletion                             | P6            | M      | UK/GDPR erasure, owed before player data scales further. Not urgent this month; not deferrable past launch.                                                                                                |

**Season-timed, not now:** season awards and the post-game coach report are worth
building against a season boundary, so schedule them toward season end rather
than competing with the list above.

## Not Now — And Why

Recorded so they are not re-litigated every planning pass. Each presupposes more
leagues, more history, or more posting volume than exists today; building any of
them now spends the season window on an audience that is not there yet.

| Deferred                                            | Revisit when                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Divisions and conferences; playoffs and brackets    | A single league is large enough to need structure beyond one round-robin table.                   |
| Multi-league organization view                      | One operator runs several leagues and asks for a combined view.                                   |
| Multi-sport data model (P9)                         | A non-basketball league is a real prospect. Until then, only avoid deepening the coupling.        |
| Templated stat-video renderer; social content inbox | Static assets have earned measurable shares and there is posting history to rank against.         |
| Structured venue records                            | Venue reuse at creation time stops being enough — real availability or capacity conflicts appear. |
| Registration and fees                               | Subscription billing is live and stable.                                                          |

## Platform Capabilities

Missing foundations rather than features. IDs are stable labels for
cross-reference, not a priority order — priority lives in **Start Here**.

|  ID | Capability                                    | Size | Evidence it is missing                                                                                                                                                                                                             | What it unblocks                                                                                                                                                                                               |
| --: | --------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  P1 | Offline-tolerant live tracking                | L    | No service worker, no IndexedDB, no queued-write layer anywhere in `client/`. Every stat event is a live HTTP write under optimistic concurrency (409 on conflict).                                                                | Trustworthy tracking in sports halls with poor signal. Today a dropped connection mid-game risks losing stats — the one failure that permanently ends a tracker's trust in the product.                        |
|  P2 | Background job runner or scheduler            | M    | No `bullmq`, `agenda`, or `node-cron`; `server/src/scripts/process-instagram-deliveries.js` is run by hand. Also recorded below as a constraint.                                                                                   | Notifications, weekly digests, game reminders, reschedule notices, Instagram token renewal, delivery retries, scheduled re-materialisation. Build this before any notification feature.                        |
|  P3 | Notifications of any kind                     | L    | `server/src/services/email.service.js` exports four senders only: verification, password reset, payment failed, trial ending.                                                                                                      | A manager is never told a join request arrived; a player is never told a game moved; a follower is never told a game finished. Nothing currently pulls a user back between games. Depends on P2.               |
|  P4 | Error monitoring and production observability | S    | No Sentry or equivalent in any `package.json`. PostHog is off by default and records explicit route events only.                                                                                                                   | Production failures are currently invisible unless someone reads Render logs. With billing going live and an outbound Instagram adapter shipping, blind production is the wrong trade.                         |
|  P5 | End-to-end tests                              | M    | 90 server Jest/Supertest tests and 66 client Vitest tests, plus `.github/workflows/ci.yml` — but no Playwright and no E2E suite.                                                                                                   | The three flows carrying the most risk (Stripe checkout, live game tracking, onboarding) are covered only by manual testing.                                                                                   |
|  P6 | Account deletion (right to erasure)           | M    | No delete-account route in `server/src/modules/auth/auth.routes.js`. Portability is partly covered — `GET /export/my-sporty` already returns the user's own records as CSV — but erasure has no mechanism behind the Privacy page. | UK/GDPR erasure for a product holding player statistics, potentially for minors. Needs a decided answer for what happens to a deleted user's league-player records, claimed profiles, and milestone ledger.    |
|  P7 | Real-time game updates                        | M    | `GameDetailPage.jsx` polls every 15s while a game is `in_progress`; that is the only live surface. No WebSocket or SSE in the repo.                                                                                                | "Watch it live" becomes a feature parents actually share. Also applies to standings and the Pulse. Lower priority than it looks — 15s polling is adequate until spectator volume justifies the infrastructure. |
|  P8 | Crawler-visible page metadata                 | M    | `useDocumentMeta.js` sets `og:*` tags client-side; `client/index.html` ships a single global square `og:image`. The client is a Vite SPA with no SSR or prerender step.                                                            | Link previews on Instagram, WhatsApp, and Facebook, whose scrapers do not execute JavaScript. Every shared TSW link currently previews identically. Prerequisite for per-page Open Graph images (Social #12).  |
|  P9 | Multi-sport data model                        | XL   | Basketball is hardcoded through `server/src/modules/shared/stats.constants.js` and the immutable per-game format snapshot.                                                                                                         | Netball, futsal, or football. Deferred — but avoid deepening the coupling meanwhile, because the cost only grows.                                                                                              |

## Product Ideas

| Idea                     | Primary user      | Notes                                                                                                                                  |
| ------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Personalized Pulse       | Fans, players     | Filter and rank feed posts through the existing user, league, and league-team follows. The follow data is already there.               |
| Post-game coach report   | Coaches           | Derive runs, droughts, foul trouble, and key performers from game events. Season-timed.                                                |
| Season awards            | Players, leagues  | The remaining half of milestones and awards; the `PlayerMilestone` ledger is live and backfilled, season awards are not. Season-timed. |
| Stat-correction workflow | Players, managers | Request, review, approve, and audit event corrections; use video timestamps. Needs the league audit log first.                         |

## League Administration

Each row was checked against the code. Where a partial foundation already exists,
the row names it and describes only the delta.

| Idea                            | Size | Main dependency                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reschedule history              | XS   | Append-only history on `Game`; notifications optional.                                                                                                                                                                                                                                                              |
| Custom standings rules          | S    | League config consumed by aggregate recomputation.                                                                                                                                                                                                                                                                  |
| Bulk roster import              | S    | CSV preview and conflict resolution.                                                                                                                                                                                                                                                                                |
| League audit log                | S    | New append-only model and write-path instrumentation. With materialised aggregates and volunteer trackers, "who changed this score" is a support burden waiting to happen — and it is the prerequisite for the stat-correction workflow.                                                                            |
| Double-booking detection        | S    | Nothing checks whether two games share a venue and time — there is no conflict check in `leagues.service.js` or in the schedule draft table. Round-robin generation keeps a team to one game per round, but hand-added rows, cross-league bookings at a shared venue, and edits after generation are all unchecked. |
| Season setup wizard             | S    | Pure orchestration. Every underlying action already ships: `POST /:leagueId/seasons`, `/seasons/:seasonId/complete`, the roster endpoints, and the schedule builder's round-robin generation over selected weekdays and time slots. The wizard is UI glue over those, not new capability.                           |
| Announcements                   | M    | New model plus admin and public surfaces.                                                                                                                                                                                                                                                                           |
| Duplicate player merge          | M    | Referential updates across stats, members, and games.                                                                                                                                                                                                                                                               |
| Delegated admin scopes          | M    | New permissions beneath league manager.                                                                                                                                                                                                                                                                             |
| Structured venue records        | M    | Deferred; see **Not Now**. A `Game` carries free-text `venue` plus an embedded `venueAddress`, and the schedule builder applies a default venue across a generated fixture list. Missing is a `Venue` entity with availability, capacity, and blackout dates.                                                       |
| Notifications and weekly digest | L    | Preferences, templates, retries, and scheduled jobs. Blocked on P2 and P3.                                                                                                                                                                                                                                          |
| Registration and fees           | L    | New Stripe flows distinct from subscriptions. Deferred; see **Not Now**.                                                                                                                                                                                                                                            |
| Divisions and conferences       | L    | Deferred; see **Not Now**. Changes schedules, standings, and public navigation.                                                                                                                                                                                                                                     |
| Playoffs and brackets           | L    | Deferred; see **Not Now**. New competition model and progression rules.                                                                                                                                                                                                                                             |
| Stat-correction queue           | XL   | Crosses immutable game history, aggregates, and audit.                                                                                                                                                                                                                                                              |
| Multi-league organization view  | XL   | Deferred; see **Not Now**. New organization and cross-league authorization model.                                                                                                                                                                                                                                   |

## Other Opportunities

- lineup and stint analytics;
- opponent scouting and private coaching notes;
- advanced shot-chart filters and video-linked events (shot maps themselves ship,
  gated by the `canViewShotMaps` entitlement; filtering and event-to-video linking
  do not);
- recruiting fields and media galleries on player profiles (a league player carries
  only `displayName`, `jerseyNumber`, and `position` today);
- PDF reports and scouting packs;
- officials assignments, eligibility, suspensions, and roster locks;
- sponsor placements on public league pages (`CAN_USE_SPONSOR_TOOLS` is already
  reserved in `plan-catalog.js` and marked `// future`, but nothing reads it);
- email or SMS game reminders and results (blocked on P2 and P3).

## Social Media And Marketing

Product work that makes the low-friction campaign in
[`marketing-social.md`](./marketing-social.md) possible. The target operating
loop is: **a game finishes, TSW prepares a social kit, and the operator chooses
what to publish**. The backlog does not assume that a live league supplies the
content; every asset must also render from the demo dataset.

### Where Today's Exports Fall Short

Game, player, and team cards export as PNGs through `ShareableCardExport`. The
4:5 post, 9:16 Story/Reel/TikTok, and 1200x630 link-image presets have framing
tests; the latter two show a text-safe guide in preview. The Instagram panel
carries a caption field and an attribution URL that rides in the caption. The
remaining gaps are:

- a per-game player line — the player card shows season averages
  (`pointsPerGame`, `reboundsPerGame`, `assistsPerGame`), which is the less
  socially compelling asset;
- any export path for milestones or YouTube-backed highlight clips, though both
  render in the Pulse — `renderCard` handles `game_card`, `player_card`, and
  `team_card` only;
- generated copy: the caption is whatever the feed post already said, with an
  attribution link appended. No hook, hashtags, handles, or alt text;
- a carousel pack, batch export, or templated social video.

### Prioritised Social Asset Backlog

Impact is the expected reduction in weekly work plus the likely share value.
Effort is relative to the current React/html2canvas and feed architecture.
Completion Status tracks each idea here; finished rows stay visible for resuming
this sequence. Rank 1 provides a downloadable link image, while crawler-visible
Open Graph previews remain rank 12 and P8.

|   Rank | Idea                                | Impact      | Effort | Size | Definition of done                                                                                                                                                                                                                                                                                                    | Completion Status |
| -----: | ----------------------------------- | ----------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
|  **1** | Remaining export presets            | High        | Medium | M    | The 4:5 preset ships. Add **1080x1920 Story/Reel/TikTok** and **1200x630 link preview** through the same renderer, each with a visible safe-area overlay in preview, no clipped long names, and the same kind of framing test the game card already has.                                                              | Complete          |
|  **2** | Per-game player stat card           | High        | Low    | S    | From a completed game's frozen box score, export a card with player photo, name, team, opponent, result/date, and a legible PTS/REB/AST line plus one context stat. Do not reuse the season-average player spotlight for this job.                                                                                    | Not started       |
|  **3** | Milestone social export             | High        | Low    | S    | Add a milestone type to `renderCard`/`ShareableCardExport`; use the already-snapshotted player avatar, make the achievement the headline, and include team, source game, date, TSW handle, and one CTA.                                                                                                               | Not started       |
|  **4** | Caption, keyword, and tag assistant | High        | Low    | S    | Generate editable copy from verified data: hook, one-sentence context, question/CTA, 3-5 relevant hashtags, player/team handles when recorded, and alt text. The attributed permalink half already exists in `instagramDraftHandoff.js`. One-click copy buttons; never invent a stat or handle.                       | Not started       |
|  **5** | Social attribution and join landing | High        | Low    | XS   | Persist first-touch UTM/referrer values, distinguish Instagram and TikTok, create source-specific links, and send new visitors to a useful public page or registration rather than a login dead end. Track `social_asset_exported`, `social_share_opened`, landing, signup, and league-enquiry events.                | Not started       |
|  **6** | Completed-game social kit           | High        | Medium | M    | A single button prepares a final-score card, top-performer card, box-score carousel, 9:16 Story result, suggested caption, alt text, and tagged public link. The operator can preview and download individually or as a ZIP.                                                                                          | Not started       |
|  **7** | Box-score breakdown carousel        | High        | Medium | M    | Export 3-4 ordered 4:5 slides: result/hook, team comparison, top performers, and CTA. Slides share a template and can be removed or reordered without design work.                                                                                                                                                    | Not started       |
|  **8** | League leaders and rankings cards   | Medium-high | Low    | S    | The data already ships: `GET /public/leagues/:leagueSlug/leaders` backs the MVP Standings fantasy-points leaderboard on the public league page. This item is only the export — feed and 9:16 cards for top-five scoring/rebounding/assists plus the current table and form, suppressed below three qualified players. | Not started       |
|  **9** | Social identity and consent fields  | Medium-high | Medium | S    | Optional Instagram/TikTok handles for leagues, teams, and players; marketing-permission status and date; minor/adult status where appropriate; and an export guard that defaults to demo/anonymised output without recorded permission.                                                                               | Not started       |
| **10** | Highlight + stat receipt            | Medium-high | Medium | M    | Export a 9:16 8-12 second clip around an eligible timestamp with player/stat/result overlays, burned-in descriptive text, source-video credit, and end card. Start with user-selected clips; do not auto-publish.                                                                                                     | Not started       |
| **11** | Player progress card                | Medium      | Medium | M    | Compare the last five games with the prior five or a season baseline, label the sample clearly, and export a simple trend card. Suppress the asset when the sample is too small.                                                                                                                                      | Not started       |
| **12** | Per-page Open Graph images          | Medium      | Medium | M    | Public game, player, team, and league links render 1200x630 previews from the same template system instead of the global square icon. Titles and descriptions are already per-page via `useDocumentMeta`, but set client-side — only worth building after P8.                                                         | Not started       |
| **13** | Templated stat-video renderer       | Medium      | High   | L    | Deferred; see **Not Now**. Turn any final score, player line, milestone, or leaderboard into a 6-10 second MP4 using two or three transitions. No timeline editor.                                                                                                                                                    | Not started       |
| **14** | Social content inbox                | Medium      | High   | L    | Deferred; see **Not Now**. Rank new assets by notability, show permission status, mark used/skipped, filter by league/date/type, retain caption/export history.                                                                                                                                                       | Not started       |

### Shared Design Requirements

These apply to every new asset, not just the first three items.

- Put the hook, player/team identity, and score or headline in that order. A
  viewer should understand the subject without reading the caption.
- Use tabular figures for scores and stats, support long names, and set minimum
  export-size typography rather than reusing small in-app labels.
- Prefer real player photos; fall back to team branding, then a deliberately
  styled initials treatment. Never silently present a team logo as a player
  photo.
- Treat team colours as accents, preserve TSW recognition with a stable layout,
  and check contrast automatically.
- Include `@TheSportyWay` (or the final account handle), a short CTA such as
  “Full box score in profile”, and the public entity URL in export metadata.
- Keep critical content inside platform-specific safe areas and make the safe
  area visible in the preview. Recheck presets when Instagram or TikTok UI
  changes.
- Static first, motion second. Animation is justified only when it adds a reveal,
  comparison, or real highlight; a looping static card is not a useful video.
- Generate alt text and retain a data provenance link for every stat claim.
- Never publish automatically. Generation can be automatic; selection, consent,
  tagging, and final posting remain human approvals.

### Recommended Build Sequence

1. **Measure first:** rank 5. Every item after it is unevaluable without
   attribution, and it is the smallest thing here.
2. **Cheap high-share assets:** ranks 2 and 3. Both read from data that is
   already frozen and need no new pipeline.
3. **Reach:** P8, then rank 12, so the links those assets carry preview properly
   wherever they land. Rank 1 export presets are complete.
4. **Weekly engine:** ranks 4, 6, and 7 — this supplies most of a 12-week
   calendar from verified content.
5. **Depth:** ranks 8, 9, and 11 once the weekly loop is running.
6. **Motion after evidence:** rank 10 only for formats whose static versions
   already earn above-median shares.

## Constraints

- There is no job queue or scheduler; timed notifications need infrastructure.
  See P2.
- Standalone games intentionally track one roster; opponent-roster features
  change the product model.
- Billing is subscription-based; registration fees require separate payment
  flows. Launch status and the pricing go-live decision live in
  [`stripe.md`](./stripe.md), not here.
- Embedded game events and materialized league aggregates make stat corrections
  a data-integrity feature, not simple CRUD.
- Marketing screenshots and videos must come from the demo account unless a
  league has given explicit permission; featuring minors additionally requires
  parent or guardian consent.
- Social assets can be generated automatically, but external posting must remain
  an explicit human action until consent, attribution, failure recovery, and
  platform-policy handling are designed. The Instagram adapter exists as a
  disabled-by-default foundation; see
  [`instagram-integration/`](./instagram-integration/).
