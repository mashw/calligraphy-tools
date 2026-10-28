import type { ScriptProfile } from './types';

// Optical estimates for Celtic (Insular) half-uncial, expressed in full nib widths.
// Manuscript letters vary by hand; these are planning widths rather than traced glyph metrics.
// In particular, the rounded c and o are approximately one x-height wide (5 nibs).
const lower: Record<string, number> = {
  a: 5, b: 5, c: 5, d: 5, e: 4.5, f: 3, g: 5, h: 5,
  i: 1.5, j: 2, k: 5, l: 2, m: 8, n: 5, o: 5, p: 5,
  q: 5, r: 3.5, s: 4.5, t: 3, u: 5, v: 5, w: 7.5,
  x: 5, y: 5, z: 4.5,
};
const upper: Record<string, number> = {
  A: 5.5, B: 5.5, C: 5.5, D: 6, E: 5, F: 4.5, G: 6,
  H: 6, I: 2, J: 3.5, K: 5.5, L: 4.5, M: 8.5, N: 6,
  O: 6, P: 5.5, Q: 6, R: 6, S: 5, T: 5, U: 6,
  V: 5.5, W: 8, X: 5.5, Y: 5.5, Z: 5,
};
const punct: Record<string, number> = {
  '.': 1, ',': 1, ':': 1, ';': 1, '!': 1, '?': 2,
  "'": 1, '"': 2, '-': 2, '–': 3, '—': 5, '(': 2, ')': 2,
};

export const celticHalfUncialProfile: ScriptProfile = {
  id: 'CelticHalfUncial',
  label: 'Celtic Half-Uncial',
  unitSystem: 'nib',
  unitToMm: ({ nibMM }) => nibMM,
  isSpace: ch => ch === ' ',
  glyphWidthUnits: ch => {
    if (ch === ' ') return 0;
    return lower[ch] ?? upper[ch] ?? punct[ch] ?? 5;
  },
  afterSpacingUnits: (_prev, ch, next) => {
    // Approximate one rounded 'o' for word spaces; optically modest letter spacing.
    if (ch === ' ') return 5;
    if (!next || next === ' ') return 0;
    return 0.75;
  },
};
