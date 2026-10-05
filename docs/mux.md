# Mux game video setup

The integration supports direct uploads, authenticated full-game playback, signed
instant clips, verified webhooks and durable cleanup. Client players and the
tracker uploader are implemented; real Mux/browser acceptance remains open. See
[mux-video-tracker.md](mux-video-tracker.md).

Use a separate Mux environment for each database, including previews and local
development. Never connect a restored production database to a different Mux
account/environment and run cleanup: attempt ownership is tied to deployment
identity (`APP_ENV` or `NODE_ENV`, plus database name). A restore needs an
operator audit of both provider resources and persisted attempts/jobs first.

## Database prerequisite

Hosted video settlement uses MongoDB transactions to commit game readiness,
upload status and quota conversion together. Use Atlas or a MongoDB replica
set; a standalone MongoDB server cannot process ready/failure transitions.
Configure this before enabling hosted uploads. Keep the ordinary standalone
local database for development without Mux if preferred.

The transaction regression suite uses an isolated replica-set database whose
name ends in `_test`:

```sh
MUX_TRANSACTION_TEST_URI='mongodb://127.0.0.1:27028/mux_video_test?replicaSet=mux-test' pnpm --filter server exec jest --runInBand video.transactions.test.js
```

## Credentials and webhook

Set all five values in the appropriate server environment or Render service:

```dotenv
MUX_TOKEN_ID=<Mux environment API token id>
MUX_TOKEN_SECRET=<Mux environment API token secret>
MUX_SIGNING_KEY_ID=<Mux signing key id>
MUX_SIGNING_PRIVATE_KEY=<base64 PEM private key supplied by Mux>
MUX_WEBHOOK_SECRET=<secret for this webhook endpoint>
MUX_MAX_RESOLUTION_TIER=1080p  # the only accepted value
MUX_UPLOADS_ENABLED=false
MUX_PUBLIC_CLIPS_ENABLED=false
```

Configure `POST https://<api-host>/api/v1/videos/webhooks/mux` in that Mux
environment. For development, point a tunnel at the local API. Subscribe to
`video.upload.asset_created`, `video.upload.errored`, `video.upload.cancelled`,
`video.upload.timed_out`, `video.asset.ready`, `video.asset.errored` and
`video.asset.deleted`. Verification uses the original request bytes and a
five-minute signature timestamp tolerance before parsing JSON. Database/provider
failures return 5xx so Mux can retry. Completion is recorded after processing.

Before enabling uploads in each database, run:

```sh
pnpm --filter server video:ensure-indexes
pnpm --filter server video:hosting <leagueId> --enable --max-stored-minutes 600 --max-concurrent-uploads 1 --max-creates-per-day 3 --dry-run
```

Review the dry-run, then run the hosting command without `--dry-run` to apply
the explicit per-league grant. Use `--disable` to revoke hosted uploads and
`--public-clips granted|withdrawn|unrecorded --by operator@example.com` to record
footage publication permission separately. Both kill switches default
to off. Uploads additionally require writable game access, a league owner or
active manager, and sufficient atomic quota. Starter replay access does not grant
billable uploads. Configure every frontend in `CLIENT_ORIGIN`; the requesting
allowlisted Origin becomes the direct upload's CORS origin.

The API checks file size/type for usability. Mux verifies duration and resolution
after ingest: assets exceeding the attempt's 180-minute reservation or configured
resolution tier, with missing verification, or with public playback IDs are
rejected and queued for deletion. Direct ingest may still incur provider charges;
set Mux spend alerts and an operational budget before turning uploads on.

## Playback and publication

`GET /api/v1/games/:gameId/video/playback` without `eventId` returns a full-game
token and requires authentication, game access and live replay entitlement.
Passing `?eventId=<24-hex>` requests a signed clip; that path uses optional
authentication. Managers can view game events; other viewers, including
anonymous ones, require a live share matching both
game and event, a completed public league, an explicit footage publication grant,
and current marketing/player permission. The token endpoint applies these checks
on each signing and returns `private, no-store`, including errors.

Full-game tokens last 12 hours. Clip tokens last one hour and sign the source
window in `asset_start_time`/`asset_end_time`; their thumbnail token fixes the
frame. Clips receive no full-game storyboard token. Withdrawal, share deletion
and video removal deny new tokens immediately. Previously issued bearer tokens
last until expiry or provider deletion. Removal queues durable deletion before
detaching the source; provider failures leave deletion pending, with retries.

Every event timestamp is bound to its recording. Confirmed equivalent uploads
may reuse the previous timeline; other replacements leave old highlights
unavailable until corrected. Changing a game's YouTube link pins its older,
unbound timestamps to the previous link first. Feed pages resolve current provider and timestamp
in one media projection per page, including legacy posts. Late-ready uploads
rerun permitted auto-publication, with existing event deduplication. Recap, league
player profile and Pulse payloads mark a Mux highlight unavailable for any viewer
the clip token endpoint would refuse.

## Recovery and operations

The API sweeps every five minutes when Mux is configured. It retries cleanup and
recovers uploads/processing attempts unchanged for at least ten minutes by
reading their known Mux upload/asset. Missed ready, failed or expired deliveries
therefore do not strand attached games. Unknown resources and attempts from
another deployment are never deleted.

Before treating any Mux 404 as "already gone", cleanup and recovery confirm that
the configured credentials can see one of this deployment's newest live assets.
If none is visible, both pause and log
`Mux credentials cannot see this deployment's live video`. Fix the credentials;
nothing is deleted or detached meanwhile. Production requires `APP_ENV` when Mux
is configured, so the deployment label never falls back to `NODE_ENV`. The sweep
also warns when open attempts or jobs exist under a different label, for example
after `APP_ENV` or the database name changed.

A manual run works even while the API service sleeps:

```sh
pnpm --filter server video:reconcile --dry-run
pnpm --filter server video:reconcile
pnpm --filter server video:reconcile --retry-failed
```

Dry-run makes database reads only. Inspect the `lifecycle`, `reconcile`, `cleanup`,
`outstanding` and `foreignDeployments` summaries. A credential or permission
failure (401/403) is retried. After fixing the cause of permanently failed jobs,
`--retry-failed` requeues them with a fresh retry budget. Alert on permanent cleanup failure logs and growing
failed job counts, and assign takedown ownership before launch. Schedule rebuilds
exclude games carrying hosted video so bulk deletion cannot orphan billed assets.
Automatic age-based retention and permanent derivative clips remain Phase 2.

## Client behavior and acceptance

In GameTrackPage, open **Options → Upload game video**, choose a file, and keep
that page open until the transfer finishes. The uploader uses 5 MiB resumable
chunks, displays progress, and polls video status every three seconds for at most
ten minutes. **Refresh video status** restarts that check. Once processing has
started you can leave and return; an unfinished transfer is aborted and its
persisted upload attempt is cancelled when the tracker unmounts. A failed
cancellation retains the attempt id in session storage so it can be retried.
Tokens and upload URLs are never stored there. **Cancel upload** works during
processing; **Remove video** is available for ready/errored media even when new
uploads are disabled. Switching tracker tabs keeps the uploader mounted.

If replacing a linked YouTube recording, confirm **Same recording and timing**
only when its timestamps really match. The YouTube player remains usable during
Mux processing. Status polling merges media fields without replacing current
clock/stat data. Once ready, Mux becomes the tracker and recap source. Stat entry
reads the current ready media element directly; source changes and breakpoint
remounts clear old timestamps and playback ownership.

Recap/profile clips and full games request credentials after pressing Play. The
reel requests only its active clip after opening it. Pulse requests credentials
when a card crosses its visibility threshold, and pauses on exit or a hidden
tab. A shared coordinator pauses the previous YouTube/Mux player. Tokens renew
five minutes before expiry and are checked after sleeping tabs; query identity
includes viewer, source version and corrected clip timestamp. Renewal restores
the actual observed position, paused state, volume and mute. A media error gets
one credential refresh; denied/out-of-range clips display **Video unavailable**.

Before launch, run every acceptance item in [the tracker](mux-video-tracker.md)
against the Development environment. For a signed 95–105 s clip, record the
actual player `currentTime`, `duration`, `seekable` ranges and `ended` behavior in
Chrome and Safari, including scrubbing attempts outside the signed window.
Also let a clip session cross its one-hour token lifetime and sleep/wake the
browser. Capture media properties only, without copying token URLs into logs.
The implementation never seeks a clip to its source event timestamp or assumes
a zero-based clip timeline.

| Browser | currentTime at start | duration | seekable ranges | ended / bounds / renewal |
| ------- | -------------------- | -------- | --------------- | ------------------------ |
| Chrome  | pending              | pending  | pending         | pending                  |
| Safari  | pending              | pending  | pending         | pending                  |

References: [Mux webhooks](https://www.mux.com/docs/core/listen-for-webhooks),
[asset response fields](https://www.mux.com/docs/api-reference/video/assets/get-asset),
[signed playback](https://www.mux.com/docs/guides/secure-video-playback),
[instant clips](https://www.mux.com/docs/guides/create-instant-clips).
