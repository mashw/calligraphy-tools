import { lengthPoly, pointAt } from '@/lib/curve-helpers';

// mm-space points (same convention as curve tool)
export type Pt = { x: number; y: number };

export type GuideSet = {
  ascLine: Pt[];
  waistLine: Pt[];
  baseLine: Pt[];
  descLine: Pt[];
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

<<<<<<< HEAD
const COPPERPLATE_SLANT_DEG = 55;

function normalize(v: Pt): Pt {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function dot(a: Pt, b: Pt) {
  return a.x * b.x + a.y * b.y;
}

function arcLengths(pts: Pt[]) {
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  return lengths;
}

function tangentAt(pts: Pt[], s: number, arcLen: number): Pt {
  const eps = 0.5;
  const p0 = pointAt(pts, Math.max(0, s - eps)).p;
  const p1 = pointAt(pts, Math.min(arcLen, s + eps)).p;
  return normalize({ x: p1.x - p0.x, y: p1.y - p0.y });
}
=======
// Copperplate slant should be 55° from the local baseline tangent
const COPPERPLATE_SLANT_FROM_TANGENT_DEG = 55;
>>>>>>> 5f73bc4 (WIP: curve copperplate guides and boxes (investigation state))

function normalFromTangent(t: Pt): Pt {
  let n = { x: -t.y, y: t.x };
  if (n.y < 0) n = { x: -n.x, y: -n.y };
  return n;
}

function buildGuideLines(baseline: Pt[], xMM: number, ascMM: number, descMM: number) {
  const arcLen = lengthPoly(baseline);
  const lengths = arcLengths(baseline);
  const baseLine: Pt[] = [];
  const waistLine: Pt[] = [];
  const ascLine: Pt[] = [];
  const descLine: Pt[] = [];

  for (let i = 0; i < baseline.length; i++) {
    const p = baseline[i];
    const t = tangentAt(baseline, lengths[i], arcLen);
    const n = normalFromTangent(t);
    baseLine.push(p);
    waistLine.push({ x: p.x - n.x * xMM, y: p.y - n.y * xMM });
    ascLine.push({ x: p.x - n.x * (xMM + ascMM), y: p.y - n.y * (xMM + ascMM) });
    descLine.push({ x: p.x + n.x * descMM, y: p.y + n.y * descMM });
  }

  return { ascLine, waistLine, baseLine, descLine };
}

export function blackletterGuideHeightsMM(nibMM: number) {
  return {
    xMM: BLACKLETTER_GUIDE_DEFAULTS.xNib * nibMM,
    ascMM: BLACKLETTER_GUIDE_DEFAULTS.ascNib * nibMM,
    descMM: BLACKLETTER_GUIDE_DEFAULTS.descNib * nibMM,
  };
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function normalize(v: Pt): Pt {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function dot(a: Pt, b: Pt) {
  return a.x * b.x + a.y * b.y;
}

function tangentAt(baseline: Pt[], s: number, arcLen: number): Pt {
  const eps = 0.5; // mm
  const p0 = pointAt(baseline, clamp(s - eps, 0, arcLen)).p;
  const p1 = pointAt(baseline, clamp(s + eps, 0, arcLen)).p;
  return normalize({ x: p1.x - p0.x, y: p1.y - p0.y });
}

// Normal derived from forward tangent; forced so "down" is +Y in SVG.
// This stabilizes offsets and prevents band flipping.
function normalDownAt(baseline: Pt[], s: number, arcLen: number): Pt {
  const t = tangentAt(baseline, s, arcLen);
  let n = { x: -t.y, y: t.x }; // perp(t)
  if (n.y < 0) n = { x: -n.x, y: -n.y };
  return n;
}

function buildOffsetPolylineBySampling(baseline: Pt[], offsetMM: number, stepMM = 0.5): Pt[] {
  const arcLen = lengthPoly(baseline);
  const out: Pt[] = [];
  for (let s = 0; s <= arcLen; s += stepMM) {
    const p = pointAt(baseline, s).p;
    const n = normalDownAt(baseline, s, arcLen);
    out.push({ x: p.x + n.x * offsetMM, y: p.y + n.y * offsetMM });
  }
  // Ensure final endpoint
  const pEnd = pointAt(baseline, arcLen).p;
  const nEnd = normalDownAt(baseline, arcLen, arcLen);
  out.push({ x: pEnd.x + nEnd.x * offsetMM, y: pEnd.y + nEnd.y * offsetMM });
  return out;
}

function buildBlackletterGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, tickStepMM } = params;
<<<<<<< HEAD
  const { ascLine, waistLine, baseLine, descLine } = buildGuideLines(baseline, xMM, ascMM, descMM);
=======

  const baseLine = baseline;
  const waistLine = buildOffsetPolylineBySampling(baseline, -xMM);
  const ascLine = buildOffsetPolylineBySampling(baseline, -(xMM + ascMM));
  const descLine = buildOffsetPolylineBySampling(baseline, +descMM);
>>>>>>> 5f73bc4 (WIP: curve copperplate guides and boxes (investigation state))

  const step = Math.max(0.5, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);

  for (let s = 0; s <= arcLen; s += step) {
<<<<<<< HEAD
    const { p } = pointAt(baseline, s);
    const t = tangentAt(baseline, s, arcLen);
    const n = normalFromTangent(t);
=======
    const p = pointAt(baseline, s).p;
    const nDown = normalDownAt(baseline, s, arcLen);
    // blackletter ticks follow normal (upright)
>>>>>>> 5f73bc4 (WIP: curve copperplate guides and boxes (investigation state))
    ticks.push({
      a: { x: p.x - nDown.x * (xMM + ascMM), y: p.y - nDown.y * (xMM + ascMM) },
      b: { x: p.x + nDown.x * descMM, y: p.y + nDown.y * descMM },
    });
  }

  return { ascLine, waistLine, baseLine, descLine, ticks };
}

function buildCopperplateGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, tickStepMM } = params;
<<<<<<< HEAD
  const { ascLine, waistLine, baseLine, descLine } = buildGuideLines(baseline, xMM, ascMM, descMM);
=======

  const baseLine = baseline;
  const waistLine = buildOffsetPolylineBySampling(baseline, -xMM);
  const ascLine = buildOffsetPolylineBySampling(baseline, -(xMM + ascMM));
  const descLine = buildOffsetPolylineBySampling(baseline, +descMM);
>>>>>>> 5f73bc4 (WIP: curve copperplate guides and boxes (investigation state))

  const step = Math.max(0.5, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);

  const theta = (COPPERPLATE_SLANT_FROM_TANGENT_DEG * Math.PI) / 180;
  const cos55 = Math.cos(theta);
  const sin55 = Math.sin(theta);

  for (let s = 0; s <= arcLen; s += step) {
<<<<<<< HEAD
    const { p } = pointAt(baseline, s);
    const t = tangentAt(baseline, s, arcLen);
    const n = normalFromTangent(t);
    const up = { x: -n.x, y: -n.y };
    const slantRad = (COPPERPLATE_SLANT_DEG * Math.PI) / 180;
    let dir = normalize({
      x: t.x * Math.cos(slantRad) + up.x * Math.sin(slantRad),
      y: t.y * Math.cos(slantRad) + up.y * Math.sin(slantRad),
    });
    if (dot(dir, t) < 0) {
      dir = { x: -dir.x, y: -dir.y };
    }
=======
    const p = pointAt(baseline, s).p;

    const t = tangentAt(baseline, s, arcLen);
    const nDown = normalDownAt(baseline, s, arcLen);
    const up = { x: -nDown.x, y: -nDown.y };

    // 55° from tangent, towards up (Copperplate forward slant)
    let dir = normalize({ x: t.x * cos55 + up.x * sin55, y: t.y * cos55 + up.y * sin55 });

    // Ensure it leans forward along increasing s
    if (dot(dir, t) < 0) dir = { x: -dir.x, y: -dir.y };

    // Centered on baseline point p
>>>>>>> 5f73bc4 (WIP: curve copperplate guides and boxes (investigation state))
    ticks.push({
      a: { x: p.x + dir.x * (+descMM), y: p.y + dir.y * (+descMM) },
      b: { x: p.x + dir.x * (-(xMM + ascMM)), y: p.y + dir.y * (-(xMM + ascMM)) },
    });
  }

  return { ascLine, waistLine, baseLine, descLine, ticks };
}

export function buildGuideSet(template: GuideTemplateId, params: GuideTemplateParams): GuideSet {
  if (template === 'blackletter') return buildBlackletterGuideSet(params);
  return buildCopperplateGuideSet(params);
}
