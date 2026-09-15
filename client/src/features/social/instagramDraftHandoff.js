import { buildGameCardLabel } from '../feed/components/posts/cardUtils';
import { buildTaggedUrl } from '../analytics/attribution';
import { guardCard } from './exportGuard';
import {
  CAPTION_ATTRIBUTION_LEAD_IN,
  CAPTION_MAX_CHARACTERS,
  buildCaptionKit,
  buildCardAttributionUrl,
} from './captionAssistant';

// One-shot hand-off of a rendered Pulse game card to the Instagram admin page.
//
// The obvious route is react-router's `navigate(to, { state })`, but that state
// goes through history.pushState: Safari caps a history entry at ~2MB and a
// 1080x1350 PNG routinely exceeds it, and an entry that does fit then survives
// back/forward and re-prefills the form with a stale image. A module-scoped ref
// lives exactly as long as the SPA navigation it was created for, and a reload
// clears it — which is correct, because the File cannot survive one either.
//
// Shape: { file, sourcePostId, sourceLabel, caption, altText, attributionUrl }.
let pendingDraft = null;

// The game page is one of the few anonymously readable routes (see OPT-019 on
// games.routes.js), so a link to it works for someone arriving logged out.
//
// Social backlog rank 4 moved the builder itself into captionAssistant.js,
// where it also covers the player and team pages the other card types name.
// This stays as the game-card-shaped entry point its callers already use.
export function buildAttributionUrl(gameCard, origin) {
  return buildCardAttributionUrl(gameCard, origin);
}

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
    field: 'gameCard',
    card: (post) => post.gameCard,
    label: (card) => buildGameCardLabel(card),
  },
  milestone: {
    field: 'milestoneCard',
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
  return { key, source, card, label: (card && source?.label(card)) || 'TSW post' };
}

export function buildInstagramDraft(post, file, origin = window.location.origin, marketing) {
  const { key, source, card } = resolveDraftSource(post);
  const guarded = marketing ? guardCard(key, card, marketing) : { card, restrictedCount: 0 };
  if (marketing && !guarded.guard?.canExport) return null;
  const safeCard = guarded.card;
  const label = (safeCard && source?.label(safeCard)) || 'TSW post';
  // Every card type's provenance is a game page — the one anonymously readable
  // route — so one attribution builder still covers them all.
  //
  // Social backlog rank 5: this hand-off has exactly one destination, so the
  // link is tagged for it unconditionally. Without the tag, a visit arriving
  // from the published post is indistinguishable from any other referral.
  const attributionUrl = buildTaggedUrl(buildCardAttributionUrl(safeCard, origin), {
    source: 'instagram',
  });
  // Social backlog rank 4: the hand-off used to carry whatever the feed post
  // already said, which for every AUTO card (feed.service.js writes
  // `caption: null` for those) was nothing at all. It now carries generated
  // copy, and a caption a human deliberately wrote still leads it.
  const safeLead = guarded.restrictedCount ? '' : post.caption;
  const safePost = { ...post, [source.field]: safeCard };
  const kit = buildCaptionKit(safePost, { attributionUrl, lead: safeLead });

  return {
    file,
    sourcePostId: post.id,
    sourceLabel: label,
    caption: kit ? kit.caption : buildCaptionWithAttribution(safeLead, attributionUrl),
    // Alt text is not part of the caption, and TSW's publishing adapter does
    // not send Instagram's `alt_text` container field (the draft model has no
    // place to store it), so this rides along for the operator to paste.
    altText: kit?.altText || '',
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
