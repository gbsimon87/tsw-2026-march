# Image & Video Processing

> Part of the [Application Audit](./README.md) · July 2026

## Current processing pipeline

**Images**: none. Uploads are stored as-is (original bytes, original format,
original dimensions) and delivered as-is. Validation is limited to mimetype
allowlist + byte-size caps. No resizing, no format conversion, no quality
optimisation at upload **or** delivery.

**Videos** (`server/src/modules/feed/feed.service.js:363-415` +
`cloudinary.client.js`):

1. Multer buffers the file in memory (≤100MB).
2. `uploadVideoBuffer` uploads with eager transform
   `[{format:'mp4', quality:'auto'}]`, **`eager_async:false`** — Cloudinary
   transcodes synchronously while the HTTP request waits.
3. Duration is validated **after** upload; >60s assets are destroyed
   (compensating action).
4. A thumbnail URL is derived (not generated eagerly):
   `/video/upload/so_1,f_jpg,q_auto/{publicId}.jpg` (`feed.service.js:31-37`).
5. Playback prefers the eager MP4 URL (`eagerUrl`).

**Client rendering**:

- Raw `<img>` everywhere (64 sites); 3 with `loading="lazy"`; no `srcset`,
  no width/height attributes → layout shift and full-size downloads.
- `<video controls playsInline poster>` on feed cards without
  `preload="metadata"`/`none` — browsers may prefetch video data for every
  card in the feed.
- The game recap share-card is rendered to a **canvas data-URL in a client
  effect on every data change** (`GameDetailPage.jsx:413+`) — main-thread work
  that should be on-demand.

## No adaptive streaming

Videos are ≤60s clips served as a single progressive MP4 — acceptable at this
duration. If longer video is ever supported, switch to Cloudinary's HLS/DASH
(`sp_auto`/streaming profiles). For now the wins are format/quality/lazy
loading, not ABR.

## Recommended pipeline (details in [26-cloudinary-optimisation](./26-cloudinary-optimisation.md))

1. **Delivery-time transforms** for all images: `f_auto,q_auto` + width buckets
   (`w_160` avatars/logos, `w_800`/`w_1200` feed) with `c_limit`.
2. `srcset`/`sizes` generated from stored width/height.
3. Universal `loading="lazy"` (except above-the-fold), `decoding="async"`,
   explicit dimensions.
4. `eager_async:true` for video transcodes (webhook or lazy `f_auto` URL); the
   raw upload is playable meanwhile.
5. `preload="metadata"` on feed videos; poster is already present.
6. Optional: incoming transformation at upload (`c_limit,w_2000,q_auto`) to cap
   stored originals.
