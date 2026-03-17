# Product Roadmap: TSW 2026 March

## Vision

Provide a fast, reliable basketball stat tracking workflow for real games: create roster, track events live, and review accurate box scores immediately after the game.

## V1 Milestones

| Milestone | Scope                                                                    | Status      |
| --------- | ------------------------------------------------------------------------ | ----------- |
| M1        | Teams and roster management                                              | Complete    |
| M2        | Game lifecycle (create, track, finish)                                   | Complete    |
| M3        | Event-based shot tracking with court location (`zoneId`, optional `x/y`) | Complete    |
| M4        | Previous games list + box score views                                    | Complete    |
| M5        | Validation, tests, and onboarding docs hardening                         | In Progress |

## Current Product State

Shipped beyond the original milestone framing:

- opponent score totals and derived final scorelines
- steals, turnovers, and fouls in core stat summaries
- starting five selection, on-court lineup tracking, and event-based substitutions in live tracking
- full-screen tracking that only shows current on-court players, plus modal quick stats and opponent scoring
- explicit opponent rebound flow in follow-up prompts
- recap tab and recap card generation
- replay gating through team billing entitlements
- printable browser box score via game detail print mode with a simplified print-first layout
- public opponent placeholder pages
- Stripe checkout, customer portal, webhook handling, and post-checkout billing refresh flow

## Future Milestones

- Opponent support:
  - full opponent roster tracking
- Reporting:
  - season rollups
  - trend summaries
  - richer recap/reporting synthesis
- Additional stat categories:
  - any categories beyond the current scoring/rebound/assist/steal/turnover/foul model
- Visual shot chart analytics and trends
- Export/share:
  - CSV export
- Team management improvements:
  - season-level views
  - role-based access (coach/staff)

## Status Notes

- Auth is considered baseline complete and reused for all new basketball features.
- V1 remains intentionally narrow for speed: one tracked team per game, event-sourced scoring, and minimal UI complexity.
- Opponent support remains intentionally limited to score totals in the near term; opponent player tracking is not part of the current scope.
