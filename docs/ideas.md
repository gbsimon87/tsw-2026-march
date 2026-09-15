# Product Backlog

Most entries in this file are unbuilt ideas, checked against the code on the date
below. **Delete an item when it ships**, except in the Prioritised Social Asset
Backlog: that table keeps completed rows so we can work through it one idea at a
time.

Last reviewed against the code: 14 September 2026.

## Start Here — Highest Value Now

Ranked across every section below, for the situation the product is actually in:
a handful of live leagues, roughly two dozen completed production games, billing
code-ready but not launched, Instagram publishing in flight, and league
acquisition gated by season timing. That state argues for **not losing the
leagues already here**, then **converting the next season window**, ahead of
anything that assumes scale the product does not yet have.

|  Rank | Do this                                      | Where   | Size  | Why it is worth more than the rest right now                                                                                                                                       |
| ----: | -------------------------------------------- | ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Error monitoring                             | P4      | S     | The cheapest item on this page, and everything else is guesswork without it. Billing and outbound Instagram publishing are both about to go live with no way to see a failure.     |
| **2** | Offline-tolerant live tracking               | P1      | L     | At this league count a single lost game is a meaningful share of all data in the product — and it is the churn event for the volunteer who lost it. Reliability outranks features. |
| **3** | Crawler-visible link previews                | P8      | M     | Every TSW link shared to WhatsApp, Instagram, or Facebook previews identically today. This silently taxes every share the items above generate.                                    |
| **4** | Job runner, then notifications               | P2 → P3 | M → L | Nothing brings a user back between games. This is the retention floor, and the job runner also unblocks digests, reminders, token renewal, and delivery retries.                   |
| **5** | Personalized Pulse                           | Product | M     | Follows for users, leagues, and league teams already exist and nothing ranks the feed by them. Unusually cheap for the engagement it should return.                                |
| **6** | End-to-end coverage of checkout and tracking | P5      | M     | Before live payments, not after. These are the two flows where a silent regression costs money or data.                                                                            |
| **7** | Account deletion                             | P6      | M     | UK/GDPR erasure, owed before player data scales further. Not urgent this month; not deferrable past launch.                                                                        |

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
carries a caption field and an attribution URL that rides in the caption, and
every share surface now generates its own caption, hashtags and alt text. The
remaining gaps are:

- direct export from YouTube embeds. Rank 10 exports a selected timestamp from
  the operator's matching local source file; it does not copy YouTube media.
  The broader templated stat-video renderer remains rank 13.

### Prioritised Social Asset Backlog

Impact is the expected reduction in weekly work plus the likely share value.
Effort is relative to the current React/html2canvas and feed architecture.
Completion Status tracks each idea here; finished rows stay visible for resuming
this sequence. Rank 1 provides a downloadable link image, while crawler-visible
Open Graph previews remain rank 12 and P8.

|   Rank | Idea                                | Impact      | Effort | Size | Definition of done                                                                                                                                                                                                                                                                                                    | Completion Status |
| -----: | ----------------------------------- | ----------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
|  **1** | Remaining export presets            | High        | Medium | M    | The 4:5 preset ships. Add **1080x1920 Story/Reel/TikTok** and **1200x630 link preview** through the same renderer, each with a visible safe-area overlay in preview, no clipped long names, and the same kind of framing test the game card already has.                                                              | Complete          |
|  **2** | Per-game player stat card           | High        | Low    | S    | From a completed game's frozen box score, export a card with player photo, name, team, opponent, result/date, and a legible PTS/REB/AST line plus one context stat. Do not reuse the season-average player spotlight for this job. Shipped with a Pulse `player_game_card` post type alongside the export.            | Complete          |
|  **3** | Milestone social export             | High        | Low    | S    | Add a milestone type to `renderCard`/`ShareableCardExport`; use the already-snapshotted player avatar, make the achievement the headline, and include team, source game, date, TSW handle, and one CTA. Shipped with the Instagram hand-off generalised beyond game cards.                                            | Complete          |
|  **4** | Caption, keyword, and tag assistant | High        | Low    | S    | Generate editable copy from verified data: hook, one-sentence context, question/CTA, 3-5 relevant hashtags, player/team handles when recorded, and alt text. The attributed permalink half already exists in `instagramDraftHandoff.js`. One-click copy buttons; never invent a stat or handle.                       | Complete          |
|  **5** | Social attribution and join landing | High        | Low    | XS   | Persist first-touch UTM/referrer values, distinguish Instagram and TikTok, create source-specific links, and send new visitors to a useful public page or registration rather than a login dead end. Track `social_asset_exported`, `social_share_opened`, landing, signup, and league-enquiry events.                | Complete          |
|  **6** | Completed-game social kit           | High        | Medium | M    | A single button prepares a final-score card, top-performer card, box-score carousel, 9:16 Story result, suggested caption, alt text, and tagged public link. The operator can preview and download individually or as a ZIP.                                                                                          | Complete          |
|  **7** | Box-score breakdown carousel        | High        | Medium | M    | Export 3-4 ordered 4:5 slides: result/hook, team comparison, top performers, and CTA. Slides share a template and can be removed or reordered without design work.                                                                                                                                                    | Complete          |
|  **8** | League leaders and rankings cards   | Medium-high | Low    | S    | The data already ships: `GET /public/leagues/:leagueSlug/leaders` backs the MVP Standings fantasy-points leaderboard on the public league page. This item is only the export — feed and 9:16 cards for top-five scoring/rebounding/assists plus the current table and form, suppressed below three qualified players. | Complete          |
|  **9** | Social identity and consent fields  | Medium-high | Medium | S    | Optional Instagram/TikTok handles for leagues, teams, and players; marketing-permission status and date; minor/adult status where appropriate; and an export guard that defaults to demo/anonymised output without recorded permission.                                                                               | Complete          |
| **10** | Highlight + stat receipt            | Medium-high | Medium | M    | Export a 9:16 8-12 second clip around an eligible timestamp with player/stat/result overlays, burned-in descriptive text, source-video credit, and end card. Start with user-selected clips; do not auto-publish.                                                                                                     | Complete          |
| **11** | Player progress card                | Medium      | Medium | M    | Compare the last five games with the prior five or a season baseline, label the sample clearly, and export a simple trend card. Suppress the asset when the sample is too small.                                                                                                                                      | Not started       |
| **12** | Per-page Open Graph images          | Medium      | Medium | M    | Public game, player, team, and league links render 1200x630 previews from the same template system instead of the global square icon. Titles and descriptions are already per-page via `useDocumentMeta`, but set client-side — only worth building after P8.                                                         | Not started       |
| **13** | Templated stat-video renderer       | Medium      | High   | L    | Deferred; see **Not Now**. Turn any final score, player line, milestone, or leaderboard into a 6-10 second MP4 using two or three transitions. No timeline editor.                                                                                                                                                    | Not started       |
| **14** | Social content inbox                | Medium      | High   | L    | Deferred; see **Not Now**. Rank new assets by notability, show permission status, mark used/skipped, filter by league/date/type, retain caption/export history.                                                                                                                                                       | Not started       |

### Social Assets — Manual Setup Checklist

Ranks 1–10 are complete for now. The incomplete rows above remain for future
work; the remaining setup and publishing actions are:

- [ ] **Render:** Deploy the latest client and server to development, then
      production after checking the exports.
- [ ] **Database:** Verify the new per-game player-card indexes exist;
      production does not create indexes automatically.
- [ ] **Demo account:** Confirm the deployed Demo League has marketing
      permission granted; reseed the intended demo database if needed.
- [x] **PostHog Dev:** Create definitions for `social_landing_viewed`,
      `share_initiated`, `share_completed`, and `league_enquiry_submitted`.
      Include the new card/kit types, formats, and sources listed in
      [`posthog.md`](./posthog.md#117-highlights-and-sharing).
      Completed through MCP on 15 September 2026 in **Dev — The Sporty Way**
      (project `247334`); all four remain unverified pending browser coverage.
- [ ] **PostHog Dev:** Test tagged visits, downloads, signup, and enquiries;
      inspect Live events before marking definitions verified.
      Existing `player_game_card` and `carousel_slide` PNG download payloads
      from 14 September were inspected through MCP and match the contract.
      Tagged landings, other export paths, signup attribution, and enquiries
      still need testing; landing and enquiry events have not been received.
- [ ] **Social profiles:** Confirm the TSW handle and campaign name; add
      separate tagged bio links for Instagram and TikTok.
- [ ] **TSW admin:** Record confirmed handles, organisation permission, player
      declines, and guardian consent where needed.
- [ ] **Browser check:** Download PNGs, a ZIP kit, and a highlight clip on the
      deployed site; inspect the finished files.
- [ ] **Before posting:** Review captions, tags, consent, and video credit;
      paste alt text into the platform manually.
- [ ] **If enabling Instagram publishing:** Complete the remaining
      [Meta review and production setup checklist](./instagram-integration/manual-actions.md).

### Caption Assistant — What Still Needs A Person

Rank 4 ships in `client/src/features/social/captionAssistant.js` (pure builders)
and `client/src/features/social/components/CaptionAssistant.jsx` (the panel with
copy buttons). It appears in the share modal on every exportable card type, and
in the Instagram draft panel. These parts are deliberately manual:

- **Alt text is copied, never published.** TSW's publishing adapter sends only
  `image_url` and `caption` (`instagram.client.js`), and the social-post model
  has no `altText` field, so the assistant offers alt text for the operator to
  paste — into Instagram's accessibility field at composition time, or via Edit
  → Edit alt text on a post the API published. Automating it means adding the
  field to `instagram.social-post.repository.js`, passing `alt_text` on the
  container, and deciding whether alt text joins the approved content digest.
- **Player and team handles are never guessed.** Rank 9 records optional
  handles and passes only cleared ones to the assistant. Without a recorded
  handle, it tags `@TheSportyWay` alone. Deriving one from a display name could
  tag a stranger.
- **The TSW handle and the standing hashtags are constants.** `TSW_HANDLE` and
  `BRAND_HASHTAGS` (`#Basketball`, `#TheSportyWay`) live at the
  top of `captionAssistant.js`. Change them there once the final account name is
  registered, or if the market stops being UK-first. Per-city or per-league tags
  need a recorded field, not a guess.
- **Read every caption before posting.** Generation is automatic; selection,
  consent, tagging, and posting stay human — see **Constraints**. The assistant
  composes only from a card's own snapshot, so it cannot invent a stat, but it
  also cannot know that a name is misspelled or that a player has not consented.
- **The attribution link is plain text on Instagram.** It is there to be read
  and typed, so the bio link has to stay pointed somewhere useful. Rank 5 is
  what makes those links measurable.

### Social Attribution — What Still Needs A Person

Rank 5 ships as `client/src/features/analytics/attribution.js` (the campaign
vocabulary, the link builder, the first-touch store) with the events added to
`analyticsContract.js`. Two naming decisions are worth knowing before reading a
dashboard:

- The share events are the handbook's existing generic `share_initiated` /
  `share_completed` (docs/posthog.md §11.7), **not** the `social_asset_exported`
  / `social_share_opened` names this row originally proposed. §7.3 says to reuse
  an event that already answers the question rather than split the data stream,
  and §11.7 exists so one dashboard can compare every share surface.
- `social_landing_viewed` fires only for a tagged link or a social referrer. A
  direct or search arrival still carries `first_touch_*` as super properties, so
  it can be segmented — but counting it as a campaign landing would make the
  metric a visitor count wearing a campaign's name.

Manual steps:

- **Create the four event definitions in PostHog**, in Dev first, and leave them
  unverified until a real payload has been inspected in Activity → Live events.
  Follow the §7.3 checklist and the §16 verification run; docs/posthog.md §0
  already holds the open verification work this joins.
- **Confirm the campaign values before the season's posts go out.**
  `DEFAULT_CAMPAIGN` is `launch_2026q3` and `KNOWN_CAMPAIGNS` lists what a link
  may carry. A `utm_campaign` outside that list is dropped on read — the source
  survives, the campaign does not — so a new campaign needs a line here before
  it is used, not after.
- **Attribution is consent-gated, and that is a deliberate cost.** First touch
  is held in memory always, and written to `localStorage` only once the visitor
  accepts analytics. Someone who declines is attributed within their session and
  forgotten when the tab closes. docs/posthog.md §5.2 is explicit that this
  product should not claim the UK statistical exception without legal review, so
  do not "fix" this by persisting earlier.
- **The bio link has to carry its own tag.** The assistant tags the link inside
  a caption, but a profile bio link is typed into Instagram by hand. Use
  `?utm_source=instagram&utm_medium=organic_social&utm_campaign=launch_2026q3`,
  and the TikTok equivalent, or bio traffic lands as `referral`.
- **Attribution is browser-side; `user_registered` is a server event.** The two
  join on the PostHog person, which needs the visitor to have accepted and been
  identified. A signup funnel split by `first_touch_source` is therefore a
  funnel over consented users, not over everyone.

### Completed-Game Social Kit — What Still Needs A Person

Rank 6 ships as `client/src/features/social/gameSocialKit.js` (the pure asset
descriptors and the ZIP's text file), `GameSocialKitModal.jsx`, and a **Kit**
action on a completed game's header. Two scope decisions are worth knowing:

- **The carousel is the templated slides from rank 7,** numbered `01-…`, `02-…`
  so the ZIP sorts the way Instagram's multi-select reads, with that order
  written into the text file. The individual player cards and the 9:16 Story
  stay in the kit unnumbered: a player's own card is what gets sent to the
  player, not slide five of a feed post.
- **The ZIP is written in-repo,** `client/src/lib/zip.js`, stored (no
  compression) and about 110 lines. PNG is already DEFLATE-compressed
  internally, so a second pass buys close to nothing, and this avoids a ~100KB
  dependency for a button an operator presses once a week. It has no ZIP64, so
  the cap is 4GB — take the dependency rather than growing that file if a kit
  ever approaches it.

Manual steps:

- **Add `game_kit` to the `share_initiated` / `share_completed` definitions in
  PostHog.** A kit download fires ONE event with `target_type: game_kit`, not
  one per image, so it does not inflate the per-card numbers beside it. This
  joins the rank 5 verification work in docs/posthog.md §0.
- **Check consent before posting, per asset.** The kit names up to three top
  performers by default, which is three identifiable people in one press. The
  text file inside the ZIP repeats the rule, and the per-asset checkboxes are
  there so a player without permission is left out of the pack — but only a
  person knows which one that is. See **Constraints**.
- **Alt text is still copied, not published.** The ZIP carries one line per
  image; it has to be pasted into each platform's accessibility field. Same
  limit as rank 4, same fix if it is ever automated.
- **The kit reads the frozen box score, so a stat correction changes it.**
  Re-open the modal after a correction rather than re-posting an older
  download; the images are rendered fresh on each open, but a ZIP already on
  disk is a snapshot of the moment it was built.

### Box-Score Carousel — What Still Needs A Person

Rank 7 ships as `carouselSlides.js` (which slides a game can honestly support,
and what each says) and `CarouselSlideExport.jsx` (how they draw). It fills the
kit's carousel, and each slide is also downloadable on its own.

"Slides share a template" is literal here: the honours-board furniture — the
varnished panel, the gilt beading, the plate, the identity block, the ruled
ledger — was extracted out of `ShareableCardExport.jsx` into
`boardExportParts.jsx`, and every slide and every single card now renders inside
the same `Board`. Two copies of a gilt bead drift within a release, and a
carousel whose slides do not match the cards beside them in a feed is worse than
no carousel.

"Removed or reordered without design work" is likewise literal: the modal holds
an ordered list of slide kinds and passes it to `buildGameSocialKit`. Moving a
slide renumbers every file after it, because the numbers **are** the upload
order. There is no per-slide code path to touch.

Manual steps:

- **Add `carousel_slide` to the share event definitions in PostHog**, alongside
  `game_kit` from rank 6. Downloading one slide on its own is tracked separately
  from downloading the kit, so "which slide is worth keeping" is answerable.
- **A one-sided game gets a one-column comparison slide, by design.** Standalone
  games intentionally track one roster (see **Constraints**), so there is no
  opponent breakdown. The slide says `TEAM TOTALS` rather than `HOW IT WAS WON`
  and shows the single column — it does not invent a second. If that reads
  poorly for a given post, remove the slide.
- **Slides suppress themselves when the data is not there.** No team stats, no
  comparison slide; nobody with a line, no performers slide. A four-slide
  carousel is the maximum, not a guarantee, and the numbering closes the gap
  automatically. Check what actually rendered before writing the caption.
- **The CTA headline and body are constants** at the top of `carouselSlides.js`
  (`CTA_HEADLINE`, `CTA_LINES`). Change them there for a campaign; they are the
  same words on every game's last slide until someone does.

### League Leaderboard Cards — What Still Needs A Person

Rank 8 ships as `leaderboardCards.js` / `LeaderboardCardExport.jsx` and a
**Leaderboard cards** button on the public league page's MVP Standings section.

**The row's "this item is only the export" turned out to be wrong, and the
server changed.** `GET /:leagueSlug/leaders` returned the top ten by FANTASY
score; ranking that array by PPG on the client would have published the wrong
name as the league's leading scorer — a volume scorer who does little else never
enters the fantasy top ten. `categoryLeaders` is therefore now ranked
server-side over every qualified player (`buildCategoryLeaders` in
`leagues.service.js`). The change is purely additive — `leaders` and
`dpoyLeaders` are untouched — and is recorded in [`api.md`](./api.md).

Manual steps:

- **Add `leaderboard_card` and the `league_page` source to the share event
  definitions in PostHog**, alongside `game_kit` and `carousel_slide`.
- **Check what a league actually qualifies for before planning a post.** A
  category needs three players with a positive average or it is suppressed; the
  table needs three teams. A young league may only ever produce the points card.
  `qualifiedCount` on the response says why a category is empty.
- **`LEADER_MIN_GAMES` is 1, deliberately.** A per-game average from one game is
  a true fact about that game, so the card shows it and prints the games played
  beside every name (`Charlie · 1 GP`) rather than hiding a small sample behind
  a cutoff. Raise the constant in `leagues.service.js` if a league gets big
  enough for a real qualification rule — and expect cards to disappear when you
  do.
- **These cards are season-to-date, and they go stale.** Nothing re-renders a
  PNG already downloaded. Re-open the modal after the next round rather than
  reposting last week's file.

### Social Identity and Consent — What Still Needs A Person

Rank 9 stores optional handles and dated marketing records on leagues,
standalone teams, league teams, and players. League owners record the league's
permission in **Admin → League → Settings**; standalone team owners do so on
**Edit Team**. League-team settings hold handles only. Player records in each
roster can hold an individual decline, age category, and guardian consent date.
The server stamps dates and the recording user; public payloads expose only a
resolved `marketing` block, never a child's age category or the raw record.

Manual steps:

- **Reseed the fictional Demo League** with `pnpm --filter server seed:demo`
  against the intended development database. The seed grants that league
  permission idempotently; it does not grant permission to the other seeded
  leagues or to any real league.
- **Record a real organisation's permission only after confirming it.** The
  owner checks the attestation that includes players and guardians, then records
  permission. A player can still decline individually; a player marked under 18
  remains restricted until guardian consent is recorded on their roster row.
- **Check every asset immediately before posting.** The export guard uses live
  permission and defaults to demo/anonymised output when the organisation has no
  recorded grant. The IDs in `restrictedPlayerIds` identify players who must be
  left out of a named export. A downloaded image cannot be recalled after
  permission is withdrawn, so re-open the asset and inspect it before posting.
- **Verify tags manually.** Handles are optional and can change; only the
  recorded handles of cleared subjects are suggested in captions.

### Highlight + Stat Receipt — What Still Needs A Person

Rank 10 adds **Export vertical clip** beside a completed game's Highlights.
Choose a cleared, timestamped player play and the matching original video file
on your device. The browser renders a silent 1080×1920, ten-second clip: a
one-second hook, seven seconds of the play, and a two-second end card. The
player's final box-score line, result, descriptive play text, source credit,
and game link are burned into the frames. The source file stays on the device;
there is no upload or automatic post. Browser recording capabilities choose
MP4 when supported, otherwise WebM.

Manual steps:

- **Supply the matching source recording and credit.** A YouTube embed cannot
  be used as the downloadable source. Choose the original file and enter the
  club or videographer to credit; confirm you may use that footage.
- **Align and preview the moment.** The saved video timestamp is prefilled.
  Adjust it if the local file starts at a different point, preview the selected
  seven seconds, and confirm the play matches the recorded stat.
- **Check consent and the final file before posting.** An organisation without
  a grant cannot export; a restricted player is not offered as a selectable
  clip. Confirm that everyone identifiable in the selected footage is covered
  before downloading. Recheck permission just before sharing the file and add any
  platform audio or accessibility text manually. The rendered file is silent.
- **Keep the tab visible during rendering.** The canvas records in real time.
  If the browser offers only WebM, convert it to a platform-accepted format
  before posting or use a browser that supports MP4 recording.

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

1. **Measure first:** rank 5 is complete. Everything after it is now
   evaluable, which is the only reason to build any of it.
2. **Cheap high-share assets:** ranks 2 and 3 are complete. Both read from data
   that was already frozen and needed no new pipeline.
3. **Reach:** P8, then rank 12, so the links those assets carry preview properly
   wherever they land. Rank 1 export presets are complete.
4. **Weekly engine:** ranks 4, 6 and 7 are complete. Between them a finished
   game supplies a four-slide carousel, a Story, player cards and the copy — most
   of a 12-week calendar from verified content, at one button press.
5. **Depth:** ranks 8 and 9 are complete; rank 11 remains now the weekly loop is
   running.
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
