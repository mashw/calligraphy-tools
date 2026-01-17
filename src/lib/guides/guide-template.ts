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

const COPPERPLATE_SLANT_DEG = 35;

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

  const step = Math.max(0.5, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);
  const slantRad = (COPPERPLATE_SLANT_DEG * Math.PI) / 180;

  for (let s = 0; s <= arcLen; s += step) {
    const { p, n, t } = pointAt(baseline, s);
    const dir = {
      x: n.x * Math.cos(slantRad) + t.x * Math.sin(slantRad),
      y: n.y * Math.cos(slantRad) + t.y * Math.sin(slantRad),
    };
    ticks.push({
      a: { x: p.x - dir.x * (xMM + ascMM), y: p.y - dir.y * (xMM + ascMM) },
      b: { x: p.x + dir.x * descMM, y: p.y + dir.y * descMM },
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
