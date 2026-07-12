# Shareable Graphics (v1) — Design

**Date:** 2026-07-12
**Branch:** `feature/shareable-graphics`
**Segment:** Parents / Fans / Community

## Goal

Let fans turn any existing game/player/team card into a crisp, TSW-branded PNG
and share it via the native OS share sheet (with an automatic download fallback).
Purely client-side, off data already rendered on the page. **No new schema, no
new endpoints, no new auth model, no server render infrastructure.**

## Non-goals (YAGNI)

- Milestone graphics (deferred — needs detection logic + new card type; its own feature).
- Server-side / OG image generation (Cloudinary overlays, headless render).
- New endpoints, Mongoose schema, or authorization.
- In-app editing/customization of the graphic before sharing.

## Decisions (from brainstorming)

- **Render engine:** client-side `html2canvas`. Reuses the existing React ShareCards, zero new server infra.
- **Delivery:** native share sheet (`navigator.share` with a PNG file), **automatic download fallback** when unsupported (desktop).
- **Entry points:** on each Pulse post **and** on game/player/team pages. The trigger must be portable — it works wherever a card's snapshot data is available.
- **Content types (v1):** existing game / player / team cards only. Milestones deferred.
- **Image format:** a dedicated off-screen export layout, fixed **1080×1350** portrait at 2× DPR, with a small TSW watermark. Decoupled from the responsive on-screen card so output is consistent and social-ready.

## Architecture — three small, isolated units

### 1. `useShareImage` hook

`client/src/features/feed/hooks/useShareImage.js`

The engine. Knows nothing about basketball — shares whatever DOM node it's handed.

- **Input:** a `ref` to a DOM node.
- **Behavior:** run `html2canvas` (scale for 2× DPR, `useCORS: true`, wait for fonts/images) → PNG `Blob`.
  - If `navigator.canShare?.({ files: [file] })` → `navigator.share({ files })`.
  - Else → trigger a download of the blob.
- **Returns:** `{ shareImage, status }` where `status ∈ { idle, generating, success, error }`.
- Owns all html2canvas quirk handling.

### 2. `ShareableCardExport` component

`client/src/features/feed/components/cards/ShareableCardExport.jsx`

The off-screen render target.

- Fixed **1080×1350** wrapper positioned off-screen (absolute, off-viewport — **not** `display:none`, since html2canvas needs layout).
- Renders the existing `GameCardPost` / `PlayerCardPost` / `TeamCardPost` (selected by card type) at export scale, reusing the existing `ShareCardPrimitives`. No visual redesign.
- Adds a small TSW watermark footer.
- Exposes the capture node via forwarded ref.

### 3. `ShareImageButton` component

`client/src/features/feed/components/ShareImageButton.jsx`

The portable trigger.

- Renders the hidden `ShareableCardExport(snapshot, type)` + a share icon button.
- Wires the export node ref into `useShareImage`.
- Disabled while `status === 'generating'`; shows a brief inline "Couldn't create image" on error.
- Dropped into `FeedPostCard` (Pulse) and the game/player/team pages.

## Data flow

```
card snapshot (already computed, already on the page)
  → ShareImageButton renders hidden ShareableCardExport(snapshot)
  → user taps share → useShareImage(ref)
  → html2canvas → PNG blob → navigator.share({ files }) OR download
```

No network calls. No new endpoints.

## Error handling

- **Share cancelled** (`AbortError` from `navigator.share`): swallow silently, return to idle. Not an error.
- **`navigator.share` / file-share unsupported** (most desktops): automatic download fallback. No error surfaced.
- **html2canvas throws / canvas tainted:** catch, `status: 'error'`, inline "Couldn't create image". Non-fatal — card and normal Pulse sharing still work.
- **Image CORS failure:** degrade gracefully. Export still generates with text/logo; a missing photo falls back via the primitives' existing `imageFallback` handling.
- **Concurrency:** button disabled during `generating` so a double-tap can't fire two captures.

## Testing (Vitest + RTL — client convention)

- **`useShareImage`:** mock `html2canvas`, `navigator.share`, `navigator.canShare`. Assert:
  - share path called with a PNG file when supported;
  - download fallback when unsupported;
  - `AbortError` leaves status idle (no error);
  - thrown capture sets error status.
- **`ShareImageButton`:** renders trigger; disabled during generating; click invokes hook (hook mocked).
- **`ShareableCardExport`:** snapshot test per card type (game/player/team) locking export layout + watermark.
- **No server tests** — nothing changes server-side.

## New dependency

- `html2canvas` added to the `client` workspace. (Approved.)

## Docs deliverables

`docs/shareable-graphics/`:

- `README.md` — feature overview
- `implementation-tracker.md` — task checklist tied to the plan
- `status-dashboard.md` — at-a-glance status
