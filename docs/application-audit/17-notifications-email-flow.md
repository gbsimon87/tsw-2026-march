# Notifications & Email Flow

> Part of the [Application Audit](./README.md) · July 2026

## Email

Single provider: **Resend** (`server/src/services/email.service.js`).

- `sendTemplateEmail`, `sendVerificationEmail`, `sendPasswordResetEmail`.
  From: `RESEND_FROM_NAME <RESEND_FROM_EMAIL>`.
- **Dev fallback**: when unconfigured, emails are logged instead of sent
  (`email.service.js:10-47`); production **hard-requires** the Resend env vars
  (`server/src/config/env.js:72-90`).
- No nodemailer/SMTP despite the env error message mentioning SMTP.

### Email triggers

| Trigger            | Endpoint                      | Notes                                                                                                                      |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Password reset     | `POST /auth/forgot-password`  | sent **inline** (Resend latency added to the response)                                                                     |
| Email verification | (dead path)                   | registration sets `emailVerified:true`; `request-verification` is a stub                                                   |
| Contact form       | `POST /contact` (5/h limiter) | sends to `CONTACT_EMAIL` inline; user-supplied name/message interpolated into HTML `<pre>` **without escaping** — sanitise |

There are no digest, marketing, or league-activity emails.

## Notifications

**No push, SMS, or in-app notification system exists.** The closest mechanism
is the **league join-request flow** (pending/approved/rejected states polled by
the admin UI — `AdminLeaguePage` requests tab) — state, not notification.

Users are not notified when: their join request is approved, they're added as
a manager, a game they played in is finished, or someone shares a highlight of
them. These are natural product gaps rather than technical debt; any future
implementation would need the background-job groundwork described in
[16-background-jobs-scheduled-tasks](./16-background-jobs-scheduled-tasks.md).

## Recommendations

1. Escape user content in the contact email HTML.
2. Move email sends off the request path (fire-and-forget + logging).
3. Remove or finish the email-verification dead path.
