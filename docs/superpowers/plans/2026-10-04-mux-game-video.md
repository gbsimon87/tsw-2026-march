# Mux Game Video (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a game manager upload a full game video to Mux, track stats against it in GameTrackPage, and show the tagged plays as signed instant-clip highlights on GameDetailPage, both player profile pages and the Pulse. YouTube keeps working.

**Architecture (subject to R1–R9 below):** The server creates a Mux direct upload, the browser sends the file straight to Mux (UpChunk), and a signed Mux webhook records the asset on a new `Game.video` subdocument. Playback is always signed. The client asks `GET /api/v1/games/:gameId/video/playback[?eventId=]` for short-lived RS256 JWTs. Full-game tokens need authenticated game access plus `canViewReplay`; highlight tokens carry Mux instant-clip claims (`asset_start_time`/`asset_end_time`). Highlight payloads gain a `videoProvider` field, so every surface picks the YouTube embed or Mux Player from one shared component.

**Tech Stack:** Express + Mongoose + Zod + Jest/Supertest (server). React 18 + TanStack Query + Vitest/RTL (client). Mux REST API through `fetch` (no SDK). `jsonwebtoken` (already a dependency) for playback JWTs. `@mux/mux-player-react` and `@mux/upchunk` on the client.

**Spec:** [`docs/media-provider-analysis.md`](../../media-provider-analysis.md) (§2 requirements, §6 architecture, §7 risks). Progress: [`docs/mux-video-tracker.md`](../../mux-video-tracker.md).

**Review status, 4 October 2026:** not ready for implementation unchanged.
The required corrections below override the original illustrative snippets.
Tasks 4–7 need the access, persistence and publication changes before their
commit steps can be considered complete. This review changes documentation;
none of the launch fixes has shipped.

## Required corrections from review

### R1 — Viewer authorization and upload packaging (critical; Tasks 4, 6, 7, 13)

`billing/plan-catalog.js` grants `canViewReplay` and `canViewHighlightClips` to
Starter, and `entitlements.service.js` falls inactive subscriptions back to
Starter. `assertGameAccess(null, gameId)` returns any existing game. Consequently
the original Task 6 snippet grants anonymous full-game playback, and Task 4
grants free users billable uploads. These are not paid-plan or privacy gates.

- [ ] Mount playback with `optionalAuthMiddleware` and pass `req.auth?.userId`
      to the service. Full-game requests require an authenticated viewer with
      `canAccessGame(userId, game)` plus the live replay entitlement. Return 401
      signed out and 404 for unrelated users; do not use the null-user access
      path as a visibility check. Anonymous full-game publication remains off
      until a separate policy is explicitly approved.
- [ ] For clips, distinguish manager access, an explicitly public highlight
      surface, and a live permitted Pulse share. Entitlement flags alone never
      publish a game. Check the current publication/footage permission before
      signing, including a league becoming private or permission withdrawal.
      Lookup a share by **both gameId and eventId**; `findSharedEventIds` is a
      deduplication helper, not a sufficient authorization query.
- [ ] Resolve live billing with narrow team/league reads. Do not call the entire
      `resolveGameTeamContext` pipeline for each token: it repairs roster
      snapshots and hydrates rosters. Define the billing resource for dual-team
      uploads, rather than silently using the anonymous viewer's initial side.
- [ ] L6 must choose a hosted-upload allowance before launch (a new entitlement
      or a separate explicit grant/quota). Preserve today's free YouTube replay
      access. Gate the uploader on writable game access and that allowance.
- [ ] Tests: anonymous full request; unrelated authenticated viewer; manager;
      Starter's actual catalog grants; private/unpublished clip; live allowed
      share; share deleted or permission withdrawn; dual-team billing selection.

### R2 — Billable upload abuse and CORS (high; Tasks 1, 3, 4, 12)

- [ ] Add an upload-creation limiter keyed by authenticated user and billing
      resource, plus atomically reserved concurrent-upload and stored-minute
      allowances. The generic 300 requests/15 min API limiter is insufficient
      for an endpoint that creates billable media. Add an operator kill switch
      and account spend alerts; record the launch allowance in the tracker.
- [ ] Validate client size/type for usability, but treat those values as
      untrusted: the API never receives the file. Enforce verified duration and
      resolution after ingest, delete over-limit assets and release quota on
      failure/cancellation. This limits retained spend; it cannot prevent all
      provider charges from an abusive direct upload (Basic's minimum matters).
- [ ] Pass the request Origin through a server allowlist to `cors_origin`.
      The original `primaryClientOrigin()` only permits the first configured
      frontend and breaks uploads from the second. Do not accept arbitrary
      origins or use `*`; CORS does not replace authentication or quotas.
- [ ] Upload URLs are bearer credentials: `private, no-store` on creation
      responses, no logs/analytics, never page data. Test disallowed origins,
      quota races and rejection before a Mux call.

### R3 — Durable deletion and orphan ownership (high; Tasks 2–5, 14)

`deleteMuxMediaQuietly` swallows errors. An already-ready asset has no future
ready webhook to trigger orphan cleanup; a detached record loses its ids and
existing tokens can still work. The original comment claiming this only leaks
storage is wrong. Mux retries failed webhook deliveries for 24 hours, not
forever ([webhook delivery](https://www.mux.com/docs/core/listen-for-webhooks)).

- [ ] Persist upload attempts and cleanup jobs with unique upload/asset ids,
      a random generation id, deployment ownership and retry state. Add
      `video.repository.js`, cleanup-job persistence/worker and tests to the
      file list. Persist cleanup before detaching/removing/replacing a video
      or deleting a game; if enqueueing fails, do not report deletion success.
      Deny new tokens immediately and expose/monitor pending provider deletion.
- [ ] Capture and queue hosted media in
      `games.repository.deleteReplaceableLeagueGames` before its bulk deletion,
      or exclude games with media from replaceable fixtures. A schedule rebuild
      bypasses `deleteGameForUser` today.
- [ ] Retry cancellation/deletion idempotently, retaining ids until confirmed.
      Resolve completed uploads to their asset before cleanup if cancellation
      reports completion. Do not classify every HTTP 400 as success.
- [ ] Reconcile known outstanding attempts and cleanup jobs on a scheduled,
      bounded sweep; include failed assets and missed webhook deliveries. Never
      delete arbitrary account assets on a failed database read or just a
      missing game. Only delete resources with proven TSW deployment/attempt
      ownership, after a grace period and an atomic reference recheck.
- [ ] Separate Mux environments per database remains mandatory. Include preview
      databases and database restores in the setup guide; environment separation
      alone does not fix local races or lost database state.
- [ ] Tests: Mux 5xx/network failure on ready-asset deletion; process restart;
      schedule bulk deletion; completed-cancel response; database outage; unknown
      ownership; eventual success without another Mux webhook.

### R4 — Atomic upload/webhook transitions (high; Tasks 2, 4, 5)

The existing Game schema has `optimisticConcurrency: true`: stale `saveGame`
calls already throw `VersionError` instead of silently overwriting newer state.
The gap is unhandled conflicts **after** Mux side effects, missing compensation,
and retry-safe identity checks; the mocks below do not model this protection.

- [ ] Replace read/mutate/`saveGame` video writes with atomic conditional updates
      scoped to game id, generation, expected upload id, expected asset id and
      allowed prior status. Preserve the repo's `__v` optimistic-concurrency
      contract when using direct updates; never overwrite unrelated game/events
      fields. Handle write conflicts with a bounded re-read/retry.
      Reserve an attempt before calling Mux; compensate a failed attach/save
      with durable cleanup. Two simultaneous creates must leave one winner.
- [ ] Allowlist event types **before** orphan handling. Record provider event id
      idempotently and validate payload shape. Handle ready-before-created,
      repeated ready, late error-after-ready, duplicate deleted, and deletion
      of an old asset after replacement. Never regress ready on a stale error.
      The original `asset.errored` branch also fails to retain `assetId`.
- [ ] Match asset lifecycle events by the persisted asset/attempt mapping;
      do not assume every deletion webhook includes `upload_id`. A stale delete
      must not clear a newer upload. Store verified finite positive duration
      and a signed playback id before marking ready; otherwise queue cleanup.
- [ ] Tests must use valid 24-hex game ids with real Mongoose validation.
      The original `'game-1'` passthrough fixture causes every webhook test to
      take the `no_game` branch. Add concurrent deferred-promise/repository tests,
      rather than only sequential mutation mocks.

### R5 — Pulse resolution and video timestamps (high; Tasks 2, 7, 8, 13)

The original Task 7 serializer reads the stored `videoProvider` and `videoUrl`.
That strands old YouTube posts when a Mux video replaces the link, and Mux posts
when the game falls back to YouTube. Resolving just the playback id is not enough.

- [ ] Resolve the current game, event, provider and timestamp for **all** Pulse
      highlight posts, including legacy ones. Batch game projections per feed
      page to avoid one full-game/roster fetch per post. Store `{ gameId, eventId }`
      as the media reference; treat any old URL/provider fields as legacy data,
      not playback authority. Keep descriptive snapshots only where useful.
- [ ] Define a video generation/timeline binding for events. Replacing a video
      with an intro or different camera angle can make every timestamp wrong
      even when within duration. Require confirmed timeline equivalence or
      explicit remapping; otherwise mark those highlights unavailable. Removal
      must not silently switch old timestamps to a different YouTube recording.
- [ ] Update highlight timestamps from the live event after stat corrections;
      deleted events/videos must show unavailable. Re-run/backfill idempotent
      auto-highlight generation when a completed public game becomes ready:
      currently clips are only attempted at game finalization, so late uploads
      would never create them. Apply current publication permission to backfills.
- [ ] Add team and league profile tests and Pulse transition tests for YouTube →
      Mux → unavailable/YouTube, corrected timestamp, deleted source, and a late
      upload after finalization. Test list rendering without tokens in payloads.

### R6 — Tokens, caches and signing (high; Tasks 3, 6, 8, 9, 12)

- [ ] Set `private, no-store` before playback handling, including error responses;
      exclude tokens/upload URLs from logs, analytics and persistent query
      caches. Keep ordinary game/feed payloads free of credentials. Invalidate
      playback queries when media is replaced, removed, or access changes.
- [ ] `staleTime` does not schedule a refetch. Task 8 now includes a foreground
      refresh interval; renew only enabled/visible sessions, retry expired media
      credentials at most once, and preserve position/play state on token changes.
      Test an uninterrupted session past expiry and resume after a sleeping tab.
- [ ] The original 12 h/1 h TTLs are revocation windows for copied bearer tokens.
      New-token denial does not invalidate issued credentials. Record that
      window in the policy; launch must choose a shorter renewable lifetime if
      required. Urgent removal needs confirmed provider deletion. Do not claim
      immediate revocation merely because a Pulse post was removed.
- [ ] Keep highlight thumbnail `time` fixed to the play; do not grant an
      unrestricted thumbnail/storyboard JWT to clip-only viewers. Test token
      audience/sub/expiry and attempted window/image-time tampering. Sign only
      server-derived claims, and disallow caller overrides of reserved JWT claims.
- [ ] Verify webhook HMAC over the exact raw Buffer, use strict integer timestamp
      and 64-hex signature parsing, and accept any valid `v1` during rotation.
      Add future/stale, malformed, duplicate-signature and non-ASCII-body tests.
      Bound the raw body and add a dedicated webhook limiter before this route
      (it bypasses the app's normal API limiter). Return retryable 5xx only when
      work was not durably recorded; invalid signatures get 400.
- [ ] Validate the base64 RSA signing key at boot without logging it. Tests need
      a generated real key; the Task 1 header-only sample is not a usable key.
      Document `MUX_MAX_RESOLUTION_TIER` in Render as well as credential vars.

### R7 — Playback starts on demand and autoplay works (medium; Tasks 9–11)

- [ ] `MuxVideo` mounts currently fetch a token for every clip even though the
      player import is lazy. Add `enabled` driven by user intent or near-viewport
      visibility, and use `preload="none"` until playback is wanted. Loading a
      game/profile must not sign tokens for every hidden highlight.
- [ ] Record visibility before the asynchronous player ref exists, then replay
      that state when the ref/metadata becomes ready. Use
      `entry.intersectionRatio >= threshold`, not `isIntersecting` alone. Pause
      on exit, hidden document and unmount. A `useRef` assignment by itself does
      not rerun an effect; use a callback ref or ready event.
- [ ] Share one playback coordinator between YouTube and Mux, including the
      fullscreen feed. Separate module singletons permit both providers to play
      simultaneously. Add delayed-token/ref, threshold, mixed-provider, rejected
      autoplay and unmount tests.
- [ ] The reel needs a play/error fallback, a way to skip unavailable clips,
      and index reset/clamping when its input changes. Browser autoplay can be
      refused between newly mounted players; the Next button alone is not an
      automatic-play guarantee.
- [ ] Vitest mocks must import React inside an async `vi.mock` factory rather
      than capture hoisted top-level imports/variables. Use `vi.hoisted` for
      shared `play`/`pause` spies; reset mocks between tests and restore mocked
      globals. The original player stubs below need this adjustment before use.

### R8 — Upload lifecycle and tracker correctness (high; Tasks 9, 12, 13)

- [ ] Uploader: set a `starting` phase before awaiting the API; disable duplicate
      selection/removal, retain the returned video status immediately, and
      invalidate/refetch the game and playback queries. Handle read failures
      after success, progress/error callbacks after unmount, game id changes,
      and retrying the same file input. Browser cancellation must also cancel
      the persisted attempt; do not clear only the local UpChunk ref.
- [ ] Poll with a non-overlapping timeout/query while a persisted attempt is
      uploading/processing; stop on terminal state/unmount and bound failures.
      An UpChunk error before parent data updates must not leave polling idle.
      Allow removal of processing/errored media, and disable upload while
      processing (the server returns 409). Preserve the usable YouTube fallback
      on GameDetailPage while Mux processes, consistent with provider helpers.
- [ ] Tracker: read `muxVideoRef.current.currentTime` at stat capture, not just
      the last `timeupdate`; handle seeking/waiting/error/source change and
      breakpoint remount. Reset stale refs/clock state, restore position only
      for the same generation, and block timestamp capture until ready. Add
      GameTrackPage tests against its real clock/stat handlers: a stub that
      forwards props does not verify integration.

### R9 — Footage publication and deletion policy (launch gate; Tasks 6, 7, 14)

L4/L5 must cover both teams and everyone filmed, public highlight permission,
withdrawal/takedown and retention of clip derivatives, not just signing a DPA.
The repo's existing `marketing` export guard skips `highlight_clip` media; it
does not automatically authorize publication of children's footage. Define and
implement the media policy before enabling public Mux clips or auto-posting.
Deleting a source/full-game retention must also address exported clip assets in
Phase 2. Record who owns takedown and cleanup failure alerts. Exact legal terms
remain for the launch owner to confirm; this review does not decide them.

### R10 — Confirmed package/API details and remaining experiment

- **Confirmed:** `@mux/mux-player-react/lazy` is a documented export, and its
  current source forwards the ref. Keep it, with a production Vite build check;
  use the main import if the installed version/bundler fails. Sources:
  [lazy-loading guide](https://www.mux.com/docs/guides/player-lazy-loading),
  [package exports](https://github.com/muxinc/elements/blob/main/packages/mux-player-react/package.json),
  [ref implementation](https://github.com/muxinc/elements/blob/main/packages/mux-player-react/src/lazy.tsx).
- **Not confirmed:** the instant clip's `currentTime` origin. The
  [instant-clips guide](https://www.mux.com/docs/guides/create-instant-clips)
  describes source-relative clipping parameters, not a guaranteed player time
  origin. Task 14 must record `currentTime`, `duration`, `seekable` and `ended`
  for a signed 95–105 s clip in Chrome and Safari, including segment padding.
  Clip components must not seek to source timestamps or assume exactly 10 s.
- **Corrected:** Task 7's fixture-only instruction is expanded below. Its free
  plan denial expectation was removed because Starter grants replay today.
- **Corrected:** `playback_policy` is deprecated; use `playback_policies`, and
  use `inputs` for new asset-based clips ([direct upload API](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload)).

## Global Constraints

- One hosted video per game in v1. `Game.video` is a single subdocument; replacing a video means removing it first, unless it's still `uploading` or `errored`.
- Mux assets: `playback_policies: ['signed']`, `video_quality: 'basic'`, `max_resolution_tier` from `MUX_MAX_RESOLUTION_TIER` (default `1080p`), `passthrough` = the game id.
- A Mux video with `status: 'ready'` takes precedence over `Game.videoUrl` (YouTube) when both exist.
- Highlight clip window: `videoTimestamp − 5 s` to `videoTimestamp + 5 s`, clamped to `[0, durationSeconds]`. This is the existing buffer in `highlightReel.js` and the feed cards.
- Token lifetimes: full game 12 h (tracking sessions are long and Mux stops playback when a token expires), highlights 1 h.
- Full-game playback needs authenticated game access and live `canViewReplay`. Hosted upload needs an explicit allowance/quota (L6); replay is free on Starter. Highlights need current viewer/publication permission; a stored Pulse share or entitlement flag alone is insufficient (R1/R9).
- Tokens are requested only for an active/visible playback intent, never for every mounted highlight (R7).
- The video file never passes through the API process. The Mux webhook is mounted with `express.raw` **before** `express.json()` and before CSRF, the same as Stripe.
- **Each database deployment (local dev, previews, production) uses its own Mux environment.** Cleanup deletes only proven TSW-owned orphan attempts, after a grace period and atomic reference recheck (R3), so sharing one Mux environment across databases would delete the other side's videos.
- All Mux env vars are optional; video hosting turns on only when all five are set (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`). A partial set fails boot.
- Server: CommonJS, `throw new ApiError(status, message)`, `asyncHandler`, Zod `schema.parse` in controllers. Client: named exports, Tailwind inline, TanStack Query for new data fetching, no path aliases.
- Tests: Jest on the server, Vitest on the client. Never the other way round.
- Commits: conventional commits.

## Review Focus

1. **A play tagged outside the uploaded video's duration** (e.g. timestamps from an earlier YouTube link, then a shorter Mux upload). The playback endpoint must return 422 rather than a broken clip, and the client must show "Video unavailable". Covered in Task 6.
2. **A webhook for an upload the game no longer claims** (video removed or game deleted while Mux was still processing). The asset must be deleted in Mux, or it's billed forever with nothing pointing at it. Covered in Task 5.
3. **Out-of-order or repeated webhooks** (`asset.ready` before `upload.asset_created`, or the same event twice). The final state must be `ready` with the right ids, and repeats must be no-ops. Covered in Task 5.
4. **An anonymous or unrelated viewer requesting a full-game token.** Replay is free on Starter. Expect 401/404 based on viewer access, with no token; separately test false entitlements (403) and public-clip permission. Covered in Task 6/R1.
5. **The upload tab closing at 60%.** The game must not get stuck in `uploading` and block new uploads. A new upload may replace an `uploading` or `errored` video. Covered in Task 4.

## File Structure

Server (create):

- `server/src/modules/shared/gameVideo.js`: provider resolution, the client-safe video projection, the clip window, highlight video fields.
- `server/src/modules/video/mux.client.js`: Mux REST calls (`createDirectUpload`, `cancelDirectUpload`, `deleteAsset`) and `isMuxConfigured`.
- `server/src/modules/video/mux.tokens.js`: RS256 playback/thumbnail/storyboard JWTs.
- `server/src/modules/video/mux.webhook.js`: `mux-signature` verification.
- `server/src/modules/video/video.service.js`: upload, removal, webhook handling, playback authorization.
- `server/src/modules/video/video.controller.js`, `video.validation.js`, `video.routes.js`.

Server (modify): `config/env.js`, `app.js`, `modules/games/games.repository.js`, `games.service.js`, `games.routes.js`, `modules/teams/teams.service.js`, `modules/leagues/leagues.service.js`, `modules/feed/feed.repository.js`, `feed.service.js`, `render.yaml`.

Client (create), all under `client/src/features/video/`:

- `api/videoApi.js`
- `hooks/useVideoPlayback.js`, `hooks/useInViewAutoplay.js`
- `videoSource.js`
- `components/MuxVideo.jsx`, `HighlightPlayer.jsx`, `MuxHighlightReel.jsx`, `GameVideoUploader.jsx`

Client (modify): `features/games/highlightReel.js`, `components/GameRecapPanel.jsx`, `pages/GameDetailPage.jsx`, `pages/GameTrackPage.jsx`, `features/teams/pages/PublicPlayerPage.jsx`, `features/leagues/pages/PublicLeaguePlayerPage.jsx`, `features/feed/components/posts/HighlightClipPostCard.jsx`, `FullScreenHighlightClipPost.jsx`, `client/package.json`.

Docs: `docs/mux.md` (new setup guide), `docs/PROJECT-KNOWLEDGE.md`, `docs/api.md`, `docs/mux-video-tracker.md`.

---

### Task 1: Mux env config

**Files:**

- Modify: `server/src/config/env.js` (base schema near the `CLOUDINARY_*` keys, plus `superRefine`)
- Test: `server/src/tests/unit/env.schema.test.js`

**Interfaces:**

- Produces: `env.MUX_TOKEN_ID`, `env.MUX_TOKEN_SECRET`, `env.MUX_WEBHOOK_SECRET`, `env.MUX_SIGNING_KEY_ID`, `env.MUX_SIGNING_PRIVATE_KEY` (base64 PEM, exactly as Mux shows it), `env.MUX_MAX_RESOLUTION_TIER` (`'720p' | '1080p'`).

- [ ] **Step 1: Write the failing tests.** Append to `env.schema.test.js` (it already defines `baseEnv`):

```js
describe('Mux video config', () => {
  const FULL_MUX = {
    MUX_TOKEN_ID: 'token-id',
    MUX_TOKEN_SECRET: 'token-secret',
    MUX_WEBHOOK_SECRET: 'webhook-secret',
    MUX_SIGNING_KEY_ID: 'signing-key-id',
    // R6: a real key generated at test time. Never commit a PEM literal; the
    // pre-commit secret scanner rejects one.
    MUX_SIGNING_PRIVATE_KEY: Buffer.from(
      require('node:crypto')
        .generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type: 'pkcs1', format: 'pem' })
    ).toString('base64'),
  };

  test('boots with no Mux config (video hosting off)', () => {
    const result = envSchema.safeParse(baseEnv());
    expect(result.success).toBe(true);
    expect(result.data.MUX_MAX_RESOLUTION_TIER).toBe('1080p');
  });

  test('boots with the full Mux config', () => {
    expect(envSchema.safeParse(baseEnv(FULL_MUX)).success).toBe(true);
  });

  test('rejects a partial Mux config and names every missing key', () => {
    const result = envSchema.safeParse(baseEnv({ MUX_TOKEN_ID: 'token-id' }));
    expect(result.success).toBe(false);
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        'MUX_TOKEN_SECRET',
        'MUX_WEBHOOK_SECRET',
        'MUX_SIGNING_KEY_ID',
        'MUX_SIGNING_PRIVATE_KEY',
      ])
    );
  });

  test('rejects an unsupported resolution tier', () => {
    const result = envSchema.safeParse(baseEnv({ ...FULL_MUX, MUX_MAX_RESOLUTION_TIER: '2160p' }));
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `pnpm --filter server test -- env.schema`. Expected: the partial-config and tier tests FAIL.

- [ ] **Step 3: Implement.** In `baseEnvSchema`, after `CLOUDINARY_FOLDER`:

```js
  // Mux game video (docs/mux.md). All five credentials or none — hosting is
  // off when unset, and a partial set fails boot rather than half-working.
  MUX_TOKEN_ID: z.string().min(1).optional(),
  MUX_TOKEN_SECRET: z.string().min(1).optional(),
  MUX_WEBHOOK_SECRET: z.string().min(1).optional(),
  MUX_SIGNING_KEY_ID: z.string().min(1).optional(),
  MUX_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  MUX_MAX_RESOLUTION_TIER: z.enum(['720p', '1080p']).default('1080p'),
```

Below `ALL_STRIPE_CONFIG`:

```js
const ALL_MUX_CONFIG = [
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
  'MUX_WEBHOOK_SECRET',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_PRIVATE_KEY',
];
```

Inside `envSchema = baseEnvSchema.superRefine((data, ctx) => {`, after the Stripe block:

```js
const configuredMuxKeys = ALL_MUX_CONFIG.filter((key) => Boolean(data[key]));
if (configuredMuxKeys.length > 0 && configuredMuxKeys.length < ALL_MUX_CONFIG.length) {
  for (const key of ALL_MUX_CONFIG) {
    if (!data[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when any Mux setting is configured`,
      });
    }
  }
}
```

- [ ] **Step 4: Run it and confirm it passes.** `pnpm --filter server test -- env.schema`. Expected: PASS.

- [ ] **Step 5: Add the keys to `render.yaml`.** Both services, next to `CLOUDINARY_API_SECRET`:

```yaml
- key: MUX_TOKEN_ID
  sync: false
- key: MUX_TOKEN_SECRET
  sync: false
- key: MUX_WEBHOOK_SECRET
  sync: false
- key: MUX_SIGNING_KEY_ID
  sync: false
- key: MUX_SIGNING_PRIVATE_KEY
  sync: false
```

- [ ] **Step 6: Commit.**

```bash
git add server/src/config/env.js server/src/tests/unit/env.schema.test.js render.yaml
git commit -m "feat(video): add optional all-or-nothing Mux env config"
```

---

### Task 2: `Game.video` schema and the shared game-video helpers

**Files:**

- Create: `server/src/modules/shared/gameVideo.js`
- Modify: `server/src/modules/games/games.repository.js` (new sub-schema above `gameSchema`; field next to `videoUrl`, line ~252)
- Test: `server/src/tests/unit/gameVideo.test.js`, `server/src/tests/unit/games.repository.schema.test.js`

**Interfaces:**

- Produces (`gameVideo.js`):
  - `GAME_VIDEO_STATUSES = ['uploading', 'processing', 'ready', 'errored']`
  - `HIGHLIGHT_CLIP_BUFFER_SECONDS = 5`
  - `getGameVideoProvider(game) → 'mux' | 'youtube' | null`
  - `hasGameVideo(game) → boolean`
  - `sanitizeGameVideo(video, { includePremiumMedia = true }) → { provider, status, durationSeconds, errorMessage } | null`
  - `buildClipWindow(videoTimestamp, durationSeconds) → { startSeconds, endSeconds } | null`
  - `buildHighlightVideoFields(game) → { videoProvider: 'mux' | 'youtube', videoUrl: string | null }`

- [ ] **Step 1: Write the failing helper tests** in `server/src/tests/unit/gameVideo.test.js`:

```js
const {
  getGameVideoProvider,
  hasGameVideo,
  sanitizeGameVideo,
  buildClipWindow,
  buildHighlightVideoFields,
} = require('../../modules/shared/gameVideo');

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const readyMux = { provider: 'mux', status: 'ready', playbackId: 'pb-1', durationSeconds: 5400 };

describe('getGameVideoProvider', () => {
  test('a ready Mux video wins over a YouTube link', () => {
    expect(getGameVideoProvider({ videoUrl: YOUTUBE, video: readyMux })).toBe('mux');
  });
  test('falls back to YouTube while the Mux video is still processing', () => {
    const video = { ...readyMux, status: 'processing', playbackId: null };
    expect(getGameVideoProvider({ videoUrl: YOUTUBE, video })).toBe('youtube');
  });
  test('a ready Mux video with no playback id is not playable', () => {
    expect(getGameVideoProvider({ video: { ...readyMux, playbackId: null } })).toBeNull();
  });
  test('no video at all', () => {
    expect(getGameVideoProvider({})).toBeNull();
    expect(hasGameVideo({})).toBe(false);
    expect(hasGameVideo({ videoUrl: YOUTUBE })).toBe(true);
  });
});

describe('sanitizeGameVideo', () => {
  test('exposes status, never Mux ids', () => {
    expect(
      sanitizeGameVideo({ ...readyMux, uploadId: 'up-1', assetId: 'as-1', errorMessage: null })
    ).toEqual({ provider: 'mux', status: 'ready', durationSeconds: 5400, errorMessage: null });
  });
  test('hidden without premium media', () => {
    expect(sanitizeGameVideo(readyMux, { includePremiumMedia: false })).toBeNull();
    expect(sanitizeGameVideo(null)).toBeNull();
  });
});

describe('buildClipWindow', () => {
  test('pads five seconds either side', () => {
    expect(buildClipWindow(100, 5400)).toEqual({ startSeconds: 95, endSeconds: 105 });
  });
  test('clamps at both ends of the video', () => {
    expect(buildClipWindow(2, 5400)).toEqual({ startSeconds: 0, endSeconds: 7 });
    expect(buildClipWindow(5398, 5400)).toEqual({ startSeconds: 5393, endSeconds: 5400 });
  });
  test('rejects a timestamp outside the video', () => {
    expect(buildClipWindow(6000, 5400)).toBeNull();
    expect(buildClipWindow(-1, 5400)).toBeNull();
    expect(buildClipWindow(Number.NaN, 5400)).toBeNull();
  });
  test('without a known duration, only clamps the start', () => {
    expect(buildClipWindow(100, null)).toEqual({ startSeconds: 95, endSeconds: 105 });
  });
});

describe('buildHighlightVideoFields', () => {
  test('Mux highlights carry no URL', () => {
    expect(buildHighlightVideoFields({ videoUrl: YOUTUBE, video: readyMux })).toEqual({
      videoProvider: 'mux',
      videoUrl: null,
    });
  });
  test('YouTube highlights keep the URL', () => {
    expect(buildHighlightVideoFields({ videoUrl: YOUTUBE })).toEqual({
      videoProvider: 'youtube',
      videoUrl: YOUTUBE,
    });
  });
});
```

Append to `games.repository.schema.test.js`:

```js
describe('Game.video schema (Mux game video)', () => {
  test('declares the hosted video sub-document', () => {
    expect(Game.schema.path('video.provider').enumValues).toEqual(['mux']);
    expect(Game.schema.path('video.status').enumValues).toEqual([
      'uploading',
      'processing',
      'ready',
      'errored',
    ]);
    for (const field of ['uploadId', 'assetId', 'playbackId', 'errorMessage']) {
      expect(Game.schema.path(`video.${field}`).instance).toBe('String');
    }
    expect(Game.schema.path('video.durationSeconds').instance).toBe('Number');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter server test -- gameVideo games.repository.schema`. Expected: FAIL (module not found, path undefined).

- [ ] **Step 3: Implement `server/src/modules/shared/gameVideo.js`:**

```js
// Mux game video (docs/media-provider-analysis.md §6). The single source of
// truth for "which video does this game play": a READY Mux asset wins over a
// YouTube link, so a league can upload over a game it previously linked.
const GAME_VIDEO_STATUSES = ['uploading', 'processing', 'ready', 'errored'];
const HIGHLIGHT_CLIP_BUFFER_SECONDS = 5;

function getGameVideoProvider(game) {
  const video = game?.video;
  if (video?.provider === 'mux' && video.status === 'ready' && video.playbackId) return 'mux';
  if (game?.videoUrl) return 'youtube';
  return null;
}

function hasGameVideo(game) {
  return getGameVideoProvider(game) !== null;
}

// Status only — Mux upload/asset/playback ids never leave the server; clients
// get playback through the token endpoint.
function sanitizeGameVideo(video, { includePremiumMedia = true } = {}) {
  if (!video || !includePremiumMedia) return null;
  return {
    provider: video.provider,
    status: video.status,
    durationSeconds: video.durationSeconds ?? null,
    errorMessage: video.errorMessage ?? null,
  };
}

function buildClipWindow(videoTimestamp, durationSeconds) {
  if (!Number.isFinite(videoTimestamp) || videoTimestamp < 0) return null;
  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
  if (hasDuration && videoTimestamp > durationSeconds) return null;
  const startSeconds = Math.max(0, videoTimestamp - HIGHLIGHT_CLIP_BUFFER_SECONDS);
  const paddedEnd = videoTimestamp + HIGHLIGHT_CLIP_BUFFER_SECONDS;
  const endSeconds = hasDuration ? Math.min(durationSeconds, paddedEnd) : paddedEnd;
  return endSeconds > startSeconds ? { startSeconds, endSeconds } : null;
}

function buildHighlightVideoFields(game) {
  const videoProvider = getGameVideoProvider(game);
  return {
    videoProvider,
    videoUrl: videoProvider === 'youtube' ? game.videoUrl : null,
  };
}

module.exports = {
  GAME_VIDEO_STATUSES,
  HIGHLIGHT_CLIP_BUFFER_SECONDS,
  getGameVideoProvider,
  hasGameVideo,
  sanitizeGameVideo,
  buildClipWindow,
  buildHighlightVideoFields,
};
```

- [ ] **Step 4: Add the schema.** In `games.repository.js`, add `const { GAME_VIDEO_STATUSES } = require('../shared/gameVideo');` with the other requires. Then add this above the main game schema:

```js
// Mux game video (docs/media-provider-analysis.md). One hosted video per game;
// `videoUrl` remains the YouTube link. Ids are written only by the Mux webhook
// (video.service.js) and never serialised to clients.
const gameVideoSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['mux'], required: true },
    status: { type: String, enum: GAME_VIDEO_STATUSES, required: true },
    uploadId: { type: String, default: null },
    assetId: { type: String, default: null },
    playbackId: { type: String, default: null },
    durationSeconds: { type: Number, min: 0, default: null },
    errorMessage: { type: String, default: null },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadStartedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
  },
  { _id: false }
);
```

Directly under `videoUrl: { type: String, trim: true, default: null },`:

```js
    video: { type: gameVideoSchema, default: null },
```

- [ ] **Step 5: Run them and confirm they pass.** `pnpm --filter server test -- gameVideo games.repository.schema`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/src/modules/shared/gameVideo.js server/src/modules/games/games.repository.js server/src/tests/unit/gameVideo.test.js server/src/tests/unit/games.repository.schema.test.js
git commit -m "feat(video): add Game.video schema and provider helpers"
```

---

### Task 3: Mux REST client, playback tokens, webhook signatures

**Files:**

- Create: `server/src/modules/video/mux.client.js`, `mux.tokens.js`, `mux.webhook.js`
- Test: `server/src/tests/unit/mux.client.test.js`, `mux.tokens.test.js`, `mux.webhook.test.js`

**Interfaces:**

- Produces:
  - `isMuxConfigured() → boolean`
  - `createDirectUpload({ corsOrigin, passthrough }) → Promise<{ id, url }>`
  - `cancelDirectUpload(uploadId) → Promise<void>` (tolerates 400/404)
  - `deleteAsset(assetId) → Promise<void>` (tolerates 404)
  - Errors are `Error` with `.status` (the Mux HTTP status)
  - `MUX_AUDIENCE = { video: 'v', thumbnail: 't', storyboard: 's' }`
  - `signPlaybackToken({ playbackId, audience, expiresInSeconds, claims = {}, now = Date.now() }) → string`
  - `verifyMuxSignature({ rawBody, signatureHeader, secret, toleranceSeconds = 300, now = Date.now() }) → boolean`

- [ ] **Step 1: Write the failing tests.**

`mux.client.test.js`:

```js
jest.mock('../../config/env', () => ({
  env: {
    MUX_TOKEN_ID: 'id',
    MUX_TOKEN_SECRET: 'secret',
    MUX_WEBHOOK_SECRET: 'whs',
    MUX_SIGNING_KEY_ID: 'kid',
    MUX_SIGNING_PRIVATE_KEY: 'key',
    MUX_MAX_RESOLUTION_TIER: '1080p',
  },
}));

const muxClient = require('../../modules/video/mux.client');

function mockFetchOnce(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

describe('mux.client', () => {
  test('isMuxConfigured is true when every credential is set', () => {
    expect(muxClient.isMuxConfigured()).toBe(true);
  });

  test('createDirectUpload requests a signed, basic, passthrough-tagged asset', async () => {
    mockFetchOnce(201, { data: { id: 'up-1', url: 'https://storage.example/upload' } });

    const result = await muxClient.createDirectUpload({
      corsOrigin: 'https://app.tsw.test',
      passthrough: 'game-1',
    });

    expect(result).toEqual({ id: 'up-1', url: 'https://storage.example/upload' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.mux.com/video/v1/uploads');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(JSON.parse(init.body)).toEqual({
      cors_origin: 'https://app.tsw.test',
      timeout: 21600,
      new_asset_settings: {
        playback_policies: ['signed'],
        video_quality: 'basic',
        max_resolution_tier: '1080p',
        passthrough: 'game-1',
      },
    });
  });

  test('deleteAsset tolerates an already-deleted asset', async () => {
    mockFetchOnce(404, { error: { messages: ['Not found'] } });
    await expect(muxClient.deleteAsset('as-1')).resolves.toBeUndefined();
  });

  test('other failures throw with the Mux status', async () => {
    mockFetchOnce(500, { error: { messages: ['boom'] } });
    await expect(muxClient.deleteAsset('as-1')).rejects.toMatchObject({
      status: 500,
      message: 'boom',
    });
  });
});
```

`mux.tokens.test.js`:

```js
jest.mock('../../config/env', () => {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return {
    env: {
      MUX_SIGNING_KEY_ID: 'kid-1',
      MUX_SIGNING_PRIVATE_KEY: Buffer.from(privateKey).toString('base64'),
      TEST_PUBLIC_KEY: publicKey,
    },
  };
});

const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { signPlaybackToken, MUX_AUDIENCE } = require('../../modules/video/mux.tokens');

describe('signPlaybackToken', () => {
  test('signs the claims Mux expects, plus instant-clip claims', () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    const token = signPlaybackToken({
      playbackId: 'pb-1',
      audience: MUX_AUDIENCE.video,
      expiresInSeconds: 3600,
      claims: { asset_start_time: 95, asset_end_time: 105 },
      now,
    });

    const decoded = jwt.verify(token, env.TEST_PUBLIC_KEY, {
      algorithms: ['RS256'],
      audience: 'v',
      clockTimestamp: now / 1000,
      complete: true,
    });
    expect(decoded.header.kid).toBe('kid-1');
    expect(decoded.payload).toEqual({
      sub: 'pb-1',
      aud: 'v',
      exp: now / 1000 + 3600,
      kid: 'kid-1',
      asset_start_time: 95,
      asset_end_time: 105,
    });
  });
});
```

`mux.webhook.test.js`:

```js
const crypto = require('crypto');
const { verifyMuxSignature } = require('../../modules/video/mux.webhook');

const SECRET = 'whsec-test';
const BODY = Buffer.from('{"type":"video.asset.ready"}');
const NOW = 1_800_000_000_000;

function header(timestamp, body = BODY, secret = SECRET) {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('verifyMuxSignature', () => {
  const t = Math.floor(NOW / 1000);
  test('accepts a valid, fresh signature', () => {
    expect(
      verifyMuxSignature({ rawBody: BODY, signatureHeader: header(t), secret: SECRET, now: NOW })
    ).toBe(true);
  });
  test('rejects a tampered body', () => {
    const signatureHeader = header(t);
    const rawBody = Buffer.from('{"type":"video.asset.deleted"}');
    expect(verifyMuxSignature({ rawBody, signatureHeader, secret: SECRET, now: NOW })).toBe(false);
  });
  test('rejects the wrong secret, a stale timestamp, and a missing header', () => {
    expect(
      verifyMuxSignature({
        rawBody: BODY,
        signatureHeader: header(t, BODY, 'other'),
        secret: SECRET,
        now: NOW,
      })
    ).toBe(false);
    expect(
      verifyMuxSignature({
        rawBody: BODY,
        signatureHeader: header(t - 301),
        secret: SECRET,
        now: NOW,
      })
    ).toBe(false);
    expect(
      verifyMuxSignature({ rawBody: BODY, signatureHeader: undefined, secret: SECRET, now: NOW })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter server test -- mux.`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `mux.client.js`:**

```js
const { env } = require('../../config/env');

const MUX_API_BASE = 'https://api.mux.com';
const MUX_REQUEST_TIMEOUT_MS = 15000;
// A 3–6 GB game over leisure-centre Wi-Fi needs more than Mux's 1 h default.
const DIRECT_UPLOAD_TIMEOUT_SECONDS = 6 * 60 * 60;

function isMuxConfigured() {
  return Boolean(
    env.MUX_TOKEN_ID &&
    env.MUX_TOKEN_SECRET &&
    env.MUX_WEBHOOK_SECRET &&
    env.MUX_SIGNING_KEY_ID &&
    env.MUX_SIGNING_PRIVATE_KEY
  );
}

async function muxRequest(method, path, body) {
  const response = await fetch(`${MUX_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(MUX_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.error?.messages?.join('; ') || `Mux request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return payload?.data ?? null;
}

async function createDirectUpload({ corsOrigin, passthrough }) {
  const data = await muxRequest('POST', '/video/v1/uploads', {
    cors_origin: corsOrigin,
    timeout: DIRECT_UPLOAD_TIMEOUT_SECONDS,
    new_asset_settings: {
      playback_policies: ['signed'],
      video_quality: 'basic',
      max_resolution_tier: env.MUX_MAX_RESOLUTION_TIER,
      passthrough,
    },
  });
  return { id: data.id, url: data.url };
}

async function cancelDirectUpload(uploadId) {
  try {
    await muxRequest('PUT', `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
  } catch (error) {
    // 400: already completed/cancelled; 404: gone. Either way nothing to cancel.
    if (error.status !== 400 && error.status !== 404) throw error;
  }
}

async function deleteAsset(assetId) {
  try {
    await muxRequest('DELETE', `/video/v1/assets/${encodeURIComponent(assetId)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

module.exports = { isMuxConfigured, createDirectUpload, cancelDirectUpload, deleteAsset };
```

- [ ] **Step 4: Implement `mux.tokens.js`:**

```js
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');

const MUX_AUDIENCE = { video: 'v', thumbnail: 't', storyboard: 's' };

// Signed playback JWT (https://www.mux.com/docs/guides/secure-video-playback).
// Instant clips add asset_start_time/asset_end_time claims; thumbnails add `time`.
function signPlaybackToken({
  playbackId,
  audience,
  expiresInSeconds,
  claims = {},
  now = Date.now(),
}) {
  const privateKey = Buffer.from(env.MUX_SIGNING_PRIVATE_KEY, 'base64').toString('ascii');
  return jwt.sign(
    {
      sub: playbackId,
      aud: audience,
      exp: Math.floor(now / 1000) + expiresInSeconds,
      kid: env.MUX_SIGNING_KEY_ID,
      ...claims,
    },
    privateKey,
    { algorithm: 'RS256', keyid: env.MUX_SIGNING_KEY_ID, noTimestamp: true }
  );
}

module.exports = { MUX_AUDIENCE, signPlaybackToken };
```

- [ ] **Step 5: Implement `mux.webhook.js`:**

```js
const crypto = require('crypto');

// Mux-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>".
function verifyMuxSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = 300,
  now = Date.now(),
}) {
  if (!signatureHeader || !secret || !rawBody) return false;
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(',')
      .map((part) => part.split('=').map((value) => value.trim()))
      .filter((pair) => pair.length === 2)
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const givenBuffer = Buffer.from(parts.v1, 'hex');
  return (
    expectedBuffer.length === givenBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, givenBuffer)
  );
}

module.exports = { verifyMuxSignature };
```

- [ ] **Step 6: Run them and confirm they pass.** `pnpm --filter server test -- mux.`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add server/src/modules/video server/src/tests/unit/mux.*.test.js
git commit -m "feat(video): add Mux REST client, playback JWTs and webhook verification"
```

---

### Task 4: Upload and remove endpoints

**Review gate:** the service snippet is an original sketch. Implement R1–R4
allowances, allowed-origin selection, conditional writes and durable cleanup
before using it; logging-and-forgetting cleanup does not complete this task.

**Files:**

- Create: `server/src/modules/video/video.service.js` (upload + removal parts), `video.controller.js`
- Modify: `server/src/modules/games/games.service.js` (export `assertGameAccess`, add and export `resolveGameViewEntitlements`; clean up Mux media in `deleteGameForUser`), `server/src/modules/games/games.routes.js`
- Test: `server/src/tests/unit/video.service.test.js`

**Interfaces:**

- Consumes: `createDirectUpload`, `cancelDirectUpload`, `deleteAsset`, `isMuxConfigured` (Task 3); `sanitizeGameVideo` (Task 2); `findGameById`, `saveGame` (games.repository).
- Produces:
  - `games.service.assertGameAccess(userId, gameId, { requireWritable })` (now exported)
  - `games.service.resolveGameViewEntitlements(game) → Promise<object>`
  - `video.service.createGameVideoUpload(userId, gameId) → { uploadUrl, video }`
  - `video.service.deleteGameVideo(userId, gameId) → { video: null }`
  - `video.service.deleteMuxMediaQuietly(video) → Promise<void>`
  - Routes: `POST /api/v1/games/:gameId/video/uploads`, `DELETE /api/v1/games/:gameId/video` (authenticated)

- [ ] **Step 1: Add the games.service exports.** Just after `resolveGameTeamContext` in `games.service.js`:

```js
// Mux game video: the same live entitlements getGameForUser gates premium
// media on (canViewReplay / canViewHighlightClips), resolved without a viewer.
async function resolveGameViewEntitlements(game) {
  const { team } = await resolveGameTeamContext(null, game);
  return team?.entitlements || {};
}
```

Add `assertGameAccess` and `resolveGameViewEntitlements` to `module.exports`.

- [ ] **Step 2: Write the failing service tests** in `server/src/tests/unit/video.service.test.js`:

```js
jest.mock('../../config/env', () => ({
  env: { CLIENT_ORIGIN: 'https://app.tsw.test,https://www.tsw.test', MUX_WEBHOOK_SECRET: 'whs' },
}));
jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../modules/video/mux.client', () => ({
  isMuxConfigured: jest.fn(() => true),
  createDirectUpload: jest.fn(),
  cancelDirectUpload: jest.fn(),
  deleteAsset: jest.fn(),
}));
jest.mock('../../modules/games/games.service', () => ({
  assertGameAccess: jest.fn(),
  resolveGameViewEntitlements: jest.fn(),
}));
jest.mock('../../modules/games/games.repository', () => ({
  findGameById: jest.fn(),
  saveGame: jest.fn((game) => Promise.resolve(game)),
}));
jest.mock('../../modules/feed/feed.repository', () => ({ findSharedEventIds: jest.fn() }));
jest.mock('../../modules/video/mux.tokens', () => ({
  MUX_AUDIENCE: { video: 'v', thumbnail: 't', storyboard: 's' },
  signPlaybackToken: jest.fn(
    ({ audience, claims }) => `${audience}:${JSON.stringify(claims || {})}`
  ),
}));

const muxClient = require('../../modules/video/mux.client');
const gamesService = require('../../modules/games/games.service');
const { saveGame } = require('../../modules/games/games.repository');
const videoService = require('../../modules/video/video.service');

function makeGame(overrides = {}) {
  return { _id: '111111111111111111111111', video: null, videoUrl: null, events: [], ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  muxClient.isMuxConfigured.mockReturnValue(true);
  gamesService.resolveGameViewEntitlements.mockResolvedValue({ canViewReplay: true });
});

describe('createGameVideoUpload', () => {
  test('creates a Mux upload for the first allowed origin and records it', async () => {
    const game = makeGame();
    gamesService.assertGameAccess.mockResolvedValue(game);
    muxClient.createDirectUpload.mockResolvedValue({ id: 'up-1', url: 'https://upload.example' });

    const result = await videoService.createGameVideoUpload('user-1', '111111111111111111111111');

    expect(gamesService.assertGameAccess).toHaveBeenCalledWith(
      'user-1',
      '111111111111111111111111',
      {
        requireWritable: true,
      }
    );
    expect(muxClient.createDirectUpload).toHaveBeenCalledWith({
      corsOrigin: 'https://app.tsw.test',
      passthrough: '111111111111111111111111',
    });
    expect(game.video).toMatchObject({
      provider: 'mux',
      status: 'uploading',
      uploadId: 'up-1',
      assetId: null,
    });
    expect(saveGame).toHaveBeenCalledWith(game);
    expect(result).toEqual({
      uploadUrl: 'https://upload.example',
      video: { provider: 'mux', status: 'uploading', durationSeconds: null, errorMessage: null },
    });
  });

  test('503 when Mux is not configured', async () => {
    muxClient.isMuxConfigured.mockReturnValue(false);
    await expect(
      videoService.createGameVideoUpload('user-1', '111111111111111111111111')
    ).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  test('403 without the replay entitlement', async () => {
    gamesService.assertGameAccess.mockResolvedValue(makeGame());
    gamesService.resolveGameViewEntitlements.mockResolvedValue({ canViewReplay: false });
    await expect(
      videoService.createGameVideoUpload('user-1', '111111111111111111111111')
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(muxClient.createDirectUpload).not.toHaveBeenCalled();
  });

  test('409 while a video is processing or ready', async () => {
    for (const status of ['processing', 'ready']) {
      gamesService.assertGameAccess.mockResolvedValue(
        makeGame({ video: { provider: 'mux', status } })
      );
      await expect(
        videoService.createGameVideoUpload('user-1', '111111111111111111111111')
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    }
  });

  test('replaces an abandoned upload, cancelling it in Mux first', async () => {
    const game = makeGame({ video: { provider: 'mux', status: 'uploading', uploadId: 'up-old' } });
    gamesService.assertGameAccess.mockResolvedValue(game);
    muxClient.createDirectUpload.mockResolvedValue({ id: 'up-new', url: 'https://upload.example' });

    await videoService.createGameVideoUpload('user-1', '111111111111111111111111');

    expect(muxClient.cancelDirectUpload).toHaveBeenCalledWith('up-old');
    expect(game.video.uploadId).toBe('up-new');
  });
});

describe('deleteGameVideo', () => {
  test('deletes the Mux asset and detaches the video', async () => {
    const game = makeGame({
      video: { provider: 'mux', status: 'ready', assetId: 'as-1', uploadId: 'up-1' },
    });
    gamesService.assertGameAccess.mockResolvedValue(game);

    await expect(
      videoService.deleteGameVideo('user-1', '111111111111111111111111')
    ).resolves.toEqual({
      video: null,
    });

    expect(muxClient.deleteAsset).toHaveBeenCalledWith('as-1');
    expect(game.video).toBeNull();
    expect(saveGame).toHaveBeenCalledWith(game);
  });

  test('cancels an upload that has no asset yet', async () => {
    const game = makeGame({
      video: { provider: 'mux', status: 'uploading', uploadId: 'up-1', assetId: null },
    });
    gamesService.assertGameAccess.mockResolvedValue(game);

    await videoService.deleteGameVideo('user-1', '111111111111111111111111');

    expect(muxClient.cancelDirectUpload).toHaveBeenCalledWith('up-1');
    expect(muxClient.deleteAsset).not.toHaveBeenCalled();
  });

  test('404 when there is no hosted video', async () => {
    gamesService.assertGameAccess.mockResolvedValue(makeGame());
    await expect(
      videoService.deleteGameVideo('user-1', '111111111111111111111111')
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
```

`ApiError` exposes `statusCode` (`server/src/utils/apiError.js`), which these tests assert on.

- [ ] **Step 3: Run them and confirm they fail.** `pnpm --filter server test -- video.service`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement the upload/removal half of `video.service.js`:**

```js
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { ApiError } = require('../../utils/apiError');
const { sanitizeGameVideo } = require('../shared/gameVideo');
const { saveGame } = require('../games/games.repository');
const gamesService = require('../games/games.service');
const muxClient = require('./mux.client');

const REPLACEABLE_STATUSES = new Set(['uploading', 'errored']);

function assertMuxConfigured() {
  if (!muxClient.isMuxConfigured()) throw new ApiError(503, 'Video hosting is not configured');
}

function primaryClientOrigin() {
  return env.CLIENT_ORIGIN.split(',')[0].trim();
}

// Illustrative only: R3 requires durable cleanup before detaching media.
// A ready asset has no future ready webhook; swallowed failure also leaves
// already-issued tokens usable. Replace this helper with enqueue + retry.
async function deleteMuxMediaQuietly(video) {
  if (!video) return;
  try {
    if (video.assetId) await muxClient.deleteAsset(video.assetId);
    else if (video.uploadId) await muxClient.cancelDirectUpload(video.uploadId);
  } catch (error) {
    logger.warn(
      { err: error, assetId: video.assetId, uploadId: video.uploadId },
      'Mux cleanup failed'
    );
  }
}

async function createGameVideoUpload(userId, gameId) {
  assertMuxConfigured();
  const game = await gamesService.assertGameAccess(userId, gameId, { requireWritable: true });
  const entitlements = await gamesService.resolveGameViewEntitlements(game);
  if (!entitlements.canViewReplay) {
    throw new ApiError(403, 'Uploading game video needs a plan that includes replays');
  }
  if (game.video && !REPLACEABLE_STATUSES.has(game.video.status)) {
    throw new ApiError(409, 'This game already has a video. Remove it before uploading another.');
  }
  if (game.video) await deleteMuxMediaQuietly(game.video);

  let upload;
  try {
    upload = await muxClient.createDirectUpload({
      corsOrigin: primaryClientOrigin(),
      passthrough: String(game._id),
    });
  } catch (error) {
    logger.error({ err: error, gameId: String(game._id) }, 'Mux direct upload creation failed');
    throw new ApiError(502, 'Could not start the upload. Please try again.');
  }

  game.video = {
    provider: 'mux',
    status: 'uploading',
    uploadId: upload.id,
    assetId: null,
    playbackId: null,
    durationSeconds: null,
    errorMessage: null,
    uploadedByUserId: userId,
    uploadStartedAt: new Date(),
    readyAt: null,
  };
  await saveGame(game);
  return { uploadUrl: upload.url, video: sanitizeGameVideo(game.video) };
}

async function deleteGameVideo(userId, gameId) {
  assertMuxConfigured();
  const game = await gamesService.assertGameAccess(userId, gameId, { requireWritable: true });
  if (!game.video) throw new ApiError(404, 'This game has no hosted video');
  await deleteMuxMediaQuietly(game.video);
  game.video = null;
  await saveGame(game);
  return { video: null };
}

module.exports = {
  createGameVideoUpload,
  deleteGameVideo,
  deleteMuxMediaQuietly,
};
```

- [ ] **Step 5: Add the controller and routes.** `video.controller.js`:

```js
const { ApiError } = require('../../utils/apiError');
const videoService = require('./video.service');

function requireAuthUserId(req) {
  if (!req.auth?.userId) throw new ApiError(401, 'Unauthorized');
  return req.auth.userId;
}

async function createUpload(req, res) {
  const result = await videoService.createGameVideoUpload(
    requireAuthUserId(req),
    req.params.gameId
  );
  res.status(201).json(result);
}

async function remove(req, res) {
  const result = await videoService.deleteGameVideo(requireAuthUserId(req), req.params.gameId);
  res.status(200).json(result);
}

module.exports = { createUpload, remove };
```

In `games.routes.js`, add `const videoController = require('../video/video.controller');`. After `gamesRouter.use(authMiddleware);`, add:

```js
gamesRouter.post('/:gameId/video/uploads', asyncHandler(videoController.createUpload));
gamesRouter.delete('/:gameId/video', asyncHandler(videoController.remove));
```

- [ ] **Step 6: Clean up Mux media when a game is deleted.** In `deleteGameForUser`, after `await game.deleteOne();`:

```js
if (game.video) {
  // Lazy require: video.service depends on this module.
  const { deleteMuxMediaQuietly } = require('../video/video.service');
  deleteMuxMediaQuietly(game.video);
}
```

- [ ] **Step 7: Run the tests and confirm they pass.** `pnpm --filter server test -- video.service games.service`. Expected: PASS. The existing games.service suite must still pass, since it mocks `games.repository` and nothing there touches `video`.

- [ ] **Step 8: Commit.**

```bash
git add server/src/modules/video server/src/modules/games/games.service.js server/src/modules/games/games.routes.js server/src/tests/unit/video.service.test.js
git commit -m "feat(video): add Mux direct upload and removal endpoints"
```

---

### Task 5: Mux webhook

**Review gate:** the handler below illustrates provider event fields, not a
complete state machine. R3/R4/R6 require attempt ownership, conditional writes,
strict verification and restart-safe cleanup; do not ship the orphan rule as-is.

**Files:**

- Modify: `server/src/modules/video/video.service.js`, `video.controller.js`, `server/src/app.js`
- Create: `server/src/modules/video/video.routes.js`
- Test: `server/src/tests/unit/video.service.test.js` (extend), `server/src/tests/integration/video.webhook.test.js`

**Interfaces:**

- Consumes: `verifyMuxSignature` (Task 3), `findGameById`, `saveGame`, `deleteAsset`.
- Produces: `video.service.handleMuxWebhookEvent(event) → { handled: boolean, reason?: string }`, `video.service.handleMuxWebhook({ rawBody, signatureHeader })`, `videoWebhookRouter`, mounted at `POST /api/v1/videos/webhooks/mux`.

- [ ] **Step 1: Write the failing tests.** Append to `video.service.test.js`:

```js
const { findGameById } = require('../../modules/games/games.repository');

describe('handleMuxWebhookEvent', () => {
  const uploading = () =>
    makeGame({
      video: {
        provider: 'mux',
        status: 'uploading',
        uploadId: 'up-1',
        assetId: null,
        playbackId: null,
      },
    });
  const assetReady = {
    type: 'video.asset.ready',
    data: {
      id: 'as-1',
      upload_id: 'up-1',
      passthrough: '111111111111111111111111',
      duration: 5400.5,
      playback_ids: [{ id: 'pb-signed', policy: 'signed' }],
    },
  };

  test('asset_created moves the game to processing', async () => {
    const game = uploading();
    findGameById.mockResolvedValue(game);

    await videoService.handleMuxWebhookEvent({
      type: 'video.upload.asset_created',
      data: {
        id: 'up-1',
        asset_id: 'as-1',
        new_asset_settings: { passthrough: '111111111111111111111111' },
      },
    });

    expect(game.video).toMatchObject({ status: 'processing', assetId: 'as-1' });
    expect(saveGame).toHaveBeenCalledWith(game);
  });

  test('asset.ready records the signed playback id and duration, even before asset_created', async () => {
    const game = uploading();
    findGameById.mockResolvedValue(game);

    const result = await videoService.handleMuxWebhookEvent(assetReady);

    expect(result).toEqual({ handled: true });
    expect(game.video).toMatchObject({
      status: 'ready',
      assetId: 'as-1',
      playbackId: 'pb-signed',
      durationSeconds: 5400.5,
      errorMessage: null,
    });
    expect(game.video.readyAt).toBeInstanceOf(Date);
  });

  test('a repeated asset.ready is a no-op', async () => {
    const game = uploading();
    findGameById.mockResolvedValue(game);
    await videoService.handleMuxWebhookEvent(assetReady);
    saveGame.mockClear();

    await videoService.handleMuxWebhookEvent(assetReady);

    expect(saveGame).not.toHaveBeenCalled();
  });

  test('asset.errored records the Mux message', async () => {
    const game = uploading();
    findGameById.mockResolvedValue(game);

    await videoService.handleMuxWebhookEvent({
      type: 'video.asset.errored',
      data: {
        id: 'as-1',
        upload_id: 'up-1',
        passthrough: '111111111111111111111111',
        errors: { messages: ['Unsupported codec'] },
      },
    });

    expect(game.video).toMatchObject({ status: 'errored', errorMessage: 'Unsupported codec' });
  });

  test('deletes an orphaned asset whose upload the game no longer claims', async () => {
    findGameById.mockResolvedValue(makeGame({ video: null }));

    const result = await videoService.handleMuxWebhookEvent(assetReady);

    expect(result).toEqual({ handled: false, reason: 'orphaned_asset_deleted' });
    expect(muxClient.deleteAsset).toHaveBeenCalledWith('as-1');
    expect(saveGame).not.toHaveBeenCalled();
  });

  test('deletes an orphaned asset whose game was deleted', async () => {
    findGameById.mockResolvedValue(null);
    await videoService.handleMuxWebhookEvent(assetReady);
    expect(muxClient.deleteAsset).toHaveBeenCalledWith('as-1');
  });

  test('ignores events with no game passthrough', async () => {
    const result = await videoService.handleMuxWebhookEvent({
      type: 'video.asset.ready',
      data: { id: 'as-x' },
    });
    expect(result).toEqual({ handled: false, reason: 'no_game' });
    expect(muxClient.deleteAsset).not.toHaveBeenCalled();
  });

  test('a cancelled or timed-out upload marks the video errored', async () => {
    const game = uploading();
    findGameById.mockResolvedValue(game);

    await videoService.handleMuxWebhookEvent({
      type: 'video.upload.timed_out',
      data: { id: 'up-1', new_asset_settings: { passthrough: '111111111111111111111111' } },
    });

    expect(game.video).toMatchObject({
      status: 'errored',
      errorMessage: 'The upload did not finish in time.',
    });
  });
});
```

Create `server/src/tests/integration/video.webhook.test.js`:

```js
const request = require('supertest');
const { createApp } = require('../../app');

describe('Mux webhook route', () => {
  test('is reachable without auth or CSRF, and refuses when Mux is unconfigured', async () => {
    const response = await request(createApp())
      .post('/api/v1/videos/webhooks/mux')
      .set('Content-Type', 'application/json')
      .set('mux-signature', 't=1,v1=00')
      .send('{"type":"video.asset.ready"}');

    // setupEnv.js leaves Mux unset → 503, not the 401/403 an un-exempted route would give.
    expect(response.statusCode).toBe(503);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter server test -- video`. Expected: FAIL.

- [ ] **Step 3: Implement the webhook handling.** Add to `video.service.js`. Add `findGameById` to the games.repository require, and add `const mongoose = require('mongoose');` and `const { verifyMuxSignature } = require('./mux.webhook');`.

```js
function passthroughOf(event) {
  return event.type.startsWith('video.upload.')
    ? event.data?.new_asset_settings?.passthrough
    : event.data?.passthrough;
}

function uploadIdOf(event) {
  return event.type.startsWith('video.upload.') ? event.data?.id : event.data?.upload_id;
}

function assetIdOf(event) {
  return event.type.startsWith('video.upload.') ? event.data?.asset_id : event.data?.id;
}

const UPLOAD_FAILURE_MESSAGES = {
  'video.upload.cancelled': 'The upload was cancelled.',
  'video.upload.errored': 'The upload failed.',
  'video.upload.timed_out': 'The upload did not finish in time.',
};

async function handleMuxWebhookEvent(event) {
  const gameId = passthroughOf(event);
  if (!gameId || !mongoose.Types.ObjectId.isValid(gameId))
    return { handled: false, reason: 'no_game' };

  const game = await findGameById(gameId);
  const claimsUpload = Boolean(game?.video?.uploadId) && game.video.uploadId === uploadIdOf(event);
  const assetId = assetIdOf(event);

  if (!claimsUpload) {
    // Removed or replaced while Mux was still processing, or the game itself
    // was deleted: nothing points at this asset any more, so stop paying for it.
    if (
      assetId &&
      (event.type === 'video.asset.ready' || event.type === 'video.upload.asset_created')
    ) {
      await muxClient.deleteAsset(assetId);
      return { handled: false, reason: 'orphaned_asset_deleted' };
    }
    return { handled: false, reason: 'stale_event' };
  }

  const video = game.video;
  switch (event.type) {
    case 'video.upload.asset_created':
      if (video.status !== 'uploading') return { handled: true };
      video.assetId = assetId;
      video.status = 'processing';
      break;
    case 'video.asset.ready': {
      const playbackId = (event.data.playback_ids || []).find((p) => p.policy === 'signed')?.id;
      if (video.status === 'ready' && video.playbackId === playbackId) return { handled: true };
      if (!playbackId) {
        video.status = 'errored';
        video.errorMessage = 'Mux returned no signed playback id.';
        break;
      }
      video.assetId = assetId;
      video.playbackId = playbackId;
      video.durationSeconds = Number.isFinite(event.data.duration) ? event.data.duration : null;
      video.status = 'ready';
      video.errorMessage = null;
      video.readyAt = new Date();
      break;
    }
    case 'video.asset.errored':
      video.assetId = assetId;
      video.status = 'errored';
      video.errorMessage =
        event.data.errors?.messages?.join('; ') || 'Mux could not process this video.';
      break;
    case 'video.upload.cancelled':
    case 'video.upload.errored':
    case 'video.upload.timed_out':
      if (video.status !== 'uploading') return { handled: true };
      video.status = 'errored';
      video.errorMessage = UPLOAD_FAILURE_MESSAGES[event.type];
      break;
    case 'video.asset.deleted':
      game.video = null;
      break;
    default:
      return { handled: false, reason: 'ignored_type' };
  }

  await saveGame(game);
  return { handled: true };
}

async function handleMuxWebhook({ rawBody, signatureHeader }) {
  assertMuxConfigured();
  if (!verifyMuxSignature({ rawBody, signatureHeader, secret: env.MUX_WEBHOOK_SECRET })) {
    throw new ApiError(400, 'Invalid Mux signature');
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ApiError(400, 'Invalid webhook payload');
  }
  if (typeof event?.type !== 'string') throw new ApiError(400, 'Invalid webhook payload');
  return handleMuxWebhookEvent(event);
}
```

Add `handleMuxWebhookEvent` and `handleMuxWebhook` to `module.exports`.

- [ ] **Step 4: Add the controller handler, router and app mount.** Append to `video.controller.js` and export it:

```js
async function handleWebhook(req, res) {
  const result = await videoService.handleMuxWebhook({
    rawBody: req.body,
    signatureHeader: req.headers['mux-signature'],
  });
  res.status(200).json(result);
}
```

`video.routes.js`:

```js
const { Router } = require('express');
const { asyncHandler } = require('../../utils/asyncHandler');
const controller = require('./video.controller');

const videoWebhookRouter = Router();
videoWebhookRouter.post('/', asyncHandler(controller.handleWebhook));

module.exports = { videoWebhookRouter };
```

In `app.js`, require it, then mount it directly after the billing webhook and before `express.json`:

```js
app.use(
  '/api/v1/videos/webhooks/mux',
  express.raw({ type: 'application/json', limit: '100kb' }),
  videoWebhookRouter
);
```

- [ ] **Step 5: Run the tests and confirm they pass.** `pnpm --filter server test -- video`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/src/modules/video server/src/app.js server/src/tests
git commit -m "feat(video): handle signed Mux webhooks with orphan cleanup"
```

---

### Task 6: Signed playback endpoint

**Review gate:** R1/R6/R9 override the anonymous/entitlement-only examples below.
Rewrite authorization and its tests around optional viewer auth and the chosen
publication policy before committing. A mocked `canViewReplay: false` case is
not evidence that free accounts are denied by the real catalog.

**Files:**

- Modify: `server/src/modules/video/video.service.js`, `video.controller.js`, `server/src/modules/games/games.routes.js`
- Create: `server/src/modules/video/video.validation.js`
- Test: `server/src/tests/unit/video.service.test.js` (extend)

**Interfaces:**

- Consumes: `assertGameAccess`, `resolveGameViewEntitlements`, `getGameVideoProvider`, `buildClipWindow`, `signPlaybackToken`, `findSharedEventIds` (feed.repository).
- Produces: `GET /api/v1/games/:gameId/video/playback?eventId=<24-hex>` (optional auth, visibility authorized before signing) returning

```json
{
  "provider": "mux",
  "playbackId": "pb-signed",
  "clip": { "startSeconds": 95, "endSeconds": 105 },
  "expiresAt": "2026-10-04T13:00:00.000Z",
  "tokens": { "playback": "…", "thumbnail": "…", "storyboard": null }
}
```

`clip` is `null` and `storyboard` is a token for a full-game request.

- [ ] **Step 1: Write the failing tests.** Append to `video.service.test.js`:

```js
const { findSharedEventIds } = require('../../modules/feed/feed.repository');
const EVENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('getGameVideoPlayback', () => {
  const readyGame = () =>
    makeGame({
      video: { provider: 'mux', status: 'ready', playbackId: 'pb-1', durationSeconds: 5400 },
      events: [
        { _id: EVENT_ID, statType: 'FG3_MADE', videoTimestamp: 100 },
        { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', statType: 'FG2_MADE', videoTimestamp: 6000 },
      ],
    });

  beforeEach(() => {
    gamesService.assertGameAccess.mockResolvedValue(readyGame());
    findSharedEventIds.mockResolvedValue([]);
  });

  test('full game: playback, thumbnail and storyboard tokens for replay viewers', async () => {
    const result = await videoService.getGameVideoPlayback('111111111111111111111111');
    expect(gamesService.assertGameAccess).toHaveBeenCalledWith(null, '111111111111111111111111');
    expect(result).toMatchObject({
      provider: 'mux',
      playbackId: 'pb-1',
      clip: null,
      tokens: { playback: 'v:{}', thumbnail: 't:{}', storyboard: 's:{}' },
    });
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now() + 11 * 3600 * 1000);
  });

  test('full game: 403 without canViewReplay', async () => {
    gamesService.resolveGameViewEntitlements.mockResolvedValue({ canViewHighlightClips: true });
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111')
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('highlight: instant-clip claims and a thumbnail at the play', async () => {
    const result = await videoService.getGameVideoPlayback('111111111111111111111111', {
      eventId: EVENT_ID,
    });
    expect(result.clip).toEqual({ startSeconds: 95, endSeconds: 105 });
    expect(result.tokens).toEqual({
      playback: 'v:{"asset_start_time":95,"asset_end_time":105}',
      thumbnail: 't:{"time":100}',
      storyboard: null,
    });
  });

  test('highlight: allowed without entitlements once the play is shared to the Pulse', async () => {
    gamesService.resolveGameViewEntitlements.mockResolvedValue({});
    findSharedEventIds.mockResolvedValue([EVENT_ID]);
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111', { eventId: EVENT_ID })
    ).resolves.toMatchObject({
      clip: { startSeconds: 95, endSeconds: 105 },
    });
  });

  test('highlight: 403 when neither entitled nor shared', async () => {
    gamesService.resolveGameViewEntitlements.mockResolvedValue({});
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111', { eventId: EVENT_ID })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('highlight: 422 when the play is outside the uploaded video', async () => {
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111', {
        eventId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('404 for unknown events and for games without a ready Mux video', async () => {
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111', {
        eventId: 'cccccccccccccccccccccccc',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    gamesService.assertGameAccess.mockResolvedValue(
      makeGame({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    );
    await expect(
      videoService.getGameVideoPlayback('111111111111111111111111')
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter server test -- video.service`. Expected: FAIL (`getGameVideoPlayback` is not a function).

- [ ] **Step 3: Implement.** In `video.service.js`, add `buildClipWindow` and `getGameVideoProvider` to the gameVideo require, plus:

```js
const { findSharedEventIds } = require('../feed/feed.repository');
const { MUX_AUDIENCE, signPlaybackToken } = require('./mux.tokens');

const FULL_GAME_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const HIGHLIGHT_TOKEN_TTL_SECONDS = 60 * 60;

async function canViewHighlight(game, eventId, entitlements) {
  if (entitlements.canViewReplay || entitlements.canViewHighlightClips) return true;
  // A play shared to the Pulse is public there, so its clip is too.
  return (await findSharedEventIds([eventId])).length > 0;
}

async function getGameVideoPlayback(gameId, { eventId = null } = {}) {
  assertMuxConfigured();
  const game = await gamesService.assertGameAccess(null, gameId);
  if (getGameVideoProvider(game) !== 'mux')
    throw new ApiError(404, 'This game has no hosted video');
  const entitlements = await gamesService.resolveGameViewEntitlements(game);
  const { playbackId, durationSeconds } = game.video;
  const now = Date.now();
  const sign = (audience, expiresInSeconds, claims) =>
    signPlaybackToken({ playbackId, audience, expiresInSeconds, claims, now });

  if (!eventId) {
    if (!entitlements.canViewReplay)
      throw new ApiError(403, 'Full game video needs a plan that includes replays');
    const ttl = FULL_GAME_TOKEN_TTL_SECONDS;
    return {
      provider: 'mux',
      playbackId,
      clip: null,
      expiresAt: new Date(now + ttl * 1000).toISOString(),
      tokens: {
        playback: sign(MUX_AUDIENCE.video, ttl),
        thumbnail: sign(MUX_AUDIENCE.thumbnail, ttl),
        storyboard: sign(MUX_AUDIENCE.storyboard, ttl),
      },
    };
  }

  const event = (game.events || []).find((ev) => String(ev._id) === eventId);
  if (!event || typeof event.videoTimestamp !== 'number')
    throw new ApiError(404, 'Highlight not found');
  if (!(await canViewHighlight(game, eventId, entitlements))) {
    throw new ApiError(403, 'This highlight is not available on the current plan');
  }
  const clip = buildClipWindow(event.videoTimestamp, durationSeconds);
  if (!clip) throw new ApiError(422, 'This play is outside the uploaded video');

  const ttl = HIGHLIGHT_TOKEN_TTL_SECONDS;
  return {
    provider: 'mux',
    playbackId,
    clip,
    expiresAt: new Date(now + ttl * 1000).toISOString(),
    tokens: {
      playback: sign(MUX_AUDIENCE.video, ttl, {
        asset_start_time: clip.startSeconds,
        asset_end_time: clip.endSeconds,
      }),
      thumbnail: sign(MUX_AUDIENCE.thumbnail, ttl, { time: event.videoTimestamp }),
      storyboard: null,
    },
  };
}
```

Export `getGameVideoPlayback`.

`video.validation.js`:

```js
const { z } = require('zod');

const playbackQuerySchema = z.object({
  eventId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'eventId must be an event id')
    .optional(),
});

module.exports = { playbackQuerySchema };
```

Controller (export it):

```js
const { playbackQuerySchema } = require('./video.validation');

async function getPlayback(req, res) {
  const { eventId } = playbackQuerySchema.parse(req.query);
  const result = await videoService.getGameVideoPlayback(req.params.gameId, { eventId });
  // Tokens are short-lived bearer credentials: never let a shared cache keep them.
  res.set('Cache-Control', 'private, no-store');
  res.status(200).json(result);
}
```

In `games.routes.js`, **before** `gamesRouter.use(authMiddleware);`:

```js
// Mux game video: public, because highlight visibility is decided per game
// entitlement / Pulse share inside the service, not by who is signed in.
gamesRouter.get('/:gameId/video/playback', asyncHandler(videoController.getPlayback));
```

- [ ] **Step 4: Run the tests and confirm they pass.** `pnpm --filter server test -- video`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/modules/video server/src/modules/games/games.routes.js server/src/tests/unit/video.service.test.js
git commit -m "feat(video): add signed full-game and instant-clip playback endpoint"
```

---

### Task 7: Hosted video in game, highlight and Pulse payloads

**Review gate:** R5 requires live provider/event resolution and timeline checks.
The snapshot serializer in Step 3 is insufficient; the transition tests below
must pass using current game/event data, including old posts.

**Files:**

- Modify: `server/src/modules/games/games.service.js` (`sanitizeGame` ~line 441, `buildGameHighlights` ~line 115), `server/src/modules/teams/teams.service.js` (~lines 217–218, 458–473), `server/src/modules/leagues/leagues.service.js` (~lines 1129–1157), `server/src/modules/feed/feed.repository.js` (`highlightClipSchema`), `server/src/modules/feed/feed.service.js` (`resolveHighlightClipPayload`, `createHighlightClipPostForUser`, `autoCreateHighlightClipPosts`)
- Test: `server/src/tests/unit/games.service.test.js`, `feed.service.test.js`, `feed.repository.schema.test.js`

**Interfaces:**

- Consumes: `hasGameVideo`, `sanitizeGameVideo`, `buildHighlightVideoFields` (Task 2).
- Produces (the client relies on these exact keys):
  - `game.video` in every game payload: `{ provider, status, durationSeconds, errorMessage } | null`
  - every highlight item: `{ gameId, eventId, statType, videoTimestamp, videoProvider, videoUrl, … }`
  - Pulse `highlightClip`: `{ gameId, eventId, videoProvider, videoUrl, videoTimestamp, statType, playerId, playerName, gameTitle }`
  - Post schema: `highlightClip.videoUrl` no longer required; new `highlightClip.videoProvider` (`'youtube' | 'mux'`, default `'youtube'`)

- [ ] **Step 1: Write the failing tests.**

In `feed.service.test.js`, inside `describe('autoCreateHighlightClipPosts')`:

```js
test('creates Mux-provider clips (no URL) for a game with a ready hosted video', async () => {
  const game = {
    _id: 'game-1',
    videoUrl: null,
    video: { provider: 'mux', status: 'ready', playbackId: 'pb-1', durationSeconds: 5400 },
    title: 'Big Game',
    events: [makeEvent({ _id: 'e1', statType: 'FG3_MADE', videoTimestamp: 10 })],
  };
  findSharedEventIds.mockResolvedValue([]);
  createPost.mockResolvedValue({ _id: 'clip-post' });

  const result = await service.autoCreateHighlightClipPosts('system-user-1', game);

  expect(result.created).toBe(1);
  expect(createPost).toHaveBeenCalledWith(
    expect.objectContaining({
      highlightClip: expect.objectContaining({
        eventId: 'e1',
        videoProvider: 'mux',
        videoUrl: null,
      }),
    })
  );
});

test('does not create clips while the hosted video is still processing', async () => {
  const game = {
    _id: 'game-1',
    videoUrl: null,
    video: { provider: 'mux', status: 'processing', playbackId: null },
    events: [makeEvent({ _id: 'e1' })],
  };
  const result = await service.autoCreateHighlightClipPosts('system-user-1', game);
  expect(result).toEqual({ created: 0, skipped: 0, capped: false });
});
```

Append this complete serializer regression block to `feed.service.test.js`.
It uses the suite's existing imported repository mocks. These cases assume the
replacement recording is confirmed to use the same timeline (R5); add separate
unavailable cases for mismatched generations when that schema is implemented.

```js
describe('Pulse highlights resolve current media', () => {
  const gameId = '111111111111111111111111';
  const eventId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const readyMux = {
    provider: 'mux',
    status: 'ready',
    playbackId: 'pb-private',
    durationSeconds: 5400,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUsersByIds.mockResolvedValue([{ _id: 'user-1', name: 'Alex' }]);
  });

  test.each([
    ['legacy YouTube post, now Mux', undefined, readyMux, 'mux', null],
    ['Mux post, now YouTube', 'mux', null, 'youtube', youtubeUrl],
    ['legacy YouTube post, still YouTube', undefined, null, 'youtube', youtubeUrl],
  ])('%s', async (_label, storedProvider, video, expectedProvider, expectedUrl) => {
    listPosts.mockResolvedValue([
      {
        _id: 'post-1',
        creatorUserId: 'user-1',
        type: 'highlight_clip',
        createdAt: new Date('2026-10-04T12:00:00Z'),
        highlightClip: {
          gameId,
          eventId,
          ...(storedProvider ? { videoProvider: storedProvider } : {}),
          videoUrl: storedProvider === 'mux' ? null : youtubeUrl,
          videoTimestamp: 30,
          statType: 'FG3_MADE',
        },
      },
    ]);
    findGameById.mockResolvedValue({
      _id: gameId,
      videoUrl: youtubeUrl,
      video,
      events: [{ _id: eventId, statType: 'FG3_MADE', videoTimestamp: 100 }],
    });

    const result = await service.listFeedPosts(null, { limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].highlightClip).toMatchObject({
      gameId,
      eventId,
      videoProvider: expectedProvider,
      videoUrl: expectedUrl,
      videoTimestamp: 100,
    });
    expect(result.posts[0].highlightClip).not.toHaveProperty('tokens');
    expect(JSON.stringify(result)).not.toContain('pb-private');
  });
});
```

In `feed.repository.schema.test.js`:

```js
test('highlightClip supports hosted (Mux) clips with no URL', () => {
  const Post = mongoose.model('Post');
  expect(Post.schema.path('highlightClip.videoUrl').isRequired).toBeFalsy();
  expect(Post.schema.path('highlightClip.videoProvider').enumValues).toEqual(['youtube', 'mux']);
  expect(Post.schema.path('highlightClip.videoProvider').defaultValue).toBe('youtube');
});
```

In `games.service.test.js`, append this complete block. It uses the existing
top-level `buildDualLeagueGame`, `buildLeagueSnapshotPlayer`, `findGameById`,
`findLeagueById`, `getGameForUser` and `STAT_TYPES` definitions; no new mock is
needed. Both active League and Starter actually grant replay. A false-entitlement
projection is already tested in Task 2; viewer/privacy denial belongs in Task 6.

```js
describe('hosted game video payloads', () => {
  test.each([
    ['active League', 'league', 'active'],
    ['free Starter', 'starter', 'inactive'],
  ])('returns safe Mux status and highlights for %s', async (_label, plan, subscriptionStatus) => {
    findLeagueById.mockResolvedValue({
      _id: 'league-1',
      plan,
      subscriptionStatus,
      billingSource: 'stripe',
    });
    const game = buildDualLeagueGame({
      videoUrl: null,
      video: {
        provider: 'mux',
        status: 'ready',
        uploadId: 'up-private',
        assetId: 'asset-private',
        playbackId: 'pb-private',
        durationSeconds: 5400,
        errorMessage: null,
      },
      homeRosterSnapshot: [buildLeagueSnapshotPlayer('home-snap-1', 'Home One')],
      awayRosterSnapshot: [buildLeagueSnapshotPlayer('away-snap-1', 'Away One')],
      events: [
        {
          _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          playerId: 'home-snap-1',
          teamSide: 'home',
          statType: STAT_TYPES.FG3_MADE,
          videoTimestamp: 100,
        },
      ],
    });
    findGameById.mockResolvedValue(game);

    const result = await getGameForUser('user-1', 'game-1');

    expect(result.game.video).toEqual({
      provider: 'mux',
      status: 'ready',
      durationSeconds: 5400,
      errorMessage: null,
    });
    expect(result.highlights).toEqual([
      expect.objectContaining({
        gameId: 'game-1',
        eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        videoProvider: 'mux',
        videoUrl: null,
        videoTimestamp: 100,
      }),
    ]);
    const payload = JSON.stringify(result);
    for (const secret of ['up-private', 'asset-private', 'pb-private']) {
      expect(payload).not.toContain(secret);
    }
    expect(result.game).not.toHaveProperty('tokens');
    expect(result.highlights[0]).not.toHaveProperty('tokens');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter server test -- feed games.service`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**

`games.service.js`: require `{ hasGameVideo, sanitizeGameVideo, buildHighlightVideoFields }` from `../shared/gameVideo`. In `sanitizeGame`, directly under the `videoUrl:` line:

```js
    video: sanitizeGameVideo(game.video, { includePremiumMedia }),
```

In `buildGameHighlights`, replace `if (!game.videoUrl) return [];` with `if (!hasGameVideo(game)) return [];`. Compute `const videoFields = buildHighlightVideoFields(game);` once before the `.filter`, and in the mapped object replace `videoUrl: game.videoUrl,` with:

```js
        gameId: String(game._id),
        ...videoFields,
```

`teams.service.js`: require the same helpers. At ~217–218:

```js
    videoUrl: game.videoUrl ?? null,
    hasVideo: hasGameVideo(game),
```

At ~458 replace `.filter((game) => game.videoUrl)` with `.filter((game) => hasGameVideo(game))`. In the pushed highlight, replace `videoUrl: game.videoUrl,` with `...buildHighlightVideoFields(game),` and make sure `gameId: String(game._id)` is present (add it if missing).

`leagues.service.js` `buildLeaguePlayerHighlights`: replace `if (!game.videoUrl) continue;` with `if (!hasGameVideo(game)) continue;` and `videoUrl: game.videoUrl,` with `...buildHighlightVideoFields(game),`. It already has `gameId`.

`feed.repository.js` `highlightClipSchema`:

```js
    // Mux game video: hosted clips carry no URL — playback is resolved per view
    // through GET /games/:gameId/video/playback?eventId=.
    videoProvider: { type: String, enum: ['youtube', 'mux'], default: 'youtube' },
    videoUrl: { type: String, default: null },
```

`feed.service.js`: require `{ hasGameVideo, buildHighlightVideoFields }`.

- `resolveHighlightClipPayload`:

```js
  const videoProvider = clip.videoProvider === 'mux' ? 'mux' : 'youtube';
  …
      videoProvider,
      videoUrl: videoProvider === 'youtube' && isSafeYouTubeUrl(clip.videoUrl) ? clip.videoUrl : null,
```

- `createHighlightClipPostForUser`: `if (!hasGameVideo(game)) throw new ApiError(400, 'This game has no video linked');`. In the `highlightClip` object, replace `videoUrl: game.videoUrl,` with `...buildHighlightVideoFields(game),`.
- `autoCreateHighlightClipPosts`: `if (!hasGameVideo(game)) return { created: 0, skipped: 0, capped: false };`. Compute `const videoFields = buildHighlightVideoFields(game);` once, and replace `videoUrl: game.videoUrl,` with `...videoFields,`.

- [ ] **Step 4: Run the server suite and confirm it passes.** `pnpm --filter server test`. Expected: PASS (all suites).

- [ ] **Step 5: Commit.**

```bash
git add server/src
git commit -m "feat(video): expose hosted video status and provider-aware highlights"
```

---

### Task 8: Client video API, playback hook and provider helpers

**Files:**

- Modify: `client/package.json`
- Create: `client/src/features/video/api/videoApi.js`, `hooks/useVideoPlayback.js`, `videoSource.js`
- Modify: `client/src/features/games/highlightReel.js`
- Test: `client/src/features/video/videoSource.test.js`, `hooks/useVideoPlayback.test.jsx`, `client/src/features/games/highlightReel.test.js`

**Interfaces:**

- Produces:
  - `videoApi.createUpload(gameId)`, `videoApi.remove(gameId)`, `videoApi.getPlayback(gameId, eventId = null)`
  - `useVideoPlayback({ gameId, eventId = null, enabled = true }) → useQuery result` (`data` is the Task 6 payload)
  - `getHostedVideoStatus(game) → 'uploading' | 'processing' | 'ready' | 'errored' | null`
  - `hasPlayableVideo(game) → boolean`
  - `isMuxHighlight(highlight) → boolean`
  - `highlightSourceKey(highlight) → string`
  - `isPlayableHighlight(highlight)`, now exported from `highlightReel.js` and provider-aware

- [ ] **Step 1: Install the dependencies.** `pnpm --filter client add @mux/mux-player-react @mux/upchunk`

- [ ] **Step 2: Write the failing tests.**

`client/src/features/video/videoSource.test.js`:

```js
import { describe, expect, test } from 'vitest';
import {
  getHostedVideoStatus,
  hasPlayableVideo,
  highlightSourceKey,
  isMuxHighlight,
} from './videoSource';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('videoSource', () => {
  test('hosted status and playability', () => {
    expect(getHostedVideoStatus({ video: { provider: 'mux', status: 'processing' } })).toBe(
      'processing'
    );
    expect(getHostedVideoStatus({})).toBeNull();
    expect(hasPlayableVideo({ video: { provider: 'mux', status: 'ready' } })).toBe(true);
    expect(
      hasPlayableVideo({ video: { provider: 'mux', status: 'processing' }, videoUrl: YT })
    ).toBe(true);
    expect(hasPlayableVideo({ video: { provider: 'mux', status: 'processing' } })).toBe(false);
  });

  test('highlight provider and dedupe key', () => {
    const mux = { videoProvider: 'mux', gameId: 'g1', eventId: 'e1' };
    expect(isMuxHighlight(mux)).toBe(true);
    expect(highlightSourceKey(mux)).toBe('mux:g1');
    expect(highlightSourceKey({ videoProvider: 'youtube', videoUrl: YT })).toBe(YT);
    expect(highlightSourceKey({ videoUrl: YT })).toBe(YT);
  });
});
```

Add to `highlightReel.test.js`:

```js
test('Mux highlights are playable without a URL and dedupe per game', () => {
  const mux = (eventId, videoTimestamp) => ({
    eventId,
    gameId: 'g1',
    statType: 'FG3_MADE',
    videoTimestamp,
    videoProvider: 'mux',
    videoUrl: null,
  });
  const segments = buildHighlightReelSegments([mux('a', 10), mux('b', 12), mux('c', 40)]);
  expect(segments.map((s) => s.eventId)).toEqual(['a', 'c']);
  expect(segments[0]).toMatchObject({ videoId: null, startSeconds: 5, endSeconds: 15 });
});
```

`client/src/features/video/hooks/useVideoPlayback.test.jsx`:

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { videoApi } from '../api/videoApi';
import { useVideoPlayback } from './useVideoPlayback';

vi.mock('../api/videoApi', () => ({ videoApi: { getPlayback: vi.fn() } }));

function wrapper({ children }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useVideoPlayback', () => {
  beforeEach(() => vi.clearAllMocks());

  test('fetches a clip token for the event', async () => {
    videoApi.getPlayback.mockResolvedValue({
      playbackId: 'pb',
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    });
    const { result } = renderHook(() => useVideoPlayback({ gameId: 'g1', eventId: 'e1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.playbackId).toBe('pb'));
    expect(videoApi.getPlayback).toHaveBeenCalledWith('g1', 'e1');
  });

  test('stays idle when disabled', () => {
    renderHook(() => useVideoPlayback({ gameId: 'g1', enabled: false }), { wrapper });
    expect(videoApi.getPlayback).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them and confirm they fail.** `pnpm --filter client test -- videoSource useVideoPlayback highlightReel`. Expected: FAIL.

- [ ] **Step 4: Implement.**

`api/videoApi.js`:

```js
import { apiClient } from '../../../lib/apiClient';

export const videoApi = {
  createUpload(gameId) {
    return apiClient.post(`/games/${gameId}/video/uploads`, {});
  },
  remove(gameId) {
    return apiClient.delete(`/games/${gameId}/video`);
  },
  getPlayback(gameId, eventId = null) {
    const suffix = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    return apiClient.get(`/games/${gameId}/video/playback${suffix}`);
  },
};
```

`hooks/useVideoPlayback.js`:

```js
import { useQuery } from '@tanstack/react-query';
import { videoApi } from '../api/videoApi';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Only enable for playback intent/visibility (R7). staleTime alone does not
// renew credentials: this foreground timer refreshes five minutes before expiry.
// R6 also requires source invalidation and media state preservation on renewal.
export function useVideoPlayback({ gameId, eventId = null, enabled = true }) {
  return useQuery({
    queryKey: ['videoPlayback', gameId, eventId ?? 'full'],
    queryFn: () => videoApi.getPlayback(gameId, eventId),
    enabled: Boolean(gameId) && enabled,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const expiresAt = Date.parse(query.state.data?.expiresAt ?? '');
      return Number.isFinite(expiresAt)
        ? Math.max(1000, expiresAt - Date.now() - REFRESH_MARGIN_MS)
        : false;
    },
  });
}
```

`videoSource.js`:

```js
export function getHostedVideoStatus(game) {
  return game?.video?.provider === 'mux' ? game.video.status : null;
}

export function hasPlayableVideo(game) {
  return getHostedVideoStatus(game) === 'ready' || Boolean(game?.videoUrl);
}

export function isMuxHighlight(highlight) {
  return highlight?.videoProvider === 'mux';
}

// Highlights within a few seconds of each other on the SAME video are duplicates.
export function highlightSourceKey(highlight) {
  return isMuxHighlight(highlight) ? `mux:${highlight.gameId}` : highlight?.videoUrl;
}
```

`highlightReel.js`: import `{ highlightSourceKey, isMuxHighlight }` from `'../video/videoSource'`. Replace `isPlayableHighlight` and export it:

```js
export function isPlayableHighlight(highlight) {
  if (!highlight || !Number.isFinite(highlight.videoTimestamp)) return false;
  return isMuxHighlight(highlight)
    ? Boolean(highlight.gameId && highlight.eventId)
    : Boolean(extractYouTubeVideoId(highlight.videoUrl));
}
```

In `buildHighlightReelSegments`, replace `existing.videoUrl === highlight.videoUrl` with `highlightSourceKey(existing) === highlightSourceKey(highlight)`. For Mux, `videoId: extractYouTubeVideoId(highlight.videoUrl)` already yields `null`, so leave it.

- [ ] **Step 5: Run them and confirm they pass.** `pnpm --filter client test -- videoSource useVideoPlayback highlightReel`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add client/package.json pnpm-lock.yaml client/src/features/video client/src/features/games/highlightReel.js client/src/features/games/highlightReel.test.js
git commit -m "feat(video): add client playback API, token hook and provider helpers"
```

---

### Task 9: `MuxVideo` and `HighlightPlayer`, used on GameDetailPage and both player profiles

**Files:**

- Create: `client/src/features/video/components/MuxVideo.jsx`, `HighlightPlayer.jsx`
- Modify: `client/src/features/games/components/GameRecapPanel.jsx` (delete `GameHighlightClip`, ~lines 41–100; full-game block ~line 133), `client/src/features/games/pages/GameDetailPage.jsx` (pass `gameId` and `video`), `client/src/features/teams/pages/PublicPlayerPage.jsx` (delete `HighlightClip`, ~lines 78–110), `client/src/features/leagues/pages/PublicLeaguePlayerPage.jsx` (delete `HighlightClip`, ~lines 49–80)
- Test: `client/src/features/video/components/HighlightPlayer.test.jsx`

**Interfaces:**

- Consumes: `useVideoPlayback`, `isMuxHighlight` (Task 8); the highlight shape from Task 7.
- Produces:
  - `MuxVideo` (forwardRef to the Mux Player element: `play()`, `pause()`, `currentTime`): props `{ gameId, eventId = null, enabled, title, className = '', fallback = null, ...playerProps }`. Renders `fallback` (default "Video unavailable") on error.
  - `HighlightPlayer`: props `{ highlight, title, className = '' }`. YouTube → bounded iframe; Mux → `MuxVideo` with the event's clip token.

- [ ] **Step 1: Write the failing tests** in `HighlightPlayer.test.jsx`:

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { videoApi } from '../api/videoApi';
import { HighlightPlayer } from './HighlightPlayer';

vi.mock('../api/videoApi', () => ({ videoApi: { getPlayback: vi.fn() } }));
vi.mock('@mux/mux-player-react/lazy', () => ({
  default: forwardRef(function MuxPlayerStub({ playbackId, tokens }, ref) {
    return (
      <div
        ref={ref}
        data-testid="mux-player"
        data-playback-id={playbackId}
        data-token={tokens?.playback}
      />
    );
  }),
}));

function renderWithQuery(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('HighlightPlayer', () => {
  test('YouTube highlight renders a bounded embed', () => {
    renderWithQuery(
      <HighlightPlayer
        title="Three"
        highlight={{
          videoProvider: 'youtube',
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          videoTimestamp: 30,
        }}
      />
    );
    expect(screen.getByTitle('Three').getAttribute('src')).toContain(
      '/embed/dQw4w9WgXcQ?start=25&end=35'
    );
  });

  test('Mux highlight renders Mux Player with the clip token', async () => {
    videoApi.getPlayback.mockResolvedValue({
      playbackId: 'pb-1',
      tokens: { playback: 'clip-token', thumbnail: 'thumb', storyboard: null },
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    });
    renderWithQuery(
      <HighlightPlayer
        title="Three"
        highlight={{ videoProvider: 'mux', gameId: 'g1', eventId: 'e1', videoTimestamp: 30 }}
      />
    );
    const player = await screen.findByTestId('mux-player');
    expect(player.dataset.playbackId).toBe('pb-1');
    expect(player.dataset.token).toBe('clip-token');
    expect(videoApi.getPlayback).toHaveBeenCalledWith('g1', 'e1');
  });

  test('Mux highlight shows "Video unavailable" when the clip is refused', async () => {
    videoApi.getPlayback.mockRejectedValue(new Error('This play is outside the uploaded video'));
    renderWithQuery(
      <HighlightPlayer
        title="Three"
        highlight={{ videoProvider: 'mux', gameId: 'g1', eventId: 'e1', videoTimestamp: 30 }}
      />
    );
    await waitFor(() => expect(screen.getByText('Video unavailable')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter client test -- HighlightPlayer`. Expected: FAIL.

- [ ] **Step 3: Implement `MuxVideo.jsx`.** Add the `enabled` intent/visibility wiring and renewal/error handling required by R6/R7; this basic rendering snippet alone does not complete the task:

```jsx
import MuxPlayer from '@mux/mux-player-react/lazy';
import { forwardRef } from 'react';
import { useVideoPlayback } from '../hooks/useVideoPlayback';

function Unavailable() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900">
      <p className="text-sm text-slate-400">Video unavailable</p>
    </div>
  );
}

// Signed Mux playback for a full game (no eventId) or one play (eventId → the
// server signs an instant clip). Tokens come from the API, never the bundle.
export const MuxVideo = forwardRef(function MuxVideo(
  {
    gameId,
    eventId = null,
    enabled = true,
    title,
    className = '',
    fallback = null,
    ...playerProps
  },
  ref
) {
  const { data, isError } = useVideoPlayback({ gameId, eventId, enabled });

  if (isError) return fallback ?? <Unavailable />;
  if (!data) return <div className={`h-full w-full animate-pulse bg-slate-900 ${className}`} />;

  return (
    <MuxPlayer
      ref={ref}
      className={className}
      streamType="on-demand"
      playbackId={data.playbackId}
      tokens={{
        playback: data.tokens.playback,
        thumbnail: data.tokens.thumbnail,
        ...(data.tokens.storyboard ? { storyboard: data.tokens.storyboard } : {}),
      }}
      metadata={{ video_title: title, video_id: eventId ? `${gameId}:${eventId}` : gameId }}
      title={title}
      {...playerProps}
    />
  );
});
```

- [ ] **Step 4: Implement `HighlightPlayer.jsx`.** The YouTube branch reproduces the current `GameHighlightClip`/`HighlightClip` embed:

```jsx
import { extractYouTubeVideoId } from '../../games/youtube';
import { isMuxHighlight } from '../videoSource';
import { MuxVideo } from './MuxVideo';

const CLIP_BUFFER_SECONDS = 5;

export function HighlightPlayer({ highlight, title, className = '' }) {
  const frameClass = `relative aspect-video w-full overflow-hidden bg-slate-950 ${className}`;

  if (isMuxHighlight(highlight)) {
    return (
      <div className={frameClass}>
        <MuxVideo
          gameId={highlight.gameId}
          eventId={highlight.eventId}
          title={title}
          className="h-full w-full"
        />
      </div>
    );
  }

  const videoId = extractYouTubeVideoId(highlight?.videoUrl);
  if (!videoId || !Number.isFinite(highlight?.videoTimestamp)) {
    return (
      <div className={`${frameClass} flex items-center justify-center`}>
        <p className="text-sm text-slate-400">Video unavailable</p>
      </div>
    );
  }
  const start = Math.max(0, Math.floor(highlight.videoTimestamp - CLIP_BUFFER_SECONDS));
  const end = Math.ceil(highlight.videoTimestamp + CLIP_BUFFER_SECONDS);
  return (
    <div className={frameClass}>
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
```

Before deleting the three local clip components, read each one. Move any wrapper chrome (width classes, the label/player caption under the video) to the call site, so each page looks the same as before. Then replace each usage with `<HighlightPlayer highlight={h} title={…same title string as before…} />`, passing the whole highlight object instead of `videoUrl`/`timestamp`.

- [ ] **Step 5: Full-game video on GameDetailPage.** Add explicit user playback intent (`fullGamePlaybackRequested`) and pass `enabled` to full-game playback. Keep the YouTube fallback available while Mux is processing (R8). In `GameRecapPanel.jsx`, add props `gameId` and `video = null`, and replace `{videoUrl ? <GameVideoEmbed … /> : null}` with:

```jsx
{
  video?.status === 'ready' ? (
    <div className="aspect-video w-full overflow-hidden bg-slate-950">
      <MuxVideo
        gameId={gameId}
        enabled={fullGamePlaybackRequested}
        title={videoTitle}
        className="h-full w-full"
      />
    </div>
  ) : video?.status === 'uploading' || video?.status === 'processing' ? (
    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      The game video is processing. Highlights appear here once it is ready.
    </p>
  ) : videoUrl ? (
    <GameVideoEmbed videoUrl={videoUrl} title={videoTitle} />
  ) : null;
}
```

Change the reel copy "Watch the best moments back-to-back from YouTube." to "Watch the best moments back-to-back." In `GameDetailPage.jsx`, pass `gameId={game.id}` and `video={game.video}` to `GameRecapPanel`.

- [ ] **Step 6: Run the tests and confirm they pass.** `pnpm --filter client test`. Expected: PASS. Update any snapshot that changes only because a clip component moved, after checking the diff is just that.

- [ ] **Step 7: Commit.**

```bash
git add client/src
git commit -m "feat(video): play Mux and YouTube highlights through one HighlightPlayer"
```

---

### Task 10: Mux highlight reel

**Files:**

- Create: `client/src/features/video/components/MuxHighlightReel.jsx`
- Modify: `client/src/features/games/components/GameRecapPanel.jsx` (reel modal, ~line 233)
- Test: `client/src/features/video/components/MuxHighlightReel.test.jsx`

**Interfaces:**

- Consumes: `buildHighlightReelSegments` (Task 8), `MuxVideo` (Task 9).
- Produces: `MuxHighlightReel({ highlights, title })`. It plays the segments in order, advancing on `ended` or via the Next/Previous buttons.

- [ ] **Step 1: Write the failing test:**

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { MuxHighlightReel } from './MuxHighlightReel';

vi.mock('../api/videoApi', () => ({
  videoApi: {
    getPlayback: vi.fn((gameId, eventId) =>
      Promise.resolve({
        playbackId: `pb-${eventId}`,
        tokens: { playback: eventId, thumbnail: 't' },
        expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      })
    ),
  },
}));
vi.mock('@mux/mux-player-react/lazy', () => ({
  default: forwardRef(function Stub({ playbackId, onEnded }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        data-testid="mux-player"
        data-playback-id={playbackId}
        onClick={onEnded}
      />
    );
  }),
}));

const h = (eventId, videoTimestamp) => ({
  eventId,
  gameId: 'g1',
  videoProvider: 'mux',
  statType: 'FG3_MADE',
  videoTimestamp,
});

describe('MuxHighlightReel', () => {
  test('advances to the next clip when one ends', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MuxHighlightReel title="Reel" highlights={[h('a', 10), h('b', 60)]} />
      </QueryClientProvider>
    );
    expect((await screen.findByTestId('mux-player')).dataset.playbackId).toBe('pb-a');
    fireEvent.click(screen.getByTestId('mux-player')); // stub fires onEnded
    expect((await screen.findByTestId('mux-player')).dataset.playbackId).toBe('pb-b');
    expect(screen.getByText('Clip 2 of 2')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `pnpm --filter client test -- MuxHighlightReel`. Expected: FAIL.

- [ ] **Step 3: Implement:**

```jsx
import { useMemo, useState } from 'react';
import { STAT_LABELS } from '../../games/constants';
import { buildHighlightReelSegments } from '../../games/highlightReel';
import { MuxVideo } from './MuxVideo';

export function MuxHighlightReel({ highlights, title }) {
  const segments = useMemo(() => buildHighlightReelSegments(highlights), [highlights]);
  const [index, setIndex] = useState(0);
  const segment = segments[index];
  if (!segment) return <p className="text-sm text-slate-500">No highlights to play.</p>;

  const atEnd = index >= segments.length - 1;
  return (
    <div className="space-y-3">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-950">
        <MuxVideo
          key={segment.eventId}
          gameId={segment.gameId}
          enabled
          eventId={segment.eventId}
          title={`${title} — ${STAT_LABELS[segment.statType] || segment.statType}`}
          className="h-full w-full"
          autoPlay
          onEnded={() => setIndex((current) => Math.min(current + 1, segments.length - 1))}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-slate-600">{`Clip ${index + 1} of ${segments.length}`}</span>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => setIndex(index + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

In `GameRecapPanel.jsx`, render the reel by provider:

```jsx
{
  highlights?.some((item) => item.videoProvider === 'mux') ? (
    <MuxHighlightReel highlights={highlights} title={videoTitle || 'Game highlights'} />
  ) : (
    <YouTubeHighlightReel highlights={highlights} title={videoTitle || 'Game highlights'} />
  );
}
```

- [ ] **Step 4: Run it and confirm it passes.** `pnpm --filter client test -- MuxHighlightReel`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/features/video client/src/features/games/components/GameRecapPanel.jsx
git commit -m "feat(video): add Mux highlight reel"
```

---

### Task 11: Pulse highlight cards on Mux

**Files:**

- Create: `client/src/features/video/hooks/useInViewAutoplay.js`
- Modify: `client/src/features/feed/components/posts/HighlightClipPostCard.jsx`, `FullScreenHighlightClipPost.jsx`
- Test: `client/src/features/feed/components/posts/HighlightClipPostCard.test.jsx`

**Interfaces:**

- Consumes: `MuxVideo` (Task 9), `isMuxHighlight` (Task 8), the Pulse `highlightClip` shape (Task 7).
- Produces: `useInViewAutoplay({ threshold }) → { containerRef, playerRef }`. Only one Mux clip plays at a time across the feed.

- [ ] **Step 1: Write the failing test:**

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { HighlightClipPostCard } from './HighlightClipPostCard';

vi.mock('../../../video/api/videoApi', () => ({
  videoApi: {
    getPlayback: vi.fn(() =>
      Promise.resolve({
        playbackId: 'pb-1',
        tokens: { playback: 'clip', thumbnail: 't' },
        expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      })
    ),
  },
}));
vi.mock('@mux/mux-player-react/lazy', () => ({
  default: forwardRef(function Stub({ playbackId }, ref) {
    return <div ref={ref} data-testid="mux-player" data-playback-id={playbackId} />;
  }),
}));

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});

describe('HighlightClipPostCard', () => {
  test('a Mux clip renders Mux Player, not a YouTube iframe', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HighlightClipPostCard
          highlightClip={{
            gameId: 'g1',
            eventId: 'e1',
            videoProvider: 'mux',
            videoUrl: null,
            videoTimestamp: 30,
            statType: 'FG3_MADE',
            playerName: 'Sam',
          }}
        />
      </QueryClientProvider>
    );
    expect((await screen.findByTestId('mux-player')).dataset.playbackId).toBe('pb-1');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `pnpm --filter client test -- HighlightClipPostCard`. Expected: FAIL.

- [ ] **Step 3: Implement `useInViewAutoplay.js`:**

```js
import { useEffect, useRef } from 'react';

// Feed autoplay for Mux clips: play muted while ≥ threshold visible, pause when
// scrolled away, and only ever one clip at a time (mirrors useYouTubeAutoplay).
let activePlayer = null;

export function useInViewAutoplay({ threshold = 0.5 } = {}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const player = playerRef.current;
        if (!player) return;
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          if (activePlayer && activePlayer !== player) activePlayer.pause?.();
          activePlayer = player;
          player.play?.()?.catch?.(() => {});
        } else {
          player.pause?.();
          if (activePlayer === player) activePlayer = null;
        }
      },
      { threshold }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (activePlayer === playerRef.current) activePlayer = null;
    };
  }, [threshold]);

  return { containerRef, playerRef };
}
```

- [ ] **Step 4: Branch both Pulse components.** In `HighlightClipPostCard.jsx`, keep the YouTube path exactly as it is, but move it into a local `YouTubeClipCard` component, since hooks can't be called conditionally. Add a Mux path:

```jsx
import { isMuxHighlight } from '../../../video/videoSource';
import { MuxVideo } from '../../../video/components/MuxVideo';
import { useInViewAutoplay } from '../../../video/hooks/useInViewAutoplay';

function MuxClipMedia({ highlightClip, title, threshold, className }) {
  const { containerRef, playerRef } = useInViewAutoplay({ threshold });
  return (
    <div ref={containerRef} className={className}>
      <MuxVideo
        ref={playerRef}
        gameId={highlightClip.gameId}
        eventId={highlightClip.eventId}
        title={title}
        className="h-full w-full"
        muted
        loop
        playsInline
        style={{ '--controls': 'none', '--media-object-fit': 'cover' }}
      />
    </div>
  );
}
```

`HighlightClipPostCard` then renders `<MuxClipMedia highlightClip={highlightClip} title={…} threshold={0.5} className="relative aspect-video w-full bg-slate-950" />` when `isMuxHighlight(highlightClip)`, and the existing YouTube markup otherwise. The caption block below stays shared. Make the same change in `FullScreenHighlightClipPost.jsx` with `threshold={0.6}` and `className="absolute inset-0"`; the label overlay stays shared. Export `MuxClipMedia` from `HighlightClipPostCard.jsx` so the full-screen component reuses it.

- [ ] **Step 5: Run the client tests and confirm they pass.** `pnpm --filter client test`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add client/src/features/video client/src/features/feed
git commit -m "feat(video): play Mux highlight clips in the Pulse"
```

---

### Task 12: Upload UI

**Files:**

- Create: `client/src/features/video/components/GameVideoUploader.jsx`
- Test: `client/src/features/video/components/GameVideoUploader.test.jsx`

**Interfaces:**

- Consumes: `videoApi.createUpload`, `videoApi.remove` (Task 8); `gamesApi.getById`; the `game.video` shape (Task 7).
- Produces: `GameVideoUploader({ gameId, video, onGameUpdated })`. `onGameUpdated(response)` receives a full `gamesApi.getById` response after removal and on every poll while the video is `uploading`/`processing`.

- [ ] **Step 1: Write the failing tests:**

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as UpChunk from '@mux/upchunk';
import { videoApi } from '../api/videoApi';
import { GameVideoUploader } from './GameVideoUploader';

vi.mock('../api/videoApi', () => ({ videoApi: { createUpload: vi.fn(), remove: vi.fn() } }));
vi.mock('../../games/api/gamesApi', () => ({
  gamesApi: { getById: vi.fn(() => Promise.resolve({ game: { video: null } })) },
}));
vi.mock('@mux/upchunk', () => {
  const listeners = {};
  return {
    __listeners: listeners,
    createUpload: vi.fn(() => ({
      on: (name, fn) => {
        listeners[name] = fn;
      },
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
    })),
  };
});

const file = new File(['x'], 'game.mp4', { type: 'video/mp4' });

describe('GameVideoUploader', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uploads the chosen file straight to the Mux URL and reports progress', async () => {
    videoApi.createUpload.mockResolvedValue({
      uploadUrl: 'https://upload.example',
      video: { status: 'uploading' },
    });
    render(<GameVideoUploader gameId="g1" video={null} onGameUpdated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Choose game video'), { target: { files: [file] } });

    await waitFor(() =>
      expect(UpChunk.createUpload).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://upload.example', file })
      )
    );
    UpChunk.__listeners.progress({ detail: 42.4 });
    expect(await screen.findByText('Uploading… 42%')).toBeTruthy();
    expect(screen.getByText(/keep this tab open/i)).toBeTruthy();
  });

  test('rejects a non-video file without calling the API', async () => {
    render(<GameVideoUploader gameId="g1" video={null} onGameUpdated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Choose game video'), {
      target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Choose a video file.')).toBeTruthy();
    expect(videoApi.createUpload).not.toHaveBeenCalled();
  });

  test('shows the processing state and the Mux error message', () => {
    const { rerender } = render(
      <GameVideoUploader gameId="g1" video={{ status: 'processing' }} onGameUpdated={vi.fn()} />
    );
    expect(screen.getByText(/processing/i)).toBeTruthy();
    rerender(
      <GameVideoUploader
        gameId="g1"
        video={{ status: 'errored', errorMessage: 'Unsupported codec' }}
        onGameUpdated={vi.fn()}
      />
    );
    expect(screen.getByText('Unsupported codec')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `pnpm --filter client test -- GameVideoUploader`. Expected: FAIL.

- [ ] **Step 3: Implement:**

```jsx
import { createUpload } from '@mux/upchunk';
import { useEffect, useRef, useState } from 'react';
import { gamesApi } from '../../games/api/gamesApi';
import { videoApi } from '../api/videoApi';

const MAX_BYTES = 20 * 1024 * 1024 * 1024;
const POLL_MS = 10_000;

export function GameVideoUploader({ gameId, video, onGameUpdated }) {
  const [phase, setPhase] = useState('idle'); // idle | uploading | paused
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const uploadRef = useRef(null);
  const status = video?.status ?? null;

  // While Mux is ingesting/processing, poll the game so the tracker picks up
  // the ready video without a reload.
  useEffect(() => {
    if (phase !== 'idle' || (status !== 'uploading' && status !== 'processing')) return undefined;
    const timer = setInterval(async () => {
      try {
        onGameUpdated(await gamesApi.getById(gameId));
      } catch {
        // transient; next tick retries
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, status, gameId, onGameUpdated]);

  useEffect(() => () => uploadRef.current?.abort(), []);

  async function startUpload(file) {
    setError('');
    if (!file?.type?.startsWith('video/')) return setError('Choose a video file.');
    if (file.size > MAX_BYTES) return setError('That file is over 20 GB.');
    try {
      const { uploadUrl } = await videoApi.createUpload(gameId);
      const upload = createUpload({ endpoint: uploadUrl, file, dynamicChunkSize: true });
      uploadRef.current = upload;
      setPhase('uploading');
      setProgress(0);
      upload.on('progress', (event) => setProgress(Math.floor(event.detail)));
      upload.on('error', (event) => {
        setPhase('idle');
        setError(event.detail?.message || 'The upload failed. Try again.');
      });
      upload.on('success', async () => {
        setPhase('idle');
        uploadRef.current = null;
        onGameUpdated(await gamesApi.getById(gameId));
      });
    } catch (err) {
      setError(err.message || 'Could not start the upload.');
    }
  }

  async function removeVideo() {
    setError('');
    try {
      await videoApi.remove(gameId);
      onGameUpdated(await gamesApi.getById(gameId));
    } catch (err) {
      setError(err.message || 'Could not remove the video.');
    }
  }

  if (phase !== 'idle') {
    return (
      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-[#1B4332] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm font-medium text-slate-800">
          {phase === 'paused' ? `Paused at ${progress}%` : `Uploading… ${progress}%`}
        </p>
        <p className="text-xs text-slate-500">Keep this tab open until the upload finishes.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (phase === 'paused') {
                uploadRef.current?.resume();
                setPhase('uploading');
              } else {
                uploadRef.current?.pause();
                setPhase('paused');
              }
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => {
              uploadRef.current?.abort();
              uploadRef.current = null;
              setPhase('idle');
            }}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {status === 'uploading' || status === 'processing' ? (
        <p className="text-sm text-slate-700">
          Processing the game video. This usually takes a few minutes.
        </p>
      ) : null}
      {status === 'errored' ? (
        <p className="text-sm text-red-600">
          {video.errorMessage || 'The video failed to process.'}
        </p>
      ) : null}
      {status === 'ready' ? (
        <button
          type="button"
          onClick={removeVideo}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Remove uploaded video
        </button>
      ) : (
        <label className="block">
          <span className="sr-only">Choose game video</span>
          <input
            type="file"
            accept="video/*"
            aria-label="Choose game video"
            onChange={(event) => startUpload(event.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run them and confirm they pass.** `pnpm --filter client test -- GameVideoUploader`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add client/src/features/video
git commit -m "feat(video): add resumable-in-session game video uploader"
```

---

### Task 13: GameTrackPage on Mux

**Files:**

- Modify: `client/src/features/games/pages/GameTrackPage.jsx` (lines cited are from commit `abf8922`; re-grep before editing)
- Test: `client/src/features/video/components/MuxVideo.test.jsx` (the media-element contract the tracker relies on), plus the manual tracker checks in Step 7

**Interfaces:**

- Consumes: `MuxVideo` (Task 9), `GameVideoUploader` (Task 12), `hasPlayableVideo`, `getHostedVideoStatus` (Task 8).
- Produces: no new exports. The tracker's existing contract (`videoCurrentTimeRef.current` in seconds, `setVideoPlaybackState('playing' | 'paused')`, `pauseVideo()`, `playVideo()`) works for both providers.

- [ ] **Step 1: Write the failing contract test** in `MuxVideo.test.jsx`:

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { MuxVideo } from './MuxVideo';

vi.mock('../api/videoApi', () => ({
  videoApi: {
    getPlayback: vi.fn(() =>
      Promise.resolve({
        playbackId: 'pb',
        tokens: { playback: 'p', thumbnail: 't', storyboard: 's' },
        expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      })
    ),
  },
}));
const play = vi.fn();
const pause = vi.fn();
vi.mock('@mux/mux-player-react/lazy', () => ({
  default: forwardRef(function Stub({ onTimeUpdate, onPlay, onPause }, ref) {
    useImperativeHandle(ref, () => ({ play, pause, currentTime: 12.6 }));
    return (
      <div data-testid="mux-player">
        <button type="button" onClick={() => onTimeUpdate?.({ target: { currentTime: 12.6 } })}>
          tick
        </button>
        <button type="button" onClick={() => onPlay?.()}>
          play
        </button>
        <button type="button" onClick={() => onPause?.()}>
          pause
        </button>
      </div>
    );
  }),
}));

describe('MuxVideo media contract', () => {
  test('forwards time and play/pause events and exposes play()/pause()', async () => {
    const onTimeUpdate = vi.fn();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const ref = { current: null };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MuxVideo
          ref={ref}
          gameId="g1"
          title="Game"
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
        />
      </QueryClientProvider>
    );
    await screen.findByTestId('mux-player');
    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('play'));
    fireEvent.click(screen.getByText('pause'));
    expect(onTimeUpdate.mock.calls[0][0].target.currentTime).toBe(12.6);
    expect(onPlay).toHaveBeenCalled();
    expect(onPause).toHaveBeenCalled();
    ref.current.pause();
    expect(pause).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it.** `pnpm --filter client test -- MuxVideo`. Expected: PASS, because `MuxVideo` forwards props and refs once enabled. Add `enabled` to the test and implement intent/visibility in all Task 9/11 call sites first; R7 requires disabled mounts to fetch nothing. If it fails, fix `MuxVideo` before touching the tracker: this contract is what the tracker relies on.

- [ ] **Step 3: Generalise "has video".** In `GameTrackPage.jsx`, import `hasPlayableVideo` and `getHostedVideoStatus` from `'../../video/videoSource'`. After the `game` binding, add `const hasVideo = hasPlayableVideo(game);`. Replace `game.videoUrl` / `game?.videoUrl` with `hasVideo` at every _conditional_ use (currently lines 1065, 1074, 3016, 3024, 3556, 3713, 3780, 3835, 4425, 4426). Leave the YouTube edit UI (4444, 4463, 4466) and `saveVideoUrl` as they are. On line 646, which runs before `game` is bound, change the deps to `[isDesktopLayout, data?.game?.videoUrl, data?.game?.video?.status]`.

- [ ] **Step 4: Provider-aware panel and controls.** Add `const muxVideoRef = useRef(null);` next to `videoIframeRef`. Replace `GameVideoPanel`:

```jsx
function GameVideoPanel({
  game,
  videoIframeRef,
  muxVideoRef,
  onMuxTimeUpdate,
  onMuxPlaybackState,
}) {
  // Always fills its container edge-to-edge (no card chrome / border radius) — both the
  // desktop left column and the mobile video-first view want the video as large as possible.
  if (getHostedVideoStatus(game) === 'ready') {
    return (
      <div className="h-full w-full overflow-hidden bg-slate-950">
        <MuxVideo
          ref={muxVideoRef}
          gameId={game.id}
          enabled
          title={game.title}
          className="h-full w-full"
          playsInline
          onTimeUpdate={(event) => onMuxTimeUpdate(event.target.currentTime)}
          onPlay={() => onMuxPlaybackState('playing')}
          onPause={() => onMuxPlaybackState('paused')}
          onEnded={() => onMuxPlaybackState('paused')}
        />
      </div>
    );
  }
  if (!game.videoUrl) return null;
  return <GameVideoEmbed ref={videoIframeRef} videoUrl={game.videoUrl} title={game.title} fill />;
}
```

Inside the page component, define the callbacks once:

```jsx
function onMuxTimeUpdate(seconds) {
  videoCurrentTimeRef.current = seconds;
}
function onMuxPlaybackState(next) {
  videoPlaybackStateRef.current = next;
  setVideoPlaybackState(next);
}
```

Update both `<GameVideoPanel …>` usages (~3558, ~3760) to pass `game={game} videoIframeRef={videoIframeRef} muxVideoRef={muxVideoRef} onMuxTimeUpdate={onMuxTimeUpdate} onMuxPlaybackState={onMuxPlaybackState}`. At the top of `pauseVideo()`:

```js
if (muxVideoRef.current) {
  muxVideoRef.current.pause();
  return;
}
```

At the top of `playVideo()`:

```js
if (muxVideoRef.current) {
  // play() rejects when the browser blocks autoplay; the scorekeeper can press play.
  muxVideoRef.current.play()?.catch?.(() => {});
  return;
}
```

The YouTube `onMessage` listener stays as it is. It ignores everything when no iframe is mounted.

- [ ] **Step 5: Upload control in the settings panel.** Directly above the existing "Add Video / Update Video" YouTube block (~line 4437), add:

```jsx
<div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
  <p className="text-sm font-semibold text-slate-900">Upload game video</p>
  <p className="mb-3 text-xs text-slate-500">
    Upload the full game to tag stats against it and turn plays into highlights.
  </p>
  {canUploadHostedVideo ? (
    <GameVideoUploader gameId={game.id} video={game.video} onGameUpdated={updateData} />
  ) : null}
</div>
```

`canUploadHostedVideo` must come from the resolved writable-access/hosted-upload allowance in R1/R2, not replay alone. `updateData` already merges a `getById` response into page state, so the panel switches to Mux Player as soon as the poll sees `ready`.

- [ ] **Step 6: Run the client suite and lint.** `pnpm --filter client test && pnpm --filter client lint`. Expected: PASS, with no new hook-dependency warnings beyond the ones already suppressed.

- [ ] **Step 7: Manual tracker check** with a real Mux dev environment (see Task 14):
  1. Upload a 2–5 minute clip from the tracker settings. Progress shows, then "Processing", then the tracker shows Mux Player without a reload.
  2. Press play: the game clock resumes. Pause: the clock pauses after ~1 s (`VIDEO_PAUSE_SETTLE_MS`).
  3. Tag a stat at a known time: the event's `videoTimestamp` matches the player time (±1 s).
  4. With "pause on entry" on, opening the event picker pauses the video, and recording resumes it.
  5. Resize across 1024 px: the panel remounts, and no stat is tagged with a stale time.
  6. A game with only a YouTube link still behaves exactly as before.

- [ ] **Step 8: Commit.**

```bash
git add client/src/features/games/pages/GameTrackPage.jsx client/src/features/video/components/MuxVideo.test.jsx
git commit -m "feat(video): track stats against Mux game video in GameTrackPage"
```

---

### Task 14: Setup guide, docs and end-to-end verification

**Files:**

- Create: `docs/mux.md`
- Modify: `docs/PROJECT-KNOWLEDGE.md` (game video and highlights sections, ~lines 174–213; the integrations list ~line 410), `docs/api.md` (the three new game routes and the webhook), `docs/mux-video-tracker.md`

- [ ] **Step 1: Write `docs/mux.md`** covering:
  1. Mux account, a separate environment for each database (**Development**, previews, **Production**). Cleanup may delete proven TSW-owned stale attempts, so never share credentials across databases. Include grace periods, attempt ownership and restore/reconciliation precautions (R3).
  2. An API access token with Mux Video read/write → `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`.
  3. A URL signing key → `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` (paste the base64 value exactly as shown).
  4. A webhook pointing at `https://<api-host>/api/v1/videos/webhooks/mux` → `MUX_WEBHOOK_SECRET`. For local development, tunnel `localhost:4000` (e.g. `cloudflared tunnel --url http://localhost:4000`) and register the tunnel URL in the Development environment.
  5. Env file locations (`env/server/.env.{development,production}`) and the matching Render variables.
  6. Cost guardrails: Basic quality, the `MUX_MAX_RESOLUTION_TIER` lever, the $20 credit, and the revisit triggers in `media-provider-analysis.md` §8.
  7. Compliance: DPA/transfer terms, footage publication permission, withdrawal, retention and durable deletion status (R3/R9).
  8. Operational runbook: quota/spend limits, disabled-hosting behavior, cleanup retries/reconciliation, failed-webhook alerts, and recovery after database restore.
  9. Verified player imports and the instant-clip timeline experiment in R10.

- [ ] **Step 2: Update `PROJECT-KNOWLEDGE.md` and `api.md`** so they describe the shipped behaviour: hosted vs YouTube precedence, the signed playback endpoint and its entitlement rules, the webhook, `Game.video`, and provider-aware highlights.

- [ ] **Step 3: Run the full gate.** `pnpm check-env && pnpm lint && pnpm test && pnpm build`. Expected: all pass.

- [ ] **Step 4: End-to-end verification in the Mux Development environment.** Use one real game recording (or a long sample) and record the results in the tracker:
  - Upload, then `ready`; tag 5 plays in the tracker.
  - GameDetailPage: full game plays; each recap clip plays only its ~10 s window (scrubbing can't leave the clip); the reel plays all clips in order.
  - Player profile pages (team and league): clips play.
  - Pulse: finishing a public league game with `AUTO_FEED_ENABLED=true` creates Mux clip posts, which autoplay muted one at a time.
  - Signed out: full-game playback returns 401; an unrelated authenticated viewer gets 404. Starter replay is enabled, but only an eligible viewer can get the full token. A currently permitted public Pulse clip still plays; withdrawn/private media cannot get new tokens.
  - Remove the video while it's processing: the asset is gone from the Mux dashboard after the `asset.ready` webhook (orphan rule).
  - Complete R1–R9 regression cases, including failure/restart cleanup, concurrent webhook/replacement, late-upload publishing, mixed-provider autoplay and token expiry.
  - Record the R10 signed-clip timeline experiment; do not assume `currentTime` starts at zero.
  - Measure the stored minutes for the test asset in the Mux dashboard and update the cost table in `media-provider-analysis.md` §4 if it differs.

- [ ] **Step 5: Commit.**

```bash
git add docs
git commit -m "docs(video): add Mux setup guide and document hosted game video"
```

---

## Phase 2 (separate plan, not in scope here)

Write a new plan when Phase 1 has shipped and either Instagram Reels need real files or the Mux bill passes the $20 credit:

1. **Clip assets for Pulse posts.** On `highlight_clip` creation for a Mux game, `POST /video/v1/assets` with `inputs: [{ url: 'mux://assets/<assetId>', start_time, end_time }]`, signed playback and a static MP4 rendition. Store `clipAssetId`/`clipPlaybackId` on the post, and have the playback endpoint prefer the clip asset. This lets the full game go cold and gives Instagram an MP4.
2. **Retention.** Delete full-game assets after a season (plan-dependent), keeping the clip assets. Requires item 1 first, and a backfill of clip assets for existing posts.
3. **Several videos per game** (per half or quarter), only if real uploads show people need it.
