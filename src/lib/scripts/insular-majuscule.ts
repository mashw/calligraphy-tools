import type { ScriptProfile } from './types';

// Provisional optical estimates for Insular Majuscule, normalised to o = 1 x-height.
// Only a few glyph ratios are independently documented; the rest are working estimates
// from the reference manuscript. Widths exclude interletter spacing and decorative initials.
// At the standard 5-nib x-height, each width unit equals 1/5 of the x-height.
export const INSULAR_MAJUSCULE_LOWER_NIB_WIDTHS: Readonly<Record<string, number>> = {
  a: 6, b: 5, c: 5, d: 5.5, e: 4.5, f: 4, g: 5, h: 5,
  i: 2, j: 2, k: 5, l: 2, m: 7.3, n: 4.5, o: 5, p: 5,
  q: 5, r: 4, s: 4, t: 3.5, u: 4.5, v: 4.5, w: 8,
  x: 5, y: 5, z: 5,
};
// In this hand ordinary capitals are estimated from the same letter widths;
// decorated manuscript initials are deliberately excluded from line estimates.
const punct: Record<string, number> = {
  '.': 1, ',': 1, ':': 1, ';': 1, '!': 1, '?': 2,
  "'": 1, '"': 2, '-': 2, '–': 3, '—': 5, '(': 2, ')': 2,
};

export const insularMajusculeProfile: ScriptProfile = {
  id: 'InsularMajuscule',
  label: 'Insular Majuscule',
  unitSystem: 'nib',
  unitToMm: ({ xHeightMM }) => xHeightMM / 5,
  isSpace: ch => ch === ' ',
  glyphWidthUnits: ch => {
    if (ch === ' ') return 0;
    return INSULAR_MAJUSCULE_LOWER_NIB_WIDTHS[ch.toLowerCase()] ?? punct[ch] ?? 5;
  },
  afterSpacingUnits: (_prev, ch, next) => {
    // Approximate one rounded 'o' for word spaces; optically modest letter spacing.
    if (ch === ' ') return 5;
    if (!next || next === ' ') return 0;
    return 0.75;
  },
};
