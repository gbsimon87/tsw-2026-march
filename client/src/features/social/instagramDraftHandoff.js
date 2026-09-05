import { buildGameCardLabel } from '../feed/components/posts/cardUtils';

// One-shot hand-off of a rendered Pulse game card to the Instagram admin page.
//
// The obvious route is react-router's `navigate(to, { state })`, but that state
// goes through history.pushState: Safari caps a history entry at ~2MB and a
// 1080x1350 PNG routinely exceeds it, and an entry that does fit then survives
// back/forward and re-prefills the form with a stale image. A module-scoped ref
// lives exactly as long as the SPA navigation it was created for, and a reload
// clears it — which is correct, because the File cannot survive one either.
//
// Shape: { file, sourcePostId, sourceLabel, caption }.
let pendingDraft = null;

// `sourceLabel` travels with the draft because the review panel's source picker
// only lists the 50 most recent feed posts. An older card would otherwise hand
// over an id matching no <option>, leaving the required select blank.
export function buildInstagramDraft(post, file) {
  return {
    file,
    sourcePostId: post.id,
    sourceLabel: buildGameCardLabel(post.gameCard),
    caption: post.caption || '',
  };
}

export function setPendingInstagramDraft(draft) {
  pendingDraft = draft || null;
}

// Reading consumes: the panel prefills once, and an operator who navigates back
// to /pulse and returns starts from a clean form rather than a stale image.
export function takePendingInstagramDraft() {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}
