import type { ScriptProfile } from './types';
import { frakturLower, frakturUpper } from '../fraktur-widths';

// Punctuation: 1 nib width, except question mark = 2.
const punct: Record<string, number> = {
  '?': 2,

  '.': 1,
  ',': 1,
  ':': 1,
  ';': 1,
  '!': 1,

  "'": 1,
  '"': 1,

  '-': 1,
  '–': 1,
  '—': 1,

  '(': 1,
  ')': 1,
  '[': 1,
  ']': 1,
  '{': 1,
  '}': 1,

  '/': 1,
};

const SPACING = {
  interLetter: 1,
  interWord: 2,
};

export const frakturProfile: ScriptProfile = {
  id: 'Fraktur',
  label: 'Fraktur',
  unitSystem: 'nib',

  // IMPORTANT: for blackletter ctx.nibMM is already effectiveNibMM,
  // so unitToMm is just nibMM.
  unitToMm: ({ nibMM }) => nibMM,

  isSpace: (ch) => ch === ' ',

  glyphWidthUnits: (ch) => {
    if (ch === ' ') return 0;

    // Lowercase
    const lc = ch.toLowerCase();
    if (lc >= 'a' && lc <= 'z' && ch === lc) return frakturLower[lc] ?? 3;

    // Uppercase
    if (ch >= 'A' && ch <= 'Z') return frakturUpper[ch] ?? 5;

    // Punctuation
    if (punct[ch] != null) return punct[ch];

    return 1;
  },

  afterSpacingUnits: (_prev, ch, next) => {
    if (ch === ' ') return SPACING.interWord;
    if (next != null && next !== ' ') return SPACING.interLetter;
    return 0;
  },
};
