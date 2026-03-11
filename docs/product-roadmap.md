# Product Roadmap: TSW 2026 March

## Vision

Provide a fast, reliable basketball stat tracking workflow for real games: create roster, track events live, and review accurate box scores immediately after the game.

## V1 Milestones

| Milestone | Scope                                                                    | Status      |
| --------- | ------------------------------------------------------------------------ | ----------- |
| M1        | Teams and roster management                                              | In Progress |
| M2        | Game lifecycle (create, track, finish)                                   | In Progress |
| M3        | Event-based shot tracking with court location (`zoneId`, optional `x/y`) | In Progress |
| M4        | Previous games list + box score views                                    | In Progress |
| M5        | Validation, tests, and onboarding docs hardening                         | In Progress |

## Future Milestones

- Opponent support:
  - opponent total scoring
  - full opponent roster tracking
- Additional stat categories:
  - rebounds, assists, steals, turnovers, fouls
- Visual shot chart analytics and trends
- Export/share:
  - printable box score
  - CSV export
- Team management improvements:
  - season-level views
  - role-based access (coach/staff)

## Status Notes

- Auth is considered baseline complete and reused for all new basketball features.
- V1 remains intentionally narrow for speed: one tracked team per game, event-sourced scoring, and minimal UI complexity.
