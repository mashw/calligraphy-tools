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
    if (next == null || next === ' ') return 0;

    const chLc = ch.toLowerCase();
    const nextLc = next.toLowerCase();
    const isLetter = (s: string) => s >= 'a' && s <= 'z';

    if ('dbopwvt'.includes(chLc) && isLetter(nextLc)) {
      return 0.5;
    }

    let spacing = 1.0;
    const group1Next = new Set(['i', 'l', 'j', 'n', 'm', 'h', 'k', 'b', 't']);
    const group5Next = new Set([
      'i',
      'j',
      'm',
      'n',
      'p',
      'r',
      's',
      't',
      'u',
      'v',
      'w',
      'x',
      'y',
      'z',
    ]);
    const group6Next = new Set(['b', 'h', 'k', 'l', 'f']);

    if (ch === 'c' && group1Next.has(next)) spacing -= 1.0;
    if (ch === 'e' && group1Next.has(next)) spacing -= 1.0;
    if (ch === 'r' && group1Next.has(next)) spacing -= 1.0;
    if (ch === 's' && group1Next.has(next)) spacing -= 0.5;
    if (['c', 'e', 'r'].includes(ch) && group5Next.has(next)) spacing -= 0.5;
    if (ch === 'f' && group6Next.has(next)) spacing += 1.5;

    return spacing;
  },
};
