/* ======================================================================
 * Fraktur letter widths (in nibs)
 * Extracted from the curved-title tool so they can be re-used elsewhere.
 *
 * NOTE: Fill in/adjust values with your measured table if needed.
 * The tool falls back to 3 nibs (lowercase) and 5 nibs (uppercase)
 * for any glyphs not present here.
 * ====================================================================== */

import type { WidthTable } from './quadrata-widths';

/** Lowercase widths for Fraktur, in nibs. */
export const frakturLower: WidthTable = {
  a: 3,
  b: 3,
  c: 2.5,
  d: 3,
  e: 2.5,
  f: 1,
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
  r: 2.5,
  s: 3,
  t: 1,
  u: 3,
  v: 3,
  w: 5,
  x: 3,
  y: 3,
  z: 3,
};

/** Uppercase widths for Fraktur, in nibs. */
export const frakturUpper: WidthTable = {
  A: 7,
  B: 6.5,
  C: 6,
  D: 6.5,
  E: 6,
  F: 5,
  G: 6,
  H: 7,
  I: 4,
  J: 5,
  K: 7,
  L: 5,
  M: 9,
  N: 7,
  O: 6,
  P: 6,
  Q: 7.5,
  R: 7,
  S: 5.5,
  T: 6.5,
  U: 7,
  V: 6,
  W: 9,
  X: 6,
  Y: 7,
  Z: 6,
};
