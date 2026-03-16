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
- Reusable sortable stats table with pinned first column for horizontally scrollable stat views
- Public team page sortable season player table, public game lists, and links to player profiles
- Public player profile page with PPG/RPG/APG and sortable per-game stat logs
- Homepage explore section with recent public games and team links
- Expanded multi-user seed data with 10 users, 10 teams, 100 players, and 200 completed games
- Public feed with authenticated posting, image uploads, shareable game/player/team cards, creator-only delete, and a floating compose modal flow

## In Progress

- Teams and roster UX refinement
- Live game tracking UX polish (event entry speed, error states)
- Expanded automated test coverage for teams/games workflows
- Documentation alignment for API and onboarding
- Feed UX polish beyond the floating composer flow
- Cloudinary setup/documentation follow-through in deployed environments

## Planned

- Opponent totals or opponent roster support per game
- Additional basketball stats (steals, turnovers, fouls)
- Fantasy stat tracking
- Season support and season-based reporting
- Game summaries and richer recap content
- Player image support from uploaded media or linked Google images
- Embedded video playback, likely via YouTube iframe support
- Time-synced game tracking from video playback
- Richer shot-zone analytics and trend summaries (heatmaps, efficiency overlays, splits)
- Export/shareable box score views
- Feed likes, reposts, comments, moderation, and richer creator profiles

## Ideas

- Multi-tenant organizations (coach/staff permissions)
- Team season dashboards and leaderboards
- Advanced reports and CSV export pipelines
- OpenAPI generation and API SDK automation

See also: `docs/product-roadmap.md`
