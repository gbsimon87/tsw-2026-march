# Cloudinary Optimisation Report

> Part of the [Application Audit](./README.md) · July 2026

Current integration documented in [10-cloudinary-integration](./10-cloudinary-integration.md).
Summary of the gap: **assets are uploaded raw and delivered raw** — none of
Cloudinary's delivery optimisation is being used, which is the point of paying
for it.

## Image delivery

### 1. `f_auto,q_auto` on every image URL — highest ROI, lowest effort

Nothing in the system emits transformation parameters. A single URL-builder:

```js
// e.g. server/src/modules/shared/cloudinaryUrl.js
function transformedUrl(url, { w } = {}) {
  const t = ['f_auto', 'q_auto', w && `w_${w}`, w && 'c_limit'].filter(Boolean).join(',');
  return url.replace('/upload/', `/upload/${t}/`);
}
```

Apply at sanitize time in the services (logo/avatar/post payload builders), so
every client gets optimised URLs with zero client changes. Typical savings:
40–80% bytes per image (WebP/AVIF + quality tuning). _Caveat: only rewrite
URLs whose host is Cloudinary's._

### 2. Width buckets + responsive `srcset`

Width/height are already stored on every asset subdoc (from the upload
response) — the data for responsive markup exists and is unused.

| Context                         | Sizes                                                                 |
| ------------------------------- | --------------------------------------------------------------------- |
| Avatars/logos in tables & cards | `w_80`, `w_160`                                                       |
| Feed card images                | `w_480`, `w_800`, `w_1200` + `sizes="(max-width:768px) 100vw, 640px"` |
| Full-screen posts               | `w_1200`, `w_1600`                                                    |

Emit 2–3 bucket URLs server-side (or build client-side from `publicId`), and a
small `<CloudinaryImage>` client component renders `srcset/sizes` + explicit
`width/height` (kills CLS).

### 3. Lazy loading

61 of 64 `<img>` sites lack `loading="lazy"`. Add `loading="lazy"
decoding="async"` everywhere except above-the-fold (first feed card, page
hero). Comes free with the shared image component.

### 4. Thumbnail correctness

Video thumbnail URL uses `q_auto` but not `f_auto` (`feed.service.js:31-37`) —
add it.

## Video delivery

1. **Async transcode**: `eager_async:false → true` (+
   `eager_notification_url` or lazy status check). The upload response returns
   immediately; until the eager MP4 exists, play the original (or an
   on-the-fly `f_auto` URL). Removes seconds of blocking from
   `POST /feed/video`.
2. **`preload="metadata"`** on feed `<video>` elements (poster already set) —
   prevents the feed from downloading video bytes for every mounted card.
   Pair with windowing ([29](./29-frontend-optimisation.md)) so off-screen
   videos unmount.
3. **Quality/format**: deliver via `f_auto,q_auto` video URL (or
   `vc_auto`) rather than the plain eager MP4 — smaller H.265/VP9/AV1 to
   capable browsers.
4. **ABR/HLS**: not needed at ≤60s clips; revisit only if long-form video
   arrives.
5. **Upload path**: replace 100MB multer memory buffering with either (a)
   direct signed browser→Cloudinary upload (server only issues signature +
   records the result — also removes the double transfer), or (b) disk/stream
   piping. (a) is the right long-term shape.
6. **Incoming cap**: consider `c_limit,w_2000/q_auto` incoming transformation
   on images to cap stored originals.

## API usage

There are **no** Cloudinary Admin/metadata API reads (nothing to batch or
cache). Usage = uploads + destroys only. Actions:

1. Await destroys and log failures (currently fire-and-forget with swallowed
   errors → orphaned assets and silent quota creep).
2. Metadata is already stored locally at upload time ✅ — keep that pattern;
   never call the Admin API at render time.
3. Move logos/avatars out of the shared `tsw/feed` folder for auditability.

## Expected impact

Feed and league pages are image-dominated; `f_auto,q_auto` + lazy loading +
correct sizing typically cuts page weight by **50–70%** on image-heavy views
and directly improves LCP/CLS. This is the highest impact-per-effort item in
the whole audit alongside route code-splitting.
