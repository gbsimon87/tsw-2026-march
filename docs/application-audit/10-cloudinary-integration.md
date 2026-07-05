# Cloudinary Integration

> Part of the [Application Audit](./README.md) · July 2026

## Architecture

Cloudinary is used **server-side only**. The single SDK entry point is
`server/src/modules/feed/cloudinary.client.js`, exposing:

- `uploadImageBuffer(buffer, options)` / `uploadVideoBuffer(buffer, options)` —
  `upload_stream` from multer **memory buffers** into folder
  `CLOUDINARY_FOLDER` (default `tsw/feed`)
- `destroyImage(publicId)` / `destroyVideo(publicId)`
- `isCloudinaryConfigured()` — graceful degradation when env is absent

Consumers:

| Consumer                                                                           | Usage                                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `server/src/modules/feed/feed.service.js`                                          | feed image posts, video posts (+ thumbnail URL), deletion cleanup |
| `server/src/modules/teams/teams.service.js:25-28`                                  | team logos                                                        |
| `server/src/modules/leagues/leagues.service.js` (`:49-52, 1036, 1050, 1085, 1099`) | league + league-team logos                                        |
| `server/src/modules/auth/auth.service.js`                                          | user avatars (reuses `uploadImageBuffer`)                         |

The client never talks to Cloudinary — it renders the stored `secure_url`
verbatim in raw `<img>`/`<video>` elements.

## Upload details

| Kind          | Limit (env)                                                              | Validation                                                                                                    |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Feed image    | 5MB (`FEED_IMAGE_MAX_BYTES`)                                             | jpeg/png/webp                                                                                                 |
| Feed video    | 100MB (`FEED_VIDEO_MAX_BYTES`), ≤60s (`FEED_VIDEO_MAX_DURATION_SECONDS`) | mp4/quicktime/webm; duration checked **after** upload, oversized assets destroyed (`feed.service.js:387-393`) |
| Logos/avatars | 2MB (`TEAM_LOGO_MAX_BYTES`)                                              | jpeg/png/webp                                                                                                 |

- Multer uses **memoryStorage** — a 100MB video is buffered fully in RAM per
  request.
- Video uploads run an **eager transformation `[{format:'mp4',
quality:'auto'}]` with `eager_async:false`** (`cloudinary.client.js:61-62`) —
  the transcode blocks the HTTP request.
- Upload responses return width/height/duration, which **are persisted** on the
  Post/logo subdocs — usable for responsive markup (currently unused).

## Delivery (the big gap)

- **Images**: stored and served as the raw `secure_url` with **no
  transformation string at all** — no `f_auto`, no `q_auto`, no width scaling.
  Original uploads (up to 5MB) are delivered to every viewer.
- **Video thumbnail**: manually built URL
  `.../video/upload/so_1,f_jpg,q_auto/{publicId}.jpg`
  (`feed.service.js:31-37`) — has `q_auto` but not `f_auto`.
- **Client**: 64 raw `<img>` tags; only 3 use `loading="lazy"`; zero `srcset`/
  `sizes`; width/height attributes generally absent (CLS).
- No Cloudinary Admin/metadata API calls exist — nothing to batch or cache on
  the API side; the account's API usage is uploads/destroys only.

## Deletion & cleanup

Post deletion fires **fire-and-forget** destroys with swallowed errors
(`feed.service.js:477-498`) — orphaned assets are possible. Game deletion
removes related posts (`deletePostsByGameId`) but doesn't touch Cloudinary
(cards store no assets — correct).

## Optimisation summary

Detailed plan in [26-cloudinary-optimisation](./26-cloudinary-optimisation.md).
Headlines:

1. Add `f_auto,q_auto,w_<bucket>,c_limit` to every delivered image URL (one
   shared URL-builder util; can be done server-side at sanitize time or
   client-side).
2. Emit `srcset`/`sizes` from the stored width/height.
3. `loading="lazy"` + explicit dimensions on the ~61 remaining `<img>` sites.
4. Make the eager video transform async (`eager_async:true` +
   `eager_notification_url`) or rely on on-the-fly `f_auto` streaming URLs.
5. Replace memory buffering for videos with streaming/disk or direct
   signed-upload from the client.
6. Await (or queue) destroy results and log failures to catch orphans.
