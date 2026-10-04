# Media Provider Analysis: Hosting Game Video in TSW

Status: **decided, 4 October 2026: Mux for game video.** This replaces the
11 September 2026 draft, which recommended Bunny Stream.
Implementation: [`superpowers/plans/2026-10-04-mux-game-video.md`](superpowers/plans/2026-10-04-mux-game-video.md),
progress in [`mux-video-tracker.md`](mux-video-tracker.md).

Scope: where full game videos live once users upload them to TSW instead of
pasting a YouTube link, and how the plays tagged against them become highlights.

## 1. What TSW does with media today

**Images: Cloudinary.** Avatars, team/league logos, feed images and generated
share cards. Uploads go through the API (`server/src/modules/feed/cloudinary.client.js`),
and delivery URLs are rewritten with `f_auto,q_auto` by
`server/src/modules/shared/cloudinaryUrl.js` (OPT-002). **Unchanged by this decision.**

**Short Pulse video: Cloudinary.** `uploadVideoBuffer` (≤100 MB, ≤60 s), with
user image/video posting currently disabled. **Unchanged by this decision.**

**Game video: YouTube, not hosted by TSW.** `Game.videoUrl` is a YouTube URL
validated by `youtubeUrlSchema` (`games.validation.js`). A stat event may carry
a `videoTimestamp`, captured from the YouTube iframe in `GameTrackPage.jsx`.
Every highlight is a timestamp-bounded YouTube embed: the recap reel
(`highlightReel.js`, `YouTubeHighlightReel.jsx`), recap clip cards
(`GameRecapPanel.jsx`), player profile clips (`PublicPlayerPage.jsx`,
`PublicLeaguePlayerPage.jsx`) and Pulse `highlight_clip` posts
(`HighlightClipPostCard.jsx`, `FullScreenHighlightClipPost.jsx`).

## 2. Requirements

1. Upload full games (90–120 min, 3–6 GB) from a phone or laptop. The file must
   never pass through the Render API process.
2. Play the full game in **GameTrackPage** with programmatic play/pause and an
   accurate `currentTime`. The tracker reads it to timestamp each stat and to
   keep the game clock in sync with the video.
3. Turn tagged plays into **highlights** on four surfaces: the Pulse feed,
   GameDetailPage (recap clips and the highlight reel), and both player profile
   pages.
4. Produce **real clip files** later for Instagram Reels and downloads.
5. Keep cost proportional to a product with very few users today. Storage is
   the cost that grows, because games are kept and rarely rewatched in full.
6. The footage is mostly UK grassroots basketball, so mostly minors. Playback
   must have an explicit viewer policy. Highlight viewers should not be able to
   scrub into the rest of the game; instant clips may expose a few seconds at
   segment boundaries, so strict privacy cuts require separate clip assets.

## 3. Pricing (verified 4 October 2026, public list prices)

**Mux** ([pricing](https://www.mux.com/docs/pricing/video)):

| Item          | Basic quality                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encoding      | Free                                                                                                                                                                   |
| Storage       | 720p $0.0024, 1080p $0.0030 per minute per month; Basic has a one-month minimum, then prorates                                                                         |
| Cold storage  | Automatic: −40% after 30 days unplayed, −60% after 90 days ([details](https://www.mux.com/blog/automatic-cold-storage-ga))                                             |
| Delivery      | First 100,000 minutes/month free, then 1080p $0.0010/min                                                                                                               |
| Credit        | $20 usage credit every month on pay-as-you-go                                                                                                                          |
| Instant clips | Free. The playback URL or JWT carries `asset_start_time`/`asset_end_time`; nothing is copied or encoded ([docs](https://www.mux.com/docs/guides/create-instant-clips)) |
| Clip assets   | A new asset cut from an existing one, frame-accurate, billed as normal on-demand video ([docs](https://www.mux.com/docs/guides/create-clips-from-your-videos))         |

**Bunny Stream** ([pricing](https://bunny.net/docs/stream/pricing)):

| Item     | Price                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Encoding | Standard encoding is free; Premium costs extra. Queue latency needs measuring; the previous hours-to-days claim was not confirmed in the current docs                                                                                                              |
| Storage  | $0.01/GB/month for the first region, +$0.01 for the second, +$0.005 for each further region. Every rendition, MP4 fallback and kept original is billed                                                                                                             |
| Delivery | $0.01/GB (EU/NA standard), $0.005/GB (volume)                                                                                                                                                                                                                      |
| Clipping | **None.** The embed takes a start time (`t`) but no end time ([embedding](https://bunny.net/docs/stream/embedding)). Chapters and Moments are timeline markers, not clips ([update video](https://bunny.net/docs/api-reference/stream/manage-videos/update-video)) |

Cloudflare Stream and Cloudinary video were ruled out in the September draft.
Their prices were not reverified in this review; recheck them if they return to
the shortlist.

## 4. Cost model

Assumptions: 100-minute games, uploaded and played at the beginning of each
model month, then unplayed. Every Mux figure below deducts the $20 monthly
credit, floored at zero each month. Use cohort weights `1, 0.6, 0.6, 0.4, …`
for hot, infrequent and cold storage, and sum the twelve monthly net bills for
year 1. Volume discounts and exact daily proration are omitted, so these are
list-rate estimates. Bunny uses estimated stored sizes (2.5 GB at 720p, 6 GB at
1080p with MP4 fallback); measure them with one real upload.

| Option                                              | 30 games/mo: month-12 bill | 30 games/mo: year-1 total | 100 games/mo: month-12 bill | 100 games/mo: year-1 total |
| --------------------------------------------------- | -------------------------- | ------------------------- | --------------------------- | -------------------------- |
| Mux 1080p                                           | $32                        | $160                      | $154                        | $1,038                     |
| Mux 1080p, kept hot by clip plays (upper estimate)  | $88                        | $475                      | $340                        | $2,100                     |
| Mux 720p, full games kept 9 months, excluding clips | $13                        | $76                       | $90                         | $725                       |
| Bunny 1080p + FFmpeg clip worker (~$7/mo on Render) | $29                        | $224                      | $79                         | $552                       |
| Bunny 720p, no clip files                           | $9                         | $59                       | $30                         | $195                       |

The retention row models only full-game storage: each cohort is deleted after
nine billed months. Permanent clips and their MP4s add growing storage, so the
total does not stay flat. Delivery, tax, FX and worker data transfer are excluded;
the $7 worker is a budget assumption, not a measured processing cost. Bunny's
$1 account minimum changes the first small 720p bill, but not the rounded total.
Mux's credit and delivery allowance are account-level budgets shared with any
other usage. MP4 storage is additional ([Mux pricing](https://www.mux.com/docs/pricing/overview)).

What the table says:

- **At about 10 games a month, the cold-storage case costs nothing for roughly
  a year.** The $20 credit covers it if no other usage consumes that credit.
- **At 30 games a month, cold Mux is cheaper than Bunny in year 1** once Bunny
  has the clip worker it would need. The hot Mux case is more expensive. That's
  before counting the time to build and run the worker.
- **At 100+ games a month, Bunny is cheaper,** by 2–4× on storage and more each
  year. A retention policy (full games for one season, clips forever) closes
  most of that gap.
- **Mux delivery fits the free allowance at small volumes.** Budget tracking,
  replay, Pulse autoplay and retry traffic together. Bunny charges per GB even
  at low volume; viewer bitrate and worker transfers need measuring.

## 5. Decision: Mux

How the requirements map:

| Requirement                      | Mux                                                                               | Bunny Stream                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Direct upload                    | Direct upload URL with a chunked browser uploader (UpChunk)                       | Resumable upload, slightly better at surviving a page reload                    |
| Ready to track soon after upload | Measure Basic encoding on a full-game upload                                      | Measure standard queue latency on the same recording                            |
| GameTrackPage control            | Mux Player is a normal media element (`currentTime`, `play()`, `pause()`, events) | Iframe player.js API: about as easy, and similar to today's YouTube setup       |
| Highlights limited to the clip   | **Built in:** a signed instant-clip token, so the stream only contains the clip   | JS workaround (seek, then pause on `timeupdate`); the full game stays reachable |
| Real clip files                  | **One API call** per clip asset                                                   | You build and run an FFmpeg worker                                              |
| Storage at scale                 | 2–4× Bunny                                                                        | Cheapest                                                                        |
| Data location                    | US company: confirm DPA, transfer terms and processing locations                  | EU company; confirm storage, processing and CDN locations                       |

Mux wins on what TSW needs now: clipping across three surfaces, with no worker
to run, at about the same cost while volumes are small. Bunny's advantages are
cheap storage at scale and EU storage options, and those are what to look at
again later (§8). Company domicile alone does not establish where processing,
backups or CDN delivery occur; confirm the complete data path if EU-only is
required.

## 6. Architecture summary

- **One hosted video per game** in v1, stored as a `Game.video` subdocument
  `{ provider: 'mux', status, uploadId, assetId, playbackId, durationSeconds, errorMessage }`.
  `Game.videoUrl` stays for YouTube. A ready Mux video takes precedence when
  both exist.
- **Upload:** the API creates a Mux direct upload. The browser sends the file
  straight to Mux with UpChunk. A signed Mux webhook moves the game through
  `uploading → processing → ready | errored`.
- **Playback is always signed; signing is not viewer authorization.** The client asks
  `GET /api/v1/games/:gameId/video/playback[?eventId=]` for short-lived JWTs.
  Full-game tokens need authenticated game access as well as `canViewReplay`.
  Starter already grants replay and highlight entitlements; these flags do not
  make footage private or restrict upload spend. Anonymous full-game access
  needs a separate, explicit publication policy before it can be enabled.
  Highlight tokens carry
  `asset_start_time`/`asset_end_time` (`videoTimestamp` ± 5 s, the existing
  clip buffer), and need eligible viewer access or a currently permitted public
  highlight/Pulse share.
- **Pulse posts** reference `{ gameId, eventId }`. Resolve the current provider
  and timestamp as well as Mux playback at view time, including legacy posts.
  Replacement preserves the reference, but a different video timeline needs
  timestamp remapping; otherwise an in-range timestamp can show the wrong play.
- **Phase 2** (separate plan): clip assets with an MP4 for Pulse shares and
  Instagram, then a retention policy that deletes full games after a season
  but keeps the clips.

## 7. Risks and open items

- **Instant-clip plays probably reset the cold-storage clock** of the full game.
  Mux documents that HLS playback resets the asset's clock; treating instant
  clips the same is an inference to validate on the invoice. That's the "kept
  hot" row in §4, and the reason for Phase 2 clip assets.
- **Mobile browsers stop uploads when the tab goes to the background.** UpChunk
  retries chunks but can't resume after a reload. The UI must say "keep this
  tab open", and desktop is the expected upload path.
- **Instant clips are accurate to the segment, not the frame.** They can run a
  few seconds long. That's acceptable for highlights; clip assets fix it.
- **Youth footage:** TSW becomes the controller of children's video. Before
  launch: sign Mux's DPA, document retention and deletion, and confirm UK
  transfer terms.
- **Storage only grows.** `canViewReplay` is available free. Launch needs an
  explicit hosted-upload allowance, server-side quotas and a spend limit;
  leaving packaging open must not enable unlimited billable uploads. A browser
  size check cannot enforce a direct-upload budget.
- **Deletion must survive failures.** Store durable cleanup work before
  detaching/deleting database records; retry and reconcile against Mux. A
  swallowed DELETE failure for an already-ready asset has no future ready
  webhook to rescue it. Include schedule-rebuild bulk game deletion.
- **Webhook state needs atomic updates.** Compare upload/asset identity and
  generation at write time. The Game schema already rejects stale saves with
  optimistic concurrency, but the proposed service does not recover those
  conflicts or compensate Mux calls made before a failed save. Delete orphans
  only when ownership is proven, not simply because an asset has an unfamiliar
  game id.
- **Launch review:** the implementation plan's required corrections and the
  tracker record viewer privacy, public sharing permission, quotas, durable
  cleanup, token renewal and tracker timing as Phase 1 gates.

## 8. Revisit triggers

Look at Bunny Stream again (or a hybrid, e.g. Bunny for full-game archives and
Mux clip assets for highlights) when any of these happens:

- More than 100 hosted games uploaded per month for 3 months in a row.
- The Mux bill goes above about $150/month after credit.
- A customer or regulator requires EU-only hosting.

`Game.video.provider` keeps a second provider additive rather than a rewrite.
