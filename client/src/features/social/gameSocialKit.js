import { buildTaggedUrl } from '../analytics/attribution';
import { SLIDE_KINDS, buildCarouselSlides } from '../feed/components/cards/carouselSlides';
import { buildGameCardFromPayload } from '../feed/components/cards/gameCard';
import { buildPlayerGameCard, hasShareableLine } from '../feed/components/cards/playerGameCard';
import { buildCaptionKit, buildCardAttributionUrl } from './captionAssistant';

// Social backlog rank 6 — the completed-game social kit.
//
// One press assembles everything a finished game is worth posting, from data
// that is ALREADY frozen: the game card, the top performers' lines, a 9:16
// result, the generated copy, and a link tagged for the platform it is going
// to. Nothing here fetches, and nothing computes a stat — every asset is a
// re-arrangement of the payload the game page already holds.
//
// The carousel is the ordered set of 4:5 assets, numbered so the ZIP sorts the
// way Instagram's multi-select reads. Rank 7 filled it with TEMPLATED slides —
// result, team comparison, top performers, CTA — all rendered on the same board
// as the single-card exports. The individual top-performer cards stay in the
// kit unnumbered: they are what an operator sends to the player, not part of
// the carousel.

// Four slides is a comfortable carousel and keeps html2canvas to a sane number
// of off-screen nodes; beyond three performers the tail is rarely notable.
const MAX_TOP_PERFORMERS = 3;

function slugify(value, fallback = 'tsw') {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function isoDatePart(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function boxScoreSides(data) {
  return data?.game?.trackingMode === 'dual_team'
    ? [
        { side: 'home', rows: data?.boxScore?.home?.players || [] },
        { side: 'away', rows: data?.boxScore?.away?.players || [] },
      ]
    : [{ side: null, rows: data?.boxScore?.players || [] }];
}

function rosterFor(data, side) {
  return (side ? data?.participants?.[side]?.players : data?.team?.players) || [];
}

// A recap's topPerformers entry is a trimmed row (points/reb/ast only). The
// card needs the FULL line — pickContextStat reads shooting splits that the
// trimmed entry does not carry — so the real box-score row is found again here
// rather than the summary being passed off as one.
function findRow(data, performer) {
  for (const { side, rows } of boxScoreSides(data)) {
    const row = rows.find((candidate) =>
      performer.leaguePlayerId
        ? String(candidate.leaguePlayerId ?? '') === String(performer.leaguePlayerId)
        : String(candidate.playerId ?? '') === String(performer.playerId ?? '')
    );
    if (row) return { row, side };
  }
  return null;
}

function findRosterPlayer(data, side, row) {
  return (
    rosterFor(data, side).find((player) =>
      row.leaguePlayerId
        ? String(player.leaguePlayerId ?? player.id ?? '') === String(row.leaguePlayerId)
        : String(player.id ?? '') === String(row.playerId ?? '')
    ) || null
  );
}

function matchupTitle(data) {
  const card = buildGameCardFromPayload(data);
  if (data?.game?.trackingMode === 'dual_team') return card?.teamName || 'Game';
  return [card?.teamName, card?.opponent].filter(Boolean).join(' vs ') || 'Game';
}

// One asset descriptor is everything the exporter and the ZIP both need: what
// to render, at what preset, and what to call the file.
const CARD_FIELDS = {
  game_card: 'gameCard',
  player_game_card: 'playerGameCard',
  carousel_slide: 'carouselSlide',
};

function describeAsset({ id, label, type, format, card, position, stem, attributionUrl, altText }) {
  const source = { type, [CARD_FIELDS[type]]: card };
  // A slide describes itself; only the single cards need the caption assistant
  // to derive alt text from their own snapshot.
  const resolvedAltText = altText ?? buildCaptionKit(source, { attributionUrl })?.altText ?? '';
  const prefix = position == null ? '' : `${String(position).padStart(2, '0')}-`;

  return {
    id,
    label,
    type,
    format,
    // `position` is the carousel order; a story or player card has none and
    // sits outside the numbered run so it cannot be mistaken for a slide.
    position: position ?? null,
    card,
    source,
    fileName: `${prefix}${stem}-${id}.png`,
    altText: resolvedAltText,
  };
}

/**
 * Assembles the kit for a completed game.
 *
 * Returns null for anything that is not a completed game: a mid-game score is
 * not a result, and the kit exists to make finished games postable.
 */
export function buildGameSocialKit(
  data,
  {
    origin = '',
    destination = 'instagram',
    maxPerformers = MAX_TOP_PERFORMERS,
    // The ordered slide kinds still wanted. The kit modal's remove and reorder
    // controls pass this straight through, which is what makes "slides can be
    // removed or reordered without design work" true — there is no per-slide
    // code path to touch.
    slideKinds = SLIDE_KINDS,
  } = {}
) {
  if (data?.game?.status !== 'completed') return null;

  const gameCard = buildGameCardFromPayload(data);
  if (!gameCard) return null;

  const title = matchupTitle(data);
  const playedOn = isoDatePart(data?.recap?.playedAt || data?.game?.completedAt);
  const stem = [slugify(title), playedOn].filter(Boolean).join('-');
  const attributionUrl = buildTaggedUrl(buildCardAttributionUrl(gameCard, origin), {
    source: destination,
  });

  const slides = buildCarouselSlides(data, { attributionUrl, only: slideKinds });
  const assets = slides.map((slide, index) =>
    describeAsset({
      id: `slide-${slide.kind}`,
      label: `${slide.label} slide`,
      type: 'carousel_slide',
      format: 'post',
      card: slide,
      position: index + 1,
      stem,
      attributionUrl,
      // A slide already knows how to describe itself; asking the caption
      // assistant would make it describe a game card it is not.
      altText: slide.altText,
    })
  );

  // Unnumbered, and deliberately after the carousel: a player's own card is
  // what gets sent to the player, not slide five of a feed post.
  for (const performer of data?.recap?.topPerformers || []) {
    if (assets.filter((asset) => asset.type === 'player_game_card').length >= maxPerformers) break;

    const found = findRow(data, performer);
    // A player with nothing recorded has no card worth posting, and the
    // team-total row is not a player at all.
    if (!found || !hasShareableLine(found.row)) continue;

    const card = buildPlayerGameCard({
      data,
      row: found.row,
      rosterPlayer: findRosterPlayer(data, found.side, found.row),
      side: found.side,
    });
    if (!card) continue;

    assets.push(
      describeAsset({
        id: slugify(card.playerName, 'player'),
        label: `Player card — ${card.playerName}`,
        type: 'player_game_card',
        format: 'post',
        card,
        position: null,
        stem,
        attributionUrl,
      })
    );
  }

  assets.push(
    describeAsset({
      id: 'story',
      label: 'Final score (9:16 Story)',
      type: 'game_card',
      format: 'story',
      card: gameCard,
      position: null,
      stem,
      attributionUrl,
    })
  );

  // The kit's caption belongs to the post as a whole, so it is the game card's
  // — the per-asset alt text is what varies from slide to slide.
  const copy = buildCaptionKit({ type: 'game_card', gameCard }, { attributionUrl });

  return {
    gameId: data.game.id,
    title,
    playedOn,
    stem,
    destination,
    attributionUrl,
    // The card the kit's caption describes. Exposed rather than left to be
    // read off assets[0], which is a SLIDE descriptor and has no game-card
    // shape at all.
    gameCard,
    caption: copy?.caption || '',
    hashtags: copy?.hashtags || [],
    assets,
    carousel: assets.filter((asset) => asset.position != null),
  };
}

/**
 * The text file that ships inside the ZIP.
 *
 * A folder of PNGs with no copy is half a kit — the caption, each image's alt
 * text, and the tagged link have to travel with the images or they are retyped
 * from memory at posting time, which is where invented stats come from.
 */
export function buildKitReadme(kit) {
  const lines = [
    `TSW social kit — ${kit.title}${kit.playedOn ? `, ${kit.playedOn}` : ''}`,
    '',
    'CAPTION',
    kit.caption || '(none)',
    '',
    'ALT TEXT (paste into the platform’s accessibility field, one per image)',
    ...kit.assets.map((asset) => `${asset.fileName} — ${asset.altText || '(none)'}`),
    '',
    'CAROUSEL ORDER',
    ...kit.carousel.map((asset) => `${asset.position}. ${asset.fileName} — ${asset.label}`),
    '',
    'LINK',
    kit.attributionUrl || '(no HTTPS link available for this game)',
    '',
    'Every number here came from this game’s frozen box score. Check consent',
    'before posting anything featuring an identifiable participant, and confirm',
    'parent or guardian permission for a minor.',
  ];
  return `${lines.join('\n')}\n`;
}
