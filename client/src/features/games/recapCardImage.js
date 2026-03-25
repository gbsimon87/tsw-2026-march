function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPercentage(value) {
  return value == null ? '--' : `${value.toFixed(0)}%`;
}

function normalizeHexColors(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
    : [];
}

function buildInitials(name, fallback = 'TM') {
  const parts = String(name || '')
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

function buildSummarySentence(recap) {
  const topPerformer = recap?.topPerformers?.[0];

  if (topPerformer?.displayName) {
    return `${topPerformer.displayName} led the way with ${topPerformer.points || 0} PTS.`;
  }

  if (recap?.opponent?.name) {
    return `${recap?.team?.name || 'Team'} closed out against ${recap.opponent.name}.`;
  }

  return `${recap?.team?.name || 'Team'} final recap.`;
}

function buildTopPerformerRows(recap) {
  return (recap?.topPerformers || []).slice(0, 3).map((player, index) => {
    const y = 770 + index * 116;
    const initials = buildInitials(player.displayName, 'PL');

    return `
      <rect x="56" y="${y}" width="968" height="92" rx="22" fill="rgba(2,6,23,0.34)" stroke="rgba(255,255,255,0.08)" />
      <rect x="74" y="${y + 14}" width="64" height="64" rx="18" fill="url(#performerAccent)" />
      <text x="106" y="${y + 55}" text-anchor="middle" font-size="22" font-weight="900" fill="#0f172a">${escapeXml(initials)}</text>
      <text x="160" y="${y + 38}" font-size="28" font-weight="800" fill="#f8fafc">${escapeXml(player.displayName)}</text>
      <text x="160" y="${y + 66}" font-size="18" font-weight="600" fill="#cbd5e1">${player.points} PTS • ${player.reb} REB • ${player.ast} AST</text>
      <text x="970" y="${y + 56}" text-anchor="end" font-size="13" font-weight="800" fill="#fbbf24" letter-spacing="2">TOP PERFORMER</text>
    `;
  });
}

function buildScoreRow({ name, points, y, nameColor, scoreColor }) {
  return `
    <text x="418" y="${y}" font-size="24" font-weight="800" fill="${nameColor}" letter-spacing="2">${escapeXml(name)}</text>
    <text x="970" y="${y + 2}" text-anchor="end" font-size="88" font-weight="900" fill="${scoreColor}">${points || 0}</text>
  `;
}

export function createRecapCardSvg(recap, options = {}) {
  const teamColors = normalizeHexColors(options.teamColors);
  const teamLogoUrl =
    typeof options.teamLogoUrl === 'string' && options.teamLogoUrl
      ? escapeXml(options.teamLogoUrl)
      : '';
  const teamName = recap?.team?.name || 'Team';
  const teamInitials = buildInitials(teamName, 'TM');
  const opponentName = recap?.opponent?.name || 'Opponent';
  const summarySentence = escapeXml(buildSummarySentence(recap));
  const performerRows = buildTopPerformerRows(recap).join('');
  const topPerformersCount = Math.max((recap?.topPerformers || []).slice(0, 3).length, 1);
  const performersBlockHeight = topPerformersCount * 116;
  const cardHeight = 770 + performersBlockHeight + 72;
  const primaryColor = teamColors[0] || '#f59e0b';
  const secondaryColor = teamColors[1] || '#f97316';
  const tertiaryColor = teamColors[2] || '#22d3ee';
  const labelColor = teamColors[1] || '#fbbf24';
  const logoMarkup = teamLogoUrl
    ? `<image href="${teamLogoUrl}" x="76" y="92" width="112" height="112" preserveAspectRatio="xMidYMid slice" />`
    : `<text x="132" y="170" text-anchor="middle" font-size="44" font-weight="900" fill="#0f172a">${escapeXml(teamInitials)}</text>`;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}" role="img" aria-label="Game recap card">
    <defs>
      <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="45%" stop-color="#111827" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="heroAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.9" />
        <stop offset="55%" stop-color="${secondaryColor}" stop-opacity="0.34" />
        <stop offset="100%" stop-color="${tertiaryColor}" stop-opacity="0.22" />
      </linearGradient>
      <linearGradient id="performerAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${labelColor}" />
        <stop offset="100%" stop-color="${primaryColor}" />
      </linearGradient>
    </defs>

    <rect width="1080" height="${cardHeight}" rx="48" fill="url(#cardBg)" />
    <rect x="32" y="32" width="1016" height="${cardHeight - 64}" rx="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
    <circle cx="1010" cy="86" r="132" fill="rgba(255,255,255,0.05)" />
    <rect x="-20" y="${cardHeight - 180}" width="220" height="110" rx="30" transform="rotate(-18 90 ${cardHeight - 125})" fill="rgba(255,255,255,0.05)" />
    <rect x="0" y="0" width="1080" height="${cardHeight}" fill="url(#heroAccent)" />
    <line x1="0" y1="670" x2="1080" y2="670" stroke="rgba(255,255,255,0.08)" />
    <line x1="716" y1="90" x2="716" y2="646" stroke="rgba(255,255,255,0.08)" />

    <text x="56" y="78" font-size="14" font-weight="900" fill="${labelColor}" letter-spacing="6">GAME RECAP</text>
    <rect x="56" y="92" width="152" height="112" rx="26" fill="rgba(255,255,255,0.92)" />
    ${logoMarkup}

    <text x="236" y="128" font-size="56" font-weight="900" fill="#f8fafc">${escapeXml(teamName)}</text>
    <text x="236" y="170" font-size="20" font-weight="700" fill="#94a3b8" letter-spacing="3">${escapeXml(recap?.statusLabel || 'FINAL')}</text>
    <text x="236" y="204" font-size="24" font-weight="600" fill="#cbd5e1">${escapeXml(formatDate(recap?.playedAt))}</text>

    <rect x="56" y="244" width="968" height="230" rx="30" fill="rgba(2,6,23,0.32)" stroke="rgba(255,255,255,0.08)" />
    ${buildScoreRow({
      name: teamName,
      points: recap?.team?.points,
      y: 330,
      nameColor: '#f8fafc',
      scoreColor: '#ffffff',
    })}
    ${buildScoreRow({
      name: opponentName,
      points: recap?.opponent?.points,
      y: 430,
      nameColor: '#cbd5e1',
      scoreColor: '#e2e8f0',
    })}
    <text x="418" y="292" font-size="14" font-weight="900" fill="${labelColor}" letter-spacing="4">SCOREBOARD</text>

    <rect x="56" y="504" width="968" height="120" rx="24" fill="rgba(2,6,23,0.28)" stroke="rgba(255,255,255,0.08)" />
    <text x="86" y="548" font-size="16" font-weight="900" fill="${labelColor}" letter-spacing="4">GAME NOTE</text>
    <text x="86" y="590" font-size="30" font-weight="700" fill="#f8fafc">${summarySentence}</text>

    <rect x="56" y="652" width="280" height="86" rx="22" fill="rgba(2,6,23,0.26)" stroke="rgba(255,255,255,0.08)" />
    <rect x="360" y="652" width="280" height="86" rx="22" fill="rgba(2,6,23,0.26)" stroke="rgba(255,255,255,0.08)" />
    <rect x="664" y="652" width="360" height="86" rx="22" fill="rgba(2,6,23,0.26)" stroke="rgba(255,255,255,0.08)" />
    <text x="84" y="684" font-size="13" font-weight="900" fill="#94a3b8" letter-spacing="3">POINTS</text>
    <text x="84" y="718" font-size="34" font-weight="900" fill="#f8fafc">${recap?.teamStats?.points || 0}</text>
    <text x="388" y="684" font-size="13" font-weight="900" fill="#94a3b8" letter-spacing="3">REB • AST</text>
    <text x="388" y="718" font-size="34" font-weight="900" fill="#f8fafc">${recap?.teamStats?.reb || 0} • ${recap?.teamStats?.ast || 0}</text>
    <text x="692" y="684" font-size="13" font-weight="900" fill="#94a3b8" letter-spacing="3">FG2% • FG3% • FT%</text>
    <text x="692" y="718" font-size="30" font-weight="900" fill="#f8fafc">${formatPercentage(recap?.teamStats?.fg2?.percentage)} • ${formatPercentage(recap?.teamStats?.fg3?.percentage)} • ${formatPercentage(recap?.teamStats?.ft?.percentage)}</text>

    <text x="56" y="744" font-size="16" font-weight="900" fill="${labelColor}" letter-spacing="4">TOP PERFORMERS</text>
    ${performerRows}
  </svg>
  `.trim();
}

export function createRecapCardDataUrl(recap, options = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createRecapCardSvg(recap, options))}`;
}
