# Media Storage

> Part of the [Application Audit](./README.md) · July 2026

All binary media lives in **Cloudinary** (no S3/GCS/local disk). MongoDB stores
only metadata subdocuments.

## Stored metadata shapes

**Logo/avatar subdoc** (Team, League, LeagueTeam, User):
`{url, publicId, width, height, mimeType}`
(`server/src/modules/teams/teams.repository.js` logoSchema and equivalents).

**Feed post image subdoc** (`server/src/modules/feed/feed.repository.js`):
`{url, publicId, width, height, mimeType, bytes}`.

**Feed post video subdoc**: `{url, publicId, width, height, duration, bytes,
mimeType, thumbnailUrl, eagerUrl}` — `eagerUrl` is the pre-transcoded MP4
(preferred for playback), `thumbnailUrl` the derived `so_1` frame.

## Asset lifecycle

| Asset                        | Created by                            | Replaced                         | Deleted                                                                 |
| ---------------------------- | ------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Team/league/league-team logo | logo upload endpoints (owner/manager) | old asset destroyed on re-upload | destroy on explicit remove                                              |
| User avatar                  | `POST /auth/avatar`                   | destroy+replace                  | —                                                                       |
| Feed image/video             | `POST /feed/image` / `/feed/video`    | n/a                              | fire-and-forget destroy on post delete (errors swallowed → orphan risk) |

All uploads flow through multer **memoryStorage** → buffer →
`upload_stream`. There is no upload queue, no resumable upload, and no direct
browser→Cloudinary signed upload (the 100MB video path transits the API
server's RAM).

## Folders & organisation

Everything lands in one folder, `CLOUDINARY_FOLDER` (default `tsw/feed`) —
including logos and avatars. Consider per-type folders (`tsw/logos`,
`tsw/avatars`, `tsw/feed`) for lifecycle rules and easier auditing; requires no
code change beyond passing a folder option.

## External video

Game film is **YouTube embeds**, not Cloudinary
(`client/src/features/games/components/GameVideoEmbed.jsx`,
`client/src/features/games/youtube.js`); highlight clips reference a game
event + video timestamp rather than storing a clipped asset.

## Gaps

1. Orphaned-asset risk from swallowed destroy errors; no reconciliation job
   (and no job runner — see [16-background-jobs-scheduled-tasks](./16-background-jobs-scheduled-tasks.md)).
2. RAM-buffered 100MB uploads (OOM pressure under concurrency).
3. Single flat folder.
4. No image variants stored — but none are needed if delivery uses on-the-fly
   transformations ([26-cloudinary-optimisation](./26-cloudinary-optimisation.md)).
