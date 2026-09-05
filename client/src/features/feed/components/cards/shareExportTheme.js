// Design tokens for the 1080x1350 share-image render target.
//
// These live apart from Tailwind on purpose. The export is a fixed-size raster
// target, not responsive UI: every value here is an exact typographic measure,
// and html2canvas only sees inline/computed styles, so nothing may depend on
// Tailwind's JIT emitting an arbitrary class. (The old export leaned on classes
// like `bg-white/6` and `border-white/12`, which are not in Tailwind's opacity
// scale and silently generated no CSS at all.)
//
// Palette is TSW's own — gold / forest / paper / leather — the same one the
// league and player pages use, rather than the slate+amber the feed cards had.

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1350;

// The honours board is composed directly at 1080x1350 and captured at 2x.
export const BOARD_CAPTURE_SCALE = 2;

// The game card is different: it reuses the *live* Pulse card, whose type sizes,
// paddings and min-heights are all tuned for a ~400px feed column. Composing it
// at 1080px would stretch a card built for a phone column across a poster, and
// a CSS `transform: scale()` is worse still — html2canvas rasterises transformed
// subtrees unreliably and the layout box stays 400px, so the frame miscentres.
//
// Instead the frame is laid out at feed scale and html2canvas' own `scale` does
// the enlarging, which rasterises text at the target resolution. 432 x 540 at
// 2.5x is exactly 1080x1350, the 4:5 the Instagram service requires.
export const GAME_FRAME_WIDTH = 432;
export const GAME_FRAME_HEIGHT = 540;
export const GAME_CAPTURE_SCALE = EXPORT_WIDTH / GAME_FRAME_WIDTH;

export const DISPLAY_FONT = "'Archivo Black', sans-serif";
export const MONO_FONT = "'IBM Plex Mono', monospace";

export const COLORS = {
  ink: '#080B09', // outside the board
  board: '#12211A', // the varnished panel
  field: '#193026', // plate backing behind a logo
  gold: '#F4A300', // TSW gold: rules, kickers, the lead figure
  goldLeaf: '#FFD98A', // highlight above each gold rule (the gilt bead)
  paper: '#F7F5F0', // names and secondary figures
  tan: '#C7A276', // labels; a legible tint of TSW's leather #8B5E34
};

export const RULE = `1px solid rgba(244, 163, 0, 0.16)`;
export const HAIRLINE = 'rgba(244, 163, 0, 0.2)';

function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const value = hex.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (!delta) return [0, 0, lightness * 100];

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return [hue * 60, saturation * 100, lightness * 100];
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// Team colours are user data and are frequently near-black (the seeded TSW Blue
// is #112233), which would disappear against the board. Lift the lightness and
// floor the saturation so the team's hue survives instead of going to mud, and
// fall back to gold for greys, which carry no identity anyway.
export function readableAccent(teamColors = []) {
  const candidate = Array.isArray(teamColors) ? teamColors.find(hexToRgb) : null;
  const rgb = hexToRgb(candidate);
  if (!rgb) return COLORS.gold;

  const [hue, saturation, lightness] = rgbToHsl(rgb);
  if (saturation < 12) return COLORS.gold;

  return hslToHex(hue, Math.max(saturation, 52), Math.min(Math.max(lightness, 60), 74));
}

// Width of the board's content column, and of the text beside the plate.
export const INNER_WIDTH = 876; // 1080 - 2*36 stage - 2*66 inner padding
export const PLATE_SIZE = 256;
export const IDENTITY_GAP = 44;
export const IDENTITY_MEASURE = INNER_WIDTH - PLATE_SIZE - IDENTITY_GAP;

// Advance per character as a fraction of font size, measured in-browser from
// the real faces rather than guessed. Archivo Black is proportional and ranges
// 0.60-0.69 across realistic club names, so the conservative end is used to
// keep long names inside the measure. IBM Plex Mono is a true monospace at
// 0.602, and letter-spacing adds to that exactly.
export const DISPLAY_ADVANCE = 0.7;
export const MONO_ADVANCE = 0.602;

const DISPLAY_LADDER = [100, 92, 84, 76, 68, 60, 54, 48, 42, 38];

function tokensOf(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean);
}

// Greedy line-break simulation: words do not split, so packing them is a much
// better estimate of the wrapped line count than dividing total length by the
// characters that fit on one line.
function estimateLines(text, fontSize, measure, advance) {
  const perLine = Math.max(1, Math.floor(measure / (fontSize * advance)));
  let lines = 1;
  let used = 0;

  for (const word of tokensOf(text)) {
    const needed = used ? word.length + 1 : word.length;
    if (used && used + needed > perLine) {
      lines += 1;
      used = word.length;
    } else {
      used += needed;
    }
  }

  return lines;
}

// Pick the largest size at which the whole name still fits the box.
//
// This replaces a three-step guess that clipped instead of fitting: a real club
// name ("Northside Community Warriors Basketball Club") overflowed the 3-line
// clamp, so the export silently rendered a *different, shorter* name. The full
// text stayed in the DOM, which is why every getByText assertion still passed.
export function fitDisplaySize(
  text,
  { measure, maxLines, maxHeight, lineHeight = 0.86, advance = DISPLAY_ADVANCE, max = Infinity }
) {
  for (const fontSize of DISPLAY_LADDER.filter((size) => size <= max)) {
    const lines = estimateLines(text, fontSize, measure, advance);
    if (lines <= maxLines && lines * fontSize * lineHeight <= maxHeight) {
      return { fontSize, lines };
    }
  }

  const fontSize = DISPLAY_LADDER[DISPLAY_LADDER.length - 1];
  return { fontSize, lines: maxLines };
}

// Single-line labels (the team name under a player's name) shrink to fit rather
// than wrapping, which would push the ledger down the board.
export function fitLineSize(text, { measure, max, min, tracking = 0 }) {
  const length = tokensOf(text).join(' ').length;
  if (!length) return max;
  const perChar = MONO_ADVANCE + tracking;
  return Math.max(min, Math.min(max, Math.floor(measure / (length * perChar))));
}
