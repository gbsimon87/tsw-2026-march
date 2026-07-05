# Application Audit — TSW

Full performance & architecture audit, July 2026. Produced from a complete
codebase read (server + client), a live inspection of the dev MongoDB
(`tsw_2026_dev` on Atlas: collections, indexes, counts, explain plans), and
no code changes.

**Start here**: [01-architecture-overview](./01-architecture-overview.md) for
orientation, [30-optimisation-roadmap](./30-optimisation-roadmap.md) for the
prioritised action plan.

## TL;DR

TSW is a well-layered Express/Mongoose API + React/Vite SPA with clean module
boundaries and sensible auth/billing flows. Its defining performance
characteristics are: **all derived data (standings, stats, leaderboards) is
recomputed from raw game events on every read**, **the client has no cache and
no code splitting**, and **Cloudinary media is delivered completely
untransformed**. The five highest-value fixes: route code splitting,
Cloudinary `f_auto/q_auto` + lazy images, write-time materialisation of
standings/stats, React Query, and eliminating full-collection public scans.

## Documentation

| #   | Doc                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- |
| 01  | [Architecture Overview](./01-architecture-overview.md)                                                |
| 02  | [API Documentation](./02-api-documentation.md)                                                        |
| 03  | [Database Overview](./03-database-overview.md)                                                        |
| 04  | [Authentication Flow](./04-authentication-flow.md)                                                    |
| 05  | [Authorisation & Permissions](./05-authorisation-permissions.md)                                      |
| 06  | [User Roles](./06-user-roles.md)                                                                      |
| 07  | [Stripe Billing & Pricing](./07-stripe-billing-pricing.md)                                            |
| 08  | [Subscription Logic](./08-subscription-logic.md)                                                      |
| 09  | [Payment Webhooks](./09-payment-webhooks.md)                                                          |
| 10  | [Cloudinary Integration](./10-cloudinary-integration.md)                                              |
| 11  | [Media Storage](./11-media-storage.md)                                                                |
| 12  | [Image & Video Processing](./12-image-video-processing.md)                                            |
| 13  | [PostHog Analytics](./13-posthog-analytics.md)                                                        |
| 14  | [Feature Flags](./14-feature-flags.md) _(not present — gap doc)_                                      |
| 15  | [Environment Variables](./15-environment-variables.md)                                                |
| 16  | [Background Jobs & Scheduled Tasks](./16-background-jobs-scheduled-tasks.md) _(none exist — gap doc)_ |
| 17  | [Notifications & Email Flow](./17-notifications-email-flow.md)                                        |
| 18  | [Caching Strategy](./18-caching-strategy.md) _(current: none)_                                        |
| 19  | [Indexing Strategy](./19-indexing-strategy.md) _(with live DB data)_                                  |
| 20  | [Third-party Integrations](./20-third-party-integrations.md)                                          |
| 21  | [Deployment Notes](./21-deployment-notes.md)                                                          |
| 22  | [Known Technical Debt](./22-known-technical-debt.md)                                                  |

## Audit reports

| #   | Report                                                                         |
| --- | ------------------------------------------------------------------------------ |
| 23  | [API Audit](./23-api-audit.md)                                                 |
| 24  | [Database Audit](./24-database-audit.md)                                       |
| 25  | [Performance Audit](./25-performance-audit.md)                                 |
| 26  | [Cloudinary Optimisation](./26-cloudinary-optimisation.md)                     |
| 27  | [Caching Opportunities](./27-caching-opportunities.md)                         |
| 28  | [Computation Optimisation (read→write time)](./28-computation-optimisation.md) |
| 29  | [Frontend Optimisation](./29-frontend-optimisation.md)                         |
| 30  | [Optimisation Roadmap](./30-optimisation-roadmap.md) ← **action plan**         |

Related pre-existing docs in `/docs`: `architecture.md`, `api.md`,
`billing.md`, `permissions.md`, `security.md`, `deployment-render.md` — this
audit supersedes them where they overlap on performance topics.
