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

function getStatusText(recap) {
  return recap?.statusLabel || 'Final';
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
  const LOGO_CX = 98;
  const LOGO_R = 38;
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
      <text x="160" y="${cy + 12}" font-size="34" font-weight="800" fill="${nameColor}" font-family="system-ui,sans-serif">${escapeXml(truncate(name, 24))}</text>
      <text x="960" y="${cy + 30}" text-anchor="end" font-size="86" font-weight="900" fill="${scoreColor}" font-family="system-ui,sans-serif">${points}</text>
    `,
  };
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
  const statusLabel = escapeXml(getStatusText(recap));
  const dateLabel = escapeXml(recap?.dateLabel || formatDate(recap?.playedAt));
  const cardHeight = 420;

  const leagueLogo = leagueBase64
    ? logoElement({
        id: 'lg',
        cx: 76,
        cy: 70,
        r: 34,
        base64: leagueBase64,
        name: 'League',
        accent,
      })
    : null;

  const HOME_CY = 190;
  const AWAY_CY = 310;
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

  const allDefs = [leagueLogo?.defs, home.defs, away.defs].filter(Boolean).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}" role="img" aria-label="Game recap card">
  <defs>${allDefs}</defs>

  <rect width="1080" height="${cardHeight}" rx="40" fill="white" />
  <rect x="1" y="1" width="1078" height="${cardHeight - 2}" rx="40" fill="none" stroke="#e2e8f0" stroke-width="2" />

  ${leagueLogo ? leagueLogo.svg : ''}
  <text x="${leagueLogo ? 128 : 64}" y="78" font-size="18" font-weight="800" fill="#94a3b8" letter-spacing="2" font-family="system-ui,sans-serif">${statusLabel}</text>
  <text x="1016" y="78" text-anchor="end" font-size="18" font-weight="600" fill="#94a3b8" font-family="system-ui,sans-serif">${dateLabel}</text>
  <line x1="64" y1="126" x2="1016" y2="126" stroke="#e2e8f0" stroke-width="2" />

  ${home.svg}

  <line x1="64" y1="250" x2="1016" y2="250" stroke="#e2e8f0" stroke-width="1" />

  ${away.svg}
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
