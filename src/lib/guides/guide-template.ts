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
};

export type GuideTemplateId = 'copperplate' | 'blackletter';

export type GuideTemplateParams = {
  baseline: Pt[];
  xMM: number;
  ascMM: number;
  descMM: number;
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
  const { baseline, xMM, ascMM, descMM, tickStepMM, tickAnchorS, actualNibMM } = params;
  const baseLine = baseline;
  const waistLine = offset(baseline, -xMM);
  const ascLine = offset(baseline, -(xMM + ascMM));
  const descLine = offset(baseline, descMM);

  const step = Math.max(0.0001, tickStepMM ?? 1);
  const ticks: { a: Pt; b: Pt }[] = [];
  const arcLen = lengthPoly(baseline);

  // Phase anchor: we will generate ticks at s = anchor + k * step
  // so there is always a tick exactly at the anchor value.
  const anchor = Number.isFinite(tickAnchorS as number) ? (tickAnchorS as number) : 0;

  const kMin = Math.floor((0 - anchor) / step);
  const kMax = Math.ceil((arcLen - anchor) / step);

  for (let k = kMin; k <= kMax; k += 1) {
    const s = anchor + k * step;
    const sClamped = Math.max(0, Math.min(arcLen, s));
    const { p, n } = pointAt(baseline, sClamped);

    ticks.push({
      a: { x: p.x - n.x * (xMM + ascMM), y: p.y - n.y * (xMM + ascMM) },
      b: { x: p.x + n.x * descMM, y: p.y + n.y * descMM },
    });
  }



  // NEW: curve-parallel intermediate rails (offset polylines)
  // Spaced in REAL nib units, with half-nib placement rules per band:
  // - descender: half (if any) lives at the BOTTOM
  // - x-height:  half (if any) lives at the TOP
  // - ascender:  half (if any) lives at the TOP
  const hGuides: Pt[][] = [];

  if (actualNibMM != null && actualNibMM > 0) {
    const topOff = -(xMM + ascMM); // ascLine offset from baseline
    const waistOff = -xMM;         // waistLine offset from baseline
    const baseOff = 0;             // baseLine offset from baseline
    const descOff = descMM;        // descLine offset from baseline

    const EPS = 1e-2; // 0.01mm tolerance

    const isNearNamedOff = (d: number) =>
      Math.abs(d - topOff) < EPS ||
      Math.abs(d - waistOff) < EPS ||
      Math.abs(d - baseOff) < EPS ||
      Math.abs(d - descOff) < EPS;

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

    const pushBand = (bandTopOff: number, bandMM: number, placement: HalfPlacement) => {
      const offs = internalOffsetsFromTopMM(bandMM, placement);
      for (const dTop of offs) {
        const d = bandTopOff + dTop; // convert band-local offset to baseline-relative offset
        // Keep inside the band (avoid named lines and avoid floating edge collisions)
        if (d <= bandTopOff + EPS) continue;
        if (d >= bandTopOff + bandMM - EPS) continue;
        if (isNearNamedOff(d)) continue;
        hGuides.push(offset(baseline, d));
      }
    };

    // Ascender band: ascLine -> waistLine (half at TOP)
    pushBand(topOff, ascMM, 'top');

    // X-height band: waistLine -> baseLine (half at TOP)
    pushBand(waistOff, xMM, 'top');

    // Descender band: baseLine -> descLine (half at BOTTOM)
    pushBand(baseOff, descMM, 'bottom');
  }


  return { ascLine, waistLine, baseLine, descLine, ticks, hGuides };
}


function buildCopperplateGuideSet(params: GuideTemplateParams): GuideSet {
  const { baseline, xMM, ascMM, descMM, tickStepMM, tickAnchorS } = params;

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

  // Phase anchor: ticks at s = anchor + k * step, guaranteeing a tick at anchor.
  const anchor = Number.isFinite(tickAnchorS as number) ? (tickAnchorS as number) : 0;

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
  const sTop = s + topOff * cot;
  const sBot = s - botOff * cot;

  const Ct = pointAtExtended(baseline, sTop);
  const Cb = pointAtExtended(baseline, sBot);

  ticks.push({
    a: { x: Ct.p.x - Ct.n.x * topOff, y: Ct.p.y - Ct.n.y * topOff },
    b: { x: Cb.p.x + Cb.n.x * botOff, y: Cb.p.y + Cb.n.y * botOff },
  });
}



  return { ascLine, waistLine, baseLine, descLine, ticks };
}

export function buildGuideSet(template: GuideTemplateId, params: GuideTemplateParams): GuideSet {
  if (template === 'blackletter') {
    return buildBlackletterGuideSet(params);
  }

  return buildCopperplateGuideSet(params);
}
