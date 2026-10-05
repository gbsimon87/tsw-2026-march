# Mux Game Video Tracker

Decision and reasoning: [`media-provider-analysis.md`](media-provider-analysis.md).
Step-by-step plan: [`superpowers/plans/2026-10-04-mux-game-video.md`](superpowers/plans/2026-10-04-mux-game-video.md).

**Implementation status, 5 October 2026:** Tasks 1–12 are implemented;
Task 13's tracker integration is implemented and awaiting its manual Mux check.
The client now supports signed playback on the recap, both player profiles,
the reel, Pulse and tracker, plus chunked uploads, cancellation and status recovery.
Task 14 and live Mux acceptance checks remain open. Starter replay access stays
separate from hosted-upload allowance and viewer authorization. Setup and
operations: [`mux.md`](mux.md). A bug and security review on 5 October found no
authorization bypass or token leak, but logged 23 medium/low findings
([review findings](#bug-and-security-review-5-october-2026)). V1–V11 (all the
medium findings plus the four that reopened R3 and R5) are fixed, and V12–V23
remain open.

Update this file as work lands: tick the box, add the commit or PR, and record
anything learned in **Notes**. Status values: `todo`, `in progress`, `blocked`,
`done`.

## Before launch (non-code)

| #   | Item                                                                                                   | Owner | Status | Notes                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| L1  | Create a Mux account with Development and Production environments                                      | Simon | todo   | Pay-as-you-go includes a $20/month credit                                                                         |
| L2  | Development credentials: API token, signing key, webhook (tunnel URL) in `env/server/.env.development` | Simon | todo   | Needed before Task 13's manual check. Keep `MUX_MAX_RESOLUTION_TIER=1080p` (see V5)                               |
| L3  | Production credentials and webhook `https://<api-host>/api/v1/videos/webhooks/mux` set in Render       | Simon | todo   | Five `MUX_*` vars, all or none                                                                                    |
| L4  | Sign Mux's DPA; confirm UK transfer terms                                                              | Simon | todo   | The footage is mostly of minors                                                                                   |
| L5  | Write the retention and deletion policy for hosted game video (privacy notice)                         | Simon | todo   | The deletion path ships in Phase 1; automated retention is Phase 2                                                |
| L6  | Decide the hosted-upload allowance, quotas and spend ceiling                                           | Simon | todo   | Launch gate: `canViewReplay` is free on Starter; do not enable unrestricted billable uploads                      |
| L7  | Define full-game viewers and explicit public-highlight/footage publication permission                  | Simon | todo   | Default: authenticated game access for full games; permission/withdrawal rules for public clips                   |
| L8  | Assign takedown, cleanup-failure and spend-alert ownership                                             | Simon | todo   | Durable cleanup/reconciliation is Phase 1, automatic age-based retention is Phase 2                               |
| L9  | Agree token revocation window and video-replacement timeline policy                                    | Simon | todo   | 12 h/1 h bearer tokens remain usable until expiry or provider deletion; replacements may need timestamp remapping |

## Phase 1: build

| Task | Scope                                                                | Status      | PR / commit               | Notes                                                                      |
| ---- | -------------------------------------------------------------------- | ----------- | ------------------------- | -------------------------------------------------------------------------- |
| 1    | Mux env config (all-or-nothing) + `render.yaml`                      | done        | 9e0a5e9                   |                                                                            |
| 2    | `Game.video` schema + `shared/gameVideo.js` helpers                  | done        | 5f19e9d                   |                                                                            |
| 3    | Mux REST client, playback JWTs, webhook signatures                   | done        | fdb1e75; 8ef8279; db2c87c |                                                                            |
| 4    | Upload + remove endpoints; Mux cleanup on game delete                | done        | fad1324; 3394604          |                                                                            |
| 5    | Mux webhook: state machine + orphan-asset cleanup                    | done        | working tree              | Includes transactional quotas and missed-webhook recovery                  |
| 6    | Signed playback endpoint (full game + instant clips)                 | done        | working tree              | Optional auth, live policy, signed clip bounds and no-store                |
| 7    | Provider-aware game, highlight and Pulse payloads                    | done        | working tree              | Live Pulse source resolution, profile payloads and late-ready publication  |
| 8    | Client video API, token hook, provider helpers                       | done        | working tree              | Intent/visibility tokens, renewal, auth/source invalidation                |
| 9    | `MuxVideo` + `HighlightPlayer` on GameDetailPage and player profiles | done        | working tree              | Shared players, unavailable states and YouTube fallback                    |
| 10   | Mux highlight reel                                                   | done        | working tree              | Mux ended/error progression, source reset, replay and volume               |
| 11   | Pulse highlight cards on Mux                                         | done        | working tree              | Visibility thresholds and shared mixed-provider playback coordinator       |
| 12   | Upload UI (`GameVideoUploader`)                                      | done        | working tree              | Chunk progress, persisted-attempt cancellation, bounded media-only polling |
| 13   | GameTrackPage on Mux Player                                          | in progress | working tree              | Current-element timestamps and clock handlers tested; manual check pending |
| 14   | Setup guide, docs, end-to-end verification                           | in progress | working tree              | Setup guide written; real provider/browser checks pending                  |

## Phase 1: acceptance checks

Tick these during Task 14, against the Mux Development environment.

- [ ] Upload a real game from the tracker; it reaches `ready` without a page reload.
- [ ] Tagged stats get `videoTimestamp`s that match the player (±1 s); the game clock follows play and pause.
- [ ] GameDetailPage: full game plays; recap clips can't be scrubbed outside their window; the reel plays in order.
- [ ] Both player profile pages play Mux clips.
- [ ] Pulse auto-posts for a finished public league game play muted, one at a time.
- [ ] Signed out: full game returns 401; an unrelated authenticated viewer gets 404. An eligible manager can play it, including on Starter; a currently permitted public Pulse clip still plays.
- [ ] A play tagged past the end of the video shows "Video unavailable" (422), not a broken player.
- [ ] Removing a video while it's processing leaves no asset in the Mux dashboard.
- [ ] YouTube-linked games behave exactly as before on every surface.
- [ ] Measured stored minutes per game recorded below; cost table in the analysis updated if it's off.
- [ ] Upload allowance/quota is enforced before a Mux call, including concurrent requests; a forged browser size/type cannot bypass verified ingest limits.
- [ ] All permitted frontend origins can upload; arbitrary origins cannot obtain an upload URL.
- [ ] Private/unpublished/withdrawn footage and deleted shares cannot mint public clip tokens. Share authorization uses game and event together.
- [ ] Ready-asset cleanup survives Mux failure and process restart without another webhook; schedule-rebuild deletion leaves no billed media.
- [ ] Concurrent replacement/removal and delayed ready/error/delete webhooks cannot resurrect or overwrite media; unknown ownership never triggers deletion.
- [ ] Legacy Pulse posts resolve current provider and event timestamp after replacement/correction; incompatible timelines show unavailable until remapped.
- [ ] A video uploaded after game finalization creates permitted auto-highlights exactly once when ready.
- [ ] Unplayed/offscreen highlights request no JWTs; one clip plays across mixed YouTube/Mux and fullscreen Pulse views.
- [ ] Playback renews across token expiry and sleeping tabs; source changes invalidate tokens and tracker timestamps read the current media element.
- [ ] Record signed 95–105 s clip `currentTime`, `duration`, `seekable` and `ended` in Chrome and Safari. No assumption that the player starts at zero.

## Review corrections (Phase 1 launch gates)

These are launch requirements. Backend and client portions have regression coverage; operational policy decisions and live provider/browser acceptance remain open. An `in progress` review has code implemented but still needs those checks or decisions. No production deployment is implied.
The plan's R1–R9 sections name files, behavior and regression cases.

| Review | Required change                                                                       | Tasks       | Status      |
| ------ | ------------------------------------------------------------------------------------- | ----------- | ----------- |
| R1     | Viewer authorization separate from Starter entitlements; resolve upload packaging     | 4, 6, 7, 13 | in progress |
| R2     | Atomic quotas, upload rate limits, spend controls and allowed-origin CORS             | 1, 3, 4, 12 | in progress |
| R3     | Durable cleanup, reconciliation, proven ownership and bulk-deletion coverage          | 2–5, 14     | done        |
| R4     | Atomic identity-checked webhook/upload transitions and valid test ids                 | 2, 4, 5     | done        |
| R5     | Live Pulse provider/timestamp resolution, timeline binding and late-upload publishing | 2, 7, 8, 13 | done        |

R3 was reopened by review findings V4, V6, V7, V10 and V11, and R5 by V1, V8 and
V9. All of them are fixed, so both are closed again.
| R6 | Token renewal/invalidation, revocation policy, strict signing and webhook verification | 3, 6, 8, 9, 12 | in progress |
| R7 | Playback-intent token fetch and shared mixed-provider autoplay coordination | 9–11 | in progress |
| R8 | Upload cancellation/polling recovery and tracker readiness/currentTime integration | 9, 12, 13 | in progress |
| R9 | Footage publication/withdrawal policy and derivative deletion | 6, 7, 14 | in progress |

## Bug and security review, 5 October 2026

A read-only review of everything on the branch since `abf8922`, committed and
working tree, server and client. Each finding was traced through the code; V5
was checked against Mux's create-upload API reference. V1–V7 were fixed the
same day with regression tests (see Notes); V8–V23 are `todo`. Severity: M =
medium, L = low.

**No security finding.** Webhook verification uses raw bytes, timing-safe HMAC,
two-sided tolerance and event-id dedupe. Tokens are RS256 with allow-listed claims.
Clip windows come only from the server-side event timestamp. Public clip access
checks game and event together. Upload, cancel and remove authorization is
correct, including IDOR on attempt ids. Quota reservation is atomic. No Mux ids
reach public payloads, and every `/video` response is `no-store`.

| #   | Sev | Area                | Finding                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                                                                                | Status |
| --- | --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| V1  | M   | Pulse               | Every ready upload reruns auto-publication with the cap of 5 applied to _unshared_ events only. Each same-recording replacement adds 5 more clips and recreates system clips an admin deleted, which makes their public clip tokens valid again. Cap per game and keep a tombstone.                                                                                                                                              | `feed.service.js` `autoPublishForFinalizedGame`; `video.lifecycle.js` `publishReady` | done   |
| V2  | M   | Client playback     | `refetchOnWindowFocus`/`staleTime: 0` mint a new token on every tab return. The new token reloads the Mux source. On the tracker the video rebuffers while the clock runs, and a paused video can auto-resume and restart the clock (traced in library code, not reproduced). Rely on the existing near-expiry `wake` check.                                                                                                     | `useVideoPlayback.js`; `MuxVideo.jsx` `autoPlay`/`restore`                           | done   |
| V3  | M   | Upload UI           | The 10-minute poll limit starts when the transfer starts. Uploads longer than 10 minutes stop polling, so "Video ready" never appears without **Refresh video status**. Start the window at `processing`.                                                                                                                                                                                                                        | `GameVideoUploader.jsx` poll effect                                                  | done   |
| V4  | M   | Cleanup             | Mux 401/403/400 on delete or cancel marks the job permanently `failed` on its first claim, for example during credential rotation. Nothing resets failed jobs, so the billed assets remain. Treat auth errors as retryable and add an operator re-drive.                                                                                                                                                                         | `video.cleanup.js` `recordFailure`; `mux.client.js` `isRetryableStatus`              | done   |
| V5  | M   | Config              | `MUX_MAX_RESOLUTION_TIER=720p` passes env validation, but Mux accepts only `1080p`/`1440p`/`2160p`, so every upload fails with 502. Send `1080p` to Mux and keep 720p as a post-ingest check only, or drop the option.                                                                                                                                                                                                           | `env.js`; `mux.client.js` `createDirectUpload`                                       | done   |
| V6  | M   | Deployment identity | Pairing a database with the wrong Mux environment makes every target 404 ("gone"). Jobs complete, minutes are released and in-flight games are detached while the real assets leak. Separately, the label falls back to `NODE_ENV`, and `APP_ENV` is required only with Stripe. Changing it silently orphans every job and attempt. Store a Mux environment fingerprint, require `APP_ENV` with Mux, and warn on unmatched rows. | `video.repository.js` `getVideoDeployment`; `env.js`                                 | done   |
| V7  | M/L | Game delete         | `deleteGameForUser` reads `game.video` once, then deletes by `_id`. A concurrent upload attach survives on a deleted game with a working upload URL and no cleanup job. It only recovers after the upload times out (up to 6 h). Make the delete conditional on the generation it read.                                                                                                                                          | `games.service.js` `deleteGameForUser`                                               | done   |
| V8  | M/L | Timelines           | "Same recording" stores only `[previousTimelineId]`. After YouTube → Mux → Mux, the YouTube-bound and legacy events become unavailable. Copy the whole equivalence chain.                                                                                                                                                                                                                                                        | `video.lifecycle.js` `publishReady`                                                  | done   |
| V9  | M/L | Timelines           | Unbound legacy events resolve to the _current_ `videoUrl`. Changing the YouTube link to a different recording plays the new footage at the old timestamps, and old public Pulse posts expose the new URL. Bind unbound events to the old link on change, or backfill.                                                                                                                                                            | `gameVideo.js` `resolveEventTimelineId`; `games.service.js` `updateGameForUser`      | done   |
| V10 | L   | Scripts             | `retrack-league-games-dual.js` runs `Game.deleteMany` without the `video: null` guard, which strands a hosted asset on a deleted scheduled game.                                                                                                                                                                                                                                                                                 | `scripts/retrack-league-games-dual.js`                                               | done   |
| V11 | L   | Reconcile           | `reconcileAttempt` moves the attempt to `cancelled` before enqueueing cleanup, so a crash in between leaks the asset. A `releaseUploadSlot` failure leaks the slot permanently. Enqueue first.                                                                                                                                                                                                                                   | `video.cleanup.js` `reconcileAttempt`                                                | done   |
| V12 | L   | Authorization       | Team managers (and a former game owner) can delete a league game, which deletes its league-hosted video. `DELETE /video` itself is limited to the league owner or a manager.                                                                                                                                                                                                                                                     | `games.service.js` `deleteGameForUser`                                               | done   |
| V13 | L   | Webhook             | A retried `asset.ready` for an already-ready video can queue `delete_asset` for the live asset, for example when the resolution tier was lowered in between. The reference deferral saves it, but after 24 h a false permanent-failure alert fires.                                                                                                                                                                              | `video.lifecycle.js` `discard`                                                       | todo   |
| V14 | L   | Quota               | Remove, cancel and game delete release stored minutes before Mux confirms deletion. Permanent cleanup failures then let a League exceed `maxStoredMinutes`.                                                                                                                                                                                                                                                                      | `video.service.js` `retireAttempt`                                                   | todo   |
| V15 | L   | Payloads            | Recap, profile and Pulse payloads mark Mux highlights `videoAvailable` for viewers the token endpoint will refuse. Play shows "Video unavailable" and costs about 8–12 queries.                                                                                                                                                                                                                                                  | `buildHighlightVideoFields` callers                                                  | todo   |
| V16 | L   | Payloads            | Anonymous public game payloads include `video.status` and internal `errorMessage` codes (`duration_limit`, `provider_create_failed`, …).                                                                                                                                                                                                                                                                                         | `gameVideo.js` `sanitizeGameVideo`                                                   | todo   |
| V17 | L   | Rate limit          | The upload limiter (5/h) counts rejected requests (409/403/502), so retries during a Mux outage lock a manager out for an hour.                                                                                                                                                                                                                                                                                                  | `rateLimit.middleware.js`                                                            | todo   |
| V18 | L   | Config              | A blank `MUX_*=` value fails boot instead of meaning "off". The signing key check accepts non-RSA keys, which then fail at signing.                                                                                                                                                                                                                                                                                              | `env.js`                                                                             | todo   |
| V19 | L   | Recovery sweep      | Stale-attempt scans take the oldest 25 and never touch skipped rows, so 25 or more long-running attempts starve newer ones.                                                                                                                                                                                                                                                                                                      | `video.lifecycle.js`; `video.repository.js` `listStaleUploadAttempts`                | todo   |
| V20 | L   | Scripts             | `video:hosting`: the header's `pnpm … -- <leagueId>` usage fails with "Unknown argument --". It accepts `--max-stored-minutes` below 180, which blocks every upload, and it prints no target database.                                                                                                                                                                                                                           | `scripts/set-league-video-hosting.js`                                                | todo   |
| V21 | L   | Client edge cases   | Device clock skew → token refetch every second or permanent "Loading video…". A poll that returns `video: null` (replay entitlement lost) aborts a live transfer. Some cancel failures leave no Cancel button. The one-retry flag never resets. The feed card Play button does nothing.                                                                                                                                          | `useVideoPlayback.js`; `GameVideoUploader.jsx`; `MuxVideo.jsx`                       | todo   |
| V22 | L   | Upload API          | Replacing an `uploading` video can't work with `maxConcurrentUploads: 1` and returns a misleading allowance 429. `errored` is never persisted on `Game.video`. The client never calls this path.                                                                                                                                                                                                                                 | `video.service.js` `createGameVideoUpload`                                           | todo   |
| V23 | L   | Operations          | Nothing at runtime checks for the replica set or video indexes before `MUX_UPLOADS_ENABLED`. Without indexes, racing quota upserts can split a counter. Shutdown and `video:reconcile` don't await `kickCleanup` batches, which leaves leased jobs and an understated summary.                                                                                                                                                   | `server.js`; `video.cleanup.js`; `video-reconcile.js`                                | todo   |

## Verification of the three open questions

| Question                             | Result                                                                            | Follow-up                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@mux/mux-player-react/lazy` exists  | Confirmed in the official guide and package exports; current source forwards refs | Keep it; production Vite build verifies the installed version                               |
| Instant clip player time starts at 0 | Not established by Mux's guide, and no signed dev clip was tested                 | Task 14 records the timeline on Chrome/Safari; clips do not seek to source time             |
| Task 7 fixture-only test step        | Expanded into complete parameterized tests using the actual repo fixtures         | Active League and free Starter both grant replay; Task 6 must separately test viewer denial |

Sources: [Mux lazy-loading guide](https://www.mux.com/docs/guides/player-lazy-loading),
[package exports](https://github.com/muxinc/elements/blob/main/packages/mux-player-react/package.json),
[instant-clips guide](https://www.mux.com/docs/guides/create-instant-clips).

## Phase 2 (needs its own plan)

| Item                                                        | Trigger                                                   | Status |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------ |
| Clip assets (frame-accurate, with MP4) for Pulse posts      | Instagram Reels needed, or the bill passes the $20 credit | todo   |
| Retention: delete full games after a season, keep the clips | After clip assets; before about 100 games/month           | todo   |
| Several videos per game                                     | Real uploads show it's needed                             | todo   |

## Revisit triggers (move to Bunny Stream, or a hybrid)

- More than 100 hosted games a month for 3 months.
- A Mux bill above about $150 a month after credit.
- An EU-only hosting requirement.

## Monthly cost log

| Month | Games uploaded | Stored minutes | Delivered minutes | Bill after credit |
| ----- | -------------- | -------------- | ----------------- | ----------------- |
|       |                |                |                   |                   |

## Notes

- 2026-10-04: Chose Mux over Bunny Stream. Bunny has no clip API and no end
  time on embeds; benchmark encoding queues rather than rely on the unconfirmed
  hours-to-days claim. Mux
  instant clips and clip assets cover the Pulse, GameDetailPage and player
  profiles with no clip worker to build or run.
- 2026-10-04 review: corrected net month-12 estimates (30 games/month: $32 cold,
  $88 kept hot); retention estimates exclude permanent clips/MP4s. Record their
  stored minutes and cost separately when Phase 2 ships. Prices are USD; budget
  taxes, FX, actual delivery and other account usage separately.

- 2026-10-05: Backend continuation completes Tasks 5–7. Webhook completion
  markers follow durable processing; ready/error and quota writes commit in
  MongoDB transactions. An isolated temporary replica set verified rollback,
  concurrent ready/error settlement, exactly-once quota conversion/refunds and
  preservation of video fields through an unrelated tracking save (7 tests).
  Hosted video now requires Atlas or a replica-set development database.
- 2026-10-05: Pulse references resolve the current game/event/provider/timestamp
  in a batched media projection, including old YouTube posts. Publication of
  Mux auto/manual shares applies current footage and player permission. Ready
  uploads rerun idempotent auto-publication. Client work and actual Mux/browser
  verification remain open; no live provider upload was performed in this pass.
- 2026-10-05 verification: server suite passed (117 suites, 1,659 tests),
  server lint and changed-file formatting passed. The opt-in transaction suite
  passed separately against the temporary replica set (7 tests), which was then
  stopped. Client regression suite: 1,069 passed, one existing caption-assistant
  test failed because it expects exactly two hashtags and also a minimum of
  three (`captionAssistant.test.js:231`); no client files were changed.

- 2026-10-05 client continuation: Tasks 8–12 and the Task 13 implementation
  are in the working tree. Tokens are requested on intent or actual Pulse
  visibility, renewed five minutes before expiry and checked after sleeping tabs.
  Source/version/timestamp and viewer changes select new queries; credentials
  stay in memory. Media errors refresh at most once; denied/out-of-range clips
  show unavailable. Mux and YouTube use one playback coordinator.
- Upload UI lives in the tracker's Options tab and stays mounted across tabs.
  It cancels the persisted attempt as well as the transfer, compensates for a
  delayed create response, keeps failed cancellation recoverable, and polls
  without overlapping requests for at most ten minutes. Polls merge media
  fields only, and responses begun before cancellation/removal are discarded.
  Tracker stat handlers read the current media element only when ready, with
  source/remount resets, and playback events drive the existing clock handlers.
- Client verification: 20 new shared-video tests plus 3 tracker integration tests
  cover intent/visibility, expiry/wake renewal, viewer/source changes, actual
  clip-time restoration, reel progression/shrinking inputs, chunk progress,
  cancellation races, unmount recovery, bounded polling and timestamp/clock
  integration. The existing contradictory caption-assistant failure remains.
  The full client suite has 1,092 passing tests and that one existing failure.
  Production build and client lint pass. Real Mux uploads, playback bounds and
  Chrome/Safari acceptance are pending; the in-app Node REPL browser runtime
  was unavailable in this session. No live provider call was made.

- 2026-10-05 review: full bug/security pass over webhook/client/tokens,
  upload/quota, cleanup/reconcile, playback/policy/payloads and the client.
  Findings V1–V23 are above. R3 and R5 are reopened. Re-run baseline, unchanged:
  server 117 suites passed / 1,659 tests (transaction suite skipped without
  `MUX_TRANSACTION_TEST_URI`). Client 1,092 passed plus the existing
  caption-assistant failure. `docs/mux.md` now says the playback endpoint's
  authentication and replay-entitlement requirement applies to full games only.

- 2026-10-05 fixes V1–V7, all in the working tree with regression tests written
  first:
  - **V1:** a game now publishes automatic highlights at most once
    (`Game.autoHighlightsPublishedAt`), and the cap of 5 counts events already
    shared. A later ready upload or a `backfill-auto-feed` rerun no longer adds
    clips or recreates deleted ones. If a game was finalized with no eligible
    events, a later ready upload can still publish.
  - **V2:** playback tokens no longer refetch on focus or reconnect. Renewal
    is driven only by expiry. `MuxVideo` remembers the viewer's last play/pause,
    so a renewal never re-arms autoplay.
  - **V3:** the ten-minute status-poll window starts when the transfer ends.
  - **V4:** Mux 401/403 are retryable. `video:reconcile --retry-failed`
    requeues failed cleanup jobs with a fresh budget.
  - **V5:** `MUX_MAX_RESOLUTION_TIER` accepts only `1080p`.
  - **V6:** production requires `APP_ENV` when Mux is configured. Cleanup and
    stale-upload recovery first prove that the credentials can see one of this
    deployment's three newest `ready` assets, and otherwise pause with an error
    log. The sweep and `video:reconcile` warn about, and report
    (`foreignDeployments`), open work under another deployment label.
  - **V7:** a single-game delete is conditional on the video generation it read;
    a concurrent attach returns 409.
  - **Verification:** server 117 suites / 1,685 tests passed. Client 1,095
    passed plus the existing caption-assistant failure. Lint, client build and
    `check-env` passed.
  - **Residual V6 risk:** with no `ready` asset to compare against, a wrong
    environment is still not detected.
- 2026-10-05 fixes V8–V11, with regression tests written first. R3 and R5 are
  closed again.
  - **V8:** the attempt now records the whole current timeline chain
    (`previousTimelineIds`), and a ready settle copies it into
    `equivalentTimelines`. On closer reading the reported YouTube → Mux → Mux
    path cannot happen: a ready Mux video must be removed before another
    upload, so the chain at reservation never holds a Mux timeline. The change
    is a guard in case replaceable statuses widen. Events stamped on a removed
    Mux generation stay unavailable after a re-upload, as designed.
  - **V9:** changing or clearing a game's YouTube link first binds every
    unbound timestamped event to the old link's timeline. The new link no
    longer plays old timestamps, and old Pulse posts no longer expose it. The
    save is version-checked, so a concurrent event edit returns 409.
  - **V10:** `retrack-league-games-dual.js` skips games with hosted video and
    re-asserts `video: null` in its delete filter. Its guards are now exported
    and tested.
  - **V11:** stale-upload reconcile enqueues cleanup before cancelling the
    attempt. A failed slot release puts the attempt back in flight for the next
    sweep.
  - **Verification:** server 118 suites / 1,693 tests passed; lint passed.
