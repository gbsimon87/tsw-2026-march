import { normalizeComparableText } from './voiceText';

const DUAL_SIDES = new Set(['home', 'away']);

function indexPlayer(player) {
  const normalizedName = normalizeComparableText(player.displayName);
  return {
    ...player,
    normalizedName,
    nameTokens: normalizedName ? normalizedName.split(' ') : [],
  };
}

export function createParticipantIndex({
  trackingMode = 'one_sided',
  playersBySide = {},
  lineupIdsBySide = {},
}) {
  const sides = trackingMode === 'dual_team' ? ['home', 'away'] : ['tracked'];
  const bySide = {};

  for (const side of sides) {
    bySide[side] = {
      players: (playersBySide[side] || []).map(indexPlayer),
      lineupIds: new Set(lineupIdsBySide[side] || []),
    };
  }

  return { trackingMode, bySide };
}

function findNameMatches(players, value) {
  const normalized = normalizeComparableText(value);
  if (!normalized) return [];
  const fullMatches = players.filter((player) => player.normalizedName === normalized);
  if (fullMatches.length > 0) return fullMatches;
  return players.filter((player) => player.nameTokens.includes(normalized));
}

function findMatches(players, participant) {
  if (participant?.kind === 'jersey' && participant.value != null) {
    return players.filter((player) => player.jerseyNumber === participant.value);
  }
  if (participant?.kind === 'name') return findNameMatches(players, participant.value);
  return [];
}

export function resolveParticipant(index, { side, participant, allowedPlayerIds } = {}) {
  if (!index?.bySide) return { ok: false, reason: 'not_found' };

  let resolvedSide = 'tracked';
  if (index.trackingMode === 'dual_team') {
    if (!side) return { ok: false, reason: 'missing_side' };
    if (!DUAL_SIDES.has(side)) return { ok: false, reason: 'invalid_side' };
    resolvedSide = side;
  } else if (side) {
    return { ok: false, reason: 'invalid_side' };
  }

  const sideIndex = index.bySide[resolvedSide];
  if (!sideIndex) return { ok: false, reason: 'invalid_side' };

  const matches = findMatches(sideIndex.players, participant);
  const lineupMatches = matches.filter((player) => sideIndex.lineupIds.has(player.id));

  if (lineupMatches.length > 1) return { ok: false, reason: 'ambiguous' };
  if (lineupMatches.length === 0) {
    if (matches.length > 1) return { ok: false, reason: 'ambiguous' };
    if (matches.length === 1) {
      return {
        ok: false,
        reason: matches[0].isActive === false ? 'inactive' : 'off_court',
      };
    }
    return { ok: false, reason: 'not_found' };
  }

  const player = lineupMatches[0];
  if (player.isActive === false) return { ok: false, reason: 'inactive' };
  if (allowedPlayerIds && !new Set(allowedPlayerIds).has(player.id)) {
    return { ok: false, reason: 'not_allowed' };
  }

  return {
    ok: true,
    player,
    playerId: player.id,
    side: index.trackingMode === 'dual_team' ? resolvedSide : null,
  };
}
