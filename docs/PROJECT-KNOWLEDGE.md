# TSW Project Knowledge

Read this first in a new development or AI session. It describes the current
application, its important boundaries, and where to inspect next. Code is the
source of truth; update this file whenever a capability, route, data model,
permission rule, billing rule, or deployment model changes.

## Product

TSW (The Sporty Way) is a basketball stat-tracking and league-management app.
It supports:

- standalone teams, rosters, games, and live event tracking;
- optional browser-native voice commands for live basketball tracking;
- leagues, seasons, teams, members, join requests, schedules, standings, and
  data-health checks;
- recurring scrimmages with independent reusable pools, manually created weeks,
  fixed weekly colors, games with one to five players per side, signed profile
  claims, efficiency MVP, player video profiles and published weekly recap sharing;
- public game, team, league, and player pages;
- box scores, recaps, shot maps, replay, highlights, and shareable cards;
- linked YouTube game video and, in development behind kill switches, hosted
  game video on Mux (direct uploads, signed full-game playback and clips);
- The Pulse public feed, player discovery, and follows for users, leagues, and
  league teams;
- CSV exports for claimed league profiles, leagues, and league teams;
- resource-scoped Stripe subscriptions and entitlements;
- optional PostHog analytics, Cloudinary media, Resend email, and OpenAI game
  summaries.

Standalone games normally track one team's roster; the opponent is a label and
score. League games can track both teams.

## Repository

This is a pnpm workspace requiring Node 20 or newer.

| Area      | Stack                                         | Entry points                                                              |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `client/` | React 18, Vite, Tailwind, TanStack Query, Zod | `client/src/main.jsx`, `client/src/app/router/AppRouter.jsx`              |
| `server/` | Express, CommonJS, Mongoose, Zod, Pino        | `server/src/server.js`, `server/src/app.js`, `server/src/routes/index.js` |

The client is organized by `client/src/features/<domain>/`. Shared UI is in
`client/src/components/`; app composition, auth state, and routing are in
`client/src/app/`.

Server domains live in `server/src/modules/<domain>/` and usually follow:

```text
routes -> controller -> service -> repository
                validation ^
```

Controllers validate and shape HTTP responses. Services own business rules and
authorization. Repositories define Mongoose schemas inline and own data access.
Cross-domain utilities are in `server/src/services/`, `server/src/utils/`, and
`server/src/modules/shared/`.

## Main Product Routes

| Route                                         | Purpose                                               | Access            |
| --------------------------------------------- | ----------------------------------------------------- | ----------------- |
| `/pulse`                                      | Public feed; `/` and `/feed` redirect here            | Public            |
| `/home`                                       | Player and game discovery                             | Public            |
| `/home?tab=scrimmages`                        | Discover public recurring scrimmages                  | Public            |
| `/scrimmage/:scrimmageId`                     | Pool claims, seasons, sessions and MVP                | Visibility-scoped |
| `/scrimmage/:scrimmageId/players/:playerId`   | Scrimmage player stats, game history and video plays  | Visibility-scoped |
| `/scrimmage/:scrimmageId/sessions/:sessionId` | Weekly colors, games, stats and published recap       | Visibility-scoped |
| `/admin?tab=scrimmages`                       | Managed Scrimmages tab                                | Authenticated     |
| `/admin/scrimmage/:scrimmageId/*`             | Scrimmage administration, players and weekly sessions | Scrimmage manager |
| `/admin/scrimmages`                           | Create and administer recurring scrimmages            | Authenticated     |
| `/games/:gameId`                              | Game detail, box score, recap, replay                 | Public            |
| `/league/:leagueSlug/*`                       | Public league, standings, games, teams, players       | Public            |
| `/teams/:teamId/*`                            | Public standalone team and player pages               | Public            |
| `/players/:userId`                            | Claimed league profiles grouped by user               | Public            |
| `/admin`                                      | Team, league and scrimmage administration             | Authenticated     |
| `/admin/leagues/:leagueId`                    | League administration                                 | Authenticated     |
| `/admin/leagues/:leagueId/schedule`           | Bulk schedule builder                                 | Authenticated     |
| `/games/:gameId/track`                        | Full-screen live tracker                              | Authenticated     |
| `/my-sporty`                                  | Current user's claimed league and scrimmage profiles  | Authenticated     |
| `/following`                                  | Followed players, leagues, and league teams           | Authenticated     |
| `/onboarding`                                 | Post-signup role wizard; resumes from the user        | Authenticated     |
| `/pricing`                                    | Plans and pricing                                     | Public            |

`client/src/app/router/AppRouter.jsx` is the complete route source of truth.
Legacy `/leagues/...` admin URLs redirect to `/admin/leagues/...`.
Legacy `/scrimmages/...` URLs redirect to the matching canonical
`/scrimmage/...` or `/admin/scrimmage/...` route.

## Request And Session Flow

`client/src/lib/apiClient.js` sends requests to `VITE_API_BASE_URL` with
cookies. It attaches the double-submit CSRF token to mutations, performs one
deduplicated refresh after a 401, retries the request, and normalizes API
errors.

Authentication supports local email/password and Google OAuth. Local accounts
must verify their email. Access tokens are accepted from a cookie or bearer
header. Refresh tokens are hashed in `Session`; refresh rotates the session.
`AuthContext.jsx` owns client session state and clears private query data when
the authenticated user changes.

Mutating API requests require CSRF protection. The Google OAuth callback is the
exception. Error responses use:

```json
{ "error": { "message": "...", "details": {}, "requestId": "..." } }
```

## Authorization

Authorization is resource- and league-role-based, not global RBAC. Enforce it
in services; client checks only control the UI.

- A league owner controls the league and all its teams.
- A league manager controls the league and all its teams except owner-only
  actions.
- A team manager controls assigned teams and their rosters and games.
- Helpers and players have limited participation access.
- `GET /leagues/:leagueId` includes `viewerContext` for client permission UI.

Reuse the assertions in `leagues.service.js`; league ownership is separate from
`LeagueManager` membership and must be checked explicitly. See
[`permissions.md`](./permissions.md) for the action matrix.

## Data Model

Schemas are defined in repository files. Main models:

| Domain     | Models                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth       | `User`, `Session`, `AuthToken`                                                                                                                                                 |
| Teams      | `Team`, `TeamSeasonSummary`                                                                                                                                                    |
| Games      | `Game` with embedded events, roster snapshots, optional `videoUrl` (YouTube) and `video` (hosted Mux media)                                                                    |
| Scrimmages | `Scrimmage` (embedded seasons), `ScrimmagePlayer`, `ScrimmageSession`, `ScrimmageAcceptance`, `ScrimmageJoinRequest`                                                           |
| Video      | `VideoUploadAttempt`, `VideoCleanupJob`, `VideoWebhookEvent`, `VideoQuotaCounter`                                                                                              |
| Feed       | `Post`                                                                                                                                                                         |
| Follows    | `Follow`                                                                                                                                                                       |
| Milestones | `PlayerMilestone`                                                                                                                                                              |
| Leagues    | `League`, `Season`, `LeagueTeam`, `LeaguePlayer`, `LeagueTeamMember`, `LeagueJoinRequest`, `LeagueManager`, `LeagueStandings`, `LeaguePlayerStats`, `LeagueDataIssueDismissal` |

Important constraints:

- Game events are embedded in `Game`; box scores, recaps, replay, and shot maps
  derive from them.
- `Game.status` is `scheduled`, `in_progress`, or `completed`.
- League games persist `seasonId`. A league has at most one active `Season`.
- League teams, players, and memberships persist across seasons.
- Standings, league player stats, team season summaries, and completed-game
  summaries are materialized. Write paths trigger recomputation; reads can
  repair missing materialized data.
- `Game` uses optimistic concurrency; conflicting writes return 409.
- `Follow` is unique by follower, target type, and target ID. Target types are
  `user`, `league`, and `leagueTeam`.
- Data-health dismissals are unique by league, season, and issue key.

## Game Tracking

Stat types and court zones are defined in
`server/src/modules/shared/stats.constants.js`. Coordinates are normalized to
`0..100` over the court.

Standalone games use a live `Team.players` roster. League one-sided games and
all dual-team games use roster snapshots. A snapshot entry's `_id` is pinned to
the durable player's id (LeaguePlayer for league, `Team.players._id` for
standalone), so a player keeps one id for the whole fixture lifecycle — an id
saved before tip-off still resolves after the snapshot is frozen, and the id the
roster-add endpoint returns is the one the game exposes and the one a following
substitution must be written against. Mid-game roster additions therefore
update the durable roster and, when applicable, the game snapshot. New players
start on the bench unless the voice missing-jersey confirmation immediately
records the necessary substitution before its captured stat. Completed games
cannot accept roster additions.

Finishing a game freezes scores and summaries, updates league aggregates,
derives player milestones for league games, and may publish automatic feed
posts when `AUTO_FEED_ENABLED=true` and the league is public. Milestone posts
also require `AUTO_FEED_MILESTONES_ENABLED=true`.

Games are currently basketball-only and have an immutable format snapshot:
four quarters, two halves, or one scrimmage regulation period, a per-segment
duration, and an overtime duration.
The default is four 10-minute quarters and five-minute overtimes. The server
owns a persisted, anchored countdown clock; it stops at zero and period/OT
transitions are manual. A tracker may also finish a running or paused quarter,
half, or overtime early when the app clock trails the real game. Starting the
clock requires at least one selected starter for each tracked team. A lineup
may contain fewer than five players; starting the game then requires explicit
confirmation in the tracker. Finishing a game early is allowed.
Every stat event stores an independent
period/clock snapshot in addition to its optional video timestamp.

When a game has a video, the game clock follows it: pausing the video pauses game
time, and playing it resumes the clock the video itself paused. A clock stopped by
hand, or never started, is never restarted by the video, and any manual clock
command takes ownership back. Buffering and seeking are ignored, and a pause only
acts once it has settled, so a stuttering connection never moves game time.
Anything that blocks tracking — the event picker, the roster and bench-sub dialogs,
event editing, lineup setup and editing, the finish confirmation — also holds video
and clock until it closes, so a scorekeeper never has to rewind. That hold is
governed by the "Pause During Stat Entry" option in the tracker's Options tab; the
video-to-clock sync above is independent of it and applies whenever a video is
attached. Stat entry owns the clock while it runs, and the video sync stands down
for the duration so the two can never issue competing clock writes.

`GameTrackPage` provides optional, session-scoped voice tracking for basketball. The scorekeeper
enables it in Options, then a court tap captures the event location and starts one short browser
speech-recognition turn. Parsed commands reuse the existing event handlers and preserve the same
player, team side, location, clock, video, and court-layout payload as button entry. Voice covers
every statistical action in the live tracker, including one-team opponent +1/+2/+3 scoring and the
assist/opponent-rebound follow-ups. Existing attributed players must be active in the current
on-court lineup. With roster-management permission, an unknown spoken jersey number instead opens a
confirmation that durably adds the player, records the required substitution event or events, and
then records the captured stat. Unknown spoken names never create players. Recognition, parsing, or
cancelled-add failures retain the tapped location and open the normal button picker; uncertain writes
are not replayed.

The speech lifecycle and basketball grammar live under `client/src/features/games/voice/`, with UI
orchestration in `GameTrackPage` and `VoiceTrackingControl`. TSW does not store audio or transcripts
or include them in analytics, although the browser may process audio remotely. Voice requires a
secure context and supported browser and remains a progressive enhancement over the complete button
workflow. The command schema, examples, release checks, open questions, and deferred extensions are
maintained in [`superpowers/plans/2026-09-06-voice-tracking.md`](./superpowers/plans/2026-09-06-voice-tracking.md).

Completed games with entitled highlights expose a storage-free virtual highlight
reel on the game recap. The client selects up to five playable events,
deduplicates nearby timestamps from the same play, restores chronological order,
and advances between timestamp-bounded YouTube embeds or signed Mux instant
clips. Sharing uses the canonical `/games/:gameId?reel=1` page URL; TSW does not
generate a new video asset for the reel.

## Hosted Game Video (Mux)

Status on 5 October 2026: Phase 1 is implemented on `feat/media-provider-analysis`
(Tasks 5–14 still uncommitted). No live Mux upload or browser acceptance has been
run, and launch decisions (DPA, retention, quotas, revocation window) are open.
A code review on 5 October found no authorization bypass or token leak. All 23 of
its findings (V1–V23) are fixed. [`mux-video-tracker.md`](./mux-video-tracker.md)
is the status, review-findings and acceptance source; [`mux.md`](./mux.md) is
the setup and operations guide.

- **Provider rule**: a ready Mux video with a signed playback id and verified
  duration wins over `Game.videoUrl`; otherwise YouTube plays as before
  (`server/src/modules/shared/gameVideo.js`). Clients receive only provider,
  status, duration and a non-secret `version`; upload, asset, playback and
  generation ids stay server-side.
- **Timelines**: every event timestamp is bound to the recording it was taken
  against (`mux:<generationId>` or `youtube:<videoId>`). A replacement only keeps
  old highlights playable when the uploader confirms "same recording".
- **Uploads** (`POST /games/:gameId/video/uploads`) are browser-to-Mux direct
  uploads from the tracker's Options tab. They need `MUX_UPLOADS_ENABLED`, an
  operator grant on the League (`League.videoHosting`, set with
  `pnpm --filter server video:hosting`), a league game (scheduled games included, so a recording can be uploaded before tracking), writable
  access as league owner or active manager, an allowlisted Origin, a per-user
  rate limit and an atomic per-League quota (concurrency, creates/day, stored
  minutes). No billing plan grants hosting (`CAN_HOST_GAME_VIDEO` is reserved).
  Cancel and `DELETE /games/:gameId/video` work for owners/managers even on a
  lapsed League.
- **Playback** (`GET /games/:gameId/video/playback[?eventId=]`, `private,
no-store`) signs RS256 Mux JWTs on each request: 12 h for full games
  (authenticated, game access, replay entitlement) and 1 h for ±5 s event clips.
  Anonymous clip access requires `MUX_PUBLIC_CLIPS_ENABLED`, a live Pulse share
  of that game and event, a completed public League, a recorded footage grant
  and current marketing/player permission. Issued tokens cannot be revoked
  before expiry.
- **Webhook** `POST /api/v1/videos/webhooks/mux` is mounted with a raw body
  before JSON/CSRF, verifies the HMAC signature and 5-minute tolerance,
  deduplicates event ids, and settles ready/failed states in MongoDB
  transactions. **Hosted video therefore needs Atlas or a replica set.**
- **Cleanup**: provider deletion is a durable, lease-claimed `VideoCleanupJob`
  queued before media is detached (remove, replace, cancel, game delete). The
  API sweeps every five minutes when Mux is configured and reconciles stale
  attempts; `pnpm --filter server video:reconcile [--dry-run]` runs it manually.
  Ownership is scoped to a deployment label (`APP_ENV`/`NODE_ENV` plus database
  name; production requires `APP_ENV`). Before treating any Mux 404 as "gone",
  cleanup and recovery check that the credentials can see this deployment's live
  assets. Schedule rebuilds never delete games carrying hosted video, and
  deleting a single game is conditional on the video it read. Run
  `video:ensure-indexes` before enabling uploads (production has `autoIndex`
  off).
- **Pulse and profiles** resolve each highlight's current provider and
  timestamp from the live game in one batched projection per page, so legacy
  posts follow replacements. A newly ready upload reruns permitted automatic
  highlight publication, but each game publishes automatic highlights only once
  (`Game.autoHighlightsPublishedAt`).
- **Client** code is in `client/src/features/video/` (lazy
  `@mux/mux-player-react`, UpChunk uploader, token hook, shared playback
  coordinator so only one YouTube/Mux player plays at a time). Tokens are
  requested on play intent or Pulse visibility, kept in memory only, and renewed
  before expiry.

## Leagues

Every league game, standing, player-stat record, export, schedule, and
data-health result is season-scoped. New league-game flows must resolve an
active `seasonId`.

## Scrimmages

`server/src/modules/scrimmages/` and `client/src/features/scrimmages/` own recurring
series, reusable player pools, embedded seasons and manually created dated weekly
sessions. We-ball Wednesdays and We-ball Saturdays are independent series with
separate pools, claims and MVP standings. Scrimmages do not provision permanent
Team or League resources. Skipped weeks need no record; a season reset retains the
pool and previous seasons and requires all current-season weeks to be finished.

### Discovery, navigation and administration

Public series appear on `/home?tab=scrimmages`; mobile discovery tabs include
extra space beneath the text. `/admin?tab=scrimmages` is the Managed Scrimmages
tab, alongside the existing administration tabs. Series creation is available
at `/admin/scrimmages?create=1`.

Regular viewers use `/scrimmage/:scrimmageId`; managers use the protected
`/admin/scrimmage/:scrimmageId` routes, including matching `/players/:playerId`
and `/sessions/:sessionId` pages. Pages redirect to the appropriate public/admin
route while preserving filters. Legacy `/scrimmages/...` links redirect to these
canonical routes; API paths remain under `/api/v1/scrimmages`.

Series pages separate Sessions, Players and MVP, with Claims for admins and
Settings for the owner. The current open week and active tracker are featured;
season selectors expose previous seasons. Weekly pages separate Games, Players
and Results, adding Recap after publication. New Game / Resume game actions stay
above the tabs. Attendance and week creation forms open on request. Existing
participation terms appear in the explicit claim dialog or collapsed settings
editor, rather than expanding on every admin visit.

### Player pools, profiles and claims

Admins create profiles, rename them, deactivate/reactivate them, or import players
from leagues they own/manage and standalone teams they own. Search imports by
name and filter by source league/team. Already imported players, including
inactive and merged records, link to their retained profile instead of being
imported again. Each created/imported player has a durable scrimmage-specific
profile before claiming or playing; source league/team identities and statistics
stay in their original resource. Deactivation preserves historical snapshots.

Pool lists, standings, weekly colors, game box scores and My Sporty link to
scrimmage player profiles. Profiles show completed-game statistics, game history
and video plays with season/week filters. Made shots, missed shots and turnovers
have play-type filters and incremental loading. Clips reuse `HighlightPlayer`
with full-recording YouTube timestamps; missing video or timestamps show an
unavailable message. Regular viewers receive published-week stats and plays;
admins can preview completed games in draft weeks.

Users claim an existing pool profile by accepting the current versioned terms
and typing their full signed name. Admins approve/reject claims; approved
profiles appear in My Sporty. Source-account claims constrain who may claim an
imported profile. Terms default to series scope, with optional weekly acceptance
and per-week overrides. `ScrimmageAcceptance` stores the signed text, SHA-256
content version, signer, signature and time. Acceptance does not imply marketing
or footage consent.

### Weekly setup and game tracking

Weekly attendance is separate from the reusable pool. Each attending player has
one color for the entire week; colors lock once a game exists. Repeat last week
prefills editable active attendance, colors, scoring and durations, leaving the
new label, date and recording explicit. Attendance/colors can also be copied
separately. Attach the full weekly YouTube recording, including long sessions,
and select each game's start using seconds, minutes:seconds or
hours:minutes:seconds; Use current video position captures the tracker playhead.

Games reuse `GameTrackPage` and embedded Game events with
`gameContext: 'scrimmage'`, series/week/season IDs, stable pool-player roster
snapshots and two temporary colors. Select **one to five players per side**;
unequal roster sizes are allowed and there is no five-player minimum. Jersey
numbers can change between games and must be unique within a color; matching
numbers across colors are allowed. Core stat entry is field-goal makes/misses
and turnovers, supporting points, FG% and missed-shot MVP penalties. Events keep
full-video timestamps and independent game-clock/period snapshots; substitutions
and lineup tracking reuse the existing tracker.

Weekly scoring/durations are configurable and snapshotted per game. Defaults are
1 inside / 2 outside the arc, one four-minute regulation period and four-minute
overtime. Games finish manually: reaching five points or clock expiry does not
automatically end a game. Overtime is manual; stats remain recordable at zero.
Scoring timelines, replay, box scores and stat labels use the game's snapshot.

New Game pauses video/clock and opens empty roster selection; creating the next
game can finish the previous one. Resuming an existing game does not create a
new game. The Games navigator pauses playback and the running clock before
showing scores, statuses and full-video offsets. It opens earlier games for
corrections without finishing the current game. Playback and the clock must be
resumed explicitly after browsing; a failed pause prevents opening the navigator.

Tracking shows Saving, Saved and unconfirmed-save feedback. Failed stat writes
reconcile from the server where possible and are never replayed implicitly.
Confirmed appends save a local video checkpoint scoped to game/recording; the
last saved server event is the fallback. Reload/resume offers the checkpoint
without starting the game clock. Browser storage failures do not block tracking.

### Results, MVP and weekly recap sharing

Only completed games contribute. Weekly totals are scoped to that week; season
MVP uses pooled season totals, not an average of weekly scores. FG% is total
makes / total attempts, with no attempts displayed as `—`. Standings include
points, makes, attempts, misses, turnovers, games played and W–L. Starting players
and players who sub in count as appearances; unused bench players do not. Ties
count as draws with no win bonus or loss penalty.

Default MVP is `(points − misses − 2×turnovers + 2×wins − losses) / games played`.
Weekly eligibility is 3 games; season eligibility is 6 games across 2 weeks.
Weights and thresholds are configurable at series creation or for a new season
and remain snapshotted per season. Both tables show the formula and eligibility;
mobile cards show core stats, expandable supporting stats and remaining
eligibility progress. Provisional scores have no award rank. Eligible players
sort first, then by MVP, FG%, wins, fewer turnovers and name. Aggregates recompute
from events on reads, so corrections and deletions update historical totals.

Admins finish/review weeks, inspecting scores, unfinished games, missing video
and missing timestamps, then publish explicitly. Publication requires a finished,
nonempty week with all games completed; missing footage/timestamps are warnings.
Regular weekly/season standings, player stats/history and plays include published
weeks only. Existing game pages and box scores follow series visibility rather
than the weekly publication gate. Corrections after publication update results
immediately; finishing alone does not publish a week.

Published weeks have a Recap tab and View & share weekly recap action in Results.
The canonical recipient link is
`/scrimmage/:scrimmageId/sessions/:sessionId?tab=recap`, including when copied by
an admin. Recaps show the eligible weekly MVP (or no eligible player), completed
game count, core stats, formula and week-filtered player video links. They reuse
weekly standings, player profiles and the social `CopyButton`. Native/clipboard
sharing refreshes access, publication, privacy and totals first. Public weeks
can share recap text and a link; private weeks share only their protected link.
Draft or inaccessible weeks cannot be shared. Selectable link/text fields cover
browsers without clipboard support. Analytics reuse `share_initiated` /
`share_completed` with `target_type=scrimmage_recap` and
`source=scrimmage_session`, without player names, statistics or URLs.

### Permissions, duplicate identities and deployment

Owners configure visibility, terms, additional admins (existing accounts by
email) and new seasons. Owners/admins manage pools, claims, weeks and tracking.
Private series, sessions, profiles and games are readable only by admins and
approved members; other viewers receive 404. Mutations require authentication,
existing CSRF protection and service-level authorization. Scrimmage APIs use
`no-store` responses. Scrimmages currently have no Stripe subscription/capacity
policy and support YouTube only.

Players → Resolve duplicate profiles requires an explicit confirmation and records
an audited atomic identity map on `Scrimmage`. Original pool records, sources,
claims, rosters, events and timestamps remain intact. Reads combine aliases under
the retained profile across seasons; old links preserve filters, My Sporty uses
the retained identity, and new game snapshots inherit its approved account.
Merged duplicates cannot be reactivated or assigned again. Merges reject foreign
profiles, self-merges, conflicting accounts, open weekly attendance and profiles
rostered together in a game. Repeated merges flatten alias groups.

A series setup lease serializes merges, claim approvals, attendance edits and game creation. A
weekly creation/completion lease, idempotent request keys and a partial unique
Game index prevent simultaneous active games or duplicate retry-created games.
Ordinary `/games` creation cannot bypass the scrimmage attendance/color checks.

The model inventory is listed above; `Scrimmage` embeds seasons and merge audit,
`ScrimmagePlayer` holds durable pool identities, `ScrimmageSession` snapshots
attendance/settings and publication, and acceptance/join-request records retain
signatures and claim review. Shared `Game` holds scrimmage events and rosters.
See [`scrimmages.md`](./scrimmages.md) for the full workflow and API catalog.

Before production rollout, run `pnpm --filter server scrimmages:ensure-indexes`
with the intended environment to create declared collection and Game indexes.
Do not run `syncIndexes` on Game; it can drop unrelated indexes. Existing finished
weeks without `publishedAt` require publication before regular viewers see their
aggregates/plays. Live phone/desktop acceptance and a full two-hour YouTube
tracking session remain pending in the linked browser acceptance checklist.
`pnpm --filter server seed:scrimmages --dry-run` previews, and
`pnpm --filter server seed:scrimmages` adds, presentation fixtures through the
existing development-only `seed.js` safeguards. Fixture definitions are in
`server/src/scripts/seed-scrimmages.js`; full `seed` and additive `seed:demo`
also include them. Two public We-ball series each have four colors, 20 regulars,
two provisional guests, an inactive profile, previous/current seasons, six weeks
and 33 games. Published weeks populate weekly/season MVP and recap sharing;
a finished draft week demonstrates publication; an open week has a paused live
game. Approved/pending claims and optional existing league imports exercise
profiles, My Sporty and import markers. Reruns preserve existing IDs, edits,
credentials and saved week dates. See
[`demo-data-generation.md`](./demo-data-generation.md#we-ball-scrimmage-presentation)
for logins, commands, safeguards and the client presentation walkthrough.

Remaining feature ideas are listed under Scrimmages in [`ideas.md`](./ideas.md).

## League Configuration

League owners configure the default game format in Settings. Managers can read
but cannot edit it. Single-game creation can override the league default;
schedule-builder games always snapshot it without a batch override.

The schedule builder creates up to 200 scheduled games in one request. Replace
mode removes only event-free scheduled games in the active season. Data health
checks overdue/stuck games, missing box scores, roster and appearance gaps, and
missing public-page data. See [`api.md`](./api.md) for endpoints and
[`data-completeness.md`](./data-completeness.md) for the check list.

## Feed And Public Profiles

`Post` supports image, video, game-card, player-card, player-game-card,
team-card, highlight, and milestone posts. Manual post creation is
entitlement-gated. Automatic posts use a non-login system account and are
restricted to finalized public-league games. Making a league private removes its
system-generated posts, not users' manual posts.

`player_game_card` is one player's line from one **completed** game, as distinct
from `player_card`'s season averages. It is created only from the box score on
the game detail page (`POST /feed/player-game-card`), is deduped globally to one
post per (game, player) by two partial unique indexes — the same rule
`highlight_clip` applies per event, so a duplicate returns 409, not 500 — and
carries a denormalised `cardSnapshot` like the other card types. Because its
source is the frozen box score it has no live-resolve fallback; a stat
correction reaches an already-published card through
`refreshPlayerGameCardPostsForGame`, which rides the same post-response trigger
as the game-card refresh (`scheduleFeedCardRefreshForGame`).

Player photos on that card come from the avatar of the account that **claimed**
the player — TSW stores no player photo of its own, so unclaimed players get a
styled initials plate, and the snapshot's `imageFallback` field records which
was used so a team crest is never passed off as a face. `getGameForUser`
resolves those avatars in one `$in`, and only for a completed game, so the 15s
in-progress poll does not pay for a lookup it cannot use.

**Pulse media safety hold — 11 September 2026, 12:31 BST:** creation of new raw
image and video posts is temporarily disabled in both the client and API. The
Pulse composer offers only game, player, and team cards; existing image and
video posts remain readable. Authenticated requests to `POST /feed/image` and
`POST /feed/video` fail with 403 before multipart parsing or Cloudinary upload.
Do not re-enable either route until pending/approved/rejected moderation and
user reporting/operator review tools are implemented and verified. The release
boundary and re-enable checklist are in [`pulse-media-safety.md`](./pulse-media-safety.md).

Unified `/players/:userId` pages include only claimed player records from
public leagues. Standalone players cannot currently be claimed or included in
unified profiles. Follows to leagues that later become private remain stored,
but their profile links are withheld until the league is visible again.
League-player and unified player profiles include recent milestone history;
the full public list is cursor-paginated.

## External Social Publishing

Instagram publishing is being built as a disabled-by-default outbound adapter. A global
`platform_operator` can use `/admin/social/instagram` to connect one official professional account
through Instagram Login, store its long-lived credential encrypted, verify safe account metadata,
or disconnect it. Ordinary users and league/team admins cannot access the API or screen. The
foundation can also perform the Graph API container/publish sequence for a single image or Reel,
but no HTTP publishing action exists. Production use still requires a durable approval/job record,
stable public social assets, token renewal/rotation operations, and end-to-end testing against a
non-production account. AI is optional and is not part of the delivery path. See
[`instagram-integration/`](./instagram-integration/) for status, architecture, platform knowledge,
and the runbook.

## Player Milestones

Player milestones are derived automatically from finalized league games and
are public wherever the league is public. Standalone games and players are out
of scope. Private leagues retain milestone records, but anonymous reads return 404. A league-player profile exposes the five most recent milestones and a
total; the complete list is available from the cursor-paginated public
milestones endpoint. Unified player profiles combine claimed player records
from public leagues.

Milestone identity is career-in-league: claimed players use
`user:<claimedByUserId>` and unclaimed players use
`player:<leaguePlayerId>`. Claim and unclaim operations re-key the ledger;
dedupe collisions preserve the earliest achievement. The durable
`PlayerMilestone` ledger records the league and season, career and player
identity, milestone key/family/tier, value and display metadata, source game,
achievement time, optional feed post, and dedupe key.

Rules live in `server/src/modules/milestones/milestones.catalog.js` as pure
`(before, after, gameLine)` evaluations. The catalog contains:

- Career ladders for points (100/250/500/1000/2000/5000), rebounds and assists
  (100/250/500/1000), threes (25/50/100/250), steals (50/100/250), and blocks
  (25/50/100). If one game crosses several rungs, only the highest is awarded.
- Single-game double-doubles, triple-doubles, 30/40 points, 7/10 threes,
  6 steals, and 5 blocks. Only the highest applicable variant is awarded.
- First recorded game, first points, and first three. A debut requires a
  recorded stat line; being present on a roster is not enough.

Career thresholds and firsts dedupe by career plus milestone key. Repeatable
single-game feats also include the source game in their dedupe key. Detection
runs after league aggregates are recomputed, derives the pre-game total by
subtracting the frozen box-score line, and persists milestones independently
of feed publication.

Only feed-tier milestones can create Pulse cards. Publishing requires a public
league plus both `AUTO_FEED_ENABLED=true` and
`AUTO_FEED_MILESTONES_ENABLED=true`; at most `AUTO_MILESTONE_CAP` (default 2)
of the rarest eligible achievements are posted per game by the system user.
Making a league private removes automatic milestone posts but retains the
ledger. Editing a completed game removes invalid milestones and linked posts
and adds newly valid ledger records without retroactively publishing them.
An edit to an earlier game can shift the true threshold-crossing game; the
current targeted re-evaluation does not replay the whole career to reassign it.

`server/src/scripts/backfill-player-milestones.js` replays completed league
games chronologically with publishing disabled. It is idempotent through the
`dedupeKey` unique index and must run after the league-season backfill. It was
run against production on 2026-08-15, replaying 22 games across the two live
leagues and creating 114 ledger records; a verification re-run created none.
Because it publishes nothing, those records have no Pulse posts and will not
gain any.

Two failure modes are silent and worth checking before any future run. Games
finalized before the box score was frozen on completion (OPT-012) have
`boxScore: null` and yield no milestones, yet are still counted as processed —
12 of the 23 completed production games fall in this group and contributed
nothing to the 114. And because `autoIndex` is disabled in production, the
`dedupeKey` index does not create itself; it was added there explicitly through
`syncIndexes` before the backfill, and without it re-runs insert duplicates
rather than skipping. Note also that `--dry-run` exits before detection, so it
reports only the games it would replay and reveals neither of these.

`server/src/scripts/check-migration-state.js` is a read-only report covering
both of those conditions plus league-season migration state. Run it before and
after any production backfill.

Deferred milestone work includes personal bests, standalone and team/league
milestones, season awards, and minutes-based milestones.

## Billing

Billing is attached to a `Team` or `League`. The capacity plans are `starter`
(one free standalone Team), `team_extra` (£5/month for each additional
standalone Team), `league` (£29/month for 1–10 teams), and `league_plus`
(£49/month for 11–24 teams). All paid plans are monthly. League plans receive a
one-time 14-day trial; additional Teams do not. Every current Team feature is
available on every Team. Billing controls management capacity, not features.

Checkout and customer management use Stripe-hosted Checkout and Billing Portal
URLs. Stripe webhooks are mounted with a raw body before JSON parsing and are
the authority for subscription state. Comped resources use
`billingSource: 'comp'` and must not be changed by Stripe events.
The app passes a locked-down `STRIPE_PORTAL_CONFIGURATION_ID` for ordinary
Portal sessions and a separate `STRIPE_PORTAL_UPGRADE_CONFIGURATION_ID` only for
the explicit League Plus confirmation flow. Ordinary Portal sessions cannot
switch plans. Both League tiers promise the same 14-day trial, so a Portal
upgrade preserves the original trial end; after the trial, upgrades are applied
and prorated immediately.

Only `active` and `trialing` Stripe subscriptions grant paid management. A
cancel-at-period-end subscription remains manageable until Stripe ends it;
afterward, data stays readable but Team/League writes stop. Failed renewals stop
management. Checkout is idempotent, the success page verifies the exact owned
Checkout Session, League creation tolerates out-of-order events, and unknown
Stripe Prices fail closed. League upgrades are confirmed in Stripe and apply
immediately; trialing upgrades preserve the trial without an immediate charge,
while paid upgrades are prorated. Eligible downgrades are scheduled for the
next period.

In `NODE_ENV=development` without a Stripe secret, starting a new League
provisions a local comped League and redirects directly to setup. With a Stripe
test key present, local League Checkout uses Stripe test mode. Every deployed
billing path uses Stripe.

The capacity-pricing migration makes the oldest standalone Team for each owner
free, makes other standalone Teams paid-capacity, and grandfathers every
pre-launch League as complimentary so the three current production Leagues
continue unchanged. It requires an explicit `--dry-run` or `--apply`; applying
also requires `MIGRATION_CONFIRM_DB` to exactly match `MONGO_DB_NAME`.

Status on 11 September 2026: the full development Stripe checklist, including
failure recovery and all additional checks, passed. A targeted redeploy remains
for the audit's explicit trial-preservation setting, mobile billing feedback,
and customer-facing billing disclosures; the migration command guard is covered
by automated tests. The Pricing route is public in code and linked from
navigation. The seven-day first-payment refund policy is implemented in the
terms but still needs review and deployment. Production is not ready until live
Stripe/Render setup, the verified production backup and capacity migration, and
controlled live payments are complete.
[`stripe.md`](./stripe.md) is the only setup, testing, lifecycle, checklist,
manual-action, and launch-status guide.

## Integrations

- Cloudinary stores avatars, logos, feed media, and generated card assets.
- Mux hosts uploaded game video (signed playback only, no MP4 renditions). It
  is off unless all five `MUX_*` credentials are set, and uploads and public
  clips each have their own kill switch. See [`mux.md`](./mux.md).
- Resend sends verification, password-reset, contact, and billing emails, through its API
  rather than SMTP. Setup and outstanding DNS work: [`email-delivery.md`](./email-delivery.md).
- PostHog is off by default. Client tracking records explicit route events and
  internal user IDs only; autocapture and session replay are disabled.
- OpenAI game summaries are optional and time-limited; deterministic summaries
  remain available without an API key.

Environment validation is in `server/src/config/env.js` and
`client/src/lib/env.js`. A configured Stripe secret requires all Stripe price,
webhook, success, and cancel settings. Mux credentials are all-or-nothing, and
`MUX_SIGNING_PRIVATE_KEY` must be a base64-encoded PEM private key.

## Engineering Conventions

- Backend: validate with Zod in controllers, throw `ApiError` in services, wrap
  async route handlers, and use structured logging.
- Frontend: named exports, feature-local API modules, relative imports, Zod at
  boundaries, and accessible controls.
- Data fetching is mixed: TanStack Query is preferred for new read surfaces,
  but some admin pages still fetch imperatively and their tests may not provide
  a Query client.
- Two visual styles coexist: newer basketball/scoreboard pages and older
  slate-based admin pages. Match the surrounding surface when editing.
- Preserve established `OPT-###` comments that explain non-obvious performance
  or correctness choices.
- Run `pnpm check-env`, `pnpm check-secrets`, `pnpm lint`, `pnpm test`, and
  `pnpm build` before merge.

## Local And Deployment

```bash
pnpm install
pnpm dev       # client :5173, API :4000
pnpm seed      # destructive development reset
```

Render defines separate client/API services for `dev` and `main`. `dev`
auto-deploys; production deploys are manual. Secrets belong in Render, not
`render.yaml`. See [`deployment-render.md`](./deployment-render.md).

## Where To Look Next

| Question                      | Source                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP endpoints                | [`api.md`](./api.md), `server/src/routes/index.js`, module route files                                                                   |
| Client routes                 | `client/src/app/router/AppRouter.jsx`                                                                                                    |
| Permissions                   | [`permissions.md`](./permissions.md), `leagues.service.js`                                                                               |
| Game events and derived stats | `games.repository.js`, `games.service.js`, `stats.constants.js`                                                                          |
| Voice tracking                | [`superpowers/plans/2026-09-06-voice-tracking.md`](./superpowers/plans/2026-09-06-voice-tracking.md), `client/src/features/games/voice/` |
| Billing and entitlements      | [`stripe.md`](./stripe.md), `billing.service.js`, `entitlements.service.js`                                                              |
| Hosted game video (Mux)       | [`mux.md`](./mux.md), [`mux-video-tracker.md`](./mux-video-tracker.md), `server/src/modules/video/`, `client/src/features/video/`        |
| Deployment and environment    | [`deployment-render.md`](./deployment-render.md), `render.yaml`, env validators                                                          |
| Product backlog               | [`ideas.md`](./ideas.md)                                                                                                                 |
| Database maintenance          | [`mongodb-production-backup.md`](./mongodb-production-backup.md), `server/src/scripts/`                                                  |
| How the modules fit together  | [`codemap/`](./codemap/) — interactive map; open `codemap.html` in a browser                                                             |
