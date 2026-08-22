// lib/line-widths.ts

import {
  MINUSCULE_RATIOS as RATIOS,
  MAJUSCULE_RATIOS as CAP_RATIOS,
  MAJUSCULE_METRICS,
  DIGIT_RATIOS as DIGITS,
  PUNCT_RATIOS as PUNCT,
} from '@/lib/copperplate-widths';

/** Core model types */

export type WidthModel = {
  x: number;
  nBody: number;
  glyphWidths: Record<string, number>;
  scale: number;
  spaceMult: number;
  capScale: number;
  /** How capitals should be treated.
   * - simple: uses structural BODY widths (reduced) for advance
   * - flourished: uses your original FULL widths (legacy behavior)
   */
  capStyle: 'simple' | 'flourished';
};

export type BaseSeg = { startMM: number; endMM: number };
export type LetterSeg = BaseSeg & {
  kind: 'letter';
  ch: string;
  /** Optional decorative overhangs (visual only; not included in start/end). */
  overhangLMM?: number;
  overhangRMM?: number;
};
export type SpaceSeg = BaseSeg & { kind: 'space'; spaceType: 'o' | 'n' };
export type Seg = LetterSeg | SpaceSeg;

export type Alignment = 'center' | 'right';

export type LineMetric = {
  text: string;
  lengthMM: number;
  startFromRefMM: number;
  segments: Seg[];
};

/** Useful constants shared by tools */

const O_SPACE_FACTOR = 0.6; // intra-word join ≈ 0.6 × width(o)

// Reference for global scale: Zaner minuscule line
const REF_WORD = 'abcdefghijklmnopqrstu';
const REF_XHEIGHT_MM = 6;
const REF_TARGET_MM = 139;

// Calibration reference texts
export const CAL_WORD = 'overpainting';
export const CAL_WORD_CAP = 'Overpainting';
export const CAL_WORD_DOUBLE = 'overpainting overpainting';

// Sentence-level boost kept as a multiplier on the reference scale.
const SENTENCE_SCALE_BOOST = 1.18;

/* ----------------------------- Utils ------------------------------------ */

export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const isLower = (ch: string) => ch >= 'a' && ch <= 'z';
const isUpper = (ch: string) => ch >= 'A' && ch <= 'Z';

const isApostrophe = (ch: string) => ch === '\'' || ch === '’';
const isWordGlyph = (ch: string) => /[a-zA-Z0-9]/.test(ch);

/* ------------------------- Model construction --------------------------- */

export function buildBaseModel(xHeightMM: number, spaceMult: number): WidthModel {
  const x = Math.max(0.1, xHeightMM);
  const nBody = x; // one x-height in mm

  const glyphWidths: Record<string, number> = {};

  for (const [ch, ratio] of Object.entries(RATIOS)) {
    glyphWidths[ch] = nBody * ratio;
  }

  for (const [ch, ratio] of Object.entries(CAP_RATIOS)) {
    glyphWidths[ch] = nBody * ratio;
  }

  for (const [d, r] of Object.entries(DIGITS)) {
    glyphWidths[d] = nBody * r;
  }

  for (const [p, r] of Object.entries(PUNCT)) {
    glyphWidths[p] = nBody * r;
  }

  return {
    x,
    nBody,
    glyphWidths,
    scale: 1,
    spaceMult: clamp(spaceMult || 1, 0.5, 2.0),
    capScale: 1,
    capStyle: 'flourished',
  };
}

function getSpacing(model: WidthModel) {
  const { glyphWidths, nBody, scale, spaceMult } = model;

  const baseO = (glyphWidths['o'] ?? nBody) * scale;
  const baseN = (glyphWidths['n'] ?? nBody) * scale;

  const oSpace = baseO * O_SPACE_FACTOR * spaceMult;
  const nSpace = baseN * spaceMult;
  const wordSpace = nSpace + 2 * oSpace;

  return { oSpace, nSpace, wordSpace };
}

/* --------------------------- Measurement -------------------------------- */

export function segmentsForLine(text: string, model: WidthModel): Seg[] {
  const { glyphWidths, nBody, scale, capScale, capStyle } = model;
  const { oSpace, wordSpace } = getSpacing(model);

  type NS = {
    index: number;
    ch: string;
    width: number;
    inlineApostrophe: boolean;
  };

  const nonSpaces: NS[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n') continue;

    const prev = i > 0 ? text[i - 1] : null;
    const next = i < text.length - 1 ? text[i + 1] : null;

    const inlineApostrophe =
      isApostrophe(ch) &&
      prev !== null &&
      next !== null &&
      isWordGlyph(prev) &&
      isWordGlyph(next);

    // Lowercase/digits/punct remain as before.
    // Capitals are special:
    // - simple: advance uses BODY (reduced) + capScale
    // - flourished: advance uses FULL (legacy) + capScale

    let baseWidth = (glyphWidths[ch] ?? nBody) * scale;
    let width = baseWidth;

    if (isUpper(ch)) {
      const metric = MAJUSCULE_METRICS[ch];
      if (metric) {
        if (capStyle === 'simple') {
          baseWidth = nBody * metric.body * scale;
        } else {
          // flourished / legacy
          baseWidth = nBody * metric.full * scale;
        }
      }
      width = baseWidth * capScale;
    }

    nonSpaces.push({
      index: i,
      ch,
      width: inlineApostrophe ? 0 : width,
      inlineApostrophe,
    });
  }

  if (!nonSpaces.length) return [];

  const out: Seg[] = [];
  let cursorMM = 0;

  const first = nonSpaces[0];
  const last = nonSpaces[nonSpaces.length - 1];

  // Leading entry stroke if first non-space is lowercase
  if (isLower(first.ch)) {
    const startMM = cursorMM;
    const endMM = startMM + oSpace;
    out.push({ kind: 'space', spaceType: 'o', startMM, endMM });
    cursorMM = endMM;
  }

  for (let k = 0; k < nonSpaces.length; k++) {
    const cur = nonSpaces[k];

    if (cur.inlineApostrophe) {
      // An apostrophe inside a word occupies the existing inter-letter
      // join visually, but contributes no additional horizontal advance.
      //
      // Split the normal join around the zero-width apostrophe so the
      // apostrophe survives in MeasuredRun and previews at the centre
      // of the existing space.
      const halfJoin = oSpace / 2;

      const leftStart = cursorMM;
      const markX = leftStart + halfJoin;

      out.push({
        kind: 'space',
        spaceType: 'o',
        startMM: leftStart,
        endMM: markX,
      });

      out.push({
        kind: 'letter',
        ch: cur.ch,
        startMM: markX,
        endMM: markX,
      });

      out.push({
        kind: 'space',
        spaceType: 'o',
        startMM: markX,
        endMM: markX + halfJoin,
      });

      cursorMM = markX + halfJoin;
      continue;
    }

    // Letter body (advance)
    const letterStart = cursorMM;
    const letterEnd = letterStart + cur.width;
    // Add decorative overhangs only for SIMPLE capitals, so the preview
    // can show the flourishes without affecting layout.
    if (isUpper(cur.ch) && capStyle === 'simple') {
      const metric = MAJUSCULE_METRICS[cur.ch];
      if (metric) {
        out.push({
          kind: 'letter',
          ch: cur.ch,
          startMM: letterStart,
          endMM: letterEnd,
          overhangLMM: metric.overhangL * nBody * scale * capScale,
          overhangRMM: metric.overhangR * nBody * scale * capScale,
        });
      } else {
        out.push({ kind: 'letter', ch: cur.ch, startMM: letterStart, endMM: letterEnd });
      }
    } else {
      out.push({ kind: 'letter', ch: cur.ch, startMM: letterStart, endMM: letterEnd });
    }
    cursorMM = letterEnd;

    if (k === nonSpaces.length - 1) break;

    const next = nonSpaces[k + 1];

    // The inline apostrophe itself will supply exactly one normal
    // intra-word join, split around the visible mark.
    if (next.inlineApostrophe) continue;

    if (next.index === cur.index + 1) {
      // Intra-word join: contiguous letters
      const sStart = cursorMM;
      const sEnd = sStart + oSpace;
      out.push({ kind: 'space', spaceType: 'o', startMM: sStart, endMM: sEnd });
      cursorMM = sEnd;
    } else {
      // Word boundary: at least one space between letters
      const sStart = cursorMM;
      const sEnd = sStart + wordSpace;
      out.push({ kind: 'space', spaceType: 'n', startMM: sStart, endMM: sEnd });
      cursorMM = sEnd;
    }
  }

  // Trailing exit stroke if last non-space is lowercase
  if (isLower(last.ch)) {
    const sStart = cursorMM;
    const sEnd = sStart + oSpace;
    out.push({ kind: 'space', spaceType: 'o', startMM: sStart, endMM: sEnd });
    cursorMM = sEnd;
  }

  return out;
}

export function lineLengthFromSegments(segs: Seg[]): number {
  if (!segs.length) return 0;
  return segs[segs.length - 1].endMM;
}

/* --------------------- Default Zaner reference scale -------------------- */

function computeDefaultScaleFromReference(): number {
  const base6 = buildBaseModel(REF_XHEIGHT_MM, 1);
  const unitModel: WidthModel = { ...base6, scale: 1, capScale: 1 };

  const segs = segmentsForLine(REF_WORD, unitModel);
  const len1 = lineLengthFromSegments(segs);

  if (!isFinite(len1) || len1 <= 0) return 1;

  const s = REF_TARGET_MM / len1;
  return clamp(s, 0.2, 5);
}

export const DEFAULT_SCALE = computeDefaultScaleFromReference() * SENTENCE_SCALE_BOOST;

/* -------------------------- Calibration engine -------------------------- */

export function computeCalibrationFactors(
  baseModel: WidthModel,
  lowerMeas?: number | null,
  doubleMeas?: number | null,
  capMeas?: number | null
): { autoScale: number; autoSpaceMult: number; autoCapScale: number } {
  let autoScale = 1;
  let autoSpaceMult = 1;
  let autoCapScale = 1;

  // 1) Lowercase word for global scale
  if (typeof lowerMeas === 'number' && Number.isFinite(lowerMeas) && lowerMeas > 0) {
    const modelRef: WidthModel = { ...baseModel, scale: DEFAULT_SCALE, spaceMult: 1, capScale: 1 };
    const segsRef = segmentsForLine(CAL_WORD, modelRef);
    const lenRef = lineLengthFromSegments(segsRef);
    if (lenRef > 0) {
      autoScale = clamp(lowerMeas / lenRef, 0.5, 1.5);
    }
  }

  const scaleForSpacing = DEFAULT_SCALE * autoScale;

  // 2) Double word for spacing
  if (typeof doubleMeas === 'number' && Number.isFinite(doubleMeas) && doubleMeas > 0) {
    const modelSpace1: WidthModel = {
      ...baseModel,
      scale: scaleForSpacing,
      spaceMult: 1,
      capScale: 1,
    };
    const modelSpace2: WidthModel = {
      ...baseModel,
      scale: scaleForSpacing,
      spaceMult: 2,
      capScale: 1,
    };

    const L1 = lineLengthFromSegments(segmentsForLine(CAL_WORD_DOUBLE, modelSpace1));
    const L2 = lineLengthFromSegments(segmentsForLine(CAL_WORD_DOUBLE, modelSpace2));

    const spacesBase = L2 - L1;
    if (spacesBase > 0) {
      const lettersPart = L1 - spacesBase;
      const target = doubleMeas;
      let sMult = (target - lettersPart) / spacesBase;
      if (!Number.isFinite(sMult)) sMult = 1;
      autoSpaceMult = clamp(sMult, 0.5, 2.0);
    }
  }

  // 3) Capitalised word for cap vs lowercase
  if (typeof capMeas === 'number' && Number.isFinite(capMeas) && capMeas > 0) {
    const scaleForCaps = scaleForSpacing;
    const modelCap: WidthModel = {
      ...baseModel,
      scale: scaleForCaps,
      spaceMult: autoSpaceMult,
      capScale: 1,
    };
    const segsCap = segmentsForLine(CAL_WORD_CAP, modelCap);
    const L_capPred = lineLengthFromSegments(segsCap);

    let capWidthsSum = 0;
    for (const seg of segsCap) {
      if (seg.kind === 'letter' && isUpper(seg.ch)) {
        capWidthsSum += seg.endMM - seg.startMM;
      }
    }

    if (capWidthsSum > 0) {
      const delta = capMeas - L_capPred;
      let solvedCapScale = 1 + delta / capWidthsSum;
      if (!Number.isFinite(solvedCapScale)) solvedCapScale = 1;
      autoCapScale = clamp(solvedCapScale, 0.7, 1.3);
    }
  }

  return { autoScale, autoSpaceMult, autoCapScale };
}

/* ---------------------- High-level measurement API ---------------------- */

export function measureLines(
  lines: string[],
  model: WidthModel,
  alignment: Alignment
): LineMetric[] {
  return lines.map((text) => {
    const segments = segmentsForLine(text, model);
    const lengthMM = lineLengthFromSegments(segments);
    const startFromRefMM = alignment === 'center' ? lengthMM / 2 : lengthMM;
    return { text, lengthMM, startFromRefMM, segments };
  });
}
