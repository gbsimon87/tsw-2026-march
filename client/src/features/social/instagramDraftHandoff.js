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
// Shape: { file, sourcePostId, sourceLabel, caption, attributionUrl }.
let pendingDraft = null;

// The game page is one of the few anonymously readable routes (see OPT-019 on
// games.routes.js), so a link to it works for someone arriving logged out.
//
// The server rejects a non-HTTPS attribution URL, and a local origin is http,
// so a dev hand-off contributes no URL rather than one that 400s on submit.
// Attribution is optional, and the operator can still type one.
export function buildAttributionUrl(gameCard, origin) {
  if (!gameCard?.gameUrl || !origin?.startsWith('https://')) return '';
  try {
    return new URL(gameCard.gameUrl, origin).toString();
  } catch {
    return '';
  }
}

// Matches the server schema and Instagram's own container limit.
const CAPTION_MAX_CHARACTERS = 2200;

// Says what is on the other end rather than just dropping a bare address: the
// linked page carries the full box score, not a copy of the card. Change this
// one line to change the voice of every hand-off.
const CAPTION_ATTRIBUTION_LEAD_IN = 'Full box score →';

// The attribution URL is a provenance record and is never sent to Meta — only
// the caption reaches the container — so the link has to ride in the caption to
// be seen at all. Instagram renders it as plain text rather than a tappable
// link, which is a platform limit no formatting works around; it is there to be
// read and typed, and to pair with whatever the bio link points at.
export function buildCaptionWithAttribution(caption, attributionUrl) {
  const base = (caption || '').trim();
  if (!attributionUrl || base.includes(attributionUrl)) return base;

  const link = `${CAPTION_ATTRIBUTION_LEAD_IN} ${attributionUrl}`;
  const combined = base ? `${base}\n\n${link}` : link;
  // Rather than truncate someone's caption, drop the link: it is still on the
  // record in attributionUrl, and a silently cut caption is worse.
  return combined.length > CAPTION_MAX_CHARACTERS ? base : combined;
}

// `sourceLabel` travels with the draft because the review panel's source picker
// only lists the 50 most recent feed posts. An older card would otherwise hand
// over an id matching no <option>, leaving the required select blank.
// Social backlog rank 3: the hand-off used to read post.gameCard directly, so a
// milestone handed over with no attribution and a "Team vs Opponent" label.
// Each post type says where its provenance lives and how to name it; anything
// without an entry hands over a usable draft rather than throwing.
const DRAFT_SOURCES = {
  game_card: {
    card: (post) => post.gameCard,
    label: (card) => buildGameCardLabel(card),
  },
  milestone: {
    card: (post) => post.milestoneCard,
    // The achievement is the point, so it leads; the player qualifies it.
    label: (card) => [card?.playerName, card?.label].filter(Boolean).join(' \u00b7 '),
  },
};

// Older callers pass a post whose type is implied by which card field is set,
// so fall back to sniffing rather than requiring `type`.
function resolveDraftSource(post) {
  const key = DRAFT_SOURCES[post?.type]
    ? post.type
    : post?.milestoneCard
      ? 'milestone'
      : 'game_card';
  const source = DRAFT_SOURCES[key];
  const card = source?.card(post) ?? null;
  return { card, label: (card && source?.label(card)) || 'TSW post' };
}

export function buildInstagramDraft(post, file, origin = window.location.origin) {
  const { card, label } = resolveDraftSource(post);
  // Every card type's provenance is a game page — the one anonymously readable
  // route — so one attribution builder still covers them all.
  const attributionUrl = buildAttributionUrl(card, origin);
  return {
    file,
    sourcePostId: post.id,
    sourceLabel: label,
    caption: buildCaptionWithAttribution(post.caption, attributionUrl),
    attributionUrl,
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
