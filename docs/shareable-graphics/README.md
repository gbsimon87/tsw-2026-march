# Shareable Graphics

**Segment:** Parents / Fans / Community · **Status:** In progress · **Branch:** `feature/shareable-graphics`

Turn any existing game/player/team card in TSW into a crisp, TSW-branded PNG that
fans can share to social media via the native OS share sheet (download fallback on desktop).

## How it works

Purely client-side. The card snapshot data is **already** computed and rendered on
the page (Pulse feed + entity pages). A share button renders that same card into a
hidden, fixed-size export layout and captures it to a PNG with `html2canvas`.

```
card snapshot → hidden ShareableCardExport (1080×1350, 2×) → html2canvas → PNG
  → navigator.share({ files })  (mobile)  OR  download  (desktop fallback)
```

**No new schema, endpoints, auth, or server render infra.**

## Pieces

| Unit                  | Path                                                                | Role                                           |
| --------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `useShareImage`       | `client/src/features/feed/hooks/useShareImage.js`                   | Capture node → PNG → share/download            |
| `ShareableCardExport` | `client/src/features/feed/components/cards/ShareableCardExport.jsx` | Off-screen 1080×1350 branded render target     |
| `ShareImageButton`    | `client/src/features/feed/components/ShareImageButton.jsx`          | Portable trigger dropped anywhere a card lives |

## Scope (v1)

- ✅ Game / player / team cards → branded PNG → native share/download
- ✅ Entry points: Pulse posts + game/player/team pages
- ❌ Milestones (deferred), server-side/OG images, in-app editing

## Reference docs

- Design spec: [`docs/superpowers/specs/2026-07-12-shareable-graphics-design.md`](../superpowers/specs/2026-07-12-shareable-graphics-design.md)
- [Implementation tracker](./implementation-tracker.md)
- [Status dashboard](./status-dashboard.md)
