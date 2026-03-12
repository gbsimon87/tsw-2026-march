# Court Assets

Store custom basketball court assets for the tracking UI here.

## Recommended format

- Prefer SVG for best scaling and precise coordinate mapping.
- Keep orientation vertical:
  - top = north baseline
  - bottom = south baseline

## Coordinate assumptions

The current tracker normalizes taps over a full-court canvas to:

- `x`: `0..100` left to right
- `y`: `0..100` top to bottom

If you replace the court visual, keep the same aspect ratio and orientation to preserve mapping behavior.
Current canonical full-court ratio is `500x940`.

## Storage location

Court assets belong in the app source (this folder), not MongoDB.
MongoDB should store game/user/event data, not static UI files.
