import {
  buildGameCardDisplay,
  formatAverage,
  formatCompactDate,
  formatPercentage,
} from '../feed/components/posts/cardUtils';
import { pickContextStat } from '../feed/components/cards/playerGameCard';

// Social backlog rank 4 — the caption, keyword, and tag assistant.
//
// Every line this module emits is composed from fields the card snapshot
// already carries. Nothing here computes a stat, and nothing here derives a
// social handle from a name: an unregistered @handle tags a stranger, and an
// invented number is worse than no caption at all. Where a field is missing the
// clause is DROPPED rather than filled with a zero or a placeholder.
//
// The shape follows the five-part caption formula in docs/marketing-social.md
// ("Caption Formula"): hook, proof, conversation, CTA, discovery.

export const TSW_HANDLE = '@TheSportyWay';

// Moved here from instagramDraftHandoff.js so the assistant can place the link
// between the CTA and the tag block instead of after everything. Says what is
// on the other end rather than dropping a bare address; change this one line to
// change the voice of every hand-off.
export const CAPTION_ATTRIBUTION_LEAD_IN = 'Full box score →';

// Matches the server schema and Instagram's own container limit.
export const CAPTION_MAX_CHARACTERS = 2200;

// Standing discovery tags.
const BRAND_HASHTAGS = ['#Basketball', '#TheSportyWay'];

const MAX_HASHTAGS = 5;
// Capped so the three brand tags always survive: two specific tags plus three
// standing ones is exactly the 3-5 the formula asks for, whatever the card is.
const MAX_DERIVED_HASHTAGS = 2;

// A card's provenance page. game/player/team cards each name their own; league
// player and league team snapshots carry none, and get no attribution rather
// than a guessed route.
function cardSourcePath(card) {
  return card?.gameUrl || card?.playerUrl || card?.teamUrl || card?.leagueUrl || null;
}

// The server rejects a non-HTTPS attribution URL, and a local origin is http,
// so a dev hand-off contributes no URL rather than one that 400s on submit.
// Attribution is optional, and the operator can still type one.
export function buildCardAttributionUrl(card, origin) {
  const path = cardSourcePath(card);
  if (!path || !origin?.startsWith('https://')) return '';
  try {
    return new URL(path, origin).toString();
  } catch {
    return '';
  }
}

function toHashtag(value) {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

  // Instagram rejects an all-digit tag, and a single character is noise.
  if (cleaned.length < 2 || !/[A-Za-z]/.test(cleaned)) return null;
  return `#${cleaned}`;
}

function buildHashtags(names) {
  const tags = [];
  const seen = new Set();

  const push = (tag, limit) => {
    if (!tag || tags.length >= limit) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  };

  for (const name of names) push(toHashtag(name), MAX_DERIVED_HASHTAGS);
  for (const tag of BRAND_HASHTAGS) push(tag, MAX_HASHTAGS);

  return tags;
}

// Social backlog rank 9 (social identity and consent fields) has not shipped,
// so no card snapshot carries a player or team handle yet. The field is read
// anyway rather than hardcoding an empty list: the day rank 9 lands, the
// assistant starts tagging without a second change here. A handle is NEVER
// derived from a display name.
function recordedHandle(value) {
  const trimmed = String(value || '')
    .trim()
    .replace(/^@+/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(trimmed) ? `@${trimmed}` : null;
}

function collectHandles(card) {
  const handles = [TSW_HANDLE];
  for (const candidate of [card?.playerInstagramHandle, card?.teamInstagramHandle]) {
    const handle = recordedHandle(candidate);
    if (handle && !handles.includes(handle)) handles.push(handle);
  }
  return handles;
}

// Drops any pair whose value was never recorded, so a snapshot missing a column
// reports three stats instead of inventing a fourth as 0.
function statLine(pairs) {
  return pairs
    .filter(([, value]) => Number.isFinite(value))
    .map(([label, value]) => `${value} ${label}`)
    .join(', ');
}

// formatCompactDate answers "Date unavailable" for a missing date, which is the
// right thing on a card and the wrong thing mid-sentence — a caption drops the
// clause instead.
function compactDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : formatCompactDate(value);
}

// Joins the clauses that survived into one sentence. Clauses are written with
// their own leading punctuation where they need it (", result W 70-61"), so the
// separating space is collapsed back out rather than leaving "12 Sep , result".
function sentence(clauses) {
  const body = clauses
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,:;])/g, '$1')
    .trim();
  return body ? `${body}.` : null;
}

function jerseySuffix(value) {
  return typeof value === 'number' ? ` #${value}` : '';
}

// Shared Design Requirements: a team crest may stand in for a missing portrait,
// but the asset has to be able to SAY that it did. Alt text is where a screen
// reader hears it.
const PORTRAIT_NOTES = {
  team_logo: 'The portrait slot shows the team crest, not a photo of the player.',
  placeholder: 'The portrait slot shows an initials treatment, not a photo of the player.',
};

function gameCardParts(card) {
  const { homeName, awayName, homePoints, awayPoints, statusLabel } = buildGameCardDisplay(card);
  const top = card?.recap?.topPerformers?.[0] || null;
  const topLine = top
    ? statLine([
        ['PTS', top.points],
        ['REB', top.reb],
        ['AST', top.ast],
      ])
    : '';

  return {
    hook: `${String(statusLabel).toUpperCase()}: ${homeName} ${homePoints}–${awayPoints} ${awayName}`,
    context: topLine
      ? `${top.displayName} led the box score with ${topLine}.`
      : 'Every number came from a live-tracked box score.',
    question: 'Which run decided this one?',
    cta: 'Save the box score.',
    names: [homeName, awayName],
    handles: collectHandles(card),
    altText: [
      `${statusLabel} score card: ${homeName} ${homePoints}, ${awayName} ${awayPoints}.`,
      topLine ? `Top performer ${top.displayName} with ${topLine}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function playerGameCardParts(card) {
  const stats = card?.stats || {};
  const contextStat = pickContextStat(stats);
  const matchup = [card?.teamName, card?.opponentName].filter(Boolean).join(' vs ');
  const when = compactDate(card?.playedOn);
  const line = statLine([
    ['PTS', stats.points],
    ['REB', stats.reb],
    ['AST', stats.ast],
  ]);

  return {
    hook: `${card?.playerName || 'Player'}: ${line}`,
    // "4 3-pointers", "7/13 field goals" — value first reads as English for
    // both the counted and the made/attempted shapes pickContextStat returns.
    context: sentence([
      `${contextStat.value} ${contextStat.label.toLowerCase()}`,
      matchup ? `in ${matchup}` : '',
      when ? `on ${when}` : '',
      card?.resultLabel ? `(${card.resultLabel})` : '',
    ]),
    question: 'Scoring or the all-round line — what stands out?',
    cta: 'Save the box score.',
    names: [card?.playerName, card?.teamName],
    handles: collectHandles(card),
    altText: [
      sentence([
        `Game stat card for ${card?.playerName || 'a player'}${jerseySuffix(card?.jerseyNumber)}`,
        card?.teamName ? `of ${card.teamName}` : '',
        `: ${statLine([
          ['points', stats.points],
          ['rebounds', stats.reb],
          ['assists', stats.ast],
        ])}`,
        card?.opponentName ? `against ${card.opponentName}` : '',
        when ? `on ${when}` : '',
        card?.resultLabel ? `, result ${card.resultLabel}` : '',
      ]),
      PORTRAIT_NOTES[card?.imageFallback],
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function playerCardParts(card) {
  const summary = card?.summary || {};
  const games = summary.gamesCount ?? 0;

  return {
    hook: `${card?.playerName || 'Player'}: ${formatAverage(summary.pointsPerGame)} PPG, ${formatAverage(
      summary.reboundsPerGame
    )} RPG, ${formatAverage(summary.assistsPerGame)} APG`,
    context: sentence([
      `Season averages across ${games} tracked ${games === 1 ? 'game' : 'games'}`,
      card?.teamName ? `for ${card.teamName}` : '',
    ]),
    question: 'Who else is putting up numbers like this?',
    cta: 'Full profile in bio.',
    names: [card?.playerName, card?.teamName],
    handles: collectHandles(card),
    altText: [
      sentence([
        `Season averages card for ${card?.playerName || 'a player'}${jerseySuffix(card?.jerseyNumber)}`,
        card?.teamName ? `of ${card.teamName}` : '',
        `: ${formatAverage(summary.pointsPerGame)} points, ${formatAverage(
          summary.reboundsPerGame
        )} rebounds and ${formatAverage(summary.assistsPerGame)} assists per game across ${games} tracked ${
          games === 1 ? 'game' : 'games'
        }`,
      ]),
      PORTRAIT_NOTES[card?.imageFallback],
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function teamCardParts(card) {
  const summary = card?.summary || {};
  const games = summary.gamesCount ?? 0;
  const gamesLabel = `${games} tracked ${games === 1 ? 'game' : 'games'}`;
  // formatPercentage answers "--" for an untracked split; that is a placeholder
  // on a ledger row and a fabricated claim in a sentence, so it is dropped.
  const shooting = [
    [summary.fg2?.percentage, 'from two'],
    [summary.fg3?.percentage, 'from three'],
    [summary.ft?.percentage, 'at the line'],
  ]
    .filter(([value]) => value != null)
    .map(([value, where]) => `${formatPercentage(value)} ${where}`);

  return {
    hook: `${card?.teamName || 'Team'}: ${summary.points ?? 0} points in ${gamesLabel}`,
    context: shooting.length ? `Shooting ${shooting.join(', ')}.` : null,
    question: 'Who in your league is shooting better than this?',
    cta: 'Full team page in bio.',
    names: [card?.teamName],
    handles: collectHandles(card),
    altText: sentence([
      `Season summary card for ${card?.teamName || 'a team'}: ${summary.points ?? 0} points in ${gamesLabel}`,
      shooting.length ? `, shooting ${shooting.join(', ')}` : '',
    ]),
  };
}

// Social backlog rank 8. A leaderboard card's subject is a ranking, so the hook
// is the category and the proof is the player at the top of it.
function leaderboardCardParts(card) {
  const [leader] = card?.rows || [];
  const isTable = card?.kind === 'table';

  return {
    hook: `${card?.leagueName || 'League'}: ${card?.label || 'Leaders'}`,
    context: leader
      ? sentence([
          isTable
            ? `${leader.name} top the table on ${leader.record}`
            : `${leader.name} leads on ${leader.value}`,
          leader.teamName ? `for ${leader.teamName}` : '',
          leader.gamesCount ? `across ${leader.gamesCount} games` : '',
        ])
      : null,
    question: isTable ? 'Who is catching them?' : 'Who takes this by the end of the season?',
    cta: 'Full table in profile.',
    names: [card?.leagueName, leader?.teamName],
    handles: collectHandles(card),
    altText: card?.altText || '',
  };
}

const MILESTONE_QUESTIONS = {
  career_threshold: 'Who reaches this next in your league?',
  single_game_feat: 'Seen a better line this season?',
  first: 'Remember your first?',
};

function milestoneCardParts(card) {
  const player = `${card?.playerName || 'Player'}${jerseySuffix(card?.jerseyNumber)}`;
  const when = compactDate(card?.achievedAt);

  return {
    // Rank 3 put the achievement in the display slot the player's name occupies
    // on every other board, because that is what the post is about. The caption
    // keeps the same order.
    hook: card?.label ? `${card.label} — ${player}` : player,
    context: sentence([
      'Recorded',
      card?.teamName ? `for ${card.teamName}` : '',
      card?.gameTitle ? `in ${card.gameTitle}` : '',
      when ? `on ${when}` : '',
    ]),
    question: MILESTONE_QUESTIONS[card?.family] || 'Who is next?',
    cta: 'Full story in profile.',
    names: [card?.playerName, card?.teamName],
    handles: collectHandles(card),
    altText: [
      sentence([
        `Milestone card: ${card?.label || 'achievement'} for ${player}`,
        card?.teamName ? `of ${card.teamName}` : '',
        card?.gameTitle ? `, recorded in ${card.gameTitle}` : '',
        when ? `on ${when}` : '',
      ]),
      // A milestone snapshot stores its images as plain strings and carries no
      // `imageFallback`, so the same three cases are read off the URLs. A real
      // avatar needs no note; the other two do.
      card?.playerAvatarUrl ? null : PORTRAIT_NOTES[card?.teamLogo ? 'team_logo' : 'placeholder'],
    ]
      .filter(Boolean)
      .join(' '),
  };
}

// Keyed the same way renderCard is, so a card type that can be exported can
// always be captioned. Anything absent returns null and the caller hides the
// assistant rather than shipping an empty caption.
const CARD_PARTS = {
  game_card: { field: 'gameCard', build: gameCardParts },
  player_card: { field: 'playerCard', build: playerCardParts },
  player_game_card: { field: 'playerGameCard', build: playerGameCardParts },
  team_card: { field: 'teamCard', build: teamCardParts },
  milestone: { field: 'milestoneCard', build: milestoneCardParts },
  leaderboard_card: { field: 'leaderboardCard', build: leaderboardCardParts },
};

// Older callers pass a post whose type is implied by which card field is set,
// so fall back to sniffing rather than requiring `type`.
export function resolveCaptionSource(source) {
  const key =
    CARD_PARTS[source?.type]?.field && source[CARD_PARTS[source.type].field]
      ? source.type
      : Object.keys(CARD_PARTS).find((candidate) => source?.[CARD_PARTS[candidate].field]);

  if (!key) return null;
  return { type: key, card: source[CARD_PARTS[key].field] };
}

// Assembles the blocks under the 2200-character limit by DROPPING trailing
// blocks rather than cutting mid-word: a caption that loses its tags still
// reads, and one truncated mid-sentence does not. The lead is never dropped.
function fitCaption(blocks) {
  const kept = [...blocks].filter(Boolean);
  while (kept.length > 1 && kept.join('\n\n').length > CAPTION_MAX_CHARACTERS) {
    kept.pop();
  }
  return kept.join('\n\n').slice(0, CAPTION_MAX_CHARACTERS);
}

/**
 * Builds editable copy for one exportable card.
 *
 * `lead` is the operator's own words. Auto-generated posts carry no caption
 * (feed.service.js writes `caption: null` for every auto card), so in practice
 * the generated hook leads unless a human deliberately wrote one — in which
 * case theirs replaces the hook and keeps the rest of the formula.
 *
 * Returns null for anything that is not an exportable card.
 */
export function buildCaptionKit(source, { attributionUrl = '', lead = '' } = {}) {
  const resolved = resolveCaptionSource(source);
  if (!resolved) return null;

  const parts = CARD_PARTS[resolved.type].build(resolved.card);
  const hook = String(lead || '').trim() || parts.hook;
  const hashtags = buildHashtags(parts.names.filter(Boolean));
  const { handles } = parts;

  const caption = fitCaption([
    [hook, parts.context, `${parts.question} ${parts.cta}`].filter(Boolean).join('\n'),
    attributionUrl ? `${CAPTION_ATTRIBUTION_LEAD_IN} ${attributionUrl}` : '',
    [handles.join(' '), hashtags.join(' ')].filter(Boolean).join('\n'),
  ]);

  return {
    type: resolved.type,
    hook,
    context: parts.context,
    question: parts.question,
    cta: parts.cta,
    hashtags,
    handles,
    altText: parts.altText,
    caption,
  };
}
