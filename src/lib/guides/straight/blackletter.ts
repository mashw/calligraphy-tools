export const BLACKLETTER_GUIDE_DEFAULTS = {
  xNib: 4.5,
  ascNib: 3,
  descNib: 2,
};

// Insular half-uncial uses a broad, rounded 5-nib body with 2-nib extensions.
// Its intermediate grid is optional and starts hidden.
export const CELTIC_HALF_UNCIAL_DEFAULTS = {
  xNib: 5,
  ascNib: 2,
  descNib: 2,
  penAngleDeg: 15 as const,
  gridHorizontal: false,
  gridVertical: false,
  nibAngleGuide: false,
};

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
