# Media Provider Analysis — Hosting Game Video In TSW

Status: analysis / recommendation, 11 September 2026. Not yet a decision.
Scope: which image + video provider TSW should use once users upload full game
videos to TSW instead of uploading to YouTube and pasting a link.

## 1. What TSW does with media today

**Images — Cloudinary.** Avatars, team/league logos, feed images, and generated
share cards. Uploads go through the API (`server/src/modules/feed/cloudinary.client.js`,
`uploadImageBuffer`), and delivery URLs are rewritten at serialization time with
`f_auto,q_auto` by `server/src/modules/shared/cloudinaryUrl.js` (OPT-002). The
client-side coupling is one component, `client/src/features/media/CloudinaryImage.jsx`.

**Short feed video — Cloudinary.** `uploadVideoBuffer` accepts mp4/mov/webm,
capped by `FEED_VIDEO_MAX_BYTES` (100 MB) and `FEED_VIDEO_MAX_DURATION_SECONDS`
(60s), with an async eager MP4 transcode (OPT-009).

**Game video — YouTube, not hosted by TSW.** `Game.videoUrl` is a single string
validated by `youtubeUrlSchema` (five places in `games.validation.js`). Each stat
event may carry a `videoTimestamp`. The recap "highlight reel" is virtual: the
client picks up to five events, dedupes nearby timestamps, and drives
timestamp-bounded YouTube embeds (`client/src/features/games/highlightReel.js`,
`YouTubeHighlightReel.jsx`, `useYouTubeAutoplay.js`). **TSW hosts no video bytes
for games today.** Feed highlight-clip posts also store a YouTube URL +
timestamp and are gated by `isSafeYouTubeUrl` in `feed.service.js`.

## 2. What actually changes if TSW hosts game video

This is not "swap Cloudinary for a cheaper Cloudinary". The workload changes shape:

| Dimension      | Today (feed clips)               | Game video                                         |
| -------------- | -------------------------------- | -------------------------------------------------- |
| File size      | ≤ 100 MB                         | 2–8 GB source per game                             |
| Duration       | ≤ 60 s                           | 90–150 min                                         |
| Upload path    | Buffered through the API process | Must go **browser → provider directly**            |
| Storage growth | Negligible                       | Permanent, cumulative, the dominant cost           |
| Delivery       | Small                            | Modest — people watch highlights, not 2-hour games |

Two consequences drive the whole decision:

1. **This workload is storage-heavy and delivery-light.** A league uploads every
   game; almost nobody watches a full game end to end. So the provider's
   _storage_ price matters roughly 10× more than its bandwidth price.
2. **Per-minute storage pricing is a trap for long video.** Providers that bill
   storage per _minute_ (Cloudflare Stream, Mux) are priced for short-form
   content. A 100-minute basketball game costs them the same as 100 one-minute
   clips, while costing a per-GB provider only what the bytes actually take.

Also note: the current upload path buffers the entire file in memory before
streaming to Cloudinary. That is fine at 100 MB and fatal at 4 GB on Render.
Whichever provider is chosen, **game uploads must use resumable direct upload
(TUS or a presigned URL) from the browser**, never through the API service.

## 3. Cost model

Scenario used throughout (adjust when you have one real measured game):

- 100 games uploaded per month, ~100 minutes each, 1080p source.
- Stored footprint per game: **~1.8 GB** lean (720p ladder, original discarded)
  or **~4.5 GB** full (1080p ladder + original retained).
- Viewing: 6,000 video sessions/month × ~4 minutes at 720p ≈ **270 GB/month**.
- Costs are monthly and **cumulative** — month 12 holds 1,200 games.

| Provider                       | Storage basis      | Month 1      | Month 12              | Notes                                               |
| ------------------------------ | ------------------ | ------------ | --------------------- | --------------------------------------------------- |
| **Bunny Stream (lean)**        | $0.01/GB           | ~$5          | **~$24**              | Encoding free, delivery $0.01/GB EU+NA              |
| **Bunny Stream (full ladder)** | $0.01/GB           | ~$8          | **~$57**              | Keeps original + 1080p                              |
| **Cloudflare Stream**          | $5 / 1,000 min     | ~$74         | **~$624**             | Delivery cheap ($24), storage brutal for long video |
| **Mux (1080p)**                | $0.0024/min × 1.25 | ~$30         | **~$360**             | Delivery free under 100k min/mo; best DX            |
| **Cloudinary**                 | 1 credit = 1 GB    | 450+ credits | **~5,500 credits/mo** | Advanced is 600 credits at $249/mo — off the chart  |

Reading the table: Bunny is **~10–25× cheaper than Cloudflare Stream and ~6–15×
cheaper than Mux** for this specific workload, and Cloudinary video at game
length is not viable at any plan short of Enterprise negotiation.

The gap is structural, not a promotional discount: it comes from per-GB vs
per-minute storage billing, plus free transcoding.

## 4. Recommendation

### Video: **Bunny Stream**

- **Storage $0.01/GB, delivery from $0.005–0.01/GB (EU/NA), transcoding free**,
  $1/month minimum. For a UK-first product, EU/NA is the cheap bandwidth tier.
- Included at no extra charge: hosted player, HLS + MP4 fallback, token
  authentication, MediaCage, DRM, auto-transcription/subtitles.
- **Chapters and Moments map directly onto TSW's data model.** A Moment is a
  `{ label, timestamp }` — which is exactly `{ statType, videoTimestamp }` per
  event. The existing virtual highlight reel can be reproduced without
  generating any new video asset, same as it works with YouTube today.
- Resumable TUS upload, so a 4 GB game upload survives a flaky phone connection
  and never touches the Render API process.
- EU-headquartered (Slovenia), which is the easier answer for GDPR and for
  **youth basketball footage** — see §7.

### Images: **stay on Cloudinary for now**

Images are not the problem. TSW's image volume fits comfortably in low tiers,
Cloudinary is already wired, and doing two migrations at once doubles the risk
for no saving. Revisit only when image credits actually bind.

When that day comes, the swap is contained — `cloudinaryUrl.js` and
`CloudinaryImage.jsx` are essentially the whole surface — and the two sensible
targets are:

- **Bunny Storage + Bunny Optimizer** — $9.50/month flat per zone, unlimited
  transformations, plus $0.01/GB storage and bandwidth. Cheapest at scale, and
  consolidates billing with Stream.
- **ImageKit** — $9/month Lite (40 GB bandwidth, 10 GB storage) or $89 Pro. The
  closest drop-in to Cloudinary's transformation URL grammar and DAM if you want
  a like-for-like replacement rather than a cheaper primitive.

### Keep YouTube as a supported option, don't remove it

Self-hosting converts a cost YouTube absorbs for free into a line item you own
forever. Keep `videoUrl` accepting YouTube for leagues that already publish
there, and make TSW-hosted upload the default for everyone else. This also gives
you a fallback if hosting costs surprise you.

## 5. Why not the others

| Option                                           | Why not                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Stream**                            | Genuinely excellent DX and it has a real server-side clipping API (`POST /stream/clip` with `startTimeSeconds`/`endTimeSeconds`). But $5 per 1,000 stored minutes makes a library of full games ~10× Bunny's price, and the gap compounds every month. Worth reconsidering _only_ if you store clips and not full games. |
| **Mux**                                          | The best developer experience of the group, good free tier (100k delivery min/mo), per-title encoding. Priced for short-form media companies; ~6× Bunny for this library.                                                                                                                                                |
| **Cloudinary (video)**                           | Credit model charges 1 credit per GB stored — a single month of games exceeds the $249 Advanced plan. Real strength is on-the-fly trimming/transform URLs, which is valuable for short derived clips, not for game archives.                                                                                             |
| **imgix / Gumlet / Sirv**                        | Image-first. Gumlet has decent video, but no pricing advantage over Bunny and a smaller operational track record.                                                                                                                                                                                                        |
| **Cloudflare Images + R2**                       | Reasonable for the _image_ side ($5/100k stored, $1/100k delivered, zero egress on R2), but R2 alone gives you no transcoding or HLS packaging for game video.                                                                                                                                                           |
| **KeyCDN / CDN77 / CloudFront / plain BunnyCDN** | Pure CDNs. You would own FFmpeg transcoding, an HLS packaging pipeline, a player, and the job queue. That is months of work to rebuild what Bunny Stream includes at $0.01/GB.                                                                                                                                           |
| **PixelVault**                                   | Too new and too thinly documented to put a core product dependency on.                                                                                                                                                                                                                                                   |

## 6. What building this actually requires

Roughly in order:

1. **Make video provider-agnostic in the data model.** `Game.videoUrl` is a bare
   String and `youtubeUrlSchema` appears five times in `games.validation.js`.
   Replace with something like `{ provider: 'youtube' | 'bunny', videoId, url }`.
   Backfill existing games as `provider: 'youtube'`.
2. **Support more than one video per game.** Real filming produces per-quarter or
   per-half files. Today's single `videoUrl` cannot represent that, and
   `videoTimestamp` is implicitly relative to one file. Decide this _before_
   backfilling, not after.
3. **Direct resumable upload.** Signed TUS credentials issued by a new server
   endpoint; the browser uploads to Bunny; a webhook or poll marks the video
   ready. No large file touches the API process.
4. **Player abstraction on the client.** `youtube.js`, `highlightReel.js`,
   `GameVideoEmbed.jsx`, `YouTubeHighlightReel.jsx`, and `useYouTubeAutoplay.js`
   all key off an 11-character YouTube ID. They need a provider-neutral seek/
   play/segment interface; the reel selection logic itself is provider-agnostic
   already and can stay.
5. **Privacy and access control.** Private leagues need signed, expiring playback
   URLs (Bunny token auth). "Unlisted YouTube link", today's de facto model, is
   not adequate once TSW is the host of record.
6. **Retention and billing policy.** See §7.
7. **Feed and Instagram paths.** `feed.service.js` validates YouTube URLs for
   highlight-clip posts, and the Instagram foundation needs a real, publicly
   reachable video file for a Reel. Bunny serves MP4, but _trimming_ to a clip
   file needs either Cloudinary's on-the-fly trim, a small FFmpeg worker, or a
   secondary provider with a clipping API.

## 7. Risks worth deciding on early

**Storage is unbounded and your plans are not.** Billing today is capacity-based
(£5/extra team, £29/£49 league) with no metered dimension. Game video is the
first genuinely variable cost in the product, and it only ever goes up. Decide
now: a storage or retention cap per plan (e.g. "current season + one archived
season", or GB per league), or an explicit paid add-on. Retrofitting a cap onto
leagues that already uploaded three seasons is a much worse conversation.

**Youth footage is sensitive data.** UK grassroots basketball means minors on
camera. Hosting it yourself moves you from "we link to a video the league
published" to "we are the controller of children's video". That argues for EU
hosting, signed playback URLs, a clear deletion path, and a documented retention
policy — and it is a real reason to prefer Bunny over US-hosted options,
independent of price.

**Vendor concentration.** Bunny is a small company relative to Cloudflare. The
mitigation is that Bunny Stream stores plain MP4/HLS and TSW would hold the
`videoId` + provider; an export is a bulk download, not a re-architecture. Keep
the provider field in the schema so a second provider is additive.

**These are list prices, not your bill.** Before committing, upload one real
game and measure the actual stored GB across the rendition ladder. The whole
recommendation turns on GB-per-game, and a 720p-capped ladder with the original
discarded is roughly 2.5× cheaper than keeping everything.

## 8. Bottom line

Use **Bunny Stream** for game video: it is the only option in the group whose
pricing model (per-GB storage, free encoding, cheap EU bandwidth) matches a
workload of long videos that are stored forever and watched in short bursts. Keep
**Cloudinary for images** until image costs actually bind, then reassess with
Bunny Optimizer or ImageKit. Keep the YouTube path working so leagues that
already publish there are not forced to migrate.

## Sources

- [Bunny Stream pricing](https://bunny.net/pricing/stream/) · [Bunny pricing](https://bunny.net/pricing/) · [Bunny Optimizer](https://bunny.net/optimizer/) · [Bunny Chapters and Moments](https://bunny.net/blog/introducing-bunny-stream-chapters-and-moments/)
- [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/) · [Cloudflare Stream video clipping](https://developers.cloudflare.com/stream/edit-videos/video-clipping/) · [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)
- [Mux video pricing](https://www.mux.com/pricing/video)
- [Cloudinary pricing](https://cloudinary.com/pricing)
- [ImageKit plans](https://imagekit.io/plans/)
