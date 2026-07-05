# Third-party Integrations

> Part of the [Application Audit](./README.md) · July 2026

All integrations are gated on env presence and degrade gracefully in dev.
Deeper docs are linked per row.

| Service           | SDK/method                                                    | Entry points                                                                                                                                                                         | Doc                                                                   |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Stripe**        | `stripe@16`                                                   | `server/src/modules/billing/*`; webhook raw-mounted in `app.js:34-38`; client `@stripe/stripe-js`                                                                                    | [07](./07-stripe-billing-pricing.md) / [09](./09-payment-webhooks.md) |
| **Cloudinary**    | `cloudinary` SDK (server only)                                | `server/src/modules/feed/cloudinary.client.js` + feed/teams/leagues/auth services                                                                                                    | [10](./10-cloudinary-integration.md)                                  |
| **Resend**        | `resend` SDK                                                  | `server/src/services/email.service.js`                                                                                                                                               | [17](./17-notifications-email-flow.md)                                |
| **PostHog**       | `posthog-js` + `posthog-node`                                 | `client/src/lib/posthog.js`, `server/src/modules/analytics/`                                                                                                                         | [13](./13-posthog-analytics.md)                                       |
| **OpenAI**        | raw `fetch` to `https://api.openai.com/v1/responses` (no SDK) | `server/src/modules/games/gameSummaryAi.service.js` — model `OPENAI_GAME_SUMMARY_MODEL` (default gpt-5.4-mini), 8s abort timeout, called synchronously from `POST /games/:id/finish` | [16](./16-background-jobs-scheduled-tasks.md)                         |
| **Google OAuth**  | passport-google-oauth20                                       | `server/src/modules/auth/oauth.google.js`                                                                                                                                            | [04](./04-authentication-flow.md)                                     |
| **YouTube**       | iframe embeds only (no API key)                               | `client/src/features/games/components/GameVideoEmbed.jsx`, `client/src/features/games/youtube.js`; tracker reads currentTime via postMessage                                         | —                                                                     |
| **MongoDB Atlas** | mongoose 8                                                    | `server/src/config/db.js`                                                                                                                                                            | [03](./03-database-overview.md)                                       |

Not present: maps, search services, S3/AWS, Twilio, Firebase, push providers.

## Cross-integration risks

1. **OpenAI in the request path** — the only integration that blocks a
   user-facing request for seconds; move async.
2. **Stripe API version unpinned** + deprecated `current_period_end` top-level
   read.
3. **Cloudinary synchronous eager transcode** on video upload.
4. **Resend inline sends** on forgot-password/contact.
5. All four above share one fix pattern: respond first, integrate after
   ([16-background-jobs-scheduled-tasks](./16-background-jobs-scheduled-tasks.md)).
