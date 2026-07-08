import playerPlaceholder from '../../../../assets/placeholders/player-placeholder.svg';
import { getGameCardLogo } from '../../cardImage';

// TSW-004: was duplicated verbatim between GameCardPost.jsx and
// FullScreenGameCard.jsx (name/points/logo/isWinner derivation for both the
// dual-team and standalone-team display shapes). Extracted to one place so
// both components render identically and can't drift.
export function buildGameCardDisplay(gameCard) {
  const isDualTeam = !!gameCard?.participants;
  const statusLabel = gameCard?.recap?.statusLabel || 'Final';

  const homeName = isDualTeam
    ? gameCard?.recap?.home?.name || gameCard?.participants?.home?.displayName || 'Home'
    : gameCard?.teamName || 'Team';
  const awayName = isDualTeam
    ? gameCard?.recap?.away?.name || gameCard?.participants?.away?.displayName || 'Away'
    : gameCard?.recap?.opponent?.name || gameCard?.opponent || 'Opponent';
  const homePoints = isDualTeam
    ? (gameCard?.recap?.home?.points ?? 0)
    : (gameCard?.recap?.team?.points ?? 0);
  const awayPoints = isDualTeam
    ? (gameCard?.recap?.away?.points ?? 0)
    : (gameCard?.recap?.opponent?.points ?? 0);
  const homeLogo = isDualTeam
    ? getGameCardLogo({ teamLogo: gameCard?.participants?.home?.logo })
    : getGameCardLogo(gameCard);
  const awayLogo = isDualTeam
    ? getGameCardLogo({ teamLogo: gameCard?.participants?.away?.logo })
    : null;

  return {
    isDualTeam,
    statusLabel,
    homeName,
    awayName,
    homePoints,
    awayPoints,
    homeLogo,
    awayLogo,
    homeIsWinner: homePoints > awayPoints,
    awayIsWinner: awayPoints > homePoints,
  };
}

export function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function formatPercentage(value) {
  return value == null ? '--' : `${value.toFixed(0)}%`;
}

export function buildInitials(value, fallback = 'TS') {
  const parts = String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return fallback;
  }

  return parts
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function formatCompactDate(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export function getPlayerFallbackState(playerCard) {
  if (playerCard?.playerImage?.url) {
    return {
      src: playerCard.playerImage.url,
      alt: `${playerCard.playerName} card avatar`,
      helper: null,
      initials: null,
    };
  }

  if (playerCard?.teamLogo?.url) {
    return {
      src: playerCard.teamLogo.url,
      alt: `${playerCard.playerName} card avatar`,
      helper: 'TEAM MARK',
      initials: null,
    };
  }

  return {
    src: null,
    alt: `${playerCard?.playerName || 'Player'} card avatar`,
    helper: 'PLAYER SPOTLIGHT',
    initials: buildInitials(playerCard?.playerName, 'PL'),
  };
}

export function getFallbackPlayerImage() {
  return playerPlaceholder;
}
