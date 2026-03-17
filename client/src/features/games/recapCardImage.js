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

  return parsed.toLocaleDateString();
}

function buildPlayerInitials(name) {
  return String(name || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function buildSummarySentence(recap) {
  if (recap?.opponent?.name) {
    const opponentPoints = recap?.opponent?.points;
    if (typeof opponentPoints === 'number') {
      return `${recap?.team?.name || 'Team'} finished ${recap?.team?.points || 0}-${opponentPoints} vs ${recap.opponent.name}.`;
    }
    return `${recap?.team?.name || 'Team'} scored ${recap?.team?.points || 0} points vs ${recap.opponent.name}.`;
  }

  return `${recap?.team?.name || 'Team'} scored ${recap?.team?.points || 0} points.`;
}

function buildPlayerLines(recap) {
  return (recap?.topPerformers || []).slice(0, 3).map((player, index) => {
    const top = 944 + index * 126;
    const initials = buildPlayerInitials(player.displayName);
    return `
      <rect x="56" y="${top}" width="968" height="102" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
      <circle cx="116" cy="${top + 51}" r="34" fill="#0ea5e9" />
      <text x="116" y="${top + 60}" text-anchor="middle" font-size="26" font-weight="800" fill="#e0f2fe">${escapeXml(initials)}</text>
      <text x="172" y="${top + 42}" font-size="28" font-weight="700" fill="#0f172a">${escapeXml(player.displayName)}</text>
      <text x="172" y="${top + 74}" font-size="22" fill="#475569">${player.points} PTS • ${player.reb} REB • ${player.ast} AST</text>
    `;
  });
}

export function createRecapCardSvg(recap, options = {}) {
  let teamLogoMarkup = '';
  const teamLogoUrl =
    typeof options.teamLogoUrl === 'string' && options.teamLogoUrl
      ? escapeXml(options.teamLogoUrl)
      : '';
  const teamName = recap?.team?.name || 'Team';
  const opponentName = recap?.opponent?.name
    ? `vs ${recap.opponent.name}`
    : 'Opponent not recorded';
  const teamInitial = escapeXml((teamName[0] || 'T').toUpperCase());
  const summarySentence = escapeXml(buildSummarySentence(recap));
  const topPerformers = (recap?.topPerformers || []).slice(0, 3);
  const playerLines = buildPlayerLines(recap).join('');
  const performersHeight = Math.max(160, topPerformers.length * 126 + 28);
  const performersLabelTop = 878;
  const performersContentTop = 944;
  const cardHeight = performersContentTop + performersHeight + 72;

  if (teamLogoUrl) {
    teamLogoMarkup = `
      <rect x="64" y="74" width="104" height="104" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="3" />
      <image href="${teamLogoUrl}" x="72" y="82" width="88" height="88" preserveAspectRatio="xMidYMid slice" />
    `;
  }

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}" role="img" aria-label="Game recap card">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fef3c7" />
        <stop offset="45%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#e0f2fe" />
      </linearGradient>
    </defs>
    <rect width="1080" height="${cardHeight}" fill="url(#bg)" />
    <rect x="32" y="32" width="1016" height="${cardHeight - 64}" rx="44" fill="#ffffff" stroke="#e2e8f0" stroke-width="4" />

    ${
      teamLogoMarkup ||
      `<circle cx="116" cy="126" r="52" fill="#f59e0b" />
    <text x="116" y="145" text-anchor="middle" font-size="42" font-weight="800" fill="#fef3c7">${teamInitial}</text>`
    }
    <text x="188" y="104" font-size="28" font-weight="800" fill="#64748b">${escapeXml(recap?.statusLabel || 'GAME RECAP')}</text>
    <text x="188" y="176" font-size="64" font-weight="800" fill="#0f172a">${escapeXml(teamName)}</text>
    <text x="188" y="226" font-size="32" fill="#475569">${escapeXml(opponentName)}</text>
    <text x="188" y="270" font-size="24" fill="#64748b">${escapeXml(formatDate(recap?.playedAt))}</text>

    <rect x="692" y="88" width="316" height="216" rx="34" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
    <text x="850" y="132" text-anchor="middle" font-size="20" font-weight="700" fill="#64748b">FINAL SCORE</text>
    <text x="780" y="182" text-anchor="middle" font-size="24" font-weight="700" fill="#64748b">${escapeXml(teamName)}</text>
    <text x="920" y="182" text-anchor="middle" font-size="24" font-weight="700" fill="#64748b">${escapeXml(recap?.opponent?.name || 'Opponent')}</text>
    <text x="780" y="252" text-anchor="middle" font-size="92" font-weight="800" fill="#0f172a">${recap?.team?.points || 0}</text>
    <text x="920" y="252" text-anchor="middle" font-size="92" font-weight="800" fill="#0f172a">${recap?.opponent?.points || 0}</text>

    <rect x="48" y="356" width="984" height="120" rx="28" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
    <text x="84" y="428" font-size="30" font-weight="700" fill="#0f172a">${summarySentence}</text>

    <text x="48" y="550" font-size="24" font-weight="800" fill="#64748b">TEAM STATS</text>
    <g>
      <rect x="48" y="574" width="300" height="140" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
      <rect x="390" y="574" width="300" height="140" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
      <rect x="732" y="574" width="300" height="140" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
      <rect x="48" y="736" width="300" height="140" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3" />
      <text x="76" y="626" font-size="22" font-weight="700" fill="#64748b">POINTS</text>
      <text x="76" y="682" font-size="54" font-weight="800" fill="#0f172a">${recap?.teamStats?.points || 0}</text>
      <text x="418" y="626" font-size="22" font-weight="700" fill="#64748b">REB • AST</text>
      <text x="418" y="682" font-size="50" font-weight="800" fill="#0f172a">${recap?.teamStats?.reb || 0} • ${recap?.teamStats?.ast || 0}</text>
      <text x="760" y="626" font-size="22" font-weight="700" fill="#64748b">FG2% • FG3%</text>
      <text x="760" y="682" font-size="42" font-weight="800" fill="#0f172a">${recap?.teamStats?.fg2?.percentage == null ? '--' : `${recap.teamStats.fg2.percentage.toFixed(0)}%`} • ${recap?.teamStats?.fg3?.percentage == null ? '--' : `${recap.teamStats.fg3.percentage.toFixed(0)}%`}</text>
      <text x="76" y="788" font-size="22" font-weight="700" fill="#64748b">FT%</text>
      <text x="76" y="844" font-size="54" font-weight="800" fill="#0f172a">${recap?.teamStats?.ft?.percentage == null ? '--' : `${recap.teamStats.ft.percentage.toFixed(0)}%`}</text>
    </g>

    <text x="48" y="${performersLabelTop + 54}" font-size="24" font-weight="800" fill="#64748b">TOP PERFORMERS</text>
    ${playerLines}
  </svg>
  `.trim();
}

export function createRecapCardDataUrl(recap, options = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createRecapCardSvg(recap, options))}`;
}
