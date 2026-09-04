# Court Assets

Court images for the tracking UI, recap shot snapshot, and game replay.

**Never replace or delete a file in this folder.** A persisted game's event `x`/`y`
are percentages of the image it was tracked on, so overwriting an asset silently
moves every marker recorded against it. Adding a court means adding a file _and_
a new layout id.

## Layout registry

[`../../features/games/court/courtLayouts.js`](../../features/games/court/courtLayouts.js)
is the single source of truth. Each entry binds an image, its rendered box, and
its calibration together — they must never be sourced separately, or a
correct-looking court can be read with the wrong inference rules.

| Layout id   | Asset                    | Intrinsic  | Rendered box | Notes                                      |
| ----------- | ------------------------ | ---------- | ------------ | ------------------------------------------ |
| `legacy-v1` | `basketball_court_1.png` | 442 × 829  | 420 × 760    | Every game created before court versioning |
| `court-v2`  | `basketball_court_2.png` | 820 × 1708 | 410 × 854    | Games stamped `court-v2` at creation       |

`legacy-v1` deliberately keeps its historical 420 × 760 render box even though the
file is 442 × 829. Stored markers are percentages of that box, so "correcting" the
ratio would move existing shots. A game with **no** `courtLayoutId` resolves to
`legacy-v1`; that absence is the durable legacy discriminator, and unknown ids
fail closed to it as well.

## Coordinate semantics

Event coordinates are percentages of the rendered image for that game's layout:

- `x`: `0..100` left to right
- `y`: `0..100` top to bottom

Orientation is always vertical (top = north baseline, bottom = south baseline).
The landscape view in the tracker is a display rotation applied over a
portrait-native asset, and the click is un-rotated before it is stored — so a
landscape source image must be rotated into portrait before it ships here.

## Calibration

`courtRect` locates the playable court inside the image, as percentages of the
full image, so decoration outside the lines (hoops, backboards, hash marks,
padding) does not skew the mapping. The `inference` block then reconciles the
painted lines with the 50 × 94 ft court model in
[`courtGeometry.js`](../../features/games/court/courtGeometry.js).

`court-v2` measurements, taken from the shipped pixels:

- sidelines at x = 34.5 / 784, baselines at y = 149 / 1558, halfcourt y = 853.5
- court rect 749.5 × 1409 px = 0.53194, within 0.004% of regulation 50:94
- painted 3PT line fits a circle of r = 19.37 ft centred 8.68 ft from the
  baseline (mean residual 0.19 ft over 638 edge points), which is 3.43 ft past
  the model's hoop — hence `threePointCenterLocalYFeet`
- both ends agree: the south arc fits r = 19.369 ft at 8.66 ft

Its decorative circles are slightly oval: the source art was 14% too wide for its
length, and the stretch that corrects the court proportions (needed for accurate
2PT/3PT inference) distorts the circles.

## Adding a new court

1. Add a new file; do not touch the existing ones.
2. Record its intrinsic size and confirm it is portrait.
3. Measure `courtRect` from the painted lines, not the file edges.
4. Measure the 3PT geometry and tune `inference` — never copy another layout's
   numbers unless the geometry is proven identical.
5. Register a new id in `courtLayouts.js` and the matching server constant in
   [`server/src/modules/shared/courtLayouts.js`](../../../../server/src/modules/shared/courtLayouts.js).
6. Add calibration tests asserting classification against measured pixel
   positions in the new art.

## Storage location

Court assets belong in the app source (this folder), not MongoDB. MongoDB stores
game/user/event data, not static UI files.
