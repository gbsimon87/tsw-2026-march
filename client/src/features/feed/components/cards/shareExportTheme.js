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

// Names run from "Amy Ng" to "Christopher Adebayo-Whitfield". Step the display
// size down so long names still fill the measure instead of overflowing it.
export function nameFontSize(name) {
  const text = String(name || '');
  const longestWord = text
    .split(/\s+/)
    .reduce((longest, word) => Math.max(longest, word.length), 0);
  if (longestWord > 11 || text.length > 22) return 68;
  if (longestWord > 8 || text.length > 15) return 84;
  return 100;
}
