/** 
 * Copperplate measurements for all glyph classes.
 * All values are ratios relative to x-height (x = 1.0).
 * These come from your Zaner measurements (full-width for caps).
 */

export const O_REL_TO_X = 0.5;

/* ---------------- Minuscules (a–z) ---------------- */

export const MINUSCULE_RATIOS: Record<string, number> = {
  a: 1.425000,
  b: 1.080625,
  c: 1.009375,
  d: 1.282500,
  e: 1.080625,
  f: 0.665000,
  g: 1.413125,
  h: 1.365625,
  i: 0.380000,
  j: 0.380000,
  k: 1.056875,
  l: 0.950000,
  m: 2.565000,
  n: 1.353750,
  o: 0.950000,
  p: 1.318125,
  q: 1.413125,
  r: 1.140000,
  s: 0.944063,
  t: 0.795625,
  u: 1.353750,
  v: 1.140000,
  w: 2.018750,
  x: 1.235000,
  y: 1.472500,
  z: 0.878750,
};

/* ---------------- Majuscules (A–Z) ---------------- */

export const MAJUSCULE_RATIOS: Record<string, number> = {
  A: 3.562500,
  B: 3.408125,
  C: 3.427917,
  D: 3.550625,
  E: 3.427917,
  F: 2.992500,
  G: 3.443750,
  H: 4.013750,
  I: 2.600625,
  J: 1.531875,
  K: 3.289375,
  L: 3.348750,
  M: 4.583750,
  N: 4.346250,
  O: 2.517500,
  P: 3.051875,
  Q: 2.517500,
  R: 3.087500,
  S: 3.265625,
  T: 2.683750,
  U: 3.526875,
  V: 3.146875,
  W: 4.215625,
  X: 4.607500,
  Y: 4.108750,
  Z: 2.683750,
};

/* ---------------- Majuscule metrics (body + overhang) ---------------- */

export type MajusculeMetric = {
  /** Full visual width you previously measured (ink-extents). */
  full: number;
  /** Structural body width used for layout/advance (simple capitals). */
  body: number;
  /** Decorative overhang to the left of the body. */
  overhangL: number;
  /** Decorative overhang to the right of the body. */
  overhangR: number;
};

/**
 * IMPORTANT:
 * - These values are an engineering split of your existing "full" cap widths.
 * - They are intended to make alignment stable by separating structural width
 *   from optional flourishes.
 * - You should tune bodyFactor + overhang bias after testing.
 */

const DEFAULT_BODY_FACTOR = 0.80;

// Letters that tend to be more flourish-dominated (smaller body share)
const BODY_FACTOR_OVERRIDES: Partial<Record<string, number>> = {
  A: 0.75,
  J: 0.72,
  T: 0.78,
  Y: 0.78,
  // Letters that are often relatively "compact" in flourishes
  I: 0.88,
  O: 0.86,
  Q: 0.84,
};

// How to split the remaining flourish width between left/right overhang.
// 0.5 => symmetrical; >0.5 => more to the left; <0.5 => more to the right.
const OVERHANG_LEFT_BIAS: Partial<Record<string, number>> = {
  A: 0.65,
  B: 0.55,
  C: 0.55,
  D: 0.55,
  E: 0.55,
  F: 0.55,
  G: 0.55,
  J: 0.70,
  L: 0.60,
  P: 0.55,
  Q: 0.55,
  R: 0.55,
  T: 0.55,
  Y: 0.55,
};

function buildMajMetric(ch: string, full: number): MajusculeMetric {
  const f = BODY_FACTOR_OVERRIDES[ch] ?? DEFAULT_BODY_FACTOR;
  const body = full * f;
  const extra = Math.max(0, full - body);
  const bias = OVERHANG_LEFT_BIAS[ch] ?? 0.5;
  const overhangL = extra * bias;
  const overhangR = extra * (1 - bias);
  return { full, body, overhangL, overhangR };
}

export const MAJUSCULE_METRICS: Record<string, MajusculeMetric> = Object.fromEntries(
  Object.entries(MAJUSCULE_RATIOS).map(([ch, full]) => [ch, buildMajMetric(ch, full)])
) as Record<string, MajusculeMetric>;

/* ---------------- Digits (0–9) ---------------- */

export const DIGIT_RATIOS: Record<string, number> = {
  '0': 1.10,
  '1': 0.85,
  '2': 1.05,
  '3': 1.05,
  '4': 1.05,
  '5': 1.05,
  '6': 1.05,
  '7': 1.00,
  '8': 1.15,
  '9': 1.05,
};

/* ---------------- Punctuation ---------------- */

export const PUNCT_RATIOS: Record<string, number> = {
  '.': 0.35,
  ',': 0.35,
  ':': 0.40,
  ';': 0.45,
  '!': 0.55,
  '?': 0.90,
  '-': 0.60,
  '–': 0.80,
  '—': 1.00,
  '\'': 0.30,
  '"': 0.60,
  '&': 1.10,
};
