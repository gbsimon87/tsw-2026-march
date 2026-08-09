# API Reference

Base path: `/api/v1`. Source of truth: `server/src/routes/index.js` and each
module's `*.routes.js`.

Conventions:

- Mutating requests require the CSRF `x-csrf-token` header; most non-public routes
  require auth (cookie `accessToken` or `Authorization: Bearer`). See
  [`security.md`](./security.md).
- Error responses use `{ error: { message, details, requestId } }`.
- `/public/*` routes are anonymous-readable (personalized when a token is present).
- Authorization rules for league/team/game actions live in
  [`permissions.md`](./permissions.md).

## Health

- `GET /health`

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/avatar`
- `POST /auth/request-verification`
- `POST /auth/verify-email`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/google/start` _(requires Google OAuth configured)_
- `GET /auth/google/callback` _(requires Google OAuth configured)_
- `POST /auth/google/exchange` _(requires Google OAuth configured)_

### Avatar Upload (`POST /auth/avatar`)

- Requires authentication.
- Multipart form-data.
- Field name: `avatar`
- Accepted mime types: `image/jpeg`, `image/png`, `image/webp`

### Request Payloads

#### Register

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "supersecret123"
}
```

#### Request Verification

```json
{
  "email": "jane@example.com"
}
```

#### Verify Email

```json
{
  "token": "verification-token-from-email"
}
```

#### Forgot Password

```json
{
  "email": "jane@example.com"
}
```

#### Reset Password

```json
{
  "token": "password-reset-token-from-email",
  "newPassword": "newstrongpassword123"
}
```

## Analytics

- `POST /analytics/event`

## Teams

- `POST /teams`
- `GET /teams` _(keyset-paginated; returns `nextCursor`)_
- `GET /teams/:teamId`
- `PATCH /teams/:teamId`
- `GET /teams/:teamId/entitlements`
- `POST /teams/:teamId/logo`
- `DELETE /teams/:teamId/logo`
- `POST /teams/:teamId/players`
- `PATCH /teams/:teamId/players/:playerId`
- `DELETE /teams/:teamId/players/:playerId`

### Team Payload (`POST /teams`, `PATCH /teams/:teamId`)

```json
{
  "name": "TSW Varsity",
  "colors": ["#112233", "#d4af37"],
  "homeVenue": {
    "arenaName": "Scotiabank Arena",
    "addressLine1": "40 Bay St",
    "addressLine2": "",
    "city": "Toronto",
    "state": "ON",
    "postalCode": "M5J 2X2",
    "country": "Canada"
  },
  "players": [
    {
      "displayName": "Jane Doe",
      "jerseyNumber": 12,
      "position": "PG"
    }
  ]
}
```

- `colors` accepts up to 3 hex values.
- `homeVenue` is optional, but if present requires arena name, address line 1, city, state, postal code, and country.
- `position` supports `PG`, `SG`, `SF`, `PF`, `C`.

### Team Logo Upload (`POST /teams/:teamId/logo`)

- Multipart form-data
- Field name: `logo`
- Accepted mime types: `image/jpeg`, `image/png`, `image/webp`

### Team Logo Delete (`DELETE /teams/:teamId/logo`)

- Removes the team logo metadata and attempts Cloudinary cleanup.

### Entitlements (`GET /teams/:teamId/entitlements`)

Returns the feature entitlements for the specified team. Requires authentication.

## Games

- `POST /games`
- `GET /games`
- `GET /games/:gameId` _(public; authentication optional)_
- `PATCH /games/:gameId`
- `POST /games/:gameId/lineup`
- `POST /games/:gameId/events`
- `POST /games/:gameId/events/:eventId/insert-before`
- `PATCH /games/:gameId/events/:eventId`
- `DELETE /games/:gameId/events/:eventId`
- `POST /games/:gameId/finish`
- `DELETE /games/:gameId`

### Game Event Payload (`POST /games/:gameId/events`)

The payload shape varies by `statType`:

- **Tracked shot** (`FT_MADE`, `FT_MISS`, `FG2_MADE`, `FG2_MISS`, `FG3_MADE`, `FG3_MISS`): `playerId`, `zoneId`, `x`, `y` are **required**. Optional: `occurredAt` (ISO datetime), `teamSide` (`"home"` | `"away"`), `videoTimestamp` (number, seconds ≥ 0).
- **Non-shot** (`AST`, `OREB`, `DREB`, `STL`, `BLK`, `TOV`, `FOUL`): `playerId` required. `zoneId`, `x`, `y` optional. Optional: `occurredAt`, `teamSide`, `videoTimestamp`.
- **Substitution** (`SUB_IN`, `SUB_OUT`): `playerId` required. Optional: `relatedPlayerId`, `relatedTeamSide` (`"home"` | `"away"`), `zoneId`, `x`, `y`, `occurredAt`, `teamSide`, `videoTimestamp`.
- **Opponent** (`OPP_FT_MADE`, `OPP_FG2_MADE`, `OPP_FG3_MADE`, `OPP_REB`): `playerId` is **not accepted**. Optional: `zoneId`, `x`, `y`, `occurredAt`, `videoTimestamp`.

Example (tracked shot):

```json
{
  "playerId": "65f2b5e2c58f0db9b8b77d1a",
  "statType": "FG3_MADE",
  "zoneId": "WING_LEFT_3",
  "x": 18.4,
  "y": 78.1
}
```

### Set Lineup Payload (`POST /games/:gameId/lineup`)

```json
{
  "playerIds": ["id1", "id2", "id3", "id4", "id5"],
  "teamSide": "home"
}
```

- `playerIds` must contain exactly 5 player ID strings.
- `teamSide` is optional (`"home"` | `"away"`); used in dual-team tracking games.

### Update Game (`PATCH /games/:gameId`)

All fields optional; at least one must be provided: `title`, `opponent` (nullable string), `scheduledAt` (ISO datetime, nullable), `videoUrl` (YouTube URL, nullable), `initialActiveSide` (`"home"` | `"away"`).

### Update Event (`PATCH /games/:gameId/events/:eventId`)

All fields optional: `playerId`, `teamSide`, `statType`, `zoneId`, `x`, `y`, `videoTimestamp` (number ≥ 0, nullable).

### Insert Event Before (`POST /games/:gameId/events/:eventId/insert-before`)

Inserts a new event immediately before the referenced event. Accepts the same payload shapes as `POST /games/:gameId/events`.

### Delete Game (`DELETE /games/:gameId`)

Permanently deletes the game and all its events.

### `statType` values

Shooting (tracked team):

- `FT_MADE`
- `FT_MISS`
- `FG2_MADE`
- `FG2_MISS`
- `FG3_MADE`
- `FG3_MISS`

Opponent scoring:

- `OPP_FT_MADE`
- `OPP_FG2_MADE`
- `OPP_FG3_MADE`
- `OPP_REB`

Non-shooting stats:

- `AST`
- `OREB`
- `DREB`
- `STL`
- `BLK`
- `TOV`
- `FOUL`

Substitution:

- `SUB_IN`
- `SUB_OUT`

### `zoneId` values

- `PAINT`
- `MID_RANGE_LEFT`
- `MID_RANGE_RIGHT`
- `TOP_KEY`
- `CORNER_LEFT_3`
- `WING_LEFT_3`
- `WING_RIGHT_3`
- `CORNER_RIGHT_3`
- `BACKCOURT`
- `FREE_THROW_LINE`

### Coordinates

- `x` and `y` are normalized to `0..100` over the full-court SVG.
- `x=0` is the left sideline, `x=100` is the right sideline.
- `y=0` is the north/top baseline, `y=100` is the south/bottom baseline.

## Feed

- `GET /feed` _(public; auth optional)_
- `GET /feed/shareable/games`
- `GET /feed/shareable/players`
- `GET /feed/shareable/teams`
- `POST /feed/image` _(multipart; field `image`)_
- `POST /feed/video` _(multipart; field `video`)_
- `POST /feed/game-card`
- `POST /feed/player-card`
- `POST /feed/team-card`
- `POST /feed/highlight-clip`
- `DELETE /feed/:postId` _(creator only)_

Post creation requires auth and Pro-team entitlement (`assertFeedPostingAllowed`).
Image/video size limits come from `FEED_IMAGE_MAX_BYTES` / `FEED_VIDEO_MAX_BYTES`.

## Billing

- `POST /billing/checkout-session` _(legacy alias, kept for compatibility)_
- `POST /billing/team-checkout`
- `POST /billing/league-checkout`
- `POST /billing/customer-portal`
- `POST /billing/webhooks` _(Stripe signature-verified; mounted with a raw body **before** `express.json()`, so it is not under the JSON-parsed router)_

Checkout/portal endpoints require auth and return a hosted Stripe URL. `interval`
accepts `monthly` (default) or `season`. Entitlements and plan state are updated by
webhooks. See [`PROJECT-KNOWLEDGE.md`](./PROJECT-KNOWLEDGE.md) §6 for today's billing,
and [`pricing-overhaul/`](./pricing-overhaul/) for the planned redesign. (The former
`billing.md` and `stripe-development-setup.md` were removed 2026-07-16.)

## Contact

- `POST /contact` _(rate-limited to 5/hour via `contactLimiter`)_

## Leagues (admin, auth required)

Mounted under `/leagues`. Authorization per action is defined in
[`permissions.md`](./permissions.md).

- `POST /leagues`, `GET /leagues` _(keyset-paginated)_, `GET /leagues/my-profiles`
- `GET /leagues/:leagueId`, `PATCH /leagues/:leagueId`, `POST /leagues/:leagueId/archive`
- `GET /leagues/:leagueId/standings`, `GET /leagues/:leagueId/games`
- `POST /leagues/:leagueId/games/bulk` — Schedule Builder bulk create (see below)
- `GET /leagues/:leagueId/data-completeness` — Data health audit (see below)
- `POST /leagues/:leagueId/data-completeness/dismissals`, `DELETE /leagues/:leagueId/data-completeness/dismissals/:issueKey`
- `POST|DELETE /leagues/:leagueId/logo`
- `GET|POST /leagues/:leagueId/managers`, `DELETE /leagues/:leagueId/managers/:managerId`
- `POST|GET /leagues/:leagueId/teams`, `GET|PATCH /leagues/:leagueId/teams/:leagueTeamId`, `POST /leagues/:leagueId/teams/:leagueTeamId/archive`
- `POST|DELETE /leagues/:leagueId/teams/:leagueTeamId/logo`
- `POST /leagues/:leagueId/teams/:leagueTeamId/players`, `PATCH|DELETE /leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId`, `POST /leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId/unclaim`
- `GET /leagues/:leagueId/teams/:leagueTeamId/members`, `POST /leagues/:leagueId/teams/:leagueTeamId/managers`, `PATCH|DELETE /leagues/:leagueId/teams/:leagueTeamId/members/:memberId`
- Join requests: `POST|GET /leagues/:leagueId/teams/:leagueTeamId/join-requests`, and `POST .../join-requests/:requestId/{approve,reject,cancel}`

### `POST /leagues/:leagueId/games/bulk` — Schedule Builder

Creates a whole fixture list in one all-or-nothing request. Backs the
`/admin/leagues/:leagueId/schedule` builder page; see
[`schedule-builder/`](./schedule-builder/).

**Auth:** `assertLeagueManagerOrOwner` (league owner or active league manager).
Requires an **active season** — 400 otherwise.

Request:

```json
{
  "replaceExisting": false,
  "games": [
    {
      "homeLeagueTeamId": "…",
      "awayLeagueTeamId": "…",
      "scheduledAt": "2026-09-05T10:00:00.000Z",
      "venue": "Court 1"
    }
  ]
}
```

| Field                                   | Rules                                                  |
| --------------------------------------- | ------------------------------------------------------ |
| `games`                                 | required, 1–**200** rows                               |
| `homeLeagueTeamId` / `awayLeagueTeamId` | required; must differ; both must belong to this league |
| `scheduledAt`                           | required ISO-8601 datetime                             |
| `venue`                                 | optional, trimmed, ≤120 chars                          |
| `replaceExisting`                       | optional, defaults `false`                             |

Games are created with `status: 'scheduled'`, `gameContext: 'league'`,
`trackingMode: 'one_sided'`, the league's current `seasonId`, and a
`"{away} at {home}"` title. `trackedLeagueTeamId` defaults to the home team.

`replaceExisting: true` first deletes league games in the active season that are
**`scheduled` and carry no events** — completed and in-progress games are never
touched.

Response `201`:

```json
{ "created": 6, "replaced": 0, "games": [{ "id": "…", "status": "scheduled", "venue": "Court 1" }] }
```

Errors: `400` invalid payload / no active season / completed season / a team from
another league · `403` not a manager or owner · `404` league not found.

### `GET /leagues/:leagueId/data-completeness` — Data health

Audits the league's **current season** for incomplete data and returns issues
grouped by category. Read-only; backs the **Data health** tab on
`AdminLeaguePage`. See [`data-completeness/`](./data-completeness/).

**Auth (three tiers, enforced in the service):**

| Caller                        | Sees                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| League owner / league manager | Everything                                                        |
| Team manager                  | League-wide game issues + **only their own team's** roster issues |
| Anyone else                   | `403`                                                             |

**No active season is not an error.** The endpoint returns `200` with
`seasonId: null` and no categories — an admin who hasn't opened a season has
nothing wrong with their data.

Response `200`:

```json
{
  "seasonId": "…",
  "seasonName": "Spring 2026",
  "generatedAt": "2026-08-09T12:00:00.000Z",
  "counts": { "high": 3, "medium": 5, "low": 12, "dismissed": 2 },
  "categories": [
    {
      "key": "overdue_game",
      "label": "Overdue games",
      "severity": "high",
      "description": "Scheduled more than 48 hours ago but never started.",
      "items": [
        {
          "issueKey": "overdue_game:…",
          "label": "Hoops at Ballers",
          "detail": "Scheduled 3 days ago, never started",
          "href": "/admin/games/…",
          "dismissed": false
        }
      ]
    }
  ]
}
```

The nine checks, by severity — **high** means the standings are wrong until fixed:

| Check               | Severity | Fires when                                                      |
| ------------------- | -------- | --------------------------------------------------------------- |
| `overdue_game`      | high     | `scheduled` and more than **48h** past tip-off                  |
| `stuck_in_progress` | high     | `in_progress` and more than 48h past tip-off                    |
| `missing_box_score` | high     | `completed` with no events recorded                             |
| `no_appearances`    | medium   | active player, 0 appearances, **and** the team has played       |
| `roster_too_small`  | medium   | fewer than **5** active players (advisory — never blocks)       |
| `missing_jersey`    | low      | active player with no jersey number (`0` is valid, not missing) |
| `unclaimed_player`  | low      | active player with no claimed account                           |
| `no_venue`          | low      | **future** scheduled game with no venue                         |
| `no_logo`           | low      | team with no logo                                               |

The 48-hour grace period is what keeps the panel usable: without it, a freshly
built 60-game schedule would report 60 warnings on day one.

Errors: `403` not an owner, league manager, or team manager · `404` league not found.

### `POST /leagues/:leagueId/data-completeness/dismissals`

Marks an issue as acknowledged. Dismissed items stay visible in a collapsed
section — they are never hidden or deleted.

**Auth:** league owner or league manager only. A **team manager gets `403`** —
dismissal is a league-wide judgement. Requires an active season.

Request:

```json
{ "issueKey": "no_logo:507f1f77bcf86cd799439031", "note": "logo arriving later" }
```

| Field      | Rules                                                      |
| ---------- | ---------------------------------------------------------- |
| `issueKey` | required, `<checkType>:<24-char hex ObjectId>`, ≤200 chars |
| `note`     | optional, trimmed, ≤500 chars, defaults `null`             |

`issueKey` deliberately contains **no mutable data** — a rescheduled game keeps
the same key, so the dismissal survives. Dismissals are scoped to
`(leagueId, seasonId, issueKey)` with a unique index, so re-dismissing is
idempotent rather than an error. They persist for the season and reset naturally
next season.

Response `201`: `{ "issueKey": "…", "dismissed": true }`

Errors: `400` malformed `issueKey` / no active season · `403` not an owner or
league manager · `404` league not found.

### `DELETE /leagues/:leagueId/data-completeness/dismissals/:issueKey`

Restores a dismissed issue to the main list. Same auth as dismissing.

The `issueKey` contains a colon, so callers must `encodeURIComponent` it.

Response `200`: `{ "issueKey": "…", "dismissed": false }`

Errors: `400` no active season · `403` not an owner or league manager · `404`
league not found.

## Public routes (anonymous-readable)

- `GET /public/teams/explore`
- `GET /public/teams/:teamId`, `GET /public/teams/:teamId/players/:playerId`
- `GET /public/opponents/:opponentSlug`
- `GET /public/leagues`, `GET /public/leagues/:leagueSlug`
- `GET /public/leagues/:leagueSlug/standings`, `/games`, `/leaders`
- `GET /public/leagues/:leagueSlug/teams/:teamSlug`
- `GET /public/leagues/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId`
