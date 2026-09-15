// Social backlog rank 9 — the export guard.
//
// Everything TSW publishes to a social platform passes through here. The server
// resolves permission from live documents (modules/shared/socialIdentity.js) and
// sends a `marketing` block with every public payload an export surface reads;
// this module turns that block into what an operator may actually download.
//
// Three outcomes, and the default is the safe one:
//
//   blocked     the organisation has no recorded permission, so nothing exports.
//               docs/ideas.md > Constraints: marketing content comes from the
//               demo account unless a league has given explicit permission.
//   restricted  the organisation gave permission, but somebody named on this
//               card is not covered by it — a player who withdrew, or a minor
//               with no guardian record. Single cards use initials; the game
//               kit omits their performer entries and player cards.
//   cleared     publish it.
//
// A MISSING block is treated as blocked, not as permission. A surface that
// forgets to pass `marketing` fails closed; that is the only direction a
// consent guard may fail in.

export const EXPORT_CLEARANCE = Object.freeze({
  CLEARED: 'cleared',
  RESTRICTED: 'restricted',
  BLOCKED: 'blocked',
});

export function marketingFingerprint(marketing) {
  if (!marketing) return 'missing';
  return JSON.stringify({
    orgId: marketing.orgId,
    canFeature: marketing.canFeature,
    reason: marketing.reason,
    restrictedPlayerIds: [...(marketing.restrictedPlayerIds || [])].map(String).sort(),
    handles: marketing.handles || {},
  });
}

const BLOCKED_COPY = {
  permission_not_recorded: {
    headline: 'Not cleared for publication',
    detail:
      'No marketing permission is recorded for this league, so its exports are held. A league owner can record it in league settings. Until then, use the demo league for marketing.',
  },
  permission_declined: {
    headline: 'Marketing permission declined',
    detail:
      'This league has declined permission for its content to be used in TSW marketing. Nothing here is exportable.',
  },
};

const TEAM_SCOPE_COPY = {
  permission_not_recorded: {
    headline: 'Not cleared for publication',
    detail:
      'No marketing permission is recorded for this team, so its exports are held. The team owner can record it in team settings. Until then, use the demo team for marketing.',
  },
  permission_declined: {
    headline: 'Marketing permission declined',
    detail:
      'This team has declined permission for its content to be used in TSW marketing. Nothing here is exportable.',
  },
};

/**
 * "Jordan Blake" becomes "J. B." — recognisable to the club, not to a stranger
 * scrolling past. Never a jersey number: in a ten-person league a number
 * identifies as precisely as a name does.
 */
export function maskName(name) {
  const initials = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2);

  return initials.length ? `${initials.join('. ')}.` : 'Player';
}

function restrictedSet(marketing) {
  return new Set((marketing?.restrictedPlayerIds || []).map(String));
}

function cardIds(card) {
  return [card?.leaguePlayerId, card?.playerId].filter(Boolean).map(String);
}

// Single-subject cards (player, per-game player, milestone) name exactly the
// person the server resolved permission for, so a restriction on the payload IS
// about them. Matching by id where the snapshot carries one keeps it exact;
// milestone snapshots predate rank 9 and carry none.
function subjectIsRestricted(card, marketing) {
  const restricted = restrictedSet(marketing);
  if (!restricted.size) return false;

  const ids = cardIds(card);
  return ids.length ? ids.some((id) => restricted.has(id)) : true;
}

function rowIsRestricted(row, restricted) {
  const ids = [row?.leaguePlayerId, row?.playerId].filter(Boolean).map(String);
  return ids.some((id) => restricted.has(id));
}

/**
 * Replaces every masked name wherever it appears in pre-built prose.
 *
 * Alt text and slide captions are composed when the card is built, so masking a
 * name in the ledger without rewriting them would export an image reading
 * "J. B." beside alt text naming the person in full.
 */
function applyMasks(text, masks) {
  if (!text || !masks.length) return text;
  return masks.reduce((current, [from, to]) => current.split(from).join(to), text);
}

function handlesFor(marketing, ids, network) {
  for (const id of ids) {
    const recorded = marketing?.handles?.[String(id)];
    if (recorded?.[network]) return recorded[network];
  }
  return null;
}

/**
 * The handles a caption may tag for this card, as the flat fields
 * captionAssistant.js already reads. Absent where nothing was recorded — the
 * assistant tags @TheSportyWay alone rather than deriving one from a name.
 */
function attachHandles(card, marketing, network = 'instagram') {
  const teamIds = [card?.leagueTeamId, card?.teamId].filter(Boolean);
  const playerIds = cardIds(card);

  const teamHandle = handlesFor(marketing, teamIds, network);
  const playerHandle = handlesFor(marketing, playerIds, network);
  if (!teamHandle && !playerHandle) return card;

  return {
    ...card,
    ...(teamHandle ? { teamInstagramHandle: teamHandle } : {}),
    ...(playerHandle ? { playerInstagramHandle: playerHandle } : {}),
  };
}

/**
 * What an export surface shows before it offers a download.
 *
 * `canExport` is the only thing a button should read. `headline`/`detail` say
 * why, and name the record that has to change — an operator who is only told
 * "no" cannot fix it.
 */
export function resolveExportGuard(marketing, { restrictedCount = 0, singleSubject = false } = {}) {
  if (!marketing?.canFeature) {
    const scopeCopy = marketing?.scope === 'team' ? TEAM_SCOPE_COPY : BLOCKED_COPY;
    const copy = scopeCopy[marketing?.reason] || scopeCopy.permission_not_recorded;
    return {
      clearance: EXPORT_CLEARANCE.BLOCKED,
      canExport: false,
      orgName: marketing?.orgName ?? null,
      scope: marketing?.scope ?? 'league',
      ...copy,
    };
  }

  if (restrictedCount > 0) {
    return {
      clearance: EXPORT_CLEARANCE.RESTRICTED,
      canExport: !singleSubject,
      orgName: marketing.orgName ?? null,
      scope: marketing.scope,
      headline:
        restrictedCount === 1 ? 'One name is hidden' : `${restrictedCount} names are hidden`,
      detail: singleSubject
        ? 'This player is not cleared for marketing. Their card cannot be exported or sent to Instagram.'
        : 'This permission does not cover every player shown — someone opted out, or a guardian consent is missing. Restricted players are omitted from the game kit and ranking cards.',
    };
  }

  return {
    clearance: EXPORT_CLEARANCE.CLEARED,
    canExport: true,
    orgName: marketing.orgName ?? null,
    scope: marketing.scope,
    headline: null,
    detail: null,
  };
}

function guardSinglePlayerCard(card, marketing) {
  if (!subjectIsRestricted(card, marketing)) return { card, restrictedCount: 0 };

  const masked = maskName(card.playerName);
  const masks = card.playerName ? [[card.playerName, masked]] : [];

  return {
    restrictedCount: 1,
    card: {
      ...card,
      playerName: masked,
      // A face is the identification the initials just removed.
      playerImage: null,
      playerAvatarUrl: null,
      jerseyNumber: null,
      playerUrl: null,
      label: applyMasks(card.label, masks),
      imageFallback: card.teamLogo ? 'team_logo' : 'placeholder',
      altText: applyMasks(card.altText, masks),
    },
  };
}

function guardLeaderboardCard(card, marketing) {
  if (card?.kind === 'table' || !Array.isArray(card?.rows)) {
    return { card, restrictedCount: 0 };
  }
  const restricted = restrictedSet(marketing);
  if (!restricted.size) return { card, restrictedCount: 0 };

  // A rank, club and exact average can re-identify a player even after their
  // name is changed to initials. Exclude the row rather than masking it.
  const rows = card.rows.filter((row) => row.leaguePlayerId && !rowIsRestricted(row, restricted));
  const restrictedCount = card.rows.length - rows.length;
  if (!restrictedCount) return { card, restrictedCount: 0 };
  if (rows.length < 3) return { card: null, restrictedCount };

  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    restrictedCount,
    card: {
      ...card,
      rows: ranked,
      altText: `${card.leagueName || 'League'} ${String(card.label || 'leaders').toLowerCase()} leaders: ${ranked
        .map((row) => `${row.rank}. ${row.name} ${row.value}`)
        .join(', ')}.`,
    },
  };
}

function guardRows(card, marketing, key = 'rows') {
  const restricted = restrictedSet(marketing);
  if (!restricted.size || !Array.isArray(card?.[key])) return { card, restrictedCount: 0 };

  const masks = [];
  const rows = card[key].map((row) => {
    if (!rowIsRestricted(row, restricted)) return row;
    const field = row.name !== undefined ? 'name' : 'displayName';
    const masked = maskName(row[field]);
    if (row[field]) masks.push([row[field], masked]);
    return { ...row, [field]: masked };
  });

  if (!masks.length) return { card, restrictedCount: 0 };

  return {
    restrictedCount: masks.length,
    card: { ...card, [key]: rows, altText: applyMasks(card.altText, masks) },
  };
}

const GUARDS = {
  player_card: guardSinglePlayerCard,
  player_game_card: guardSinglePlayerCard,
  milestone: guardSinglePlayerCard,
  leaderboard_card: guardLeaderboardCard,
  carousel_slide: (card, marketing) => guardRows(card, marketing),
  // A game card's individuals are the three names in its recap.
  game_card: (card, marketing) => {
    const guarded = guardRows(card?.recap, marketing, 'topPerformers');
    if (!guarded.restrictedCount) return { card, restrictedCount: 0 };
    return { card: { ...card, recap: guarded.card }, restrictedCount: guarded.restrictedCount };
  },
  // A club is not an individual: a team card carries no name the organisation's
  // own permission does not already cover.
  team_card: (card) => ({ card, restrictedCount: 0 }),
};

/**
 * Applies the guard to one card.
 *
 * Returns the card to render, the guard state to show beside it, and nothing
 * else — a blocked card is still returned (a preview an operator can see is how
 * they understand what is being withheld), and it is `guard.canExport` that
 * stops the download.
 */
export function guardCard(type, card, marketing, { network = 'instagram' } = {}) {
  if (!card) return { card, guard: resolveExportGuard(marketing), restrictedCount: 0 };

  const apply = GUARDS[type];
  const { card: guarded, restrictedCount } = apply
    ? apply(card, marketing)
    : { card, restrictedCount: 0 };

  const guard = resolveExportGuard(marketing, {
    restrictedCount,
    singleSubject: ['player_card', 'player_game_card', 'milestone'].includes(type),
  });
  // A blocked card never carries handles: tagging is the act permission is for.
  const withHandles = guard.canExport ? attachHandles(guarded, marketing, network) : guarded;

  return { card: withHandles, guard, restrictedCount };
}

/**
 * Applies the guard to a whole game payload, once, before anything is built
 * from it.
 *
 * The kit, the carousel and the game card all read `recap.topPerformers`. A
 * restricted performer must be removed here, because the kit re-joins that
 * entry to the full box score and roster to build a player card. Masking only
 * the recap name would leave their full name and portrait in that card.
 */
export function guardGamePayload(data, marketing) {
  const restricted = restrictedSet(marketing);
  const performers = data?.recap?.topPerformers;

  if (!restricted.size || !Array.isArray(performers)) {
    return { data, guard: resolveExportGuard(marketing), restrictedCount: 0 };
  }

  const guardedPerformers = performers.filter(
    (performer) => !rowIsRestricted(performer, restricted)
  );
  const restrictedCount = performers.length - guardedPerformers.length;

  return {
    data: { ...data, recap: { ...data.recap, topPerformers: guardedPerformers } },
    guard: resolveExportGuard(marketing, { restrictedCount }),
    restrictedCount,
  };
}
