import type { ScriptProfile } from './types';
import { frakturUpper } from './fraktur-widths';

// Nib-unit widths for Fraktur (lowercase).
// Spacing rules:
// - inter-letter: 1 nib
// - inter-word: 2 nibs

const lower: Record<string, number> = {
  a: 3,
  b: 3,
  c: 2,
  d: 3,
  e: 2,
  f: 2,
  g: 3,
  h: 3,
  i: 1,
  j: 1,
  k: 3,
  l: 1,
  m: 5,
  n: 3,
  o: 3,
  p: 3,
  q: 3,
  r: 2,
  s: 3,
  t: 2,
  u: 3,
  v: 3,
  w: 5,
  x: 2,
  y: 3,
  z: 3,
};

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

const isUpper = (ch: string) => ch >= 'A' && ch <= 'Z';

const radians = (deg: number) => (deg * Math.PI) / 180;

export const frakturProfile: ScriptProfile = {
  id: 'Fraktur',
  label: 'Fraktur',
  unitSystem: 'nib',

  unitToMm: (ctx) => {
    const angle = ctx.penAngleDeg ?? 35;
    return ctx.nibMM * Math.sin(radians(angle));
  },

  isSpace: (ch) => ch === ' ',

  glyphWidthUnits: (ch) => {
    if (ch === ' ') return 0;

    // Lowercase
    const lc = ch.toLowerCase();
    if (lc >= 'a' && lc <= 'z' && ch === lc) return lower[lc] ?? 3;

    // Uppercase
    if (isUpper(ch)) return frakturUpper[ch] ?? 5;

    // Punctuation
    if (punct[ch] != null) return punct[ch];

    // Default for unknown symbols
    return 1;
  },

  afterSpacingUnits: (_prev, ch, next) => {
    // Space consumes word spacing.
    if (ch === ' ') return SPACING.interWord;

    // Uppercase uses no after-spacing.
    if (isUpper(ch)) return 0;

    // If another glyph follows (not a space), add inter-letter spacing.
    if (next != null && next !== ' ') return SPACING.interLetter;

    return 0;
  },
};
