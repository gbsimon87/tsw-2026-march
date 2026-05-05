# Roadmap

## Completed

- MERN monorepo baseline (`client` + `server`)
- Secure authentication baseline (email/password, Google OAuth, CSRF, rotating JWT cookies)
- Core deployment and environment scaffolding
- V1 backend domain scaffolding for teams and games
- V1 frontend routes/pages for team setup, teams management, game tracking, and box scores
- GameTrack full-court image tap flow with inferred 2PT/3PT, zone inference, and free-throw handling
- Court image calibration/debug overlay with draggable handles and calibration value output
- GameDetail shot map with made/missed markers, player + shot-type filters, zone overlay toggle, and zone results table
- Simplified GameDetail tabbed UI (`Recap`, `Stats`, `Replay`) with reduced redundancy
- Replay flow with sequential event playback, live-updating replay box score, and Pro-only gating
- Rebounds and assists tracked in live game flow and included across all box scores
- Opponent total scoring with final scoreline rendering across game detail, recap, and public surfaces
- Additional stat categories in the current model: steals, turnovers, fouls
- Starting five setup, on-court lineup tracking, and event-based substitutions in live tracking
- Optional per-game YouTube video URLs with embedded playback on game detail
- Full-screen tracking consolidation around on-court players, modal quick stats, and opponent rebound flow
- Reusable sortable stats table with pinned first column for horizontally scrollable stat views
- Public team page sortable season player table, public game lists, and links to player profiles
- Public player profile page with PPG/RPG/APG and sortable per-game stat logs
- Public opponent placeholder pages for grouped opponent-name viewing
- Homepage explore section with recent public games and team links
- Expanded multi-user seed data with 10 users, 10 teams, 100 players, and 200 completed games
- Public feed with authenticated posting, image uploads, shareable game/player/team cards, creator-only delete, and a floating compose modal flow
- Team billing foundation with pricing page, Stripe checkout, customer portal, webhook-driven entitlements, and billing success/cancel routes
- Browser print mode for game detail box scores
- Print-first box score polish for cleaner browser print-to-PDF output

## In Progress

- Teams and roster UX refinement
- Live game tracking UX polish from real-device/manual validation
- Billing reliability and deployment readiness in staging/production
- Expanded automated test coverage for teams/games workflows
- Documentation alignment for README, roadmap, and historical planning docs
- Feed UX polish beyond the floating composer flow
- Cloudinary setup/documentation follow-through in deployed environments

## Planned

- Season support and season-based reporting
- Opponent roster/player support beyond score totals
- Richer recap/reporting content and trend summaries
- Fantasy stat tracking
- Player image support from uploaded media or linked Google images
- Editing/replacing saved game video links after initial creation
- Time-synced game tracking from video playback
- Richer shot-zone analytics and trend summaries (heatmaps, efficiency overlays, splits)
- CSV/export pipelines beyond the current print mode
- Feed likes, reposts, comments, moderation, and richer creator profiles

## Ideas

- Multi-tenant organizations (coach/staff permissions)
- Team season dashboards and leaderboards
- Advanced reports and CSV export pipelines
- OpenAPI generation and API SDK automation

See also: `docs/product-roadmap.md`
