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
    // Word spacing
    if (ch === ' ') return SPACING.interWord;
  
    // No spacing at end of word or line
    if (next == null || next === ' ') return 0;
  
    const chLc = ch.toLowerCase();
  
    // Default (future: user-configurable)
    const DEFAULT_INTERLETTER = 1.0;
  
    // Exceptions (future: user-configurable)
    const OPEN_LETTERS_AFTER = 0.25;   // c, e, r
    const DENSER_LETTERS_AFTER = 0.5;  // b, d, f, k, o, p, s
  
    // Groups
    const OPEN_LETTERS = new Set(['c', 'e', 'r']);
    const DENSER_LETTERS = new Set(['b', 'd', 'f', 'k', 'o', 'p', 's']);
  
    if (OPEN_LETTERS.has(chLc)) return OPEN_LETTERS_AFTER;
    if (DENSER_LETTERS.has(chLc)) return DENSER_LETTERS_AFTER;
  
    return DEFAULT_INTERLETTER;
  },  
};
