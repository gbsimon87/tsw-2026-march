# Roadmap

## Completed

- MERN monorepo baseline (`client` + `server`)
- Secure authentication baseline (email/password, Google OAuth, CSRF, rotating JWT cookies)
- Core deployment and environment scaffolding
- V1 backend domain scaffolding for teams and games
- V1 frontend routes/pages for team setup, game tracking, and box scores
- GameTrack full-court image tap flow with inferred 2PT/3PT, zone inference, and free-throw handling
- Court image calibration/debug overlay with draggable handles and calibration value output
- GameDetail shot map with made/missed markers, player + shot-type filters, zone overlay toggle, and zone results table
- GameDetail tabbed UI (`Box Score`, `Replay`, `Game Info`) to reduce page length and improve navigation
- Replay flow with sequential event playback and live-updating replay box score
- Rebounds and assists tracked in live game flow and included across all box scores
- Public team page aggregate box score and roster stat summaries

## In Progress

- Teams and roster UX refinement
- Live game tracking UX polish (event entry speed, error states)
- Expanded automated test coverage for teams/games workflows
- Documentation alignment for API and onboarding

## Planned

- Opponent totals or opponent roster support per game
- Additional basketball stats (steals, turnovers, fouls)
- Richer shot-zone analytics and trend summaries (heatmaps, efficiency overlays, splits)
- Export/shareable box score views

## Ideas

- Multi-tenant organizations (coach/staff permissions)
- Team season dashboards and leaderboards
- Advanced reports and CSV export pipelines
- OpenAPI generation and API SDK automation

See also: `docs/product-roadmap.md`
