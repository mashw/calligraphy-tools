/* ======================================================================
 * Textura Quadrata letter widths (in nibs)
 * Extracted from the curved-title tool so they can be re-used elsewhere.
 *
 * NOTE: Fill in/adjust values with your measured table if needed.
 * The tool falls back to 3 nibs (lowercase) and 5 nibs (uppercase)
 * for any glyphs not present here.
 * ====================================================================== */

export type WidthTable = Record<string, number>;

/** Lowercase widths for Textura Quadrata, in nibs. */
export const texturaLower: WidthTable = {
  // Values below are from the previous helper file where available.
  // Fill in missing glyphs with your measured widths.
  a: 3.2,
  b: 3.4,
  c: 3.0,
  d: 3.5,
  e: 3.1,
  // f–p: TODO – insert your calibrated values here.
  q: 3.7,
  r: 2.4,
  s: 2.7,
  t: 2.5,
  u: 3.0,
  v: 3.2,
  w: 4.8,
  x: 3.3,
  y: 3.5,
  z: 3.3,
};

/** Uppercase widths for Textura Quadrata, in nibs. */
export const texturaUpper: WidthTable = {
  // Partial table from your earlier helpers – extend/adjust as needed.
  A: 5.5,
  B: 5.0,
  C: 5.5,
  D: 5.5,
  E: 4.0,
  // F–P: TODO – insert your calibrated values here.
  Q: 6.8,
  R: 5.0,
  S: 5.5,
  T: 4.0,
  U: 5.5,
  V: 5.8,
  W: 7.5,
  X: 5.8,
  Y: 5.5,
  Z: 5.0,
};
