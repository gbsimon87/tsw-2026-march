# API Reference

Base path: `/api/v1`. Module `*.routes.js` files are the source of truth.
Mutations require `x-csrf-token`. Routes are authenticated unless marked
public. Errors use `{ error: { message, details, requestId } }`.

## Auth And Utility

```text
GET    /health                                      public
POST   /contact                                     public, rate-limited
POST   /analytics/event

POST   /auth/register                               public
POST   /auth/login                                  public
POST   /auth/refresh                                public
POST   /auth/logout                                 public
GET    /auth/me
POST   /auth/avatar                                 multipart: avatar
POST   /auth/request-verification                   public
POST   /auth/verify-email                           public
POST   /auth/forgot-password                        public
POST   /auth/reset-password                         public
GET    /auth/google/start                           public
GET    /auth/google/callback                        public
POST   /auth/google/exchange                        public when OAuth configured
```

Avatar MIME types: JPEG, PNG, WebP.

## Teams

```text
POST   /teams
GET    /teams                                       cursor-paginated
GET    /teams/:teamId
PATCH  /teams/:teamId
GET    /teams/:teamId/entitlements
POST   /teams/:teamId/logo                          multipart: logo
DELETE /teams/:teamId/logo
POST   /teams/:teamId/players
PATCH  /teams/:teamId/players/:playerId
DELETE /teams/:teamId/players/:playerId

GET    /public/teams                                public
GET    /public/teams/explore                        public
GET    /public/teams/:teamId                        public
GET    /public/teams/:teamId/players/:playerId      public
GET    /public/opponents/:opponentSlug              public
```

Team colors accept up to three hex values. Positions are `PG`, `SG`, `SF`,
`PF`, or `C`. Logo MIME types: JPEG, PNG, WebP.

## Games

```text
POST   /games
GET    /games                                       cursor-paginated
GET    /games/:gameId                               public, optional auth
PATCH  /games/:gameId
POST   /games/:gameId/lineup
POST   /games/:gameId/roster
POST   /games/:gameId/events
POST   /games/:gameId/events/:eventId/insert-before
PATCH  /games/:gameId/events/:eventId
DELETE /games/:gameId/events/:eventId
POST   /games/:gameId/finish
DELETE /games/:gameId
```

Lineups contain exactly five player IDs and optional `teamSide` (`home` or
`away`). Mid-game roster additions accept `displayName`, optional
`jerseyNumber`, and `side` for dual-team games. Completed games reject roster
additions.

Event types and court zones come from
`server/src/modules/shared/stats.constants.js`. Shots require `playerId`,
`zoneId`, `x`, and `y`; opponent events reject `playerId`. Coordinates use
`0..100`. `teamSide`, `occurredAt`, and `videoTimestamp` are optional where
allowed by `games.validation.js`.

## Feed And Follows

```text
GET    /feed                                        public
GET    /feed/discoverable/players                   public
GET    /feed/shareable/games                        public
GET    /feed/shareable/players                      public
GET    /feed/shareable/teams                        public
POST   /feed/image                                  multipart: file
POST   /feed/video                                  multipart: file
POST   /feed/game-card
POST   /feed/player-card
POST   /feed/team-card
POST   /feed/highlight-clip
DELETE /feed/:postId                                creator only

GET    /follows/following
GET    /follows/status
POST   /follows/:targetType/:targetId
DELETE /follows/:targetType/:targetId
```

Follow target types: `user`, `league`, `leagueTeam`. Legacy
`/follows/users/:userId` mutation aliases remain temporarily.

## Leagues

```text
POST   /leagues
GET    /leagues                                     cursor-paginated
GET    /leagues/my-profiles
GET    /leagues/:leagueId
PATCH  /leagues/:leagueId
POST   /leagues/:leagueId/archive

POST   /leagues/:leagueId/seasons
GET    /leagues/:leagueId/seasons
POST   /leagues/:leagueId/seasons/:seasonId/complete
GET    /leagues/:leagueId/standings
GET    /leagues/:leagueId/games
POST   /leagues/:leagueId/games/bulk

GET    /leagues/:leagueId/managers
POST   /leagues/:leagueId/managers
DELETE /leagues/:leagueId/managers/:managerId
POST   /leagues/:leagueId/logo                      multipart: logo
DELETE /leagues/:leagueId/logo

POST   /leagues/:leagueId/teams
GET    /leagues/:leagueId/teams
GET    /leagues/:leagueId/teams/:leagueTeamId
PATCH  /leagues/:leagueId/teams/:leagueTeamId
POST   /leagues/:leagueId/teams/:leagueTeamId/archive
POST   /leagues/:leagueId/teams/:leagueTeamId/logo  multipart: logo
DELETE /leagues/:leagueId/teams/:leagueTeamId/logo
POST   /leagues/:leagueId/teams/:leagueTeamId/players
PATCH  /leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId
DELETE /leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId
POST   /leagues/:leagueId/teams/:leagueTeamId/players/:leaguePlayerId/unclaim
GET    /leagues/:leagueId/teams/:leagueTeamId/members
POST   /leagues/:leagueId/teams/:leagueTeamId/managers
PATCH  /leagues/:leagueId/teams/:leagueTeamId/members/:memberId
DELETE /leagues/:leagueId/teams/:leagueTeamId/members/:memberId
POST   /leagues/:leagueId/teams/:leagueTeamId/join-requests
GET    /leagues/:leagueId/teams/:leagueTeamId/join-requests
POST   /leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/approve
POST   /leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/reject
POST   /leagues/:leagueId/teams/:leagueTeamId/join-requests/:requestId/cancel

GET    /leagues/:leagueId/data-completeness
POST   /leagues/:leagueId/data-completeness/dismissals
DELETE /leagues/:leagueId/data-completeness/dismissals/:issueKey
```

Bulk schedules require an active season and 1-200 games. Each game requires
different home/away league-team IDs and `scheduledAt`; `venue` is optional.
`replaceExisting` removes only event-free scheduled games in that season.

Dismissal issue keys must be URL-encoded when restored. Permission rules are in
[`permissions.md`](./permissions.md); health checks are in
[`data-completeness.md`](./data-completeness.md).

## Public League Data

```text
GET    /public/leagues                              public
GET    /public/leagues/:leagueSlug                  public
GET    /public/leagues/:leagueSlug/standings        public
GET    /public/leagues/:leagueSlug/games            public
GET    /public/leagues/:leagueSlug/leaders          public
GET    /public/leagues/:leagueSlug/seasons          public
GET    /public/leagues/:leagueSlug/teams/:teamSlug  public
GET    /public/leagues/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId
GET    /public/players/:userId                      public
```

## Exports

```text
GET /export/my-sporty
GET /export/leagues/:leagueId/season/:seasonId
GET /export/leagues/:leagueId/teams/:leagueTeamId/season/:seasonId
```

Responses are CSV attachments. League export requires league-manager or owner
access; team export also permits that team's manager.

## Billing

```text
GET  /billing/catalog                               public
POST /billing/team-checkout
POST /billing/league-checkout
POST /billing/customer-portal
POST /billing/checkout-session                      legacy alias
POST /billing/webhooks                              public, Stripe-signed raw body
```

Checkout interval is `monthly` or `season`. Stripe webhooks, not checkout
redirects, update billing state. See [`pricing.md`](./pricing.md).
