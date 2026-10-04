# Mux Game Video Tracker

Decision and reasoning: [`media-provider-analysis.md`](media-provider-analysis.md).
Step-by-step plan: [`superpowers/plans/2026-10-04-mux-game-video.md`](superpowers/plans/2026-10-04-mux-game-video.md).

**Review status, 4 October 2026:** Mux remains the chosen provider, but the plan
must incorporate R1–R9 before launch. No code fixes are complete. In particular,
Starter includes replay/highlights, so `canViewReplay` is neither a paid-upload
allowance nor viewer authorization.

Update this file as work lands: tick the box, add the commit or PR, and record
anything learned in **Notes**. Status values: `todo`, `in progress`, `blocked`,
`done`.

## Before launch (non-code)

| #   | Item                                                                                                   | Owner | Status | Notes                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| L1  | Create a Mux account with Development and Production environments                                      | Simon | todo   | Pay-as-you-go includes a $20/month credit                                                                         |
| L2  | Development credentials: API token, signing key, webhook (tunnel URL) in `env/server/.env.development` | Simon | todo   | Needed before Task 13's manual check                                                                              |
| L3  | Production credentials and webhook `https://<api-host>/api/v1/videos/webhooks/mux` set in Render       | Simon | todo   | Five `MUX_*` vars, all or none                                                                                    |
| L4  | Sign Mux's DPA; confirm UK transfer terms                                                              | Simon | todo   | The footage is mostly of minors                                                                                   |
| L5  | Write the retention and deletion policy for hosted game video (privacy notice)                         | Simon | todo   | The deletion path ships in Phase 1; automated retention is Phase 2                                                |
| L6  | Decide the hosted-upload allowance, quotas and spend ceiling                                           | Simon | todo   | Launch gate: `canViewReplay` is free on Starter; do not enable unrestricted billable uploads                      |
| L7  | Define full-game viewers and explicit public-highlight/footage publication permission                  | Simon | todo   | Default: authenticated game access for full games; permission/withdrawal rules for public clips                   |
| L8  | Assign takedown, cleanup-failure and spend-alert ownership                                             | Simon | todo   | Durable cleanup/reconciliation is Phase 1, automatic age-based retention is Phase 2                               |
| L9  | Agree token revocation window and video-replacement timeline policy                                    | Simon | todo   | 12 h/1 h bearer tokens remain usable until expiry or provider deletion; replacements may need timestamp remapping |

## Phase 1: build

| Task | Scope                                                                | Status | PR / commit | Notes                             |
| ---- | -------------------------------------------------------------------- | ------ | ----------- | --------------------------------- |
| 1    | Mux env config (all-or-nothing) + `render.yaml`                      | todo   |             |                                   |
| 2    | `Game.video` schema + `shared/gameVideo.js` helpers                  | todo   |             |                                   |
| 3    | Mux REST client, playback JWTs, webhook signatures                   | todo   |             |                                   |
| 4    | Upload + remove endpoints; Mux cleanup on game delete                | todo   |             |                                   |
| 5    | Mux webhook: state machine + orphan-asset cleanup                    | todo   |             |                                   |
| 6    | Signed playback endpoint (full game + instant clips)                 | todo   |             |                                   |
| 7    | Provider-aware game, highlight and Pulse payloads                    | todo   |             |                                   |
| 8    | Client video API, token hook, provider helpers                       | todo   |             |                                   |
| 9    | `MuxVideo` + `HighlightPlayer` on GameDetailPage and player profiles | todo   |             |                                   |
| 10   | Mux highlight reel                                                   | todo   |             |                                   |
| 11   | Pulse highlight cards on Mux                                         | todo   |             |                                   |
| 12   | Upload UI (`GameVideoUploader`)                                      | todo   |             |                                   |
| 13   | GameTrackPage on Mux Player                                          | todo   |             | Includes the manual tracker check |
| 14   | Setup guide, docs, end-to-end verification                           | todo   |             |                                   |

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

These are requirements to implement, not findings already fixed in production.
The plan's R1–R9 sections name files, behavior and regression cases.

| Review | Required change                                                                        | Tasks          | Status |
| ------ | -------------------------------------------------------------------------------------- | -------------- | ------ |
| R1     | Viewer authorization separate from Starter entitlements; resolve upload packaging      | 4, 6, 7, 13    | todo   |
| R2     | Atomic quotas, upload rate limits, spend controls and allowed-origin CORS              | 1, 3, 4, 12    | todo   |
| R3     | Durable cleanup, reconciliation, proven ownership and bulk-deletion coverage           | 2–5, 14        | todo   |
| R4     | Atomic identity-checked webhook/upload transitions and valid test ids                  | 2, 4, 5        | todo   |
| R5     | Live Pulse provider/timestamp resolution, timeline binding and late-upload publishing  | 2, 7, 8, 13    | todo   |
| R6     | Token renewal/invalidation, revocation policy, strict signing and webhook verification | 3, 6, 8, 9, 12 | todo   |
| R7     | Playback-intent token fetch and shared mixed-provider autoplay coordination            | 9–11           | todo   |
| R8     | Upload cancellation/polling recovery and tracker readiness/currentTime integration     | 9, 12, 13      | todo   |
| R9     | Footage publication/withdrawal policy and derivative deletion                          | 6, 7, 14       | todo   |

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
