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

function normalize(v: Pt): Pt {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function tangentAt(pts: Pt[], s: number, arcLen: number): Pt {
  const eps = 0.5;
  const p0 = pointAt(pts, Math.max(0, s - eps)).p;
  const p1 = pointAt(pts, Math.min(arcLen, s + eps)).p;
  return normalize({ x: p1.x - p0.x, y: p1.y - p0.y });
}

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
  for (let s = 0; s <= arcLen; s += step) {
    const { p, n } = pointAt(baseline, s);
    const up = { x: -n.x, y: -n.y };
    const t = tangentAt(baseline, s, arcLen);
    const slantRad = (COPPERPLATE_SLANT_DEG * Math.PI) / 180;
    const dir = normalize({
      x: t.x * Math.cos(slantRad) + up.x * Math.sin(slantRad),
      y: t.y * Math.cos(slantRad) + up.y * Math.sin(slantRad),
    });
    ticks.push({
      a: { x: p.x + dir.x * descMM, y: p.y + dir.y * descMM },
      b: { x: p.x - dir.x * (xMM + ascMM), y: p.y - dir.y * (xMM + ascMM) },
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
