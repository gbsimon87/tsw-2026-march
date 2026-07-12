# Shareable Graphics — Implementation Tracker

Task checklist for the [design spec](../superpowers/specs/2026-07-12-shareable-graphics-design.md).
Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## 0. Setup

- [ ] Add `html2canvas` to the `client` workspace (`pnpm --filter client add html2canvas`)

## 1. `useShareImage` hook

- [ ] Create `client/src/features/feed/hooks/useShareImage.js`
- [ ] Capture node → PNG blob (2× DPR scale, `useCORS: true`, wait for fonts/images)
- [ ] `navigator.canShare({ files })` → `navigator.share`; else download fallback
- [ ] Swallow `AbortError` (share cancelled) → idle
- [ ] `status` state machine: idle / generating / success / error
- [ ] Guard against concurrent captures

## 2. `ShareableCardExport`

- [ ] Create `client/src/features/feed/components/cards/ShareableCardExport.jsx`
- [ ] Off-screen 1080×1350 wrapper (positioned off-viewport, NOT `display:none`)
- [ ] Render existing GameCardPost / PlayerCardPost / TeamCardPost by type
- [ ] TSW watermark footer
- [ ] Forward capture-node ref

## 3. `ShareImageButton`

- [ ] Create `client/src/features/feed/components/ShareImageButton.jsx`
- [ ] Compose hidden `ShareableCardExport` + share icon button
- [ ] Wire ref → `useShareImage`
- [ ] Disabled during `generating`; inline error message on `error`

## 4. Integration

- [ ] Add `ShareImageButton` to `FeedPostCard` (Pulse posts)
- [ ] Add to game page card
- [ ] Add to player page card
- [ ] Add to team page card

## 5. Tests (Vitest + RTL)

- [ ] `useShareImage.test.js` — share / download / abort / error paths
- [ ] `ShareImageButton.test.jsx` — render, disabled-while-generating, click→hook
- [ ] `ShareableCardExport.test.jsx` — snapshot per card type

## 6. Verify

- [ ] `pnpm --filter client lint`
- [ ] `pnpm --filter client test`
- [ ] `pnpm --filter client build`
- [ ] Manual: share a card on mobile (share sheet) + desktop (download)
- [ ] Update [status dashboard](./status-dashboard.md)
