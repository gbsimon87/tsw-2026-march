# Proposed PROJECT-KNOWLEDGE.md updates (apply AFTER merge to main)

> Follow the repo rule: apply these only once the feature ships. Mirrors the v1
> `docs/follow-system/proposed-project-knowledge-updates.md` handoff.

## §1 — update the Follow System bullet

Change the "User Follow System v1 (users-only, 2026-07-11)" bullet to note the
v1.5 extension. Suggested edit to its opening + the "polymorphic-ready" and
"Deferred" sentences:

- Title/lead: "**Follow System (v1.5, 2026-07-12)**: signed-in users can
  follow/unfollow **user accounts, leagues, and league teams** and view a private
  sectioned "Following" page (`/following`, Players / Leagues / Teams)."
- Schema line: "`Follow.targetType` enum is `['user','league','leagueTeam']`
  (widened from `['user']` — additive, no migration)."
- Gating: "League and league-team follows reuse `assertLeagueVisible` (leagueTeam
  via its parent `leagueId`) for both follow-creation and list hydration; a
  now-private followed target has its `profileHref`/slugs nulled server-side
  (D8), the follow row persists (D5)."
- Routes: "Backed by generic `POST/DELETE /follows/:targetType/:targetId` +
  `GET /follows/following?targetType` + `GET /follows/status?targetType&targetIds`
  (the old `/follows/users/:userId` kept as a back-compat alias)."
- Deferred: "standalone `Team` follows (no public surface yet), public counts,
  personalized feed, notifications."
- Point the "Design + trackers" link at `docs/follow-system-teams-leagues/`
  alongside `docs/follow-system/`.

## §5 — update the `Follow` collection row

Change the `targetType` note from "enum is `['user']` only in v1" to:
"`targetType` enum `['user','league','leagueTeam']` (v1.5); `targetId` is
polymorphic over the type — a `User`, `League`, or `LeagueTeam` `_id`."

## §11 — add a "Follow System v1.5" entry

Add after the existing v1 / security-pass entries:

> **Follow System v1.5, leagues + league teams (2026-07-12,
> `feature/follow-teams-leagues`)**: widened `Follow.targetType` to
> `['user','league','leagueTeam']` (additive, no migration) and generalized the
> `follows` module into a `TARGET_HANDLERS` dispatch map
> (`assertFollowable`/`hydrateMany` per type). Generic
> `/follows/:targetType/:targetId` routes (old `/users/:userId` kept as a
> back-compat alias). League/leagueTeam visibility gates **reuse**
> `assertLeagueVisible` (leagueTeam via parent `leagueId`) for follow-creation and
> list hydration — hydration nulls `profileHref`/slugs server-side for
> now-private targets (D8). Client: `FollowButton` gained `targetType`
> (default `'user'`, existing mounts unchanged); sectioned `/following` page
> (Players/Leagues/Teams, per-type pagination); follow buttons on
> `PublicLeaguePage`/`PublicLeagueTeamPage` gated on `league.isPublic`. Server
> suite 416/416; whole-diff security review found no issues. Deferred: standalone
> `Team` follows, public counts, personalized feed, notifications. Known perf
> note: hydration re-fetches leagues already loaded (bounded, reuse-over-speed
> choice). Design + trackers: `docs/follow-system-teams-leagues/`.
