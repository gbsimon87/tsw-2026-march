import playerPlaceholder from '../../../../assets/placeholders/player-placeholder.svg';

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
