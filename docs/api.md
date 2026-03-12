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
- `POST /teams/:teamId/players`
- `PATCH /teams/:teamId/players/:playerId`
- `DELETE /teams/:teamId/players/:playerId`

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
