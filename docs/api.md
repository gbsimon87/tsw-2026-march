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
- `POST /auth/request-verification`
- `POST /auth/verify-email`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/google/start`
- `GET /auth/google/callback`

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

## Games

- `POST /games`
- `GET /games`
- `GET /games/:gameId`
- `POST /games/:gameId/events`
- `DELETE /games/:gameId/events/:eventId`
- `POST /games/:gameId/finish`

### Game Event Payload (`POST /games/:gameId/events`)

```json
{
  "playerId": "65f2b5e2c58f0db9b8b77d1a",
  "statType": "FG3_MADE",
  "zoneId": "WING_LEFT_3",
  "x": 18.4,
  "y": 78.1
}
```

### `statType` values

- `FT_MADE`
- `FT_MISS`
- `FG2_MADE`
- `FG2_MISS`
- `FG3_MADE`
- `FG3_MISS`

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
