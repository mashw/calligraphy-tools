import { lengthPoly, offset, pointAt, pointAtExtended } from '@/lib/curve-helpers';
import { blackletterConstructionDistances } from '@/lib/guides/construction-guide-offsets';


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
  constructionGuides?: ConstructionGuide[];
};

export type BlackletterScript = 'Fraktur' | 'TexturaQuadrata';
export type ConstructionGuideKind = 'downstrokeStart' | 'spurHeight' | 'upperQuadrantStart' | 'lowerQuadrantStart';
export type ConstructionGuide = { kind: ConstructionGuideKind; line: Pt[]; offsetMM: number };
export type ConstructionGuideSettings = { upper: boolean; lower: boolean; color: string };
export const DEFAULT_CONSTRUCTION_GUIDES: ConstructionGuideSettings = { upper: false, lower: false, color: '#dc2626' };

export type GuideTemplateId = 'copperplate' | 'blackletter';

export type GuideTemplateParams = {
  baseline: Pt[];
  xMM: number;
  ascMM: number;
  descMM: number;
  invertGuides?: boolean;
  normalSign?: 1 | -1;
  tickStepMM?: number;     // used for vertical ticks
  tickAnchorS?: number;    // phase anchor along baseline arc-length (mm)
  actualNibMM?: number;    // used for horizontal tick spacing
  penAngleDeg?: number;
  blackletterScript?: BlackletterScript;
  constructionGuides?: Partial<ConstructionGuideSettings>;
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
  const { baseline, xMM, ascMM, descMM, invertGuides = false, normalSign = 1, tickStepMM, tickAnchorS, actualNibMM } = params;
  const waistOff = -xMM * normalSign;
  const ascOffNormal = -(xMM + ascMM) * normalSign;
  const descOffNormal = descMM * normalSign;
  const baseLine = invertGuides ? offset(baseline, waistOff) : baseline;
  const waistLine = invertGuides ? baseline : offset(baseline, waistOff);
  const ascLine = invertGuides ? offset(baseline, ascMM * normalSign) : offset(baseline, ascOffNormal);
  const descLine = invertGuides ? offset(baseline, -(xMM + descMM) * normalSign) : offset(baseline, descOffNormal);

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

  const topScalar = invertGuides ? ascMM : -(xMM + ascMM);
  const botScalar = invertGuides ? -(xMM + descMM) : descMM;

  for (let k = kMin; k <= kMax; k += 1) {
    const s = anchor + k * step;
    const sClamped = Math.max(0, Math.min(arcLen, s));
        // Closed loops: avoid drawing both s=0 and s=arcLen (same physical seam).
        if (isClosed && sClamped >= arcLen - 1e-9) continue;

    const { p, n } = pointAt(baseline, sClamped);

    ticks.push({
      a: { x: p.x + n.x * topScalar * normalSign, y: p.y + n.y * topScalar * normalSign },
      b: { x: p.x + n.x * botScalar * normalSign, y: p.y + n.y * botScalar * normalSign },
    });
  }



  // NEW: curve-parallel intermediate rails (offset polylines)
  // Spaced in REAL nib units, with half-nib placement rules per band:
  // - descender: half (if any) lives at the BOTTOM
  // - x-height:  half (if any) lives at the TOP
  // - ascender:  half (if any) lives at the TOP
  const hGuides: Pt[][] = [];
  const hGuideOffsets: number[] = [];

  if (actualNibMM != null && actualNibMM > 0) {
    const offAsc = invertGuides ? ascMM * normalSign : -(xMM + ascMM) * normalSign;
    const offWaist = invertGuides ? 0 : -xMM * normalSign;
    const offBase = invertGuides ? -xMM * normalSign : 0;
    const offDesc = invertGuides ? -(xMM + descMM) * normalSign : descMM * normalSign;

    const EPS = 1e-2; // 0.01mm tolerance

    const isNearNamedOff = (d: number) =>
      Math.abs(d - offAsc) < EPS ||
      Math.abs(d - offWaist) < EPS ||
      Math.abs(d - offBase) < EPS ||
      Math.abs(d - offDesc) < EPS;

    // Coerce to nearest half-nib count to avoid float noise (sliders are 0.5 steps).
    const toHalfNibs = (mm: number) => Math.round((mm / actualNibMM) * 2) / 2;

    type HalfPlacement = 'top' | 'bottom';

    // Returns internal boundary offsets measured DOWN from the band's TOP edge, in mm.
    const internalOffsetsFromTopMM = (bandMM: number, placement: HalfPlacement): number[] => {
      const n = toHalfNibs(bandMM);
      const whole = Math.floor(n + 1e-9);
      const hasHalf = Math.abs(n - (whole + 0.5)) < 1e-9;

      const out: number[] = [];

      if (!hasHalf) {
        // Whole nibs: boundaries at 1,2,...,whole-1 nibs from top
        for (let i = 1; i < whole; i += 1) out.push(i * actualNibMM);
        return out;
      }

      if (placement === 'top') {
        // Half nib at TOP: boundaries at 0.5, 1.5, 2.5, ... (whole entries)
        for (let i = 0; i < whole; i += 1) out.push((0.5 + i) * actualNibMM);
        return out;
      }

      // placement === 'bottom'
      // Half nib at BOTTOM: boundaries at 1,2,3,...,whole nibs from top
      // (the last segment is the 0.5 remainder at the bottom)
      for (let i = 1; i <= whole; i += 1) out.push(i * actualNibMM);
      return out;
    };

    const pushBandBetween = (
      offTopLine: number,
      offBottomLine: number,
      bandMM: number,
      placement: HalfPlacement,
    ) => {
      const offsFromTop = internalOffsetsFromTopMM(bandMM, placement);

      // Walk from "top line" toward "bottom line" even if offsets are reversed by normalSign.
      const dir = offBottomLine >= offTopLine ? 1 : -1;

      const lo = Math.min(offTopLine, offBottomLine);
      const hi = Math.max(offTopLine, offBottomLine);

      for (const dTop of offsFromTop) {
        const d = offTopLine + dir * dTop;

        // Keep inside the band (avoid named lines and avoid floating edge collisions)
        if (d <= lo + EPS) continue;
        if (d >= hi - EPS) continue;
        if (isNearNamedOff(d)) continue;

        hGuides.push(offset(baseline, d));
        hGuideOffsets.push(d);
      }
    };

    // Ascender band: ascLine -> waistLine (half at TOP)
    pushBandBetween(offAsc, offWaist, ascMM, 'top');

    // X-height band: waistLine -> baseLine (half at TOP)
    pushBandBetween(offWaist, offBase, xMM, 'top');

    // Descender band: baseLine -> descLine (half at BOTTOM)
    pushBandBetween(offBase, offDesc, descMM, 'bottom');
  }


  const constructionGuides: ConstructionGuide[] = [];
  const construction = { ...DEFAULT_CONSTRUCTION_GUIDES, ...params.constructionGuides };
  if (actualNibMM && params.blackletterScript) {
    const distances = blackletterConstructionDistances(actualNibMM, params.penAngleDeg ?? 45, params.blackletterScript);
    const offBase = invertGuides ? -xMM * normalSign : 0;
    const add = (kind: ConstructionGuideKind, d: number) => constructionGuides.push({ kind, offsetMM: d, line: offset(baseline, d) });
    const offWaist = invertGuides ? 0 : -xMM * normalSign;
    const directionTowardAscender = Math.sign((invertGuides ? ascMM * normalSign : -(xMM + ascMM) * normalSign) - offWaist);
    if (construction.upper && ascMM + 1e-2 >= actualNibMM) add(params.blackletterScript === 'Fraktur' ? 'downstrokeStart' : 'upperQuadrantStart', offWaist + directionTowardAscender * distances.upperFromWaistMM);
    if (construction.lower) add(params.blackletterScript === 'Fraktur' ? 'spurHeight' : 'lowerQuadrantStart', offBase + Math.sign(offWaist - offBase) * distances.lowerFromBaselineMM);
  }
  const EPS = 1e-2;
  const specialOffsets = constructionGuides.map(guide => guide.offsetMM);
  const filteredHGuides = hGuides.filter((_, index) => !specialOffsets.some(d => Math.abs(d - hGuideOffsets[index]) < EPS));
  return { ascLine, waistLine, baseLine, descLine, ticks, hGuides: filteredHGuides, constructionGuides };
}


function buildCopperplateGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, invertGuides = false, normalSign = 1, tickStepMM, tickAnchorS } = params;

  const baseLine = invertGuides ? offset(baseline, -xMM * normalSign) : baseline;
  const waistLine = invertGuides ? baseline : offset(baseline, -xMM * normalSign);
  const ascLine = invertGuides ? offset(baseline, ascMM * normalSign) : offset(baseline, -(xMM + ascMM) * normalSign);
  const descLine = invertGuides ? offset(baseline, -(xMM + descMM) * normalSign) : offset(baseline, descMM * normalSign);

  const step = Math.max(0.5, tickStepMM ?? 100);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);
  const cot = 1 / Math.tan((COPPERPLATE_SLANT_DEG * Math.PI) / 180);
  const topScalar = invertGuides ? ascMM : -(xMM + ascMM);
  const botScalar = invertGuides ? -(xMM + descMM) : descMM;
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

      const sTop = s - topScalar * cot * normalSign;
      const sBot = s - botScalar * cot * normalSign;

      const Ct = pointAt(baseline, wrap(sTop));
      const Cb = pointAt(baseline, wrap(sBot));

      ticks.push({
        a: { x: Ct.p.x + Ct.n.x * topScalar * normalSign, y: Ct.p.y + Ct.n.y * topScalar * normalSign },
        b: { x: Cb.p.x + Cb.n.x * botScalar * normalSign, y: Cb.p.y + Cb.n.y * botScalar * normalSign },
      });
    }
  } else {
    // We must NOT clamp the slants to [0, arcLen], otherwise the first/last ticks
    // become "special" and look broken at the ends.
    // Instead: over-generate beyond both ends and sample with pointAtExtended.

    const slantPad = Math.max(Math.abs(topScalar * cot), Math.abs(botScalar * cot));
    const uMin = -slantPad - step * 2;
    const uMax = arcLen + slantPad + step * 2;

    const kMin = Math.floor((uMin - anchor) / step);
    const kMax = Math.ceil((uMax - anchor) / step);

    for (let k = kMin; k <= kMax; k += 1) {
      const s = anchor + k * step;

      // Top of tick occurs "later" along the curve than the bottom for forward slant
      const sTop = s - topScalar * cot * normalSign;
      const sBot = s - botScalar * cot * normalSign;

      const Ct = pointAtExtended(baseline, sTop);
      const Cb = pointAtExtended(baseline, sBot);

      ticks.push({
        a: { x: Ct.p.x + Ct.n.x * topScalar * normalSign, y: Ct.p.y + Ct.n.y * topScalar * normalSign },
        b: { x: Cb.p.x + Cb.n.x * botScalar * normalSign, y: Cb.p.y + Cb.n.y * botScalar * normalSign },
      });
    }
  }



  return { ascLine, waistLine, baseLine, descLine, ticks };
}

export function buildGuideSet(template: GuideTemplateId, params: GuideTemplateParams): GuideSet {
  if (template === 'blackletter') {
    return buildBlackletterGuideSet(params);
  }

  return buildCopperplateGuideSet(params);
}
