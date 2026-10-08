# Scrimmages

Scrimmages are recurring basketball sessions with reusable player pools, rather
than permanent teams. We-ball Wednesdays and We-ball Saturdays are separate
Scrimmage records, each with independent seasons, pools, claims and MVP standings.

## Workflow

1. Open Admin → Managed Scrimmages (`/admin?tab=scrimmages`). Choose New
   Scrimmage (`/admin/scrimmages?create=1`) to create a series,
   first season and Terms & Conditions. Public series appear in the Scrimmages
   tab on `/home`.
2. Create pool profiles, or import players from leagues you own/manage or
   standalone teams you own. Pool profiles retain their source identity. Imports
   do not claim another user's profile automatically. Search imports by player
   name and filter by source league or team. Existing imports show Already in this
   scrimmage and link to their profile, including merged profiles.
   Every import creates a distinct profile attached to this scrimmage, retaining
   its source league-player reference. The original league profile and stats
   remain in their league; scrimmage stats accumulate under the new pool ID.
3. Users select an existing pool profile, explicitly accept the displayed terms
   and enter their full name as a signature. An admin approves the claim. The
   approved scrimmage profile appears in My Sporty. Existing claims on source
   league/team players restrict who can claim an imported profile.
4. Manually create a dated weekly session. Select attendance and one color per
   player for that entire night. The reusable pool is independent of attendance.
   Repeat last week prefills active players, attendance, colors, scoring and
   durations for review and editing. Enter a fresh label, date and recording.
   Previous attendance/colors can also be copied separately. Skipped weeks require no record.
5. Attach the week's full YouTube video and choose scoring and durations. Default
   scoring is 1 inside / 2 outside the arc; regulation and overtime are 4 minutes
   each. Weekly settings are captured in each game.
6. Create a game by selecting two colors and one to five players per color.
   Jersey numbers can change every game and must be unique within each color;
   matching numbers across colors are permitted. Pick the start position in the
   full weekly video using hours:minutes:seconds, minutes:seconds or numeric seconds.
   From the tracker, Use current video position captures the current playhead.
   Start the game clock with the selected starting lineups.
7. Record field-goal makes/misses and turnovers through the existing court/video
   tracker. Events retain full-video timestamps and independent period/clock
   snapshots. A game never automatically finishes when reaching five points or
   when the clock expires. Overtime is manual; stats can still be attributed at
   zero after overtime. The tracker decides when to finish.
8. New Game pauses video and clock, opens empty roster selection and lets the
   tracker choose another full-video start position. Creating the next game
   manually completes the previous game. Resuming an existing game does not
   create another one. Games opens a navigator with scores, statuses and
   full-video start times. Opening it pauses playback and the running clock before
   showing the list. Select an earlier game to correct its events; this does not
   finish the current game. Resume playback and the clock explicitly when returning.
9. Finish & review the weekly session once its games have finished. In Results,
   review game scores, unfinished games, missing timestamps and missing recordings.
   Publish results explicitly to release weekly/season standings and player stats,
   game history and plays to regular viewers. Missing video data produces warnings,
   not a publication gate. Corrections after publication update results immediately.
   Start a new season from Settings after closing all open weeks. Previous seasons
   and player identities remain available.
10. Click a player in the series pool, standings, weekly color lists, game box
    scores or My Sporty to open `/scrimmage/:scrimmageId/players/:playerId`.
    Profiles exist before a user claims them or any games are recorded. They show
    completed-game stats, game history and player makes, misses and turnovers.
    Season/week filters scope both stats and plays. Video clips reuse the league
    highlight player around full-recording event timestamps; missing timestamps
    display an unavailable message. Play-type filters and incremental loading
    keep long sessions usable. Private profiles follow series visibility rules.

## Page organization and routes

The recurring scrimmage opens on Sessions, with separate Players and MVP tabs.
Admins also have Claims, plus Settings for the owner. Week creation opens only
when requested. The latest open session is featured with Resume tracking when a
current game exists; earlier weeks are listed below and the season selector
provides access to previous seasons. Weekly pages have Games, Players and Results
tabs, with New Game / Resume game visible above them. Attendance editing opens
on request inside Players. Game cards link directly to their YouTube offsets.
Players open the claim dialog to read and sign participation
terms; admins edit existing terms in a collapsed section in Settings.

Public pages use `/scrimmage/:scrimmageId`, with `/players/:playerId` and
`/sessions/:sessionId` beneath it. Managers use the matching protected
`/admin/scrimmage/:scrimmageId` routes. The pages redirect according to the
viewer's permission while preserving query filters. Previous `/scrimmages/…`
links redirect to the canonical routes. API endpoints retain `/scrimmages`.

## Weekly recap sharing

Published weeks have a Recap tab, also reachable through **View & share weekly
recap** in Results. The recap shows the eligible weekly MVP (or an explicit
no-eligible-player message), completed game count, all weekly player statistics,
MVP formula and eligibility, and links to player video plays filtered to that week.
No recap is available for draft weeks, including admin previews.

The canonical shared link is
`/scrimmage/:scrimmageId/sessions/:sessionId?tab=recap`; admin links use this same
public route for recipients. Existing session and player APIs enforce visibility
and publication, so sharing does not create a separate public copy or change
access. Corrections update the linked recap immediately.

Use the native Share weekly recap button when supported, or Copy recap link.
Public scrimmages also offer selectable, copyable recap text with core stats and
the results/video-plays link. Private scrimmages share only the protected link;
recipients must be admins or approved members. Link/text fields remain selectable
when clipboard APIs are unavailable. Native sharing and clipboard copying re-read
access, publication, privacy and totals before sharing, and refuse unpublished or
inaccessible weeks. The existing social `CopyButton` supplies clipboard feedback;
weekly aggregates and player video profiles are reused rather than duplicated.

## Scoring

For a player, let P be points, M missed field goals, T turnovers, W wins,
L losses and G completed games played. The default weekly formula is:

```text
Weekly MVP = (P − M − 2T + 2W − L) / G
```

The season formula uses the same expression with **season totals**. It divides
the total contribution across all weekly sessions by the total games played;
it does not average weekly MVP scores. Each series has independent standings.

Weekly eligibility is at least 3 games. Season eligibility is at least 6 games
across 2 weekly sessions. Below these thresholds scores are displayed as
provisional, without an award rank. Admins can select different weights and
thresholds when creating a series or starting its next season. Each season
captures its formula; historical seasons do not change when a new one starts.
The formula and eligibility thresholds are printed below both tables.

FG% = 100 × total makes / total attempts, with no attempts displayed as `—`.
Running FG% is calculated from pooled makes and attempts. Points, makes,
attempts, misses, turnovers, games and W–L are available in the tables.
Game results, the scoring timeline, replay box scores and stat labels use the
game's captured scoring rules, including weeks with custom point values.

Starting players count as appearances even with no stat event. A player who
subs in also counts; a player listed on a bench without playing does not.
Each appearance receives the game's team result. A manually finalized tied
game counts as a draw, with no win bonus or loss penalty.

Only completed games contribute. Regular viewers only receive stats and player
plays from published weekly sessions; admins can preview completed games in draft
weeks. Mobile MVP cards prioritize points, FG%, turnovers and MVP with expandable
supporting stats. Provisional entries explain the remaining games/weeks required.
Aggregation replays events on reads, scoped by
weekly session or series plus season, so corrections and deletions update
standings without stale materialized totals. Eligible players sort before
provisional players, then by MVP, FG%, wins, fewer turnovers and name.

## Models and permissions

- `Scrimmage`: owner, additional admins, visibility, versioned terms, embedded
  seasons, active season and audited player identity merges. Pool membership persists across season resets.
- `ScrimmagePlayer`: durable series-specific identity, optional source league or
  standalone player, approved user link and active flag. Deactivation does not
  delete historical game snapshots.
- `ScrimmageSession`: dated week, season, attendance/color snapshots, terms,
  YouTube video, scoring, durations, status, publication timestamp/admin and
  game-creation lease.
- `ScrimmageAcceptance`: authenticated signer, full signed terms text, SHA-256
  content version, signed name, acceptance time and optional weekly scope.
- `ScrimmageJoinRequest`: existing profile claim, user, acceptance and review.
- `Game`: `gameContext: 'scrimmage'`, dual color participants, series/week/season
  IDs, request key, scoring snapshot, video offset and stable roster IDs.

Owners configure visibility, terms, additional admin emails and new seasons.
Owners/admins manage pools, approve claims, create weekly sessions and track or
correct games. Private series are readable by those admins and approved members;
anonymous visitors and other users receive 404. Mutations use existing auth and
CSRF middleware and enforce permissions in the services.

Terms are required to claim a profile. Default scope is the recurring series;
admins may require a separate signature every week or override a particular
week's terms. Acceptance is not an implied marketing or footage consent. A
pending claim must reference the current series terms before it can be approved.
The app records typed signatures; it does not integrate an external e-signature
provider.

Two tracker requests cannot create simultaneous games in a week. A short
database lease serializes creation/completion; a unique request key makes
network retries idempotent. The client resets tracker state per game and opens
the same YouTube recording at the selected offset. Weekly colors lock once any
game is created. Players do not move between colors within the week.
An additional partial unique Game index permits at most one active game per
weekly session, including if a creation lease expires while a worker is delayed.

Scrimmages currently have no Stripe subscription/capacity policy and do not
provision permanent Team or League resources. Only YouTube is supported here;
the existing league-only Mux upload rules are unchanged.

## Tracking recovery and duplicate identities

The scrimmage tracker shows Saving, Saved and an unconfirmed-save state. Failed
stat writes reconcile from the server where possible and are never replayed
implicitly. The user checks the event list before entering the stat again.
Confirmed appended stats save their video position locally, scoped to the game
and recording. On return, a resume dialog offers that position; the last saved
server event is a fallback when no valid local checkpoint exists. Resuming video
does not operate the game clock. Browser storage failures do not prevent tracking.

Players → Resolve duplicate profiles lets an admin select a duplicate and the
profile to keep, review the names, and explicitly acknowledge that they represent
the same person. One optimistic-concurrency save records an audited identity map
on Scrimmage. Original pool records, source references, approved user links, claims,
rosters, events and video timestamps remain intact. Reads combine aliases under
the retained profile across seasons. Old profile links redirect while preserving
filters, My Sporty uses the retained identity, and new game snapshots inherit the
approved user from the identity group. Previously merged records are excluded
from the selectable pool and cannot be reactivated or assigned again.

Merges reject self-merges, foreign profiles, conflicting linked/source accounts,
profiles used in open weekly attendance, and profiles rostered together in the
same game. Repeated group merges flatten old aliases to the new retained profile.
A short series setup lease serializes merges, claim approvals, attendance edits and game creation.

## API

All paths are under `/api/v1/scrimmages`.

| Method      | Path                                   | Purpose                                                        |
| ----------- | -------------------------------------- | -------------------------------------------------------------- |
| GET         | `/`                                    | Public recurring series                                        |
| GET         | `/managed`                             | Current user's administered series                             |
| GET         | `/my-profiles`                         | Approved profiles and current season stats                     |
| POST        | `/`                                    | Create series and first season                                 |
| GET / PATCH | `/:id`                                 | Read / owner settings; GET accepts `seasonId`                  |
| GET         | `/:id/players/:playerId`               | Player stats and video plays; optional `seasonId`, `sessionId` |
| GET         | `/:id/import-options`                  | Players from caller's managed resources                        |
| POST        | `/:id/players`                         | Add/import pool player                                         |
| PATCH       | `/:id/players/:playerId`               | Rename or activate/deactivate pool player                      |
| POST        | `/:id/join`                            | Sign terms and request existing profile claim                  |
| GET         | `/:id/join-requests`                   | Admin pending claims                                           |
| PATCH       | `/:id/join-requests/:requestId`        | Approve/reject claim                                           |
| POST        | `/:id/seasons`                         | Owner starts next season                                       |
| POST        | `/:id/sessions`                        | Create dated week                                              |
| GET         | `/:id/sessions/:sessionId`             | Games and weekly standings                                     |
| PATCH       | `/:id/sessions/:sessionId/assignments` | Edit colors before games exist                                 |
| POST        | `/:id/sessions/:sessionId/terms`       | Sign weekly terms                                              |
| POST        | `/:id/sessions/:sessionId/games`       | Create game, optionally finishing previous                     |
| POST        | `/:id/sessions/:sessionId/finish`      | Finish week after games                                        |

Additional admin endpoints:

- `POST /:id/sessions/:sessionId/publish`: publish a finished, nonempty week after
  verifying every game is completed; saves publication time and admin identity.
- `POST /:id/players/:playerId/merge`: combine a duplicate into `toPlayerId` with
  `confirmed: true`; preserves original records and enforces identity conflicts.

Game reads and tracking commands use the existing `/games/:gameId` endpoints.
The ordinary game creation endpoint cannot create scrimmage games; creation
must validate the weekly attendance and color assignments through this domain.

## Deployment

No destructive data migration is needed. Existing finished weeks without a
publication timestamp now await admin publication before their standings and
player plays appear to regular viewers. Production disables Mongoose `autoIndex`:
create the new scrimmage collection indexes and the added Game indexes before
using the feature, particularly the unique `(scrimmageSessionId,
scrimmageRequestId)` index and the unique per-series source/user indexes.
Do not use `syncIndexes` against Game: it can drop unrelated live indexes.
The explicit `scrimmages:ensure-indexes` command creates declared indexes only.
No production data or subscription changes are performed by development/tests.

```sh
pnpm --filter server scrimmages:ensure-indexes
```

Run the command with the intended environment configuration before enabling
scrimmages in production. The feature has been validated with automated service,
HTTP route and UI tests plus lint/build checks. Live browser acceptance and a full
two-hour YouTube tracking session still need validation in the running app.

## Browser acceptance checklist

A live two-hour YouTube run remains pending. No browser tool was available in the
implementation session. Automated checks cover long video offsets, confirmed
save checkpoints, reload/resume, failed stat writes without duplicate replay,
publication visibility and corrections, and alias aggregation across weeks.

In the running app, verify on both phone and desktop:

1. Open the current week, resume tracking, and enter a game offset near two hours.
2. Record a make, miss, turnover and substitution, then verify the player clips.
3. Refresh and resume from the confirmed position without starting the clock.
4. Interrupt connectivity during a stat save; check the reconciled event list
   before retrying and verify there is exactly one event.
5. Finish and review the week, correct an event, and publish. Compare admin previews
   with a regular user's weekly/season standings and player plays.
6. Combine eligible duplicate profiles after closing their weeks; verify old links,
   source references, the approved account and historical totals still resolve.
