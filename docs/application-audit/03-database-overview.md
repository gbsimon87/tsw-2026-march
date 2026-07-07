# Database Overview

> Part of the [Application Audit](./README.md) · July 2026

MongoDB via Mongoose 8. Connection: `server/src/config/db.js` —
`mongoose.connect(MONGO_URI, { dbName })` with **no pool sizing or timeout
options** (driver defaults: maxPoolSize 100, serverSelectionTimeoutMS 30s),
5 connection retries with linear backoff, no disconnect/SIGTERM handling.

Schemas are defined inline in each module's `*.repository.js`. There is **no
`.aggregate()` usage anywhere** — all derived data is computed in Node.

Live dev DB (`tsw_2026_dev` on Atlas, inspected 2026-07-04): 12 collections,
136 documents, ~217 KB data, **73 indexes (~2.4 MB — index size is 11× data
size)**. Dataset is tiny today, so all performance findings are about scaling
behaviour, not current pain.

## Collections

### users — `server/src/modules/auth/auth.repository.js`

email (unique), name, passwordHash, googleId, emailVerified, authProvider
(local/google), avatar, `roles:[String]` (default `['user']`), `plan`
(free/pro — mirror of team billing via `syncOwnerPlan`), legacy `leaguePlan` +
league stripe fields (**written nowhere — dead schema fields**, only read by
`sanitizeUser`).
Live indexes: `email_1`, `googleId_1`.

### sessions — same file

userId, sessionId (unique), refreshTokenHash (sha256), userAgent, ip,
expiresAt. **TTL index** `{expiresAt:1, expireAfterSeconds:0}` handles cleanup.
Live indexes: `userId_1`, `sessionId_1`, `expiresAt_1` (TTL).

### authtokens — same file

userId, type (email_verification/password_reset), tokenHash (unique), expiresAt
(TTL), usedAt. Live indexes: `userId_1`, `type_1`, `tokenHash_1`,
`expiresAt_1` (TTL), `userId_1_type_1`.

### teams — `server/src/modules/teams/teams.repository.js`

ownerUserId, name, logo `{url, publicId, width, height, mimeType}`, colors[],
homeVenue (7 address fields), **players[] embedded** (displayName,
jerseyNumber, position, isActive — soft delete), plus billing fields: plan,
subscriptionStatus, stripeCustomerId/SubscriptionId/PriceId, billingInterval,
currentPeriodEnd, trialEnd, cancelAtPeriodEnd, billingEmail,
`processedWebhookEventIds[]` (ring capped at 25 in code), lastWebhookEventId.
Indexes: `ownerUserId_1` (redundant — prefix of the compound),
`ownerUserId_1_name_1`.

### games — `server/src/modules/games/games.repository.js` (the hot collection)

ownerUserId, teamId, gameContext (standalone/league), trackingMode (single/dual),
leagueId, home/awayLeagueTeamId, trackedLeagueTeamId, home/awayTeamId,
home/awayParticipant (embedded: side, participantType, teamId, leagueTeamId,
displayName, logo, colors, billingSnapshot/entitlementsSnapshot as Mixed —
**note: service reads/writes `participant.slug` but the schema has no `slug`
field, so Mongoose silently drops it**, forcing a runtime backfill on every
dual-game read: `games.service.js:724-732`), title, opponent, videoUrl, status,
6 lineup id arrays, scheduledAt, completedAt, **three roster snapshot arrays**
(rosterSnapshot/homeRosterSnapshot/awayRosterSnapshot), **`events[]` — unbounded
embedded array** of shot events (playerId, statType, zoneId, x/y, teamSide,
videoTimestamp, occurredAt, each with its own `_id`; ~200–600 events per
tracked game), aiSummary (embedded), aiSummaryGenerationLockId/LockedAt.

Live indexes (**23 on this collection alone**):

```
_id_, ownerUserId_1, teamId_1, gameContext_1, trackingMode_1, leagueId_1,
homeLeagueTeamId_1, awayLeagueTeamId_1, trackedLeagueTeamId_1, homeTeamId_1,
awayTeamId_1, homeParticipant.teamId_1, homeParticipant.leagueTeamId_1,
awayParticipant.teamId_1, awayParticipant.leagueTeamId_1, status_1,
events.teamSide_1, ownerUserId_1_teamId_1_createdAt_-1,
homeTeamId_1_createdAt_-1, awayTeamId_1_createdAt_-1,
homeLeagueTeamId_1_createdAt_-1, awayLeagueTeamId_1_createdAt_-1,
aiSummaryGenerationLockId_1
```

Redundancies and problems are analysed in [19-indexing-strategy](./19-indexing-strategy.md)
(headline: 5+ single-field indexes are prefixes of compounds; `events.teamSide_1`
is a multikey index over every event of every game with no query that uses it).

### leagues — `server/src/modules/leagues/leagues.repository.js`

ownerUserId, name, slug (unique), description, seasonLabel, status
(active/archived), isPublic, logo, plan (free/pro/league), subscriptionStatus,
stripe fields (as teams), billingInterval (monthly/season),
`processedWebhookEventIds[]`, lastWebhookEventId.
Indexes: `ownerUserId_1` (redundant prefix), `slug_1`, `status_1`,
`ownerUserId_1_status_1`.

### leagueteams

leagueId, name, slug, logo, colors[], status. Indexes: `leagueId_1`,
`status_1`, `leagueId_1_slug_1` (unique).

### leagueplayers

leagueId, leagueTeamId, displayName, jerseyNumber, position (PG/SG/SF/PF/C),
isActive (soft delete), claimedByUserId. Indexes: `leagueId_1`,
`leagueTeamId_1`, `claimedByUserId_1`. **No compound index** — the common query
`{leagueTeamId, isActive}` relies on the single-field index.

### leagueteammembers

leagueId, leagueTeamId, userId, role (manager/helper/player), leaguePlayerId,
status (active/removed), createdByUserId. Indexes: singles on leagueId /
leagueTeamId / userId / status + compound `leagueTeamId_1_userId_1_status_1`.
Note: `listLeagueTeamManagersByLeague` queries `{leagueId, role, status}` which
no compound covers.

### leaguejoinrequests

leagueId, leagueTeamId, requesterUserId, requestedRole, requestedLeaguePlayerId,
status (pending/approved/rejected/canceled), reviewedByUserId, reviewedAt.
Indexes: singles + `leagueTeamId_1_requesterUserId_1_status_1`.

### leaguemanagers

leagueId, userId, createdByUserId, status. Indexes: singles +
`leagueId_1_userId_1_status_1`.

### posts — `server/src/modules/feed/feed.repository.js`

creatorUserId, type (post/game_card/player_card/team_card/highlight_clip),
caption, embedded image/video subdocs (url, publicId, width, height, duration…),
card subdocs storing referenced IDs only (hydrated at read time),
highlightClip subdoc. Indexes: `creatorUserId_1`, `type_1`,
`highlightClip.eventId_1` (unique sparse — duplicate-share guard).
Feed pagination is `_id`-cursor keyset (`{_id: {$lt: cursor}}`, sort `{_id:-1}`).

## Relationships

All references are by ObjectId (no populate discipline — services fetch by id).

```
User 1─N Team (ownerUserId)          User 1─N League (ownerUserId)
League 1─N LeagueTeam 1─N LeaguePlayer
League 1─N LeagueManager (userId)    LeagueTeam 1─N LeagueTeamMember (userId)
Game → Team (home/away or teamId) or LeagueTeam (dual-mode standalone/league)
Post → User + optionally Game/Team/LeaguePlayer (cards, highlight clips)
```

Games are **dual-mode**: standalone (owned team vs text opponent, or two owned
teams) or league (two LeagueTeams, one optionally "tracked"). The embedded
`homeParticipant`/`awayParticipant` subdocs denormalise display data and
snapshot billing/entitlements at creation.

## Write patterns worth knowing

- **Event appends save the whole Game document** (`game.events.push()` +
  `game.save()` — `games.service.js:1184-1198`, `games.repository.js:266-268`),
  not `$push`. No optimistic-concurrency guard: two trackers on the same game
  can clobber lineups.
- Roster-snapshot lazy repair (`repairGameRosterSnapshots`,
  `games.service.js:642-697`) runs on every read/append and can **write during
  a GET**.
- Webhook idempotency uses a read-modify-save ring of event IDs on the
  Team/League doc — not atomic under concurrent webhook delivery.

## Known schema limitations

1. `Game.events` unbounded array: the 16 MB doc limit is distant (~200-600
   events × ~150 B), but every read/list carries the full array.
2. `participant.slug` missing from schema (silently dropped writes).
3. Dead user-level league billing fields.
4. Ties count as home wins in standings (`homePoints >= awayPoints`,
   `leagues.service.js:1763`).
5. No materialised/derived collections — every aggregate view recomputes.

See [24-database-audit](./24-database-audit.md) for recommendations.
