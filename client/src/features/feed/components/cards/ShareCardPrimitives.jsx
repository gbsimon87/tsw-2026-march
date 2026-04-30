function clampStyle(lines) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(245,158,11,${alpha})`;
  }

  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getShareCardPalette(teamColors = [], accent = 'amber') {
  const defaults = {
    amber: {
      primary: '#f59e0b',
      secondary: '#f97316',
      tertiary: '#22d3ee',
      label: '#fcd34d',
      dot: '#fde68a',
    },
    crimson: {
      primary: '#ef4444',
      secondary: '#f97316',
      tertiary: '#fbbf24',
      label: '#fdba74',
      dot: '#fed7aa',
    },
    cyan: {
      primary: '#22d3ee',
      secondary: '#38bdf8',
      tertiary: '#3b82f6',
      label: '#67e8f9',
      dot: '#a5f3fc',
    },
  };

  const fallback = defaults[accent] || defaults.amber;
  const normalizedColors = Array.isArray(teamColors)
    ? teamColors.filter((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    : [];

  return {
    primary: normalizedColors[0] || fallback.primary,
    secondary: normalizedColors[1] || fallback.secondary,
    tertiary: normalizedColors[2] || fallback.tertiary,
    label: normalizedColors[1] || fallback.label,
    dot: normalizedColors[2] || fallback.dot,
  };
}

export function ShareCardBackdrop({ accent = 'amber', teamColors = [] }) {
  const palette = getShareCardPalette(teamColors, accent);

  return (
    <>
      <div className="absolute inset-0 bg-[#0f172a]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.32)} 0%, ${hexToRgba(palette.secondary, 0.14)} 55%, ${hexToRgba(palette.tertiary, 0.2)} 100%)`,
        }}
      />
      <div
        className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
        style={{ backgroundColor: hexToRgba(palette.primary, 0.16) }}
      />
      <div className="absolute -left-10 bottom-0 h-28 w-36 rotate-[-18deg] rounded-[2rem] bg-white/6" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="absolute inset-x-0 bottom-16 h-px bg-white/8" />
      <div className="absolute inset-y-0 right-[34%] w-px bg-white/8" />
    </>
  );
}

export function ShareCardShell({ children, accent = 'amber', teamColors = [], className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-white/10 shadow-[0_20px_40px_rgba(15,23,42,0.35)] ${className}`}
    >
      <ShareCardBackdrop accent={accent} teamColors={teamColors} />
      <div className="relative z-10 flex min-h-[18rem] flex-col p-5 text-white">{children}</div>
    </div>
  );
}

export function ShareCardHeader({ kicker, badge, accentColor }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p
        className="text-[11px] font-black uppercase tracking-[0.32em]"
        style={{ color: accentColor || '#fcd34d' }}
      >
        {kicker}
      </p>
      {badge ? (
        <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
          {badge}
        </div>
      ) : null}
    </div>
  );
}

export function ShareCardLogoBadge({
  src,
  alt,
  initials,
  teamColors = [],
  accent = 'amber',
  className = '',
}) {
  const palette = getShareCardPalette(teamColors, accent);

  if (src) {
    return (
      <div
        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-white/12 bg-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.28)] ${className}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/12 text-3xl font-black text-slate-950 shadow-[0_14px_32px_rgba(15,23,42,0.28)] ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${palette.label}, ${palette.primary})`,
      }}
    >
      {initials}
    </div>
  );
}

export function ShareCardStatPill({ label, value, emphasis = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p
        className={`mt-1 font-black ${emphasis ? 'text-2xl text-white' : 'text-xl text-slate-100'}`}
      >
        {value}
      </p>
    </div>
  );
}

export function ShareCardMetaStrip({ children }) {
  return (
    <div className="mt-5 rounded-[20px] border border-white/10 bg-black/22 px-4 py-3 backdrop-blur-sm">
      {children}
    </div>
  );
}

export function ShareCardTitle({ children, lines = 2, className = '' }) {
  return (
    <h3
      className={`text-[1.75rem] font-black leading-[1.02] text-white ${className}`}
      style={clampStyle(lines)}
    >
      {children}
    </h3>
  );
}

export function ShareCardSubtitle({ children, className = '' }) {
  return <p className={`text-sm font-medium text-slate-300 ${className}`}>{children}</p>;
}

export function ShareCardClamp({ children, lines = 1, className = '' }) {
  return (
    <p className={className} style={clampStyle(lines)}>
      {children}
    </p>
  );
}
