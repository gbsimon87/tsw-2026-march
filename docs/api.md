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

### Sample Event Payload

```json
{
  "event": "button_clicked",
  "distinctId": "user-123",
  "properties": {
    "source": "dashboard"
  }
}
```
