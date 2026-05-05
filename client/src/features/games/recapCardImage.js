function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeHexColors(values) {
  return Array.isArray(values)
    ? values.filter((v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))
    : [];
}

function buildInitials(name, fallback = 'TM') {
  const parts = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return fallback;
  return parts
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

async function toBase64(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function logoElement({ id, cx, cy, r, base64, name, accent }) {
  const initials = buildInitials(name);
  const clipId = `c${id}`;
  const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0" />`;

  if (base64) {
    return {
      defs: `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}" /></clipPath>`,
      svg: `${circle}<image href="${escapeXml(base64)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`,
    };
  }

  const fs = Math.round(r * 0.72);
  return {
    defs: '',
    svg: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" /><text x="${cx}" y="${cy + Math.round(r * 0.3)}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="white" font-family="system-ui,sans-serif">${escapeXml(initials)}</text>`,
  };
}

function scoreRow({ name, points, cy, isWinner, logoId, logoBase64, logoAccent }) {
  const LOGO_CX = 92;
  const LOGO_R = 32;
  const nameColor = isWinner ? '#0f172a' : '#94a3b8';
  const scoreColor = isWinner ? '#0f172a' : '#cbd5e1';
  const logo = logoElement({
    id: logoId,
    cx: LOGO_CX,
    cy,
    r: LOGO_R,
    base64: logoBase64,
    name,
    accent: logoAccent,
  });

  return {
    defs: logo.defs,
    svg: `
      ${logo.svg}
      <text x="140" y="${cy + 11}" font-size="30" font-weight="800" fill="${nameColor}" font-family="system-ui,sans-serif">${escapeXml(truncate(name, 22))}</text>
      <text x="1040" y="${cy + 28}" text-anchor="end" font-size="80" font-weight="900" fill="${scoreColor}" font-family="system-ui,sans-serif">${points}</text>
    `,
  };
}

function performerRow({ player, index, accent }) {
  const y = 456 + index * 104;
  const cy = y + 44;
  const r = 28;
  const initials = buildInitials(player.displayName, 'PL');
  const teamTag = player.teamName ? escapeXml(truncate(player.teamName, 20)) : '';

  return `
    <rect x="40" y="${y}" width="1000" height="88" rx="18" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />
    <circle cx="${40 + r + 16}" cy="${cy}" r="${r}" fill="${accent}" />
    <text x="${40 + r + 16}" y="${cy + 8}" text-anchor="middle" font-size="16" font-weight="900" fill="white" font-family="system-ui,sans-serif">${escapeXml(initials)}</text>
    <text x="${40 + r * 2 + 28}" y="${cy - 10}" font-size="22" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${escapeXml(truncate(player.displayName, 26))}</text>
    ${teamTag ? `<text x="${40 + r * 2 + 28}" y="${cy + 14}" font-size="13" font-weight="600" fill="#94a3b8" font-family="system-ui,sans-serif">${teamTag}</text>` : ''}
    <text x="${40 + r * 2 + 28}" y="${teamTag ? cy + 34 : cy + 16}" font-size="16" font-weight="700" fill="#64748b" font-family="system-ui,sans-serif">${player.points} PTS · ${player.reb} REB · ${player.ast} AST</text>
  `;
}

export function createRecapCardSvg(recap, resolvedLogos = {}) {
  const { homeBase64, awayBase64, leagueBase64, teamColors } = resolvedLogos;
  const colors = normalizeHexColors(teamColors);
  const accent = colors[0] || '#f59e0b';

  const isDualTeam = !!recap?.home;
  const homeName = isDualTeam ? recap.home?.name || 'Home' : recap.team?.name || 'Team';
  const awayName = isDualTeam ? recap.away?.name || 'Away' : recap.opponent?.name || 'Opponent';
  const homePoints = isDualTeam ? (recap.home?.points ?? 0) : (recap.team?.points ?? 0);
  const awayPoints = isDualTeam ? (recap.away?.points ?? 0) : (recap.opponent?.points ?? 0);
  const homeWins = homePoints > awayPoints;
  const awayWins = awayPoints > homePoints;
  const statusLabel = escapeXml((recap?.statusLabel || 'FINAL').toUpperCase());
  const dateLabel = escapeXml(formatDate(recap?.playedAt));
  const performers = (recap?.topPerformers || []).slice(0, 3);
  const cardHeight = 456 + performers.length * 104 + 56;

  // Header league logo
  const leagueLogo = logoElement({
    id: 'lg',
    cx: 64,
    cy: 48,
    r: 28,
    base64: leagueBase64,
    name: homeName,
    accent,
  });

  // Score rows (home center cy=196, away center cy=326)
  const HOME_CY = 196;
  const AWAY_CY = 326;
  const home = scoreRow({
    name: homeName,
    points: homePoints,
    cy: HOME_CY,
    isWinner: homeWins,
    logoId: 'hm',
    logoBase64: homeBase64,
    logoAccent: accent,
  });
  const away = scoreRow({
    name: awayName,
    points: awayPoints,
    cy: AWAY_CY,
    isWinner: awayWins,
    logoId: 'aw',
    logoBase64: awayBase64,
    logoAccent: '#64748b',
  });

  const allDefs = [leagueLogo.defs, home.defs, away.defs].filter(Boolean).join('\n');
  const performerRows = performers
    .map((p, i) => performerRow({ player: p, index: i, accent }))
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}" role="img" aria-label="Game recap card">
  <defs>${allDefs}</defs>

  <!-- Background -->
  <rect width="1080" height="${cardHeight}" rx="40" fill="white" />
  <rect x="1" y="1" width="1078" height="${cardHeight - 2}" rx="40" fill="none" stroke="#e2e8f0" stroke-width="2" />

  <!-- Header -->
  ${leagueLogo.svg}
  <text x="108" y="40" font-size="11" font-weight="900" fill="#94a3b8" letter-spacing="5" font-family="system-ui,sans-serif">GAME RECAP</text>
  <text x="108" y="64" font-size="18" font-weight="700" fill="#475569" font-family="system-ui,sans-serif">${dateLabel}</text>
  <line x1="40" y1="96" x2="1040" y2="96" stroke="#f1f5f9" stroke-width="2" />

  <!-- Score section -->
  <rect x="40" y="112" width="1000" height="270" rx="24" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" />

  <!-- Status badge -->
  <rect x="480" y="124" width="120" height="28" rx="14" fill="#e2e8f0" />
  <text x="540" y="143" text-anchor="middle" font-size="11" font-weight="900" fill="#475569" letter-spacing="3" font-family="system-ui,sans-serif">${statusLabel}</text>

  <!-- Home row -->
  ${home.svg}

  <!-- Separator -->
  <line x1="56" y1="261" x2="1024" y2="261" stroke="#e2e8f0" stroke-width="1" />

  <!-- Away row -->
  ${away.svg}

  <!-- Top performers section -->
  <text x="40" y="430" font-size="11" font-weight="900" fill="#94a3b8" letter-spacing="5" font-family="system-ui,sans-serif">TOP PERFORMERS</text>

  ${performerRows}
</svg>`.trim();
}

export async function createRecapCardDataUrl(recap, options = {}) {
  const [homeBase64, awayBase64, leagueBase64] = await Promise.all([
    toBase64(options.homeLogoUrl || null),
    toBase64(options.awayLogoUrl || null),
    toBase64(options.leagueLogoUrl || null),
  ]);

  const svg = createRecapCardSvg(recap, {
    homeBase64,
    awayBase64,
    leagueBase64,
    teamColors: options.teamColors || [],
  });

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
