# Product Backlog

Ideas only; nothing here is committed work. Remove shipped items instead of
turning this file into a release log.

## Highest Value

| Idea                     | Primary user      | Notes                                                                                 |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| Post-game coach report   | Coaches           | Derive runs, droughts, foul trouble, and key performers from game events.             |
| Season trends            | Coaches, players  | Last-five and season time series for shooting, turnovers, and rebounding.             |
| Stat-correction workflow | Players, managers | Request, review, approve, and audit event corrections; use video timestamps.          |
| Personalized Pulse       | Fans, players     | Filter feed posts through existing user, league, and league-team follows.             |
| Milestones and awards    | Players, leagues  | Player milestones shipped (see docs/player-milestones.md); season awards outstanding. |

## League Administration

| Idea                            | Size | Main dependency                                            |
| ------------------------------- | ---- | ---------------------------------------------------------- |
| Reschedule history              | XS   | Append-only history on `Game`; notifications optional.     |
| Custom standings rules          | S    | League config consumed by aggregate recomputation.         |
| Bulk roster import              | S    | CSV preview and conflict resolution.                       |
| League audit log                | S    | New append-only model and write-path instrumentation.      |
| Announcements                   | M    | New model plus admin and public surfaces.                  |
| Venue and time-slot management  | M    | Structured venues replacing free-text game venue.          |
| Season setup wizard             | M    | Orchestrate existing season, roster, and schedule actions. |
| Duplicate player merge          | M    | Referential updates across stats, members, and games.      |
| Delegated admin scopes          | M    | New permissions beneath league manager.                    |
| Notifications and weekly digest | L    | Preferences, templates, retries, and scheduled jobs.       |
| Registration and fees           | L    | New Stripe flows distinct from subscriptions.              |
| Divisions and conferences       | L    | Changes schedules, standings, and public navigation.       |
| Playoffs and brackets           | L    | New competition model and progression rules.               |
| Stat-correction queue           | XL   | Crosses immutable game history, aggregates, and audit.     |
| Multi-league organization view  | XL   | New organization and cross-league authorization model.     |

## Other Opportunities

- lineup and stint analytics;
- opponent scouting and private coaching notes;
- advanced shot-chart filters and video-linked events;
- recruiting fields and media galleries on player profiles;
- PDF reports and scouting packs;
- officials assignments, eligibility, suspensions, and roster locks;
- sponsor placements on public league pages;
- standalone-player account claiming and unified-profile support;
- email or SMS game reminders and results.

## Constraints

- There is no job queue or scheduler; timed notifications need infrastructure.
- Standalone games intentionally track one roster; opponent-roster features
  change the product model.
- Billing is subscription-based and not publicly launched; registration fees
  require separate payment flows.
- Embedded game events and materialized league aggregates make stat corrections
  a data-integrity feature, not simple CRUD.
