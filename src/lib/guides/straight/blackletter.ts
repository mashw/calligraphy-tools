export const BLACKLETTER_GUIDE_DEFAULTS = {
  xNib: 4.5,
  ascNib: 3,
  descNib: 2,
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
