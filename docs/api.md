# API Reference

Base path: `/api/v1`

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
- `GET /teams`
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
