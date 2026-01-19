import { lengthPoly, offset, pointAt } from '@/lib/curve-helpers';

// mm-space points (same convention as curve tool)
export type Pt = { x: number; y: number };

export type GuideSet = {
  // core guide lines as polylines in mm-space
  ascLine: Pt[];
  waistLine: Pt[];
  baseLine: Pt[];
  descLine: Pt[];
  // optional perpendicular ticks/markers (each tick is a line segment)
  ticks?: { a: Pt; b: Pt }[];
};

export type GuideTemplateId = 'copperplate' | 'blackletter';

export type GuideTemplateParams = {
  baseline: Pt[];
  xMM: number;
  ascMM: number;
  descMM: number;
  tickStepMM?: number;
};

export const BLACKLETTER_GUIDE_DEFAULTS = {
  xNib: 5,
  ascNib: 3,
  descNib: 2,
};

const COPPERPLATE_SLANT_DEG = 55;

export function blackletterGuideHeightsMM(nibMM: number) {
  return {
    xMM: BLACKLETTER_GUIDE_DEFAULTS.xNib * nibMM,
    ascMM: BLACKLETTER_GUIDE_DEFAULTS.ascNib * nibMM,
    descMM: BLACKLETTER_GUIDE_DEFAULTS.descNib * nibMM,
  };
}

function buildBlackletterGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, tickStepMM } = params;
  const baseLine = baseline;
  const waistLine = offset(baseline, -xMM);
  const ascLine = offset(baseline, -(xMM + ascMM));
  const descLine = offset(baseline, descMM);

  const step = Math.max(0.5, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);
  for (let s = 0; s <= arcLen; s += step) {
    const { p, n } = pointAt(baseline, s);
    ticks.push({
      a: { x: p.x - n.x * (xMM + ascMM), y: p.y - n.y * (xMM + ascMM) },
      b: { x: p.x + n.x * descMM, y: p.y + n.y * descMM },
    });
  }

  return { ascLine, waistLine, baseLine, descLine, ticks };
}

function buildCopperplateGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, tickStepMM } = params;
  const ascLine = offset(baseline, -(xMM + ascMM));
  const waistLine = offset(baseline, -xMM);
  const baseLine = baseline;
  const descLine = offset(baseline, descMM);

  const step = Math.max(0.5, tickStepMM ?? 100);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);
  const cot = 1 / Math.tan((COPPERPLATE_SLANT_DEG * Math.PI) / 180);
  const topOff = xMM + ascMM;
  const botOff = descMM;

  for (let s = 0; s <= arcLen; s += step) {
    // Top of tick occurs "later" along the curve than the bottom for forward slant
    const sTop = Math.max(0, Math.min(arcLen, s + topOff * cot));
    const sBot = Math.max(0, Math.min(arcLen, s - botOff * cot));

    const Ct = pointAt(baseline, sTop);
    const Cb = pointAt(baseline, sBot);

    ticks.push({
      // a = top (asc rail), b = bottom (desc rail) or vice versa doesn’t matter visually
      a: { x: Ct.p.x - Ct.n.x * topOff, y: Ct.p.y - Ct.n.y * topOff },
      b: { x: Cb.p.x + Cb.n.x * botOff, y: Cb.p.y + Cb.n.y * botOff },
    });
  }


  return {
    ascLine,
    waistLine,
    baseLine,
    descLine,
    ticks,
  };
}

export function buildGuideSet(template: GuideTemplateId, params: GuideTemplateParams): GuideSet {
  if (template === 'blackletter') {
    return buildBlackletterGuideSet(params);
  }

  return buildCopperplateGuideSet(params);
}
