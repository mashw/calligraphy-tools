import type { ScriptProfile } from './types';

// A working calibration of Insular Majuscule line estimation, not a canonical
// historical alphabet. Most letters remain manuscript-informed optical estimates.
// Selected widths below are measured visible ink extents from a single 3 mm nib,
// 15 degree handwriting sample; normalised to nib units at x-height = 5 nibs.
// Lowercase and ordinary (non-decorative) capitals share widths.
export const INSULAR_MAJUSCULE_LOWER_NIB_WIDTHS: Readonly<Record<string, number>> = {
  a: 6, b: 5, c: 5, d: 5.5, e: 4.5, f: 4, g: 5, h: 5,
  i: 2, j: 2, k: 5, l: 2, m: 23 / 3, n: 17 / 3, o: 17 / 3, p: 6,
  q: 5, r: 19 / 3, s: 15.5 / 3, t: 17 / 3, u: 16 / 3, v: 4.5, w: 8,
  x: 5, y: 5, z: 5,
};

// Pair corrections are derived from written two-letter samples, expressed in
// nib units. Negative values represent overlap of visible letter shapes.
// Unmeasured joins use the measured sample median of zero; do not assume
// uniform positive interletter spacing as in the previous estimator.
// The 'un' correction is inferred from the two 4-letter samples runt/sunt.
export const INSULAR_MAJUSCULE_PAIR_SPACING_NIBS: Readonly<Record<string, number>> = {
  oo: 0, pp: 2 / 3, uu: 2 / 3,
  po: -1 / 3, op: -1 / 3, pu: 1 / 3,
  ru: -4 / 3, su: -4.5 / 3, nt: 0,
  un: 2 / 3,
};

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
    // Word spacing is uncalibrated; retain an approximate 5-nib word gap.
    if (ch === ' ') return 5;
    if (!next || next === ' ') return 0;
    return INSULAR_MAJUSCULE_PAIR_SPACING_NIBS[ch.toLowerCase() + next.toLowerCase()] ?? 0;
  },
};
