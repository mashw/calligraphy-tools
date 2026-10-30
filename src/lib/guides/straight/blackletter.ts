export const BLACKLETTER_GUIDE_DEFAULTS = {
  xNib: 4.5,
  ascNib: 3,
  descNib: 2,
};

// Insular half-uncial uses a broad, rounded 5-nib body with 2-nib extensions.
// Its intermediate grid is optional and starts hidden.
export const INSULAR_MAJUSCULE_DEFAULTS = {
  xNib: 5,
  ascNib: 2,
  descNib: 2,
  penAngleDeg: 15 as const,
  gridHorizontal: false,
  gridVertical: false,
  nibAngleGuide: false,
};

/**
 * Insular majuscule reference: interlinear whitespace is about two minim heights.
 * The tool's row gap excludes ascender and descender guide zones, so subtract
 * those zones to leave two x-heights of space between the letter bodies.
 */
export function insularMajusculeRowGapMM(
  nibMM: number,
  xNib = INSULAR_MAJUSCULE_DEFAULTS.xNib,
  ascNib = INSULAR_MAJUSCULE_DEFAULTS.ascNib,
  descNib = INSULAR_MAJUSCULE_DEFAULTS.descNib,
) {
  return Math.max(0, (2 * xNib - ascNib - descNib) * nibMM);
}

export type BlackletterGridWidthMode = 'effective' | 'actual' | 'custom';

export function effectiveBlackletterNibMM(nibMM: number, penAngleDeg: number) {
  return nibMM * Math.cos(penAngleDeg * Math.PI / 180);
}

export function resolveBlackletterGridWidthMM(mode: BlackletterGridWidthMode, nibMM: number, penAngleDeg: number, customWidthMM?: number) {
  const effectiveNibMM = effectiveBlackletterNibMM(nibMM, penAngleDeg);
  if (mode === 'actual') return nibMM;
  if (mode === 'custom') return typeof customWidthMM === 'number' && Number.isFinite(customWidthMM) && customWidthMM > 0 ? customWidthMM : effectiveNibMM;
  return effectiveNibMM;
}

export function blackletterVerticalMetricsMM(nibMM: number, xNib: number, ascNib: number, descNib: number) {
  return { xMM: xNib * nibMM, ascMM: ascNib * nibMM, descMM: descNib * nibMM };
}
