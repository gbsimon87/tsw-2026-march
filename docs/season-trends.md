# Season Trends

Status: discovery and first vertical slice

## Product Goal

Help coaches and players answer two related questions without exporting data or
reviewing every box score:

1. How is this team or player performing right now?
2. How has that performance changed over the selected season?

The first slice adds recent team form to the public league overview, full
standings, and league-team pages. Later slices can add last-five summaries and
season-long charts for scoring, shooting, turnovers, and rebounding.

## Confirmed Product Decisions

- Recent form follows the usual sports-table convention: the last five results
  run chronologically from left to right, so the newest result is on the right.
- Form appears on the league overview, full standings, and public league-team
  pages. Standalone team pages remain outside this season-scoped feature because
  they do not belong to a league season.
- Detailed trends will start with teams. Public player pages already provide
  season totals and a per-game log; the league-team page currently has a larger
  information gap.
- The first detailed chart will show scoring margin, with points scored and
  allowed for each game. This follows naturally from W/L form, is easy to
  interpret, and works from final scores without relying on complete event
  capture for every statistical category.
- Player last-five windows use the team's last five completed games, not the
  player's last five appearances. A missed appearance should display as `DNP`
  rather than a zero-stat performance and should not count in per-appearance
  averages.
- Season trends are public. They are not restricted by membership or billing
  entitlement.

## First Slice: Recent Team Form

The public league overview and full standings show a `Form` column beside each
team's W-L record. The league-team page shows the same form beside the team's
rank. It contains up to five results from the applicable season:

- `W` for a win;
- `L` for a loss;
- `T` for a legacy tied result (new league games cannot finish tied);
- an em dash when the team has no completed results.

Results are calculated in the client from the season-scoped `league.games`
payload already returned by `GET /public/leagues/:leagueSlug`, or from the
season-scoped games already returned with a public league team. The most recent
five are ordered chronologically with the newest on the right, using
`completedAt` and falling back to `scheduledAt`. Scheduled and in-progress
games do not count. Each badge has an accessible description with the result,
opponent, and score; colour is supplementary rather than the only way the
result is communicated.

This is intentionally a presentation-only change. It does not introduce a new
endpoint or persist derived form data.

## Proposed Scope

### Team trends — first detailed release

- Current form: last five completed games and current win/loss streak.
- First chart: points scored, points allowed, and scoring margin per game.
- Summary: last-five scoring margin compared with the season average.
- Shooting: field-goal, two-point, three-point, and free-throw percentages.
- Ball control: turnovers per game and, if useful, assists-to-turnover ratio.
- Rebounding: offensive, defensive, and total rebounds per game.
- Later charts should add shooting, turnovers, and rebounding in that order,
  subject to data-completeness checks.

### Player trends

- Game-by-game minutes or appearances, points, rebounds, assists, steals,
  blocks, turnovers, and shooting percentages.
- Last-five averages compared with season averages.
- Filters for team and player when viewing a league.
- Clear treatment of players who move teams or have a small sample size.
- A last-five window based on the team's last five completed games, with `DNP`
  gaps where the player did not appear.

### User experience

- All trends follow the season selected on the page.
- A chart point links to its game detail where practical.
- Tooltips show the exact value, opponent, date, and game result.
- Empty, partial, and invalid data states explain why a trend is unavailable.
- Tables or text summaries remain available where a chart alone would be hard
  to interpret or inaccessible.
- Mobile layouts must remain useful without requiring precise chart gestures.

## Metric Definitions to Settle

Percentages should be calculated from summed makes and attempts across the
window, not by averaging per-game percentages. This avoids a one-attempt game
having the same weight as a twenty-attempt game.

For a window of games:

```text
FG% = total field goals made / total field goals attempted
3P% = total three-pointers made / total three-pointers attempted
FT% = total free throws made / total free throws attempted
TOV/G = total turnovers / games included
REB/G = total rebounds / games included
```

Player last-five summaries use the team's last five completed games. Games in
which the player did not appear are shown as `DNP` and excluded from
per-appearance averages, preserving the team timeline without recording a
false zero-stat performance.

## Data and Architecture

Game events and frozen completed-game box scores are the source of truth. The
existing league response is enough for team form because it includes game
status, participant IDs, scores, and dates. It is not the right long-term
payload for richer trends: returning or replaying every event on a public page
would increase response size and duplicate metric logic in the browser.

A likely next step is a season-scoped read endpoint such as:

```text
GET /public/leagues/:leagueSlug/trends?seasonId=...&scope=team&teamId=...
GET /public/leagues/:leagueSlug/trends?seasonId=...&scope=player&playerId=...
```

The response should return pre-shaped time-series points plus season and
last-five summaries. Initially these can be derived on read from completed
games and frozen box scores. If measurement shows that work is expensive, add
a materialized season-trend model refreshed by the same completed-game and
stat-correction paths that refresh standings and league player stats.

Any trend cache or materialized record must be keyed by league, season, subject
type, and subject ID. A completed-game correction must invalidate or recompute
the affected teams and players.

## Edge Cases

- Teams with fewer than five completed games show only the available results.
- Selected historical seasons must not leak games from the current season.
- Scheduled, in-progress, deleted, or scoreless games do not affect trends.
- Legacy ties display honestly rather than becoming a win or loss.
- Postponed games use the actual completion order for recent form.
- Zero-attempt shooting percentages display as unavailable, not `0%`.
- A player with no appearance in a game should not receive a zero-stat game-log
  unless the product explicitly decides that being rostered counts.
- Team changes need a defined rule for unified player trends: split by team,
  combine within the league season, or both.

## Delivery Sequence

1. Recent W/L form on the public league overview (implemented).
2. Validate placement and terminology with real league data.
3. Define the team scoring-margin response and accessible chart/table design.
4. Add a read-only trends service and endpoint with unit and integration tests.
5. Add team last-five versus season summaries and the scoring-margin chart.
6. Measure query cost and materialize only if necessary.
7. Add shooting, turnover, and rebounding trends.
8. Extend the same season timeline to players, including `DNP` gaps.

## Acceptance Criteria for the First Slice

- Only completed games in the selected season appear.
- Each participating team receives the inverse result of its opponent.
- At most five results appear per team, chronologically with the newest on the
  right.
- The result remains understandable without colour.
- Teams without results have a clear empty state.
- Existing standings consumers do not show the column unless they provide form
  data.

## Deferred Decisions

- Whether the first release needs side-by-side team comparison or should focus
  on one selected team.
- Whether the scoring chart belongs directly in the league-team Stats tab or
  behind a dedicated Trends tab once more metrics are available.
- How a player's unified trend should behave after changing teams during a
  league season.
