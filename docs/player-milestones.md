# Player Milestones

**Status: design approved, not implemented.** Scope for the first cut of
"Milestones and awards" in [`ideas.md`](./ideas.md). This document covers
**player milestones only** — derived automatically from game data. League and
team awards, and any admin-selected award (MVP, All-League), are out of scope
and are not designed here.

Goal: when a game is finalized, recognise the rare things a player just did —
career landmarks, big single-game feats, career firsts — record them durably on
their profile, and publish only the rarest ones to The Pulse.

**The Pulse stays video-first.** Game highlight clips are the primary content of
the feed. Milestone posts are capped hard (§5) so a milestone can never crowd
out video.

## 1. Decisions

| Decision                                                                     | Rationale                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestones only; no awards                                                   | Awards need a season-end trigger (does not exist) or an admin grant UI (new model + permissions). Separate spec.                                                      |
| One Pulse card per player per milestone, rare-only                           | Each milestone reads as its own moment and is individually shareable. Volume is controlled by the tier gate and the per-game cap, not by batching.                    |
| Career = **per league**, across seasons and teams                            | Matches how standings and player stats are already scoped, and survives a player changing teams. See §3 for the identity caveat.                                      |
| Families: career thresholds, single-game feats, firsts/debut                 | Career highs ("personal bests") are **deferred** — see §11.                                                                                                           |
| Backfill seeds totals **and** records history, publishes nothing             | Profiles show a real history from day one; no past game ever posts to the feed. Same shape as [`backfill-auto-feed.js`](../server/src/scripts/backfill-auto-feed.js). |
| Milestone **records** are written for every league; only **posts** are gated | Private-league players still get profile milestones. The public-league gate stays in one place (§5).                                                                  |
| Standalone teams and games are out of scope                                  | Career is defined per league, and standalone games never auto-post today. See §11.                                                                                    |

## 2. Data available today (verified 2026-08-15)

Per player, per game, from the frozen box score
([`computeBoxScore`](../server/src/modules/games/games.service.js)):

`points`, `ftm`/`fta`, `fg2m`/`fg2a`, `fg3m`/`fg3a`, `ast`, `oreb`/`dreb`/`reb`,
`stl`, `blk`, `tov`, `foul`.

**There is no minutes-played figure.** It is derivable from `SUB_IN`/`SUB_OUT`
events plus each event's period/clock snapshot, but nothing computes it today,
so no milestone in this design depends on minutes.

Already materialized:
[`LeaguePlayerStats`](../server/src/modules/leagues/leagues.repository.js) — one
document per `(leagueId, seasonId, leagueTeamId, leaguePlayerId)` holding raw
accumulated totals plus `gamesCount`, replaced wholesale by
`recomputeLeagueAggregates` on every write that affects a league.

Two properties of that aggregate matter here:

- It is **season-scoped**. A career-in-league total is the sum of a player's
  rows across every season and team.
- `gamesCount` counts **roster appearances, not games played** — a player on the
  bench for the whole game still increments it. §4 defines debut around this.

## 3. Career identity

`LeaguePlayer.leagueTeamId` is set at creation and **no code path changes it**.
There is no player-transfer feature. A player joining a second team in the same
league gets a _new_ `LeaguePlayer` row, and `claimedByUserId` is the only thread
linking the two.

So the career key is:

```text
claimed   -> `user:<claimedByUserId>`
unclaimed -> `player:<leaguePlayerId>`
```

Consequences, accepted for v1:

- An **unclaimed** player who switches teams within a league starts a new career.
  Claiming the profile fixes it going forward.
- Career totals never cross league boundaries. "1,000 points" always means
  1,000 points _in that league_.

### 3.1 Claim and unclaim must re-key

Claiming a profile changes a player's career key, orphaning milestones recorded
under the old key. Both paths in
[`leagues.service.js`](../server/src/modules/leagues/leagues.service.js) that
write `claimedByUserId` must re-key the player's milestone records:

- **On claim** — rewrite `player:<id>` records to `user:<userId>`. Where that
  collides with an existing record (the user already earned that milestone under
  another roster row), keep the one with the earlier `achievedAt` and delete the
  other.
- **On unclaim** — rewrite that player's records back to `player:<id>`, applying
  the same collision rule.

Accepted imprecision: merging two histories on claim can mean a threshold is
_already_ crossed by the combined total. We do not retroactively award it; it
resolves at the player's next game.

## 4. Catalog

Rules live in a single declarative file, `milestones.catalog.js`. Each rule is:

```text
key, family, tier, rarityRank, statKey, label(ctx), test(before, after, gameLine)
```

`test` is a **pure function** of the three inputs, so the whole catalog is
unit-testable without a database, and tuning rarity is a one-file edit that
needs no recompute — the same principle as the OPT-011 note on
`leaguePlayerStatsSchema`.

`tier` is `feed` (eligible to post) or `profile` (recorded silently).

### 4.1 Career thresholds — family `career_threshold`

Crossed when a ladder rung falls in `(before, after]`. Once per career.

| Stat     | Ladder                          | `feed` rungs          |
| -------- | ------------------------------- | --------------------- |
| points   | 100, 250, 500, 1000, 2000, 5000 | 500, 1000, 2000, 5000 |
| rebounds | 100, 250, 500, 1000             | 500, 1000             |
| assists  | 100, 250, 500, 1000             | 250, 500, 1000        |
| threes   | 25, 50, 100, 250                | 100, 250              |
| steals   | 50, 100, 250                    | —                     |
| blocks   | 25, 50, 100                     | —                     |

### 4.2 Single-game feats — family `single_game_feat`

Pure functions of the game's box-score line. Repeatable — once per game.

| Key             | Condition         | Tier    |
| --------------- | ----------------- | ------- |
| `triple_double` | 3 categories ≥ 10 | feed    |
| `pts_40`        | ≥ 40 points       | feed    |
| `fg3m_10`       | ≥ 10 threes made  | feed    |
| `stl_6`         | ≥ 6 steals        | feed    |
| `blk_5`         | ≥ 5 blocks        | feed    |
| `pts_30`        | ≥ 30 points       | profile |
| `fg3m_7`        | ≥ 7 threes made   | profile |
| `double_double` | 2 categories ≥ 10 | profile |

Double-double and triple-double count across points, rebounds, assists, steals,
and blocks.

**Ladder suppression:** within a ladder, only the highest satisfied rung is
recorded. A 41-point game records `pts_40`, not `pts_40` _and_ `pts_30`. A
triple-double does not also record a double-double.

### 4.3 Firsts — family `first`

All `profile` tier. In a league with rolling signups these fire constantly
league-wide, so none of them post.

| Key                   | Condition                                                 |
| --------------------- | --------------------------------------------------------- |
| `first_career_game`   | first completed game with **at least one event** recorded |
| `first_career_points` | `before.points === 0 && after.points > 0`                 |
| `first_career_three`  | `before.fg3m === 0 && after.fg3m > 0`                     |

`first_career_game` is deliberately defined on recorded events, not on
`gamesCount`, because `gamesCount` counts bench appearances (§2).

### 4.4 Rarity ranking

When more than `AUTO_MILESTONE_CAP` feed-tier milestones land in one game, they
are ranked by `rarityRank` ascending — rarest first — and the rest are recorded
without posting. The v1 order:

1. `triple_double`
2. career threshold, points 5000 / 2000
3. `fg3m_10`
4. `pts_40`
5. career threshold, points 1000 / rebounds 1000 / assists 1000
6. `blk_5`, `stl_6`
7. every remaining feed-tier career threshold

Ties break on the higher `value`.

## 5. Detection and publishing

New module `server/src/modules/milestones/` following the standard layout:
`routes → controller → service → repository`, plus `milestones.catalog.js`.

### 5.1 Trigger

`scheduleMilestoneDetectionForGame(game)` is called from
[`finishGameForUser`](../server/src/modules/games/games.service.js) alongside the
existing finish-time schedulers — post-response via `setImmediate`, errors
logged not thrown, never blocking the finish request.

Detection **awaits `recomputeLeagueAggregates(leagueId, seasonId)` first.** That
call coalesces with the pass already in flight (the `recomputeInFlight` map), so
it waits for current totals rather than duplicating work — this is how the
ordering dependency on `LeaguePlayerStats` is resolved, with no new mechanism.

### 5.2 Per-player algorithm

For each box-score line carrying a `leaguePlayerId` (both sides for
`dual_team`):

1. Resolve the career key (§3).
2. `after` — sum every `LeaguePlayerStats` row in this league belonging to that
   identity, across all seasons and teams.
3. `before` — `after` minus this game's line, with `gamesCount - 1`.
4. Run the catalog against `(before, after, gameLine)`.
5. Insert each crossed milestone. A duplicate-key error means it was already
   awarded — skip it, it is not a failure.

Deriving `before` by subtraction rather than storing it is what keeps this
correct across retries and re-finalizes: the inputs are always the frozen box
score and the recomputed aggregate, never an incrementally-mutated counter.

### 5.3 Publishing

Newly inserted `feed`-tier milestones are ranked by `rarityRank` and the top
**`AUTO_MILESTONE_CAP = 2`** are handed to the feed — mirroring
`AUTO_HIGHLIGHT_CAP = 5`. When the cap truncates, log it rather than silently
dropping, matching `autoCreateHighlightClipPosts`.

Publishing goes through `feed.service.js`, which keeps
`autoPublishForFinalizedGame` as the **single enforcement point** for the
public-league restriction — preserving the invariant documented at that
function. A milestone post therefore requires all of: `AUTO_FEED_ENABLED`, the
new `AUTO_FEED_MILESTONES_ENABLED`, `gameContext === 'league'`, and
`isLeaguePublic`.

Worst case for one finalized game: 1 game card + 2 milestone cards + 5 highlight
clips. Video remains the majority of what a game contributes to the feed.

### 5.4 Feed integration points

- New post type `milestone` with a `milestoneCard` sub-schema on `Post`,
  carrying `auto: true` and a `cardSnapshot` per the OPT-017 pattern, so the
  feed read path never pays a live resolve.
- Unique index on `milestoneCard.milestoneId` (sparse) — one post per milestone.
- `reverseAutoPostsForLeague` extends to delete milestone posts when a league
  flips to private. Milestone **records** are kept; league profile links are
  already withheld while a league is private.

### 5.5 A separate env flag

`AUTO_FEED_MILESTONES_ENABLED`, default `false`, Zod-validated in
[`env.js`](../server/src/config/env.js) and added to both env templates so
`pnpm check-env` covers it. This ships the machinery dark: records and profile
surfaces go live, real milestone volume can be observed, and the feed is only
switched on once that volume is known to be acceptable.

## 6. Data model

One new collection, `PlayerMilestone`, defined inline in
`milestones.repository.js`.

| Field             | Notes                                               |
| ----------------- | --------------------------------------------------- |
| `leagueId`        | indexed                                             |
| `seasonId`        | season of the source game                           |
| `careerKey`       | `user:<id>` or `player:<id>` (§3)                   |
| `leaguePlayerId`  | the roster row that earned it                       |
| `leagueTeamId`    | team at time of earning                             |
| `claimedByUserId` | nullable; denormalized for unified-profile reads    |
| `milestoneKey`    | e.g. `career_points_1000`, `triple_double`          |
| `family`          | `career_threshold` \| `single_game_feat` \| `first` |
| `tier`            | `feed` \| `profile`                                 |
| `value`           | the achieved figure (1000, 41, …)                   |
| `sourceGameId`    | indexed — drives re-evaluation on edit (§7)         |
| `achievedAt`      | the game's `completedAt`                            |
| `postId`          | nullable; set when published                        |
| `dedupeKey`       | **unique** — see below                              |

`dedupeKey` is a single computed string carrying the whole idempotency rule, so
one unique index covers both once-per-career and repeatable milestones:

```text
once per career (thresholds, firsts):  `${careerKey}|${milestoneKey}`
repeatable (single-game feats):        `${careerKey}|${milestoneKey}|${sourceGameId}`
```

Idempotency is therefore a property of the index, not of application logic —
re-running detection for a game is always safe.

Additional indexes: `{ leaguePlayerId: 1, achievedAt: -1 }` for the league
player page, `{ claimedByUserId: 1, achievedAt: -1 }` for the unified profile,
`{ sourceGameId: 1 }` for edit re-evaluation.

## 7. Edits to completed games

Completed games can be edited, and `refreezeGameBoxScoreIfCompleted` recomputes
their box score. A milestone awarded from that game may stop being true.

On edit of a completed league game, re-run detection for that game:

- **Delete** records whose `sourceGameId` is this game and whose condition no
  longer holds, along with any post they created.
- **Insert** newly qualifying records, but **do not publish** them. Necro-posting
  to the feed days after a game is worse than a missing card.

Accepted imprecision, deliberately not solved in v1: if editing an _earlier_
game shifts which game crossed a career threshold, the threshold is not
reassigned to the correct game. The record stays attached to the game that
originally crossed it. Reassignment would require replaying the whole league.

## 8. Read surfaces

| Surface                                                                                         | Change                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `getPublicLeaguePlayerById` payload                                                             | add `milestones: { recent: [...5], total }` — no extra round trip for the page that needs it |
| `GET /leagues/:leagueId/players/:leaguePlayerId/milestones`                                     | paginated full list, public, behind the same `isLeaguePublic` gate                           |
| [`PublicLeaguePlayerPage.jsx`](../client/src/features/leagues/pages/PublicLeaguePlayerPage.jsx) | new Milestones section, with an empty state                                                  |
| [`PublicUserProfilePage.jsx`](../client/src/features/players/pages/PublicUserProfilePage.jsx)   | milestones across all claimed public-league profiles                                         |
| `client/src/features/feed/components/posts/`                                                    | new `MilestonePost` card                                                                     |

New client reads use TanStack Query, per the migration preference. The new
endpoint and the extended player payload must be added to
[`api.md`](./api.md), and the new `Post` type and `PlayerMilestone` model to
[`PROJECT-KNOWLEDGE.md`](./PROJECT-KNOWLEDGE.md).

## 9. Backfill

`server/src/scripts/backfill-player-milestones.js`, supporting `--dry-run` like
every other script in that directory.

Per league, replay completed games in chronological order through the **same**
detection function with publishing disabled, so backfilled and live milestones
are produced by identical code. Idempotent via `dedupeKey`, so it is safe to
re-run.

Run order matters: this must run **after** league seasons are backfilled, since
career totals are assembled from season-scoped rows.

## 10. Testing

Server (Jest + Supertest, `server/src/tests/`):

- **Unit, catalog** — the bulk of the value. Each rule as a table of
  `(before, after, gameLine) → expected keys`. Covers ladder suppression, the
  `(before, after]` boundary (exactly-1000 crosses; 1001→1002 does not), and
  debut-on-events-not-appearances.
- **Unit, idempotency** — run detection twice over one game, assert one record.
- **Unit, identity** — claim and unclaim re-keying, including the collision rule.
- **Integration** — finalize a public-league game: records written, posts capped
  at 2. Finalize a private-league game: records written, **no** posts. Flip a
  league to private: milestone posts removed, records retained.
- **Integration** — edit a completed game so a feat no longer holds: record and
  post removed.

Client (Vitest + RTL, colocated `*.test.jsx`): `MilestonePost` renders each
family; the profile milestones section renders a list and an empty state.

## 11. Deferred

- **Career highs / personal bests.** Named in `ideas.md` but cut from v1. The
  `(before, after, gameLine)` machinery supports them directly; they need a
  stored per-stat best, a minimum games-played floor, and a minimum absolute
  value, or a new player sets a career high every game.
- **Standalone teams and players.** Career is defined per league, and standalone
  games have no auto-feed path today.
- **Team and league milestones.** Win streaks, franchise records.
- **Season awards**, derived or admin-granted — the other half of the `ideas.md`
  entry.
- **Minutes-based milestones**, blocked on deriving minutes played (§2).
