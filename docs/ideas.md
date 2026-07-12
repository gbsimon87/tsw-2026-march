# Product Opportunities by User Segment

## Coaches / Team Managers

### Current Value

- Live tracking
- Rosters
- Box scores
- Replay
- Shot maps
- Public team/player pages

### Opportunity

Help coaches turn raw statistics into actionable decisions.

### High-Value Features

#### Post-Game Coach Reports

- Automatic summary of what changed the game
- Best lineup stretches
- Scoring droughts
- Turnover runs
- Rebounding gaps
- Foul trouble
- Top performers

#### Season Trends

- Player and team trends over time
- Last 5 games
- Shooting zones
- Turnovers per game
- Rebounding splits
- Usage trends

#### Lineup Analytics

- Best-performing five-player lineups
- Net scoring impact
- Rebounding effectiveness
- Lineups that prevented or allowed runs

#### Practice Focus Suggestions

Examples:

- "Team shot 2/14 from left-wing threes over the last 3 games."
- "Opponents scored 18 second-chance points."

#### Opponent Scouting

- Opponent tendencies
- Scouting notes attached to opponent pages

#### Export Tools

- CSV exports
- PDF reports
- Easy sharing with parents, schools, and coaching staff

### Core Value Proposition

> **"TSW does the post-game breakdown for you."**

---

## Players

### Current Value

- Public player profiles
- Per-game logs
- Season averages
- Shareable stat cards

### Opportunity

Transform TSW into a player's basketball identity and development platform.

### High-Value Features

#### Unified Player Profiles

- Merge appearances across multiple teams and leagues
- One permanent basketball profile

#### Development Dashboard

Track trends over time:

- PPG
- RPG
- APG
- Shooting splits
- Turnovers
- Fouls
- Player role

#### Stat Correction Requests

- Players request corrections
- Include video timestamps
- Managers review and approve

#### Recruiting Profile

Public player page including:

- Stats
- Game logs
- Video clips
- Team history
- Measurables
- Contact/social links

#### Personal Milestones

Examples:

- Season high
- Career high
- First 20-point game
- Double-double
- Other achievements

#### Player Badges

Examples:

- Top Scorer
- Most Improved
- Defensive Impact
- Clutch Performer
- Streaks

### Core Value Proposition

> **"Build your basketball résumé automatically from real games."**

---

## League Organizers

### Current Value

- Teams
- Standings
- Rosters
- Join requests
- Public league pages
- Managers
- Scheduling

### Opportunity

Reduce administration while creating a more professional league experience.

### High-Value Features

#### Schedule Generation

- Round robin
- Balanced home/away
- Venue constraints
- Time-slot constraints

#### Announcements

- League-wide
- Team-specific
- Game-specific

#### Administration Tools

- Fouls
- Technicals
- Suspensions
- Eligibility
- Roster lock dates

#### Officials Workflow

Assign:

- Referees
- Scorekeepers
- Table staff
- Game administrators

#### League Reports

- Top scorers
- Statistical leaders
- Team rankings
- Weekly recap
- Player of the Week

#### Registration & Payments

- Team fees
- Player fees
- Waivers
- Roster caps

#### Public League Homepage

- Sponsors
- Fixtures
- Standings
- Leaders
- Recent results
- Announcements

### Core Value Proposition

> **"Run the league from one place and give it a professional public presence."**

---

## Parents / Fans / Community

### Current Value

- Pulse feed
- Public pages

### Opportunity

Make following local basketball effortless.

### High-Value Features

#### Follow System

- Teams
- Players
- Leagues
- Personalized feed
- Notifications
- Recent results

#### Game Day Pages

- Upcoming matchup
- Rosters
- Live score
- Post-game recap

#### Shareable Graphics

- Final score
- Top performer
- Milestones
- Standings updates

#### Media Galleries

- Photos
- Videos
- Game media
- Team media
- Player media

#### Notifications

- Email updates
- SMS updates
- Final scores
- Next game reminders
- Weekly recaps

### Core Value Proposition

> **"Follow local basketball like a real sports platform."**

---

## Semi-Pro / Competitive Clubs

### Opportunity

Provide premium analytics and presentation-quality tools.

### High-Value Features

#### Advanced Shot Charts

Filter by:

- Game
- Season
- Player
- Lineup
- Opponent
- Court zone

#### Video-Linked Events

Jump directly from:

- Shot
- Turnover
- Rebound
- Other events

...to the corresponding YouTube timestamp.

#### Scouting Packs

Exportable reports for:

- Players
- Teams
- Coaches
- Recruiters

#### Roster Comparison

Compare:

- Efficiency
- Shooting profile
- Usage
- Trends

#### Private Team Notes

- Coaching-only comments
- Game notes
- Player observations

### Core Value Proposition

> **"Turn every tracked game into film-backed performance analysis."**

---

# Priority Product Bets

## 1. Unified Player Profiles — ✅ Shipped (v1, league-only, 2026-07-11)

One player profile across teams and leagues.

**Status:** Public `/players/:userId` pages are live, aggregating claimed league-player profiles. Remaining follow-ups: standalone team-player claiming, discovery dedup, cross-context stat merging.

**Why:** Creates long-term player identity, improves retention, and increases profile sharing.

---

## 2. Post-Game Auto Reports + Season Trends

Automatic game summaries paired with trend analysis.

**Why:** Saves coaches significant time while surfacing insights they wouldn't otherwise find.

---

## 3. Stat Correction Workflow

Player-requested stat corrections with:

- Video timestamps
- Manager approval

**Why:** Improves data quality, player engagement, and trust in the platform.

---

# Prioritised Backlog — Easiest to Hardest

Ranked by implementation effort against the codebase as it exists today
(2026-07-12), with user value noted. Effort estimates lean on what's already
built: game events are embedded and fully derived server-side, league player
stats and standings are materialized, the Follow System (users + leagues +
league teams) shipped v1.5, Cloudinary/Resend/Stripe are wired, and there is
**no job queue or cron** (anything scheduled or notification-driven costs
extra infrastructure).

## Tier 1 — Quick wins (days, high user value) ⭐

| #   | Feature                                                                              | Why it's easy                                                                                                                                          | User value                                                                                   |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | **CSV export** (box scores, season tables, league standings)                         | All data already computed/materialized; add export endpoints or even client-side CSV from existing `StatsTable` data                                   | Coaches/organizers share with parents, schools, staff — most-requested "get my data out" ask |
| 2   | **Personal milestones** (season high, career high, first 20-pt game, double-doubles) | Pure read-time derivation from existing per-game logs (`LeaguePlayerStats` + game events); render on player pages                                      | Players love it; makes profiles shareable and sticky                                         |
| 3   | **League leaders / weekly report page** (top scorers, statistical leaders)           | `LeaguePlayerStats` is already materialized per league+season; it's an aggregation + a public page                                                     | Gives every league a professional face; organizers share it weekly                           |
| 4   | **Private team/scouting notes** (coach-only notes on games, players, opponents)      | Simple new CRUD module following the established `routes→controller→service→repository` pattern; auth gates already exist (`assertTeamManagerOrOwner`) | Coaches keep observations where the stats live                                               |
| 5   | **League announcements**                                                             | Small CRUD + render on the public league page (public homepage section already exists)                                                                 | Reduces organizer admin; makes league pages feel alive                                       |

## Tier 2 — Medium (1–2 weeks each)

| #   | Feature                                                                              | Effort notes                                                                                                                                                  | User value                                                                         |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 6   | **Personalized "Following" feed on The Pulse**                                       | Follow edges already exist (v1.5); needs a feed query filtered by followed users/leagues/teams + a feed tab. Already on the follow-system deferred list       | Turns follows into a daily-return habit — the biggest retention lever in this tier |
| 7   | **PDF post-game report** (extend existing `?print=1` print mode)                     | Print-first layout already exists on game detail; polish + a proper "export report" flow                                                                      | The "TSW does the post-game breakdown" promise, shareable                          |
| 8   | **Post-game coach report v1** (scoring droughts, runs, top performers, foul trouble) | Events carry timestamps/order, so run/drought detection is pure derivation in `games.service.js`; recap/key-moments infrastructure already exists to build on | Core coach value prop; differentiator                                              |
| 9   | **Season trends** (last-5 games, shooting zones over time, per-game trendlines)      | Data exists; needs per-game time-series endpoints + recharts views (recharts already a chunk)                                                                 | Coaches and players both; pairs with #8                                            |
| 10  | **Stat correction requests** (player requests, manager approves)                     | Workflow CRUD mirroring the existing join-request approve/reject pattern; `videoTimestamp` fields already exist on events                                     | Trust + engagement; priority bet #3                                                |
| 11  | **Media galleries** (game/team photos)                                               | Cloudinary upload path already exists for feed images; needs gallery model + pages                                                                            | Parents/fans; low risk                                                             |

## Tier 3 — Hard (multi-week, or blocked on infrastructure)

| #   | Feature                                                                    | Why it's hard                                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | **Email notifications** (final scores, next-game reminders, weekly recaps) | Resend is wired, but there's no job queue/cron — scheduled sends need new infrastructure; per-event sends are feasible sooner via the existing `setImmediate` pattern |
| 13  | **Lineup analytics** (best five-player lineups, net impact)                | SUB_IN/SUB_OUT events exist so lineups are reconstructable, but stint reconstruction + plus-minus across embedded events is genuinely tricky derivation work          |
| 14  | **Schedule generation** (round robin, venue/time constraints)              | Constraint-solving problem + new scheduling data model; venues don't exist yet                                                                                        |
| 15  | **Video-linked events / advanced shot chart filters**                      | Per-event `videoTimestamp` exists (demo seed proves it), but the capture UX (time-synced tracking from playback) is a large product surface                           |
| 16  | **Registration & payments** (team/player fees, waivers)                    | New Stripe products/flows beyond the current resource-scoped subscriptions; billing isn't even publicly launched yet (`/pricing` is dev-only)                         |
| 17  | **SMS notifications, officials workflow, opponent roster tracking**        | New providers, new roles/permissions, or contradicts the one-tracked-team model                                                                                       |

## Recommended first sprint

**#1 CSV export → #2 Personal milestones → #3 League leaders page.** All three
are read-only derivations over data the app already materializes, each ships
independently in days, and each gives a different segment (coaches, players,
organizers) something immediately shareable. Follow with **#6 Following feed**
to convert the just-shipped Follow System into daily engagement.
