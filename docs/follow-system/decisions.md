# Follow System — Decisions, Assumptions & Open Questions

> Records the architectural decisions confirmed before implementation, plus
> assumptions and non-blocking open questions.

## Confirmed decisions

### D1 — Follow at the user-account level (not per player profile)

**Decision:** Follows target `User._id`, not individual `LeaguePlayer` docs.
**Why:** A person owns many player profiles (`LeaguePlayer.claimedByUserId`), and
the app already unifies them at `GET /public/players/:userId`. Following the
account means one follow tracks the whole person and all their profiles — no
duplicate follows, no fan-out when they join a new league. Per-profile follows
would fragment identity.

### D2 — v1 scope: users only

**Decision:** v1 supports following user accounts only. Teams, leagues, a
personalized feed, and notifications are out of scope.
**Why:** The core requirement is user-following with correct multi-profile
handling. The broader vision (from the product ideas board) is several features;
users-only is the smallest surface that delivers value and fits the existing
`/players/:userId` profile surface. User confirmed "users only".

### D3 — Polymorphic-ready schema

**Decision:** Store follows as `{ followerUserId, targetType, targetId }` with
`targetType` enum = `['user']` in v1.
**Why:** Extending to `'team'`/`'league'` later is an additive enum change with
**no migration**. Small cost now (an enum + a generic `targetId`), large future
payoff. User confirmed the polymorphic-ready option.

### D4 — Private following, no public counts

**Decision:** A user's following list is private to them; no public
follower/following counts or follower lists on profiles.
**Why:** Simplest privacy story, zero exposure surface, appropriate for an MVP.
Public counts are a documented future enhancement. User confirmed "private".

### D5 — Durable follows / dangling follow handling

**Decision:** Follows are stored by `userId` and are durable. If a followed user
later has no public profile, still show a minimal card (name + avatar from the
`User` doc) with `profileHref: null`.
**Why:** A follow silently disappearing and reappearing is confusing; the
relationship should be stable. User confirmed "keep, show minimal card".

### D6 — Only logged-in users can follow (hard requirement)

**Decision:** All `/follows/*` routes require auth; the `FollowButton` shows a
"Log in to follow" CTA (→ `/login`) to logged-out visitors rather than a silent
no-op or hidden button.
**Why:** Explicit user requirement. Also the only sensible model — a follow needs
an authenticated follower identity.

### D7 — Quick access to followed profiles (hard requirement)

**Decision:** A persistent "Following" nav link (visible whenever logged in) plus
one-click links from each following-card to the user's `/players/:userId` profile.
**Why:** Explicit user requirement — users must reach followed profiles fast.

## Assumptions

- **A1:** The only follow target with a public surface today is a claimed-league-player
  user. Standalone team players have no user link (`claimedByUserId` absent), so
  they're correctly out of scope.
- **A2:** No cap on how many users one account can follow (v1).
- **A3:** No cascade on account deletion (v1); list hydration tolerates missing
  users via `findUsersByIds` skipping absent ids.
- **A4:** Button state is fetched separately (`/follows/status`) so the public
  profile response stays unchanged and cacheable.

## Open questions (non-blocking)

- **Q1:** Should there be a follow cap per user? (Assumed no for v1; revisit if abused.)
- **Q2:** Should account deletion cascade-delete follow rows? (Assumed no for v1;
  a cleanup job or cascade is a future enhancement.)
- **Q3:** When do we introduce public follower counts? (Deferred; likely alongside
  the personalized feed / notifications work.)

## D8 — Follow button scope stays public-surface-only (found + fixed 2026-07-11)

**Decision:** The follow button (and the `claimedUserId` field that powers it)
only appears/resolves on **public** surfaces: the unified profile
(`/players/:userId`), homepage discovery, and the public league-player page
**when `league.isPublic`**. It is withheld — both server-side (`claimedUserId`
nulled) and client-side (gated on `league.isPublic`) — on a private-league
player page, even for an authorized viewer (owner/manager/roster member).
**Why:** Adding the button to `PublicLeaguePlayerPage` required exposing
`claimedUserId`, but that page is also reachable for **private** leagues by
anyone `assertLeagueVisible` authorizes. Without this fix, a private-league
viewer could follow someone via a linkage that was supposed to be a public-only
feature. `isClaimed`/`claimedBadgeLabel` (pre-existing) still work unchanged —
only the raw account id is withheld for private leagues. Found during a
pre-merge security review; see the `follows.controller`/`leagues.service` tests
for `getPublicLeaguePlayerBySlug`.

## Follow-up fixes from the same review (performance, not scope)

- **Parallelized `hasPublicProfile` check**: `listFollowing` computed each
  followed user's `hasPublicProfile` sequentially in a loop; switched to
  `Promise.all` so a page of N follows costs one round of concurrent lookups,
  not N serialized ones.
- **`FollowButton` gained `knownIsFollowing`**: lets a parent that already
  knows (or has batch-fetched) a user's follow status skip the button's own
  `GET /follows/status` call. `DiscoverablePlayers` now issues one batched
  status request for every visible claimed result instead of one per card;
  `FollowingPage` passes `knownIsFollowing` unconditionally, since every entry
  on that page is by definition already followed — no fetch needed at all.
