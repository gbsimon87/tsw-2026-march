# Known Technical Debt

> Part of the [Application Audit](./README.md) · July 2026

Catalogue of debt found during the audit, grouped by kind. Performance debt is
covered separately in reports [23](./23-api-audit.md)–[29](./29-frontend-optimisation.md).

## Correctness-adjacent (fix first)

1. **`participant.slug` missing from the Game schema** — service writes/reads
   it but Mongoose silently drops it; a runtime backfill runs on every
   dual-game read forever (`games.service.js:724-732`, schema at
   `games.repository.js`).
2. **`publicOnly` option silently ignored** — `getPublicLeagueBySlug` passes
   `{publicOnly:true}` but `listLeagueGames` takes no options
   (`leagues.service.js:549` vs `:1705`); public games list is unfiltered.
3. **Standings tie rule**: `homePoints >= awayPoints` counts ties as home wins
   (`leagues.service.js:1763`).
4. **AI summary lock has no expiry**; persisted fallback summaries never retry;
   editing a completed league game clears the summary but nothing can ever
   regenerate it (`games.service.js:160-164, 1486-1505`).
5. **Contact form HTML injection** — user fields interpolated unescaped into
   the notification email.
6. **Feed `req.auth` never populated on GET routes** — mounted before
   `authMiddleware` with no `optionalAuthMiddleware` (`feed.routes.js:26-31`),
   so `canDelete` is always false in listings.
7. **Roster-snapshot repair writes during GET requests**
   (`games.service.js:642-697, 749`).
8. **No optimistic concurrency on Game saves** — two trackers on one game can
   clobber lineups/events.

## Duplicated logic (consolidate)

- Stat accumulators ×3: `applyEventToRow` (`games.service.js:254-314`) ≡
  `applyEventToLine` (`leagues.service.js:1492-1553`); `emptyStats` ×2; all
  belong in `server/src/modules/shared/statSummary.js`.
- `HIGHLIGHT_STAT_TYPES` defined in games and redefined in teams service;
  highlight-building loops duplicated (`games.service.js:78` vs
  `teams.service.js:318`).
- `sanitizeLogo` ×2; box-score totals reduction ×2; recap team-stats blocks
  triplicated (`gameRecap.service.js:155-190`).
- Entitlement derivation ×2 (`billing.service.js:73-92` vs
  `auth.service.js:76-85`).
- Legacy billing route/controller byte-identical to team-checkout.
- `CLIENT_ORIGIN.split(',')[0]` helper ×3.
- Client: `DashboardPage.jsx` is a live-in-bundle duplicate of `AdminPage.jsx`
  (same triple fetch, apparently superseded).

## Dead code / dead paths

- Email verification flow (registration pre-verifies; request endpoint is a
  stub) + `EMAIL_VERIFY_TTL_MINUTES`.
- `STRIPE_PRICE_ID_PRO_MONTHLY` env; legacy `'pro'` plan values (kept for
  We-ball Saturday — document or migrate).
- User-level league billing fields written by nothing
  (`auth.repository.js:13-23`).
- `games.controller.getById` exported but unrouted; `loginWithGoogle` unused;
  several unused repository exports (`findGameByIdAndOwner`,
  `listGamesByStandaloneParticipantTeamId`, …); `summarizeEventsOneSided` and
  `findLeaguesByOwner` pass-through aliases.
- `events.teamSide` index (multikey, unqueried).

## Fragile couplings

- Placeholder league claimed by **literal name `'My League'`**
  (`leagues.service.js:398-401`) ↔ webhook creation.
- `getLeagueTeamRosterSnapshotForGame` hardcodes an active-pro billing spoof
  (`leagues.service.js:1873-1874`).
- Session `expiresAt` hardcoded 7d, ignoring `REFRESH_TOKEN_TTL`.
- Client display prices hardcoded vs Stripe price objects.
- Stripe API version unpinned + deprecated field read.

## Validation gaps

- List query params unvalidated (`games.controller.js:28-31`); most `:id`
  params rely on Mongoose cast errors; zod schemas cover bodies only.
- Analytics `distinctId` unbound to the authed user.

## Operational

- No graceful shutdown; health check without DB ping; in-memory rate limiters;
  no dedicated login/register limiter; CSRF token minted on every request
  (Set-Cookie churn); `processedWebhookEventIds` race window.
