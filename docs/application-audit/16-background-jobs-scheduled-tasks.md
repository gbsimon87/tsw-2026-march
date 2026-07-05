# Background Jobs & Scheduled Tasks

> Part of the [Application Audit](./README.md) · July 2026

**No job system exists.** There is no node-cron, agenda, BullMQ, worker
process, or `setInterval` scheduler anywhere in the server. Everything runs
synchronously inside HTTP request handlers.

## What fills the gap today

| Concern            | Mechanism                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session cleanup    | MongoDB **TTL index** on `sessions.expiresAt`                                                                                                                                                                                                                                                                                    |
| Auth-token cleanup | TTL index on `authtokens.expiresAt`                                                                                                                                                                                                                                                                                              |
| AI game summaries  | Generated **inline in `POST /games/:gameId/finish`** (blocks the request up to 8s), guarded by a DB lock (`aiSummaryGenerationLockId`, `games.repository.js:270-305`). **The lock has no TTL/stale recovery** — a crash between claim and save permanently blocks regeneration; a persisted fallback summary also prevents retry |
| Cloudinary cleanup | fire-and-forget destroys inside delete handlers (errors swallowed)                                                                                                                                                                                                                                                               |
| Webhooks           | Stripe pushes; processed synchronously                                                                                                                                                                                                                                                                                           |
| Seeding            | manual scripts `server/src/scripts/seed.js`, `seed-we-ball-saturday.js`                                                                                                                                                                                                                                                          |

## Work that _should_ move to background execution

Ranked by value (all detailed in [30-optimisation-roadmap](./30-optimisation-roadmap.md)):

1. **AI summary generation** — return `finish` immediately, generate
   asynchronously (even a `setImmediate` fire-and-forget with the existing DB
   lock would do), and add lock expiry (e.g. claim only if `lockedAt` older
   than 2 minutes).
2. **Standings/stats materialisation** — recompute-on-write can run
   post-response (see [28-computation-optimisation](./28-computation-optimisation.md)).
3. **Video eager transcode** — `eager_async:true` + notification webhook.
4. **Email sends** (forgot-password, contact) — currently inline, adds Resend
   latency to user-facing responses.
5. **Orphaned Cloudinary asset reconciliation** — periodic sweep.

## Recommendation

At current scale, avoid new infrastructure: in-process async (fire-and-forget
with logging) + Mongo-based locks covers 1–4. If/when a queue is justified
(multi-instance deploys, retry semantics), BullMQ requires Redis — which would
then also serve caching ([27-caching-opportunities](./27-caching-opportunities.md)).
Render supports background workers and cron jobs natively (`render.yaml`).
