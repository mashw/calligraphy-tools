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
  a: 3.4,
  b: 3.6,
  c: 3.2,
  d: 3.8,
  e: 3.3,
  // f–p: TODO – insert your calibrated values here.
  q: 3.9,
  r: 2.6,
  s: 2.9,
  t: 2.7,
  u: 3.2,
  v: 3.5,
  w: 5.0,
  x: 3.5,
  y: 3.7,
  z: 3.5,
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
