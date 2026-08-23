# Court image versioning implementation plan

**Feature status:** Design complete; implementation not started  
**Last updated:** 2026-08-23  
**Scope:** Tracking court, completed-game shot snapshot, and game replay

## Goal

Introduce a new basketball court image for newly created games without changing the
meaning or display position of locations already recorded against
`basketball_court_1.png`.

The safe approach is to version the complete court layout contract, not merely replace
the imported image. A layout includes:

- the image asset;
- its intrinsic width, height, aspect ratio, and orientation;
- the rectangle in the image that represents the playable court;
- the calibration used for hoop, three-point, and zone inference; and
- the coordinate semantics used by markers saved for that layout.

## Why a direct image replacement is unsafe

The current `x` and `y` event fields are percentages of the displayed image (`0..100`),
not coordinates in an image-independent court model. The tracker uses the old image's
calibration to turn a click into the saved stat type and zone. Recap and replay then put
the saved percentages directly on the same PNG.

Consequently, replacing the PNG import can cause two separate regressions:

1. Existing markers can move relative to the painted court lines when rendered on the
   new image.
2. New clicks can be classified into the wrong 2PT/3PT family or zone if the new
   image's court rectangle or line placement differs.

The old asset is currently coupled to these paths:

- [`InteractiveCourtImage.jsx`](../client/src/features/games/components/InteractiveCourtImage.jsx)
  captures normalized image coordinates.
- [`courtImageCalibration.js`](../client/src/features/games/court/courtImageCalibration.js)
  contains values tuned specifically for `basketball_court_1.png`.
- [`GameTrackPage.jsx`](../client/src/features/games/pages/GameTrackPage.jsx) performs
  inference and saves the resulting `zoneId`, `x`, and `y`.
- [`RecapShotSnapshot.jsx`](../client/src/features/games/components/RecapShotSnapshot.jsx)
  renders completed-game markers directly over the old image.
- [`GameReplayPanel.jsx`](../client/src/features/games/components/GameReplayPanel.jsx)
  does the same for replay.
- [`games.repository.js`](../server/src/modules/games/games.repository.js) stores only
  `zoneId`, `x`, and `y`; it does not currently identify the layout under which those
  values were recorded.

## Decision

Add an immutable, game-level `courtLayoutId` and keep both assets in the application.

| Game record                                            | Resolved layout | Behaviour                                                         |
| ------------------------------------------------------ | --------------- | ----------------------------------------------------------------- |
| Existing record with no `courtLayoutId`                | `legacy-v1`     | Uses `basketball_court_1.png` and today's calibration             |
| Newly created record after cutover                     | `court-v2`      | Uses the new asset and its independently measured calibration     |
| Existing scheduled or in-progress record with no value | `legacy-v1`     | Remains on the old layout so a game cannot mix coordinate systems |

`courtLayoutId` must be assigned by the server at game creation and must not be accepted
from an ordinary create/update request. Once assigned, it must not change. In
particular, changing a game's status must not change its layout.

This deliberately preserves _all_ pre-cutover games, not only completed games. That is
slightly more conservative than the original requirement, but prevents an in-progress
game from containing events recorded against two images.

No historical event migration is required. Missing `courtLayoutId` is the durable
legacy discriminator, so the release remains backward compatible even before an
optional database backfill is run.

## Proposed layout registry

Create one client-side source of truth, for example
`client/src/features/games/court/courtLayouts.js`:

```js
export const LEGACY_COURT_LAYOUT_ID = 'legacy-v1';
export const CURRENT_COURT_LAYOUT_ID = 'court-v2';

export const COURT_LAYOUTS = {
  'legacy-v1': {
    image: legacyCourtImage,
    width: 420,
    height: 760,
    calibration: LEGACY_V1_CALIBRATION,
  },
  'court-v2': {
    image: courtV2Image,
    width: /* measured source width */,
    height: /* measured source height */,
    calibration: COURT_V2_CALIBRATION,
  },
};

export function resolveCourtLayout(id) {
  return COURT_LAYOUTS[id] || COURT_LAYOUTS[LEGACY_COURT_LAYOUT_ID];
}
```

Unknown or absent IDs should fail closed to `legacy-v1` for rendering existing data.
The server should use matching string constants, with `court-v2` as the default only
when it creates a new game. Avoid a Mongoose schema default of `court-v2`: document
defaults can obscure the distinction between legacy records and genuinely stamped new
records when old documents are hydrated or rewritten. Set the value explicitly in all
game-creation paths instead.

Keep `basketball_court_1.png` in source control for as long as a persisted game can
reference `legacy-v1`. Renaming it to a version-explicit name is optional, but deleting
or overwriting it is not.

## Implementation phases

### Phase 0 — prepare and calibrate the new asset

- [ ] Add the new court under `client/src/assets/courts/` as a new file; do not replace
      `basketball_court_1.png` in place.
- [ ] Record the new image's exact intrinsic dimensions and orientation.
- [ ] Confirm whether the image includes transparent padding, a border, labels, or
      decoration outside the playable court.
- [ ] Measure `courtRect.left`, `top`, `width`, and `height` as percentages of the full
      image.
- [ ] Tune the three-point and corner thresholds by clicking representative points on
      the visible lines. Do not copy the legacy calibration unless the geometry is proven
      identical.
- [ ] Update [`client/src/assets/courts/README.md`](../client/src/assets/courts/README.md)
      so it documents every supported layout accurately. The legacy PNG is actually
      `442x829`, the live component forces a `420x760` ratio, and the README currently
      calls `500x940` canonical. Preserve the current rendered legacy ratio unless visual
      regression testing explicitly approves correcting that existing distortion.

**Gate:** Do not start the data cutover until the final image file and calibration are
stable. Changing either after events are recorded creates another layout version.

### Phase 1 — add the persisted compatibility contract

- [ ] Add `courtLayoutId` to `gameSchema` with an enum containing `legacy-v1` and
      `court-v2`, leaving the schema default unset or `null`.
- [ ] Explicitly write `court-v2` in every `createGameForUser` branch and in any bulk
      fixture creation path. The schedule builder currently uses `insertManyGames` from
      `leagues.service.js`, so it needs an explicit stamp too.
- [ ] Return the resolved value from `sanitizeGame`:
      `game.courtLayoutId || 'legacy-v1'`.
- [ ] Include the resolved layout ID wherever recap data is consumed. Prefer adding it
      to `shotSnapshot` as `courtLayoutId`, so the snapshot is self-describing even when
      used separately from the full game response.
- [ ] Do not expose `courtLayoutId` in `createGameSchema` or `updateGameSchema`; layout
      selection is a server-owned integrity decision.
- [ ] Use `courtLayoutId` as a write precondition for coordinate-bearing append,
      insert, and coordinate-edit requests. The client sends the layout it displayed; the
      server compares it with the game's resolved layout and returns `409 Conflict` on a
      mismatch. The precondition does not need to be duplicated on each stored event.
- [ ] During rollout, permit an absent precondition only for `legacy-v1` games. Reject
      an absent value for `court-v2`, which prevents a cached old client from recording v1
      clicks into a newly stamped v2 game. The error should tell the user to refresh.
- [ ] Add a repository/service test proving that a legacy document without the field
      serializes as `legacy-v1` and a new game is persisted as `court-v2`.

If league schedule creation bypasses `createGameForUser`, it must stamp `court-v2` too.
Use a shared server constant/helper so creation paths cannot drift.

### Phase 2 — make tracking layout-aware

- [ ] Replace the module-level old-image import in `InteractiveCourtImage` with a
      required/resolved layout prop.
- [ ] Derive the displayed aspect ratio and Cloudinary width/height from the selected
      layout instead of the hard-coded `420 / 760` constants.
- [ ] In `GameTrackPage`, resolve the layout from `data.game.courtLayoutId` once and
      pass that same object to both `InteractiveCourtImage` and `inferCourtSelection`.
- [ ] Send the resolved layout ID as the write precondition on every request that can
      create or modify coordinates.
- [ ] Pass the layout calibration to `buildFreeThrowPayload` as well as normal shot
      inference.
- [ ] Keep stored `x/y` semantics unchanged for each game: they remain normalized
      percentages of that game's versioned image. Do not transform legacy event values.
- [ ] Ensure insert/edit flows on old completed games use the game's `legacy-v1`
      contract rather than the global current layout.

The image, dimensions, and calibration must always come from the same resolved registry
entry. Passing them as unrelated props would allow a visually correct image to be
paired with the wrong inference rules.

### Phase 3 — make history layout-aware

- [ ] Add a layout prop to `RecapShotSnapshot` and render the snapshot's resolved
      asset/dimensions.
- [ ] Add a layout prop to `GameReplayPanel` and render the full game's resolved
      asset/dimensions.
- [ ] Keep marker placement as `left: event.x%` / `top: event.y%`; no conversion is
      needed because the matching versioned image is selected.
- [ ] Confirm the full game detail response supplies the same layout ID to recap and
      replay.
- [ ] Make unknown IDs observable (client error reporting or analytics) while still
      rendering with the safe legacy fallback.

### Phase 4 — test and release

- [ ] Unit-test layout resolution: absent/unknown -> `legacy-v1`, `court-v2` -> v2.
- [ ] Parameterize calibration tests so both layouts cover north/south paint, corner
      three, wing three, top of key, backcourt, and free-throw positions.
- [ ] Extend `InteractiveCourtImage` tests for each aspect ratio and rotated mobile
      coordinate normalization.
- [ ] Add recap and replay tests proving a legacy game loads the old asset and a new
      game loads the new asset with markers at the saved percentages.
- [ ] Add an integration test that creates a new game, records a click, reloads it,
      and sees the marker at the same visible location.
- [ ] Add a compatibility fixture with no `courtLayoutId` to represent a production
      game created before this feature.
- [ ] Visually test portrait, rotated landscape mobile, desktop, recap, and replay for
      both versions.
- [ ] Deploy in two safe stages: first ship the layout-aware client/registry while the
      server still creates only legacy games; then ship server persistence, handshake
      enforcement, and the switch that stamps new games as `court-v2`. Keep the client
      deployment backward compatible so its extra precondition is ignored or accepted by
      the first-stage server.
- [ ] Verify that a deliberately simulated cached v1 client cannot append coordinates
      to a `court-v2` game and receives the refresh-required conflict response.
- [ ] After deployment, query a sample of newly created games to confirm they contain
      `court-v2`, and open at least one legacy completed game to verify the old shot map.

## Acceptance criteria

1. A completed pre-cutover game with no `courtLayoutId` displays the old court in recap
   and replay, with every marker at its previous percentage position.
2. An in-progress pre-cutover game continues to track and render on the old layout.
3. A post-cutover game is stored with `courtLayoutId: 'court-v2'` and uses the new asset
   consistently in tracking, recap, and replay.
4. The same visible click is classified correctly as 2PT/3PT and receives the expected
   `zoneId` under the v2 calibration.
5. Refreshing, completing, reopening, inserting, or editing events never changes a
   game's layout.
6. Unknown or missing layout values do not crash the UI and do not silently render
   historical coordinates over the new image.
7. The old image remains shipped and addressable.

## Rollback

Rollback does not require changing stored events. Stop stamping `court-v2` for newly
created games and set the current server creation constant back to `legacy-v1`.
Already-created `court-v2` games must continue resolving to the v2 asset, even during a
rollback, because their saved coordinates belong to it. Therefore both layout entries
must remain supported in every rollback build.

## Optional later improvement

If the product later needs to combine shots from different court layouts into one
cross-game heat map, introduce canonical court coordinates (for example regulation
court feet or normalized playable-court coordinates) as new fields/versioned semantics.
That is not necessary for this image replacement and should not be mixed into the
compatibility release. The existing `zoneId` and stat types are already durable stats;
this plan protects their original display locations without rewriting them.

## Status tracker

| Workstream                | Status           | Exit condition                                                   |
| ------------------------- | ---------------- | ---------------------------------------------------------------- |
| Current-state audit       | Complete         | Tracking, persistence, recap, and replay dependencies identified |
| Compatibility design      | Complete         | Immutable game-level layout version and legacy fallback agreed   |
| New asset and calibration | Blocked on asset | Final image is present and measured                              |
| Server persistence/API    | Not started      | New games stamped; legacy games resolve safely                   |
| Tracking UI               | Not started      | v2 click, inference, rotation, and reload verified               |
| Recap and replay          | Not started      | Each game renders its matching versioned image                   |
| Automated and visual QA   | Not started      | Acceptance criteria pass for legacy and v2 fixtures              |
| Production rollout        | Not started      | Server/client deployed and sample audit completed                |

Update this table and the phase checkboxes in the same pull request as each implementation
step so this file remains the source of truth for feature status.
