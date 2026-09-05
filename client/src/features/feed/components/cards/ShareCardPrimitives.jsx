import CloudinaryImage from '../../../media/CloudinaryImage';

function clampStyle(lines) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

// html2canvas 1.4.1 draws every glyph run at `bounds.top + baseline`, where
// `baseline` comes from its own FontMetrics probe rather than the element's line
// box. Measured across five box/font-size combinations the result lands a
// constant 0.367em below where the browser puts it — the same ratio at 16px and
// 30px, and unchanged when the box height changes, so it is a font-metric
// offset rather than a layout one.
//
// In normal flow this is invisible: every line shifts together. Inside a box of
// fixed height it is glaring, because the box does not shift with the text. The
// two vertically centred boxes below therefore lift their text by that amount
// when rendering into an export, and only then.
const EXPORT_BASELINE_LIFT = { position: 'relative', top: '-0.367em' };

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

// `exportSafe` swaps the one declaration html2canvas cannot rasterise. It has no
// `filter` support at all, so the corner glow would otherwise capture as a hard
// 160px disc instead of a bloom. A radial gradient is painted (html2canvas does
// parse gradients) and reads the same on screen, so the exported PNG matches
// what the operator reviewed in The Pulse.
export function ShareCardBackdrop({ accent = 'amber', teamColors = [], exportSafe = false }) {
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
      {exportSafe ? (
        <div
          className="absolute -right-24 -top-24 h-64 w-64 rounded-full"
          style={{
            backgroundImage: `radial-gradient(closest-side, ${hexToRgba(palette.primary, 0.24)} 0%, ${hexToRgba(palette.primary, 0)} 100%)`,
          }}
        />
      ) : (
        <div
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(palette.primary, 0.16) }}
        />
      )}
      <div className="absolute -left-10 bottom-0 h-28 w-36 rotate-[-18deg] rounded-[2rem] bg-white/[0.06]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="absolute inset-x-0 bottom-16 h-px bg-white/[0.08]" />
      <div className="absolute inset-y-0 right-[34%] w-px bg-white/[0.08]" />
    </>
  );
}

export function ShareCardShell({
  children,
  accent = 'amber',
  teamColors = [],
  className = '',
  exportSafe = false,
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-white/10 shadow-[0_20px_40px_rgba(15,23,42,0.35)] ${className}`}
    >
      <ShareCardBackdrop accent={accent} teamColors={teamColors} exportSafe={exportSafe} />
      <div className="relative z-10 flex min-h-[18rem] flex-col p-5 text-white">{children}</div>
    </div>
  );
}

export function ShareCardHeader({ kicker, badge, accentColor, exportSafe = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p
        className="text-[11px] font-black uppercase tracking-[0.32em]"
        style={{ color: accentColor || '#fcd34d' }}
      >
        {kicker}
      </p>
      {badge ? (
        // textIndent offsets half of the trailing letter-space that tracking
        // adds after the last glyph, which otherwise sits the label left of
        // the pill's true centre in the browser as well as the export.
        <div
          className="rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200"
          style={{ textIndent: '0.09em' }}
        >
          <span style={exportSafe ? EXPORT_BASELINE_LIFT : undefined}>{badge}</span>
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
  exportSafe = false,
}) {
  const palette = getShareCardPalette(teamColors, accent);

  if (src) {
    return (
      <div
        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border border-white/[0.12] bg-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.28)] ${className}`}
      >
        <CloudinaryImage
          src={src}
          alt={alt}
          width={80}
          height={80}
          className="h-full w-full object-cover"
          srcSetWidths={[80, 160, 240]}
          sizes="80px"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/[0.12] text-3xl font-black text-slate-950 shadow-[0_14px_32px_rgba(15,23,42,0.28)] ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${palette.label}, ${palette.primary})`,
      }}
    >
      <span style={exportSafe ? EXPORT_BASELINE_LIFT : undefined}>{initials}</span>
    </div>
  );
}

export function ShareCardStatPill({ label, value, emphasis = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/[0.18] px-3 py-2 backdrop-blur-sm">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-center font-black ${emphasis ? 'text-2xl text-white' : 'text-xl text-slate-100'}`}
      >
        {value}
      </p>
    </div>
  );
}

export function ShareCardMetaStrip({ children }) {
  return (
    <div className="mt-5 rounded-[20px] border border-white/10 bg-black/[0.22] px-4 py-3 backdrop-blur-sm">
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

// html2canvas has no -webkit-box line layout, and clips overflow against a box
// it measures differently, so a clamped paragraph captures as a horizontal
// slice through the middle of the text. Exports drop the clamp entirely: a long
// summary wraps rather than being cut mid-glyph, and the frame has room for it.
export function ShareCardClamp({ children, lines = 1, className = '', exportSafe = false }) {
  return (
    <p className={className} style={exportSafe ? undefined : clampStyle(lines)}>
      {children}
    </p>
  );
}
