export const MAX_VOICE_CHARACTERS = 160;
export const MAX_VOICE_TOKENS = 20;

const SMALL_NUMBERS = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
]);

const TENS = new Map([
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);

export function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, '')
    .replace(/[‐‑‒–—―-]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareVoiceText(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return { ok: false, reason: 'empty' };
  if (source.length > MAX_VOICE_CHARACTERS) return { ok: false, reason: 'too_long' };

  const text = normalizeComparableText(source);
  if (!text) return { ok: false, reason: 'empty' };

  const tokens = text.split(' ');
  if (tokens.length > MAX_VOICE_TOKENS) return { ok: false, reason: 'too_long' };
  return { ok: true, text, tokens };
}

export function parseSpokenNumber(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > 2) return null;

  if (tokens.length === 1 && /^\d{1,3}$/.test(tokens[0])) {
    const value = Number(tokens[0]);
    return value <= 999 ? value : null;
  }

  if (tokens.length === 1) return SMALL_NUMBERS.get(tokens[0]) ?? null;

  const tens = TENS.get(tokens[0]);
  const units = SMALL_NUMBERS.get(tokens[1]);
  if (tens == null || units == null || units === 0 || units >= 10) return null;
  return tens + units;
}
