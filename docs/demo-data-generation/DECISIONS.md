# Demo Data Generation — Questions, Decisions & Rationale

Recorded so these choices aren't re-litigated by a future maintainer.

## Standalone script vs. extending `seed.js`

**Decision**: new file, `server/src/scripts/seed-demo-account.js`.

`seed.js`'s `main()` unconditionally calls `resetSeedData()`, which wipes
Users, Teams, Games, Leagues, and Posts. There's no way to add an
additive/idempotent mode to that entrypoint without either forking `main()`
behind a flag (risky — one bad flag check away from wiping a real database)
or duplicating most of the file's logic anyway. A separate script keeps the
destructive and non-destructive code paths physically unable to run
together, and its idempotent/additive nature is a much closer match to the
existing `backfill-*.js` family (same header-comment convention, same
`--dry-run` support) than to `seed.js`.

## Why `require.main === module` needed to be added to `seed.js`

Before this change, `seed.js` called `main().catch(...)` unconditionally at
the bottom of the file with no guard. Since the new script needs to
`require('./seed.js')` to reuse its pure helper functions, requiring it
without a guard would have triggered a full destructive database reset as a
side effect of merely importing the module — an unacceptable footgun. The
guard was added, and a `module.exports` block was added alongside it,
without changing any behavior of `pnpm seed` itself (verified: `seed.js` is
still invoked exactly the same way via `node src/scripts/seed.js`).

## Why the existing testuser@gmail.com account's credentials were overwritten

When first run against the dev Atlas database, a `User` document for
`testuser@gmail.com` already existed — `plan: 'free'`, no owned leagues, no
claimed player profiles. This looked like a stray manual-testing account,
not an intentional prior demo setup. Since the task requires the account to
be reachable with a specific password (`password1!2@3#`), and the script
must not silently produce an account that can't actually be logged into,
`upsertUser` was given a `forceCredentials` option — used **only** for the
canonical demo user, never for the synthetic commissioner users — that
updates `passwordHash`/`plan`/`emailVerified` on an existing account in
place while leaving every other field (and all other collections) untouched.
This is the **one deliberate exception** to the "never touches data it
didn't create" idempotency rule, documented explicitly in the script's
header comment.

## Why direct `claimedByUserId` writes instead of a service call

There is no `claimLeaguePlayer` service function in `leagues.service.js`
(only `unclaimLeaguePlayer` exists) — claiming today happens through a
join-request/approval workflow (`LeagueJoinRequest`) intended for real user
self-service. Since this is a trusted, server-side seed script — exactly the
same trust level `seed.js` already operates at when it constructs
`LeaguePlayer` documents directly, bypassing the join-request flow entirely
— the demo script sets `claimedByUserId` via a direct, guarded
`LeaguePlayer.updateOne({ _id, claimedByUserId: null }, { $set: {
claimedByUserId } })`. The `claimedByUserId: null` filter ensures the script
never steals a claim from a real user, and a pre-check skips the write
entirely if the demo user already holds that claim (idempotent).

## Why leagues 2 and 3 are owned by synthetic "commissioner" users instead of the demo user

Asked directly to the user and confirmed: a synthetic commissioner user owns
Harborview Rec League and Summit City Hoops Circuit, while the demo user
holds a `manager` role in one and a `player`-only role in the other. A real
user is rarely simultaneously the owner of 3 unrelated leagues — having the
demo account hold different roles across its three leagues is a more
realistic showcase and directly demonstrates all three permission tiers
(`owner`, `manager`, `player`) documented in
[`../permissions.md`](../permissions.md), rather than only ever showing the
most-privileged view.

## Why `buildSeedLeagueGames` (from `seed.js`) wasn't reused as-is

That function hardcodes a 6-matchup schedule assuming exactly 4 teams
(`[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]`). This project's leagues have 5
teams, and every team needs at least 3 games — a different schedule shape.
`seed-demo-account.js` defines its own `FIVE_TEAM_SCHEDULE` (8 matchups)
verified by direct DB query to give every team ≥3 appearances, and its own
`buildDemoLeagueGames` (structurally modeled on `buildSeedLeagueGames`) that
additionally sets `videoUrl` per game and calls the new
`injectVideoTimestamps` helper on the merged event list — two things the
original function never did.

## Why league games can't end in a tie, and how that's handled

`games.service.js`'s `assertLeagueScoreNotTied` rejects a `finalScore` where
`home === away` for any `gameContext: 'league'` game. Since the demo
script's event generation is randomized, a tie is possible by chance. A
small `breakTieIfNeeded` helper adds one point to the home side's computed
`finalScore` if it would otherwise be tied — this only adjusts the
denormalized `finalScore` field, not the underlying event list (the box
score derived from events already matches what a viewer would compute
independently; the +1 nudge just avoids re-simulating events until a
non-tie occurs by chance).

## Why `finalScore` and `eventCount` are computed eagerly instead of left to compute-on-miss

The codebase already has a `computeGameFinalScore(game)` function exported
from `games.service.js`, used at both game-completion time and read-time
fallback. The demo script calls it directly right after generating each
game's events (before `insertMany`) so the persisted document is
self-consistent from creation — this mirrors how a real "finish game" flow
would leave the document, rather than relying on the compute-on-miss
fallback to backfill it on first read.

## Why standings/player-stats materialization isn't run automatically by the script

`LeagueStandings` and `LeaguePlayerStats` are self-healing
(compute-on-miss-and-persist) per the architecture described in
[`../PROJECT-KNOWLEDGE.md`](../PROJECT-KNOWLEDGE.md) §5 — the first read
after seeding will compute and cache them correctly regardless. Running
`backfill-league-standings.js` afterward is optional and only saves the
first reader from paying the compute cost; the demo script prints a reminder
rather than invoking it automatically, to keep the two scripts' concerns
separate (one seeds data, the other warms caches) and avoid coupling the
demo script's exit code to an unrelated maintenance script's success.

## Why the dev database was wiped entirely instead of surgically cleaning "non-demo" data

The task initially asked to "clean the dev database, keep only the 3 demo
leagues." Investigating first turned up more than disposable seed junk: a
real imported league (`we-ball-saturday`, owned by `y.simon.cordova@gmail.com`,
built from actual TSV game data per `seed-we-ball-saturday.js`), a personal
manual-testing league (`dev-test-league`, owned by
`simon.cordova@creative-cx.com` — the requester's own account), and 2
standalone teams (Toronto Raptors, Milwaukee Bucks) owned by other
real-looking accounts. Surgically preserving "real" data while deleting
"seed" data would have required guessing at ownership/intent with no
reliable signal to distinguish them (both look like ordinary user-created
records — there's no `isSeed` flag). Asked directly, the requester chose the
simpler and safer path: wipe the entire dev database first, then reseed from
a known-clean state. This trades "some possibly-wanted manual-testing data is
gone" for "the resulting dev DB is unambiguous and fully reproducible from
seed scripts" — the right tradeoff for a dev environment, and explicitly not
something `reset-dev-database.js` will do to production (hard-refused).

## Why `reset-dev-database.js` drops collections one at a time instead of calling `dropDatabase()`

The first implementation called `mongoose.connection.dropDatabase()`, which
failed against the dev Atlas cluster with `MongoServerError: user is not
allowed to do action [dropDatabase] on [tsw_2026_dev.]` — the configured
Atlas database user has collection-level write access but not the
database-admin privilege `dropDatabase` requires. Iterating each collection
via `.drop()` achieves the same end state without needing an elevated role,
and is arguably safer anyway (it can't accidentally drop the database itself
or any Atlas-managed system collections outside the target database).

## Why highlight/video content uses the existing YouTube `highlight_clip` post type, not a new Cloudinary upload path

The task's original phrasing asked for highlights to be uploaded to
Cloudinary and stored as Cloudinary URLs. Investigating the existing feed
code found that `type: 'highlight_clip'` posts are YouTube-iframe-only
(`HighlightClipPostCard.jsx`/`FullScreenHighlightClipPost.jsx` both extract a
YouTube video ID and embed via iframe; `isSafeYouTubeUrl` rejects any
non-YouTube host at read time) — Cloudinary-hosted video would need the
separate `type: 'video'` post shape (`VideoPostCard.jsx`, native `<video>`
tag), which is a different, unrelated post type. Cloudinary also has no
built-in way to fetch a YouTube watch-page URL directly (it can fetch-upload
an arbitrary direct file URL, e.g. `.mp4`, but not a YouTube page — YouTube
blocks that at the platform level), so satisfying the original ask would have
required sourcing entirely different (non-YouTube) sample video files just to
have something Cloudinary could ingest.

Asked directly, the requester dropped the Cloudinary requirement and
confirmed the 4 originally-supplied YouTube URLs should be used via the
existing `highlight_clip` mechanism instead — which is also the more
consistent choice, since the games themselves already use those same YouTube
URLs as their `Game.videoUrl` (see the "Video / highlights" section of
`README.md`); a highlight clip is just that same URL plus one event's
`videoTimestamp`, expressed as a shareable Pulse post. No Cloudinary upload
code was written. If real Cloudinary-hosted video highlights are wanted in
the future, that's tracked as a future improvement in `TRACKER.md`.

## Why highlight-clip posts are inserted directly instead of via `createHighlightClipPostForUser`

`createHighlightClipPostForUser` (`feed.service.js`) enforces
`assertCanShareHighlightClip`, which requires the poster to either manage the
game or be the specific claimed player on that specific event. Enforcing
that for seed data would mean every highlight could only ever be posted by
whichever single teammate happens to be claimed on that exact event's
`playerId` — far too restrictive to produce 20+ varied posts from 5 different
posters. Since this is a trusted, server-side seed script (the same trust
level `seed.js` already operates at for all its `Post.insertMany` calls),
highlight posts are inserted directly via Mongoose, with the event's
existing `HIGHLIGHT_STAT_TYPES` membership and `videoTimestamp` presence
still checked (mirroring the service's own validation), but the
ownership/claim assertion intentionally skipped. The schema's unique-sparse
index on `highlightClip.eventId` is still respected (checked before each
insert) so the same event is never shared twice, matching real usage.

## Why highlights round-robin across games instead of filling from the first game

The first implementation iterated games in order and filled from each game's
full highlight-eligible event list before moving to the next — since a
single Demo League game has ~225 such events (far more than the 20-post
target), all 20 highlights came from the very first game, contradicting the
"come from multiple games" requirement. Caught by the requester in review
before this was documented as "verified." Fixed with a round-robin queue
(one candidate event pulled from each game per pass, cycling through all
games until the target count is reached) so highlights are guaranteed to
spread across as many games as needed to hit the target, rather than being
front-loaded onto whichever game happens to be processed first. Verified:
regenerating with the fix produced 20 highlights spanning all 8 Demo League
games (2–3 per game) instead of 20 from one game.

## Why the "full-screen game/team/player cards" requirement needed no new client code

Investigating `FeedList.jsx`'s post-type dispatch found that full-screen
renderers for `game_card` (`FullScreenGameCard.jsx`), `player_card`
(`FullScreenPlayerCard.jsx`), `team_card` (`FullScreenTeamCard.jsx`), and
`highlight_clip` (`FullScreenHighlightClipPost.jsx`) already existed and were
already wired into the mobile snap-scroll dispatch, built on the same shared
`cardUtils.js` helpers and server-side `cardSnapshot` shapes as the
already-working normal-mode cards. Asked directly, the requester confirmed
the actual gap was simply a lack of seeded content of those types — not a
missing UI feature — so no `client/` files were changed for this
requirement; seeding `game_card`/`player_card`/`team_card` posts (alongside
the highlight clips) was sufficient.

## Open question for a human maintainer before a production run

None of the choices above are provisional — they were all either directly
confirmed with the requester or are unambiguous given the existing codebase
constraints. The one thing genuinely deferred to a future decision is
**when** to run this against production (tracked in `TRACKER.md`'s
"Pending" section) — that's a business/timing decision, not a technical one,
and the script is ready whenever that's greenlit.
