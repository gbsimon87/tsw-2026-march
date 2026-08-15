# TSW Project Knowledge

Read this first in a new development or AI session. It describes the current
application, its important boundaries, and where to inspect next. Code is the
source of truth; update this file whenever a capability, route, data model,
permission rule, billing rule, or deployment model changes.

## Product

TSW (The Sporty Way) is a basketball stat-tracking and league-management app.
It supports:

- standalone teams, rosters, games, and live event tracking;
- leagues, seasons, teams, members, join requests, schedules, standings, and
  data-health checks;
- public game, team, league, and player pages;
- box scores, recaps, shot maps, replay, highlights, and shareable cards;
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

| Route                               | Purpose                                         | Access              |
| ----------------------------------- | ----------------------------------------------- | ------------------- |
| `/pulse`                            | Public feed; `/` and `/feed` redirect here      | Public              |
| `/home`                             | Player and game discovery                       | Public              |
| `/games/:gameId`                    | Game detail, box score, recap, replay           | Public              |
| `/league/:leagueSlug/*`             | Public league, standings, games, teams, players | Public              |
| `/teams/:teamId/*`                  | Public standalone team and player pages         | Public              |
| `/players/:userId`                  | Claimed league profiles grouped by user         | Public              |
| `/admin`                            | Team and league administration                  | Authenticated       |
| `/admin/leagues/:leagueId`          | League administration                           | Authenticated       |
| `/admin/leagues/:leagueId/schedule` | Bulk schedule builder                           | Authenticated       |
| `/games/:gameId/track`              | Full-screen live tracker                        | Authenticated       |
| `/my-sporty`                        | Current user's claimed league profiles          | Authenticated       |
| `/following`                        | Followed players, leagues, and league teams     | Authenticated       |
| `/pricing`                          | Pricing UI; redirects to `/pulse` in production | Non-production only |

`client/src/app/router/AppRouter.jsx` is the complete route source of truth.
Legacy `/leagues/...` admin URLs redirect to `/admin/leagues/...`.

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
| Games      | `Game` with embedded events and roster snapshots                                                                                                                               |
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
all dual-team games use roster snapshots. Mid-game roster additions therefore
update the durable roster and, when applicable, the game snapshot. New players
start on the bench. Completed games cannot accept roster additions.

Finishing a game freezes scores and summaries, updates league aggregates,
derives player milestones for league games, and may publish automatic feed
posts when `AUTO_FEED_ENABLED=true` and the league is public. Milestone posts
also require `AUTO_FEED_MILESTONES_ENABLED=true`.

Games are currently basketball-only and have an immutable format snapshot:
four quarters or two halves, a per-segment duration, and an overtime duration.
The default is four 10-minute quarters and five-minute overtimes. The server
owns a persisted, anchored countdown clock; it stops at zero and period/OT
transitions are manual. A tracker may also finish a running or paused quarter,
half, or overtime early when the app clock trails the real game. Starting the
clock requires at least one selected starter for each tracked team. A lineup
may contain fewer than five players; starting the game then requires explicit
confirmation in the tracker. Finishing a game early is allowed.
Every stat event stores an independent
period/clock snapshot in addition to its optional video timestamp.

## Leagues

Every league game, standing, player-stat record, export, schedule, and
data-health result is season-scoped. New league-game flows must resolve an
active `seasonId`.

League owners configure the default game format in Settings. Managers can read
but cannot edit it. Single-game creation can override the league default;
schedule-builder games always snapshot it without a batch override.

The schedule builder creates up to 200 scheduled games in one request. Replace
mode removes only event-free scheduled games in the active season. Data health
checks overdue/stuck games, missing box scores, roster and appearance gaps, and
missing public-page data. See [`api.md`](./api.md) for endpoints and
[`data-completeness.md`](./data-completeness.md) for the check list.

## Feed And Public Profiles

`Post` supports image, video, game-card, player-card, team-card, highlight, and
milestone posts. Manual post creation is entitlement-gated. Automatic posts
use a non-login system account and are restricted to finalized public-league
games. Making a league private removes its system-generated posts, not users'
manual posts.

Unified `/players/:userId` pages include only claimed player records from
public leagues. Standalone players cannot currently be claimed or included in
unified profiles. Follows to leagues that later become private remain stored,
but their profile links are withheld until the league is visible again.
League-player and unified player profiles include recent milestone history;
the full public list is cursor-paginated.

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

Production milestones start from new games onward. Games finalized before the
feature shipped have no ledger records and are deliberately left that way: the
backfill's prerequisite, `backfill-league-seasons.js`, deletes legacy
season-less `LeagueStandings` and `LeaguePlayerStats` rows, which is not an
acceptable risk against live league data. No backfill has been run in
production and none is planned.

`server/src/scripts/backfill-player-milestones.js` therefore remains a
development and seeding tool. It processes completed league games
chronologically with publishing disabled, is idempotent through the `dedupeKey`
unique index, and must run after the league-season backfill. Before considering
any production run, note that `--dry-run` only counts the games it would
replay: it exits before detection, so it reveals neither the milestones it
would create nor the two failure modes that are otherwise silent. Games
finalized before the box score was frozen on completion (OPT-012) have
`boxScore: null`, yield no milestones, and are still counted as processed;
and because `autoIndex` is disabled in production, a missing `dedupeKey` index
turns re-runs into duplicate inserts. Career-threshold totals also need
verifying as reconstructed per historical game rather than read from
present-day aggregates.

Deferred milestone work includes personal bests, standalone and team/league
milestones, season awards, and minutes-based milestones.

## Billing

Billing is attached to a `Team` or `League`. Plans are `starter`, `team_pro`,
and `league`; entitlements, not plan-name checks, should gate features. League
billing grants Team Pro features to that league's teams.

Checkout and customer management use Stripe-hosted Checkout and Billing Portal
URLs. Stripe webhooks are mounted with a raw body before JSON parsing and are
the authority for subscription state. Comped resources use
`billingSource: 'comp'` and must not be changed by Stripe events.

In `NODE_ENV=development`, starting a new league checkout provisions a local
comped league and redirects directly to league setup. Existing-resource billing
management and every production billing path continue to use Stripe.

The production pricing route is still disabled. See [`pricing.md`](./pricing.md)
and [`pricing-manual-actions.md`](./pricing-manual-actions.md).

## Integrations

- Cloudinary stores avatars, logos, feed media, and generated card assets.
- Resend sends verification, password-reset, contact, and billing emails.
- PostHog is off by default. Client tracking records explicit route events and
  internal user IDs only; autocapture and session replay are disabled.
- OpenAI game summaries are optional and time-limited; deterministic summaries
  remain available without an API key.

Environment validation is in `server/src/config/env.js` and
`client/src/lib/env.js`. A configured Stripe secret requires all Stripe price,
webhook, success, and cancel settings.

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

| Question                      | Source                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| HTTP endpoints                | [`api.md`](./api.md), `server/src/routes/index.js`, module route files                  |
| Client routes                 | `client/src/app/router/AppRouter.jsx`                                                   |
| Permissions                   | [`permissions.md`](./permissions.md), `leagues.service.js`                              |
| Game events and derived stats | `games.repository.js`, `games.service.js`, `stats.constants.js`                         |
| Billing and entitlements      | [`pricing.md`](./pricing.md), `billing.service.js`, `entitlements.service.js`           |
| Deployment and environment    | [`deployment-render.md`](./deployment-render.md), `render.yaml`, env validators         |
| Product backlog               | [`ideas.md`](./ideas.md)                                                                |
| Database maintenance          | [`mongodb-production-backup.md`](./mongodb-production-backup.md), `server/src/scripts/` |
