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
  A: 6.0,
  B: 5.5,
  C: 6.5,
  D: 6.0,
  E: 4.5,
  // F–P: TODO – insert your calibrated values here.
  Q: 7.0,
  R: 5.5,
  S: 6.0,
  T: 4.5,
  U: 6.0,
  V: 6.2,
  W: 7.8,
  X: 6.2,
  Y: 6.0,
  Z: 5.5,
};
