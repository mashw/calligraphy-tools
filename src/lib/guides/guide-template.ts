import { lengthPoly, offset, pointAt, pointAtExtended } from '@/lib/curve-helpers';


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
  hGuides?: Pt[][]; // NEW: curve-parallel intermediate rails
  dashedGuides?: Pt[][];
};

export type GuideTemplateId = 'copperplate' | 'blackletter';

export type GuideTemplateParams = {
  baseline: Pt[];
  xMM: number;
  ascMM: number;
  descMM: number;
  normalSign?: 1 | -1;
  tickStepMM?: number;     // used for vertical ticks
  tickAnchorS?: number;    // phase anchor along baseline arc-length (mm)
  actualNibMM?: number;    // used for horizontal tick spacing
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
  const { baseline, xMM, ascMM, descMM, normalSign = 1, tickStepMM, tickAnchorS, actualNibMM } = params;
  const baseLine = baseline;
  const waistLine = offset(baseline, -xMM * normalSign);
  const ascLine = offset(baseline, -(xMM + ascMM) * normalSign);
  const descLine = offset(baseline, descMM * normalSign);

  const step = Math.max(0.0001, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);

  const isClosed = (() => {
    if (baseline.length < 3) return false;
    const a = baseline[0];
    const b = baseline[baseline.length - 1];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx + dy * dy) < 1e-6; // ~0.001mm^2 tolerance
  })();


  // Phase anchor: we will generate ticks at s = anchor + k * step
  // so there is always a tick exactly at the anchor value.
  const anchor = Number.isFinite(tickAnchorS as number) ? (tickAnchorS as number) : 0;

  const kMin = Math.floor((0 - anchor) / step);
  const kMax = Math.ceil((arcLen - anchor) / step);

  for (let k = kMin; k <= kMax; k += 1) {
    const s = anchor + k * step;
    const sClamped = Math.max(0, Math.min(arcLen, s));
        // Closed loops: avoid drawing both s=0 and s=arcLen (same physical seam).
        if (isClosed && sClamped >= arcLen - 1e-9) continue;

    const { p, n } = pointAt(baseline, sClamped);

    ticks.push({
      a: { x: p.x - n.x * (xMM + ascMM) * normalSign, y: p.y - n.y * (xMM + ascMM) * normalSign },
      b: { x: p.x + n.x * descMM * normalSign, y: p.y + n.y * descMM * normalSign },
    });
  }



  // NEW: curve-parallel intermediate rails (offset polylines)
  // Spaced in REAL nib units, with half-nib placement rules per band:
  // - descender: half (if any) lives at the BOTTOM
  // - x-height:  half (if any) lives at the TOP
  // - ascender:  half (if any) lives at the TOP
  const hGuides: Pt[][] = [];

  const horizontalStep = Math.max(0.5, tickStepMM ?? actualNibMM ?? 1);
  if (horizontalStep > 0) {
    const topOff = -(xMM + ascMM) * normalSign; // ascLine offset from baseline
    const waistOff = -xMM * normalSign;         // waistLine offset from baseline
    const baseOff = 0;             // baseLine offset from baseline
    const descOff = descMM * normalSign;        // descLine offset from baseline

    const EPS = 1e-2; // 0.01mm tolerance

    const isNearNamedOff = (d: number) =>
      Math.abs(d - topOff) < EPS ||
      Math.abs(d - waistOff) < EPS ||
      Math.abs(d - baseOff) < EPS ||
      Math.abs(d - descOff) < EPS;

    const lo = Math.min(topOff, descOff);
    const hi = Math.max(topOff, descOff);
    const count = Math.floor((hi - lo) / horizontalStep);
    for (let i = 1; i <= count; i += 1) {
      const d = lo + i * horizontalStep;
      if (d <= lo + EPS || d >= hi - EPS) continue;
      if (isNearNamedOff(d)) continue;
      hGuides.push(offset(baseline, d));
    }
  }


  return { ascLine, waistLine, baseLine, descLine, ticks, hGuides };
}


function buildCopperplateGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, normalSign = 1, tickStepMM, tickAnchorS } = params;

  const ascLine = offset(baseline, -(xMM + ascMM) * normalSign);
  const waistLine = offset(baseline, -xMM * normalSign);
  const baseLine = baseline;
  const descLine = offset(baseline, descMM * normalSign);
  const asc1Line = offset(baseline, -(xMM + ascMM * 0.5) * normalSign);
  const desc1Line = offset(baseline, descMM * 0.5 * normalSign);

  const step = Math.max(0.5, tickStepMM ?? 100);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);
  const cot = 1 / Math.tan((COPPERPLATE_SLANT_DEG * Math.PI) / 180);
  const topOff = xMM + ascMM;
  const botOff = descMM;
  const isClosed = (() => {
    if (baseline.length < 3) return false;
    const a = baseline[0];
    const b = baseline[baseline.length - 1];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx + dy * dy) < 1e-6; // ~0.001mm^2 tolerance
  })();

  const wrap = (s: number) => {
    if (arcLen <= 0) return 0;
    const m = s % arcLen;
    return m < 0 ? m + arcLen : m;
  };

  // Phase anchor: ticks at s = anchor + k * step, guaranteeing a tick at anchor.
  const anchor = Number.isFinite(tickAnchorS as number) ? (tickAnchorS as number) : 0;

  if (isClosed) {
    const count = Math.max(1, Math.round(arcLen / step));
    const evenStep = arcLen / count;

    for (let i = 0; i < count; i += 1) {
      const s = anchor + i * evenStep;

      const sTop = s + topOff * cot * normalSign;
      const sBot = s - botOff * cot * normalSign;

      const Ct = pointAt(baseline, wrap(sTop));
      const Cb = pointAt(baseline, wrap(sBot));

      ticks.push({
        a: { x: Ct.p.x - Ct.n.x * topOff * normalSign, y: Ct.p.y - Ct.n.y * topOff * normalSign },
        b: { x: Cb.p.x + Cb.n.x * botOff * normalSign, y: Cb.p.y + Cb.n.y * botOff * normalSign },
      });
    }
  } else {
    // We must NOT clamp the slants to [0, arcLen], otherwise the first/last ticks
    // become "special" and look broken at the ends.
    // Instead: over-generate beyond both ends and sample with pointAtExtended.

    const slantPad = Math.max(topOff * cot, botOff * cot);
    const uMin = -slantPad - step * 2;
    const uMax = arcLen + slantPad + step * 2;

    const kMin = Math.floor((uMin - anchor) / step);
    const kMax = Math.ceil((uMax - anchor) / step);

    for (let k = kMin; k <= kMax; k += 1) {
      const s = anchor + k * step;

      // Top of tick occurs "later" along the curve than the bottom for forward slant
      const sTop = s + topOff * cot * normalSign;
      const sBot = s - botOff * cot * normalSign;

      const Ct = pointAtExtended(baseline, sTop);
      const Cb = pointAtExtended(baseline, sBot);

      ticks.push({
        a: { x: Ct.p.x - Ct.n.x * topOff * normalSign, y: Ct.p.y - Ct.n.y * topOff * normalSign },
        b: { x: Cb.p.x + Cb.n.x * botOff * normalSign, y: Cb.p.y + Cb.n.y * botOff * normalSign },
      });
    }
  }



  const hGuides: Pt[][] = [];
  const horizontalStep = Math.max(0.5, tickStepMM ?? 1);
  const top = Math.min(-(xMM + ascMM) * normalSign, descMM * normalSign);
  const bottom = Math.max(-(xMM + ascMM) * normalSign, descMM * normalSign);
  const count = Math.floor((bottom - top) / horizontalStep);
  for (let i = 1; i <= count; i += 1) {
    const d = top + i * horizontalStep;
    hGuides.push(offset(baseline, d));
  }

  return { ascLine, waistLine, baseLine, descLine, ticks, hGuides, dashedGuides: [asc1Line, desc1Line] };
}

export function buildGuideSet(template: GuideTemplateId, params: GuideTemplateParams): GuideSet {
  if (template === 'blackletter') {
    return buildBlackletterGuideSet(params);
  }

  return buildCopperplateGuideSet(params);
}
