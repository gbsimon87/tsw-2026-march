# 03 · Feature Packaging

> How every capability maps to plans and entitlement keys. The **entitlement key** is
> the contract features check at runtime (never the plan name). This table is the
> human-readable form of what `plan-catalog.js` will encode.

## Legend

- **Access:** ✓ included · — not included · ＋ add-on (future)
- **Build status:** ● built today · ◐ partial · ○ proposed (fast-follow / future)
- **Gate type:** how access is enforced — see
  [`08-entitlements-and-gating.md`](./08-entitlements-and-gating.md).

## Feature → plan matrix

| Feature                               | Entitlement key         | Status | Starter | Team Pro | League | Gate type                         |
| ------------------------------------- | ----------------------- | ------ | :-----: | :------: | :----: | --------------------------------- |
| Live stat tracking                    | `canTrackStats`         | ●      |    ✓    |    ✓     |   ✓    | **Free** (was 402 — D2 removes)   |
| Box scores & recaps                   | `canViewBoxScore`       | ●      |    ✓    |    ✓     |   ✓    | Free                              |
| Public team/player pages              | _(always on)_           | ●      |    ✓    |    ✓     |   ✓    | Free / public                     |
| Following, shareable cards, The Pulse | _(always on)_           | ●      |    ✓    |    ✓     |   ✓    | Free / public                     |
| Replay                                | `canViewReplay`         | ●      |    —    |    ✓     |   ✓    | Snapshot + light server guard     |
| Public shot maps                      | `canViewShotMaps`       | ●      |    —    |    ✓     |   ✓    | Snapshot + light server guard     |
| Highlight clips                       | `canViewHighlightClips` | ●      |    —    |    ✓     |   ✓    | Client-surfaced (share gated)     |
| Full historical stats                 | `canViewFullHistory`    | ◐      | recent  |    ✓     |   ✓    | Client-surfaced (limits ○)        |
| CSV export                            | `canExportCsv`          | ●      |    —    |    ✓     |   ✓    | **Hard server 402** (data egress) |
| Rich player profiles (cascade)        | `canRichPlayerProfiles` | ○      |    —    |    ✓     |   ✓    | Content-shaping (no 402)          |
| Coach reports & season trends         | `canViewCoachReports`   | ○      |    —    |    ✓     |   ✓    | Content-shaping                   |
| League management                     | `canManageLeague`       | ●      |    —    |    —     |   ✓    | **Hard server 402**               |
| Priority support                      | _(operational)_         | ●      |    —    |    ✓     |   ✓    | n/a                               |
| Sponsor integrations                  | `canUseSponsorTools`    | ○      |    —    |    —     |   ＋   | Future add-on                     |

Notes:

- **Following is already free and built** (Follow System v1.5) — logged-in users
  follow users/leagues/league-teams. No change needed; listed to make explicit it
  stays free.
- **League bundles Team Pro:** the League plan's resolved entitlement set is
  `league entitlements ∪ team_pro entitlements`, so every team in a League gets replay/
  shot maps/highlights/history/export without a separate Team Pro purchase. Encoded as
  `bundles: ['team_pro']` in the catalog.
- **Full history** is `◐` because history _exists_ today but the Starter _limit_ (recent
  season only) is not enforced — enforcement is a fast-follow.

## Entitlement key catalog

The complete set the resolver can return. Absent keys default to `false`.

| Key                     | Meaning                                             | Introduced    |
| ----------------------- | --------------------------------------------------- | ------------- |
| `canTrackStats`         | Create games & record events                        | now           |
| `canViewBoxScore`       | View derived box scores/recaps                      | now           |
| `canViewReplay`         | Event-by-event replay                               | now           |
| `canViewShotMaps`       | Public shot-location charts                         | now           |
| `canViewHighlightClips` | Highlight clip playback/creation                    | now           |
| `canViewFullHistory`    | Beyond recent-season history                        | now (limit ○) |
| `canExportCsv`          | CSV data export                                     | now           |
| `canRichPlayerProfiles` | Rich public player profiles (cascade)               | fast-follow   |
| `canViewCoachReports`   | Post-game reports & season trends                   | future        |
| `canManageLeague`       | League admin (standings/rosters/scheduling/seasons) | now           |
| `canUseSponsorTools`    | Sponsor placements on public pages                  | future        |

> **Why reserve future keys now:** adding the key to the catalog (even unused) means
> the feature, when built, only has to _check_ it — no packaging refactor later. Keys
> marked "future" resolve `false` everywhere until a plan claims them.

## Cascade summary (fast-follow)

`canRichPlayerProfiles` is the first cascading entitlement:

- **Standalone team:** a Team Pro team → its embedded players' `PublicPlayerPage`
  renders rich sections. Team-scoped (no user link).
- **League team:** a League (which bundles Team Pro) → all member teams → each claimed
  `LeaguePlayer`'s `PublicLeaguePlayerPage` renders rich sections. Resolved via
  `LeaguePlayer → LeagueTeam → League`.

Derived at resolve time; never stored per-player. Full design in
[`05-architecture.md`](./05-architecture.md).
