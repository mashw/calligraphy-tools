'use client';

import { InspectorIntro } from '@/components/editor/Controls';
import PreviewMeta from '@/components/editor/PreviewMeta';

import { Button, Select, NumericInput, Slider, Toggle } from '@/components/editor/Controls';

import { InfoTip } from '@/components/editor/Controls';

import { pointBounds } from '@/lib/editor/camera';
import { useEditorCamera } from '@/components/editor/useEditorCamera';
import PreviewToolbar from '@/components/editor/PreviewToolbar';

import DisclosureSection from '@/components/layout/DisclosureSection';
import EditorWorkspace from '@/components/editor/EditorWorkspace';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {PAPERS_MM } from '@/lib/curve-helpers';

import {
  clamp,
} from '@/lib/line-widths';
import { type ScriptId } from '@/lib/scripts';
import { buildGuideSet } from '@/lib/guides/guide-template';
import GuidelinesRenderer from '@/components/guidelines/GuidelinesRenderer';
import ConstructionGuideControls from '@/components/guidelines/ConstructionGuideControls';
import { cloneSvgForRasterExport, computeRasterPxPerMM, mmToPt, printJpegDataUrlToScale, renderSvgCloneToJpegDataUrl } from '@/lib/export/raster-export';
import { createDefaultGuidelinesSettings, type GuidelinesSettings } from '@/lib/guides/straight/settings';
import { insularMajusculeRowGapMM } from '@/lib/guides/straight/blackletter';

type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';

type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';

type Pt = { x: number; y: number };
type Box = { w: number; h: number };
type GuideSet = ReturnType<typeof buildGuideSet>;
const SHARED_GUIDELINE_DEFAULTS = createDefaultGuidelinesSettings();


function buildPageSlantLines(opts: {
  boxW: number;
  boxH: number;
  xMin: number;
  xMax: number;
  angleDeg: number;
  stepMM: number;
}): { a: { x: number; y: number }; b: { x: number; y: number } }[] {
  const { boxH, xMin, xMax, angleDeg, stepMM } = opts;

  const rad = (angleDeg * Math.PI) / 180;
  const dx = boxH / Math.tan(rad); // x shift over full page height (sign depends on angle)

  // start far enough left so lines cover the whole page when slanted
  const start = xMin - Math.abs(dx) - stepMM * 2;
  const end = xMax + Math.abs(dx) + stepMM * 2;

  const lines: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let x = start; x <= end; x += stepMM) {
    lines.push({
      a: { x, y: 0 },
      b: { x: x + dx, y: boxH },
    });
  }
  return lines;
}

function buildCopperplateSlantLines(
  guideSets: GuideSet[],
  box: Box,
  slantSpacingMM: number,
  slantAngleDeg: number
) {
  const first = guideSets[0];
  if (!first) return [];

  const xMin = first.baseLine[0].x;
  const xMax = first.baseLine[first.baseLine.length - 1].x;

  const lines = buildPageSlantLines({
    boxW: box.w,
    boxH: box.h,
    xMin,
    xMax,
    angleDeg: -slantAngleDeg,
    stepMM: slantSpacingMM,
  });

  return lines.map(line => ({
    x1: line.a.x,
    y1: line.a.y,
    x2: line.b.x,
    y2: line.b.y,
  }));
}


function GuidelinesRowMask({ guideSets, box }: { guideSets: GuideSet[]; box: Box }) {
  return (
    <mask id="guidelines-row-mask">
      <rect x={0} y={0} width={box.w} height={box.h} fill="black" />

      {guideSets.map((gs, i) => {
        const x1 = gs.baseLine[0].x;
        const x2 = gs.baseLine[gs.baseLine.length - 1].x;
        const yTop = gs.ascLine[0].y;
        const yBottom = gs.descLine[0].y;

        return (
          <rect
            key={`mask-row-${i}`}
            x={x1}
            y={yTop}
            width={x2 - x1}
            height={yBottom - yTop}
            fill="white"
          />
        );
      })}
    </mask>
  );
}

function CopperplateSlantLines({
  guideSets,
  box,
  slantSpacingMM,
  slantAngleDeg,
  slantLineContrast,
  highContrastMode,
  swThin,
}: {
  guideSets: GuideSet[];
  box: Box;
  slantSpacingMM: number;
  slantAngleDeg: number;
  slantLineContrast: number;
  highContrastMode: boolean;
  swThin: number;
}) {
  const lines = buildCopperplateSlantLines(guideSets, box, slantSpacingMM, slantAngleDeg);
  if (lines.length === 0) return null;

  return (
    <g mask="url(#guidelines-row-mask)">
      {lines.map((ln, i) => (
        <line
          key={`page-slant-${i}`}
          x1={ln.x1}
          y1={ln.y1}
          x2={ln.x2}
          y2={ln.y2}
          stroke="#000"
strokeOpacity={highContrastMode ? 1 : slantLineContrast}

          strokeWidth={swThin}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}



/* ---------------- Reusable InfoTip ---------------- */




/* ---------------- Export helpers ---------------- */
function stripNoExport(svg: SVGSVGElement) {
  // Remove any elements marked as non-export (green indicators etc.)
  svg.querySelectorAll('[data-no-export="true"]').forEach(n => n.remove());

  // Remove stage background rect if present
  const stage = svg.querySelector('#stage-bg');
  if (stage) stage.remove();

  // Remove any filters that might cause raster artefacts in print/export
  svg.querySelectorAll('filter').forEach(f => f.remove());
}

function bakeExportStrokes(source: SVGSVGElement, clone: SVGSVGElement, boxW: number) {
  const rect = source.getBoundingClientRect();
  if (!rect.width) return;
  const pxPerMM = rect.width / boxW;
  const sourceEls = Array.from(source.querySelectorAll<SVGElement>('*'));
  const cloneEls = Array.from(clone.querySelectorAll<SVGElement>('*'));

  sourceEls.forEach((el, idx) => {
    const cloneEl = cloneEls[idx];
    if (!cloneEl) return;
    const style = window.getComputedStyle(el);
    const strokeWidthPx = parseFloat(style.strokeWidth || '0');
    const hasStroke = (style.stroke && style.stroke !== 'none') || strokeWidthPx > 0;
    if (!hasStroke) {
      cloneEl.removeAttribute('vector-effect');
      return;
    }

    if (style.stroke && style.stroke !== 'none') {
      cloneEl.setAttribute('stroke', style.stroke);
    }
    if (!Number.isNaN(strokeWidthPx)) {
      cloneEl.setAttribute('stroke-width', String(strokeWidthPx / pxPerMM));
    }
    const dasharray = style.strokeDasharray;
    if (dasharray && dasharray !== 'none') {
      const baked = dasharray
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(entry => {
          const num = parseFloat(entry);
          return Number.isNaN(num) ? entry : String(num / pxPerMM);
        })
        .join(' ');
      cloneEl.setAttribute('stroke-dasharray', baked);
    } else if (dasharray === 'none') {
      cloneEl.removeAttribute('stroke-dasharray');
    }
    if (style.strokeLinecap) cloneEl.setAttribute('stroke-linecap', style.strokeLinecap);
    if (style.strokeLinejoin) cloneEl.setAttribute('stroke-linejoin', style.strokeLinejoin);
    if (style.strokeMiterlimit) cloneEl.setAttribute('stroke-miterlimit', style.strokeMiterlimit);
    if (style.strokeOpacity) cloneEl.setAttribute('stroke-opacity', style.strokeOpacity);

    cloneEl.removeAttribute('vector-effect');
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function b64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function makeSimplePdfFromJpeg(
  jpegDataUrl: string,
  pageWpt: number,
  pageHpt: number,
  imgW: number,
  imgH: number
): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const imgBytes = b64ToUint8(base64);

  const EOL = '\n';
  const header = '%PDF-1.4' + EOL;

  const obj1 = `1 0 obj${EOL}<< /Type /Catalog /Pages 2 0 R >>${EOL}endobj${EOL}`;
  const obj2 = `2 0 obj${EOL}<< /Type /Pages /Count 1 /Kids [3 0 R] >>${EOL}endobj${EOL}`;
  const obj3 =
    `3 0 obj${EOL}` +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}` +
    `endobj${EOL}`;

  const contentStream = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;
  const obj5 =
    `5 0 obj${EOL}` +
    `<< /Length ${contentStream.length} >>${EOL}` +
    `stream${EOL}${contentStream}${EOL}endstream${EOL}` +
    `endobj${EOL}`;

  const obj4Head =
    `4 0 obj${EOL}` +
    `<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Filter /DCTDecode /Width ${imgW} /Height ${imgH} /Length ${imgBytes.byteLength} >>${EOL}` +
    `stream${EOL}`;
  const obj4Tail = `${EOL}endstream${EOL}endobj${EOL}`;

  const chunks: (string | Uint8Array)[] = [header];

  const xref: number[] = [];
  let offset = header.length;

  const pushStr = (s: string) => {
    chunks.push(s);
    offset += s.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.byteLength;
  };

  // obj 1
  xref.push(offset);
  pushStr(obj1);

  // obj 2
  xref.push(offset);
  pushStr(obj2);

  // obj 3
  xref.push(offset);
  pushStr(obj3);

  // obj 4 (record xref ONCE, at the start of "4 0 obj")
  xref.push(offset);
  pushStr(obj4Head);
  pushBytes(imgBytes);
  pushStr(obj4Tail);

  // obj 5
  xref.push(offset);
  pushStr(obj5);

  const xrefStart = offset;
  let xrefTable =
    `xref${EOL}` +
    `0 ${xref.length + 1}${EOL}` +
    `0000000000 65535 f ${EOL}`;
  for (const off of xref) {
    xrefTable += `${off.toString().padStart(10, '0')} 00000 n ${EOL}`;
  }

  const trailer =
    `trailer${EOL}` +
    `<< /Size ${xref.length + 1} /Root 1 0 R >>${EOL}` +
    `startxref${EOL}` +
    `${xrefStart}${EOL}` +
    `%%EOF`;

  chunks.push(xrefTable, trailer);

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}

export default function GuidelinesPage() {
  const sharedDefaults = SHARED_GUIDELINE_DEFAULTS;
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);




  const [showBaselineIndicator, setShowBaselineIndicator] = useState(sharedDefaults.appearance.baselineIndicator);
  const [baselineColor, setBaselineColor] = useState(sharedDefaults.appearance.baselineColor);
  const [waistlineColor, setWaistlineColor] = useState(sharedDefaults.appearance.waistlineColor);
  const [xLineContrast, setXLineContrast] = useState(sharedDefaults.appearance.xLineContrast);
  const [xLineThickness, setXLineThickness] = useState(sharedDefaults.appearance.xLineThickness); // multiplier
  const [midlineDashGap, setMidlineDashGap] = useState(sharedDefaults.appearance.midpointDashGap); // mm gap between dashes
  const [midlineDashContrast, setMidlineDashContrast] = useState(sharedDefaults.appearance.midpointDashContrast); // alpha multiplier
  const [slantSpacingMM, setSlantSpacingMM] = useState(sharedDefaults.slant.spacingMM);
  const [slantLineContrast, setSlantLineContrast] = useState(sharedDefaults.slant.contrast);
  const [slantAngleText, setSlantAngleText] = useState(String(sharedDefaults.slant.angle));
  const [enableSlant2, setEnableSlant2] = useState(sharedDefaults.slant.secondEnabled);
  const [slantAngle2, setSlantAngle2] = useState(() => {
    const v = parseInt(slantAngleText, 10);
    return Number.isFinite(v) ? v : 55;
  });

const slantAngleDeg = useMemo(() => {
  const v = parseInt(slantAngleText, 10);
  return Number.isFinite(v) ? v : 55;
}, [slantAngleText]);



  const [gridContrast, setGridContrast] = useState(0.5);
  const [gridThickness, setGridThickness] = useState(1);
  const [showGridHorizontal, setShowGridHorizontal] = useState(true);
  const [showGridVertical, setShowGridVertical] = useState(true);
  const [gridWidthMode, setGridWidthMode] = useState<'effective' | 'actual' | 'custom'>('effective');
  const [customGridWidthMM, setCustomGridWidthMM] = useState(sharedDefaults.grid.customWidthMM ?? Math.SQRT2);
  const [showNibAngleGuide, setShowNibAngleGuide] = useState(true);
  const [constructionGuides, setConstructionGuides] = useState(() => ({ ...sharedDefaults.constructionGuides! }));
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [showCenterLine, setShowCenterLine] = useState(false);


  const midY = (a: Pt[], b: Pt[]) => (a[0].y + b[0].y) / 2;

  function stripFirstAndLastTicks(guideSet: any) {
    if (!guideSet.ticks || guideSet.ticks.length <= 2) {
      return guideSet;
    }

    return {
      ...guideSet,
      ticks: guideSet.ticks.slice(1, -1),
    };
  }

  function hexToRgba(hex: string, alpha: number) {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    if (full.length !== 6) return `rgba(0,0,0,${alpha})`;

    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r},${g},${b},${a})`;
  }

  function lerpGridColor(t: number) {
    const clamped = Math.max(0, Math.min(1, t));
    const from = { r: 226, g: 232, b: 240 }; // #e2e8f0
    const to = { r: 0, g: 0, b: 0 };
    const r = Math.round(from.r + (to.r - from.r) * clamped);
    const g = Math.round(from.g + (to.g - from.g) * clamped);
    const b = Math.round(from.b + (to.b - from.b) * clamped);
    return `rgb(${r},${g},${b})`;
  }

  // Derive main four guide colors (contrast scales alpha; hue preserved)
  const baseAlpha = Math.max(0, Math.min(1, xLineContrast));
  const alpha = highContrastMode ? 1 : baseAlpha;

  const effectiveBaselineHex = highContrastMode ? '#111827' : baselineColor;
  const effectiveWaistHex = highContrastMode ? '#111827' : waistlineColor;

  const ascColor = hexToRgba('#111827', alpha);
  const descColor = hexToRgba('#111827', alpha);
  const baseColor = hexToRgba(effectiveBaselineHex, alpha);
  const waistColor = hexToRgba(effectiveWaistHex, alpha);

  const xLineThicknessScale = highContrastMode ? 1.8 : xLineThickness;
  const gridBaseContrast = Math.max(0, Math.min(1, gridContrast));
  const gridBaseline = 0.5;
  const gridT = Math.max(0, (gridBaseContrast - gridBaseline) / (1 - gridBaseline));
  const gridColor = lerpGridColor(gridT);
  const gridMaxScale = 1.4;
  const gridThicknessScale = Math.min(highContrastMode ? gridMaxScale : gridThickness, gridMaxScale);








  // “next whole 0.5” in the direction of travel
  const stepHalfFrom = (current: number, dir: 1 | -1) => {
    const eps = 1e-9;
    const x2 = current * 2;
    const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
    return next2 / 2;
  };

  const [script, setScript] = useState<ScriptId>(sharedDefaults.script);
  const showGridControls = script !== 'Copperplate';
  const gridContrastBeforeHigh = useRef<number | null>(null);


  const [xHeightMMText, setXHeightMMText] = useState(String(sharedDefaults.xHeightMM));

  const xHeightMM = useMemo(() => {
    const v = parseFloat(xHeightMMText);
    return Number.isFinite(v) ? v : 6;
  }, [xHeightMMText]);
  const [capStyle, setCapStyle] = useState<'simple' | 'flourished'>('flourished');
  const [nibText, setNibText] = useState(String(sharedDefaults.nibMM));
  const [copperplateRatioPreset, setCopperplateRatioPreset] = useState<CopperplateRatioPreset>(sharedDefaults.copperplateRatioPreset);
  const [copperplateDescUnitsText, setCopperplateDescUnitsText] = useState(String(sharedDefaults.copperplateUnits.desc));
  const [copperplateXUnitsText, setCopperplateXUnitsText] = useState(String(sharedDefaults.copperplateUnits.x));
  const [copperplateAscUnitsText, setCopperplateAscUnitsText] = useState(String(sharedDefaults.copperplateUnits.asc));
  const [copperplateDescUnits, setCopperplateDescUnits] = useState(2);
  const [copperplateXUnits, setCopperplateXUnits] = useState(1);
  const [copperplateAscUnits, setCopperplateAscUnits] = useState(2);

  const nibMM = useMemo(() => {
    const v = parseFloat(nibText);
    return Number.isFinite(v) ? v : 2;
  }, [nibText]);
  const [penAngleDeg, setPenAngleDeg] = useState<15 | 35 | 40 | 45>(sharedDefaults.penAngleDeg);
  const [xNib, setXNib] = useState(sharedDefaults.xNib);

  const [ascNib, setAscNib] = useState(sharedDefaults.ascNib);
  const [descNib, setDescNib] = useState(sharedDefaults.descNib);

  useEffect(() => {
    if (script === 'InsularMajuscule') {
      setXNib(5);
      setAscNib(2);
      setDescNib(2);
      setPenAngleDeg(15);
      setShowGridHorizontal(false);
      setShowGridVertical(false);
      setShowNibAngleGuide(false);
    } else if (script === 'Fraktur' || script === 'TexturaQuadrata') {
      setXNib(4.5);
      setAscNib(2);
      setDescNib(2);
      setPenAngleDeg(script === 'Fraktur' ? 40 : 45);
      setShowGridHorizontal(true);
      setShowGridVertical(true);
      setShowNibAngleGuide(true);
    }
  }, [script]);


  const [rowGapMM, setRowGapMM] = useState(sharedDefaults.rowGapMM);
  const lastSuggestedInsularGap = useRef<number | null>(null);
  const previousRowGapScript = useRef(script);
  useEffect(() => {
    const prior = lastSuggestedInsularGap.current;
    if (script !== 'InsularMajuscule') {
      if (previousRowGapScript.current === 'InsularMajuscule' && prior !== null) {
        setRowGapMM(current => Math.abs(current - prior) < 1e-6 ? sharedDefaults.rowGapMM : current);
      }
      lastSuggestedInsularGap.current = null;
    } else {
      const next = insularMajusculeRowGapMM(nibMM, xNib, ascNib, descNib);
      setRowGapMM(current => prior === null || Math.abs(current - prior) < 1e-6 ? next : current);
      lastSuggestedInsularGap.current = next;
    }
    previousRowGapScript.current = script;
  }, [script, nibMM, xNib, ascNib, descNib]);










  const svgRef = useRef<SVGSVGElement | null>(null);







  // Full-viewport paint layer to hide any layout decorations behind this route


  // ---------- Page box (mm) ----------
  const raw = PAPERS_MM[paper];
  const box = useMemo(() => {
    if (orientation === 'landscape' && raw.w < raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    if (orientation === 'portrait' && raw.w > raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    return { w: raw.w, h: raw.h, label: raw.label };
  }, [raw, orientation]);

  // ---------- Derived sizes ----------
  const effectiveNibMM = useMemo(() => {
    if (script === 'Copperplate') return nibMM;
    const rad = (penAngleDeg * Math.PI) / 180;
    return nibMM * Math.cos(rad);
  }, [script, nibMM, penAngleDeg]);

  // Blackletter “nibs” height controls should be REAL nib widths (mm), not effective.
  const texturaXHeightMM = xNib * nibMM;

  const blackletterHeights = useMemo(
    () => ({ xMM: texturaXHeightMM, ascMM: ascNib * nibMM, descMM: descNib * nibMM }),
    [texturaXHeightMM, ascNib, descNib, nibMM],
  );

  const copperplateHeights = useMemo(() => {
    if (copperplateRatioPreset === 'custom') {
      const xMM = xHeightMM * copperplateXUnits;
      const ascMM = xHeightMM * copperplateAscUnits;
      const descMM = xHeightMM * copperplateDescUnits;
      return { xMM, ascMM, descMM };
    }

    const presetUnits = {
      '2:1:2': { desc: 2, x: 1, asc: 2 },
      '3:2:3': { desc: 3, x: 2, asc: 3 },
      '1:1:1': { desc: 1, x: 1, asc: 1 },
    };

    const { desc, x, asc } = presetUnits[copperplateRatioPreset];
    const safeX = x > 0 ? x : 1;
    const descMM = xHeightMM * (desc / safeX);
    const ascMM = xHeightMM * (asc / safeX);
    return { xMM: xHeightMM, ascMM, descMM };
  }, [xHeightMM, copperplateRatioPreset, copperplateDescUnits, copperplateXUnits, copperplateAscUnits]);

  const guideHeights = script === 'Copperplate' ? copperplateHeights : blackletterHeights;
  const xMM = guideHeights.xMM;
  const ascMM = guideHeights.ascMM;
  const descMM = guideHeights.descMM;

  const swThin = Math.max(0.35, Math.min(0.7, Math.min(box.w, box.h) * 0.0025));
  const swBold = swThin * 1.8;
  const swMax = Math.max(swThin, swBold);

  const guideTemplate = script === 'Copperplate' ? 'copperplate' : 'blackletter';

  const [marginTopMM, setMarginTopMM] = useState(sharedDefaults.margins.top);
  const [marginBottomMM, setMarginBottomMM] = useState(sharedDefaults.margins.bottom);
  const [marginLeftMM, setMarginLeftMM] = useState(sharedDefaults.margins.left);
  const [marginRightMM, setMarginRightMM] = useState(sharedDefaults.margins.right);

  const margins = useMemo(
    () => ({
      top: marginTopMM,
      bottom: marginBottomMM,
      left: marginLeftMM,
      right: marginRightMM,
    }),
    [marginTopMM, marginBottomMM, marginLeftMM, marginRightMM],
  );









  const lineHeight = ascMM + xMM + descMM;
  const rowStepMM = lineHeight + rowGapMM;

  const baselinePositions = useMemo(() => {
    if (rowStepMM <= 0) return [] as number[];

    // Top anchor: first row’s ascender line is exactly at margins.top
    const startY = margins.top + ascMM + xMM;

    // Deliberately over-generate: do NOT compute any bottom limit.
    // We generate until the baseline is well past the bottom of the page,
    // and rely solely on the bottom-only clip to hide whatever falls into the bottom margin.
    const overshootEndY = box.h + lineHeight + rowStepMM;

    const count = Math.max(0, Math.ceil((overshootEndY - startY) / rowStepMM));

    const positions: number[] = [];
    for (let i = 0; i <= count; i += 1) {
      positions.push(startY + i * rowStepMM);
    }

    return positions;
  }, [rowStepMM, margins.top, lineHeight, box.h]);


  const guideSets = useMemo(() => {
    const left = margins.left;
    const right = margins.right;
    return baselinePositions.map((y) => {
      const baseline: Pt[] = [
        { x: left, y },
        { x: box.w - right, y },
      ];

      // ADD THIS (right here)
      const gridUnitMM =
        gridWidthMode === 'actual'
          ? nibMM
          : gridWidthMode === 'custom'
            ? customGridWidthMM
            : effectiveNibMM;

      return buildGuideSet(guideTemplate, {
        baseline,
        xMM,
        ascMM,
        descMM,
        tickStepMM:
          script === 'Copperplate'
            ? Math.max(xMM * 0.9, 3)
            : gridUnitMM, // CHANGE THIS from effectiveNibMM
        actualNibMM: nibMM,
      });
    });

  }, [baselinePositions, margins.left, margins.right, box.w, guideTemplate, xMM, ascMM, descMM, script, effectiveNibMM, nibMM, gridWidthMode, customGridWidthMM]);



  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const camera = useEditorCamera(svgRef, {x:0,y:0,w:box.w,h:box.h}, pointBounds(guideSets.flatMap(g=>[...g.ascLine,...g.waistLine,...g.baseLine,...g.descLine]),{x:0,y:0,w:box.w,h:box.h},2));
  const vb = camera;
  /* ---------------- Export actions ---------------- */
  function downloadSVG() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Export is always exact page, not stage
    clone.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    clone.setAttribute('width', `${box.w}mm`);
    clone.setAttribute('height', `${box.h}mm`);

    bakeExportStrokes(svg, clone, box.w);
    stripNoExport(clone);

    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'guidelines.svg');
  }

  async function downloadPDF() {
    const svg = svgRef.current;
    if (!svg) return;

    const { wPx, hPx } = computeRasterPxPerMM(box.w, box.h);

    const clone = cloneSvgForRasterExport(svg, box.w, box.h, wPx, hPx, bakeExportStrokes, stripNoExport);
    const dataUrl = await renderSvgCloneToJpegDataUrl(clone, wPx, hPx);

    const pdfBlob = makeSimplePdfFromJpeg(dataUrl, mmToPt(box.w), mmToPt(box.h), wPx, hPx);
    downloadBlob(pdfBlob, 'guidelines.pdf');
  }

  async function printToScale() {
    const svg = svgRef.current;
    if (!svg) return;

    const { wPx, hPx } = computeRasterPxPerMM(box.w, box.h);

    const clone = cloneSvgForRasterExport(svg, box.w, box.h, wPx, hPx, bakeExportStrokes, stripNoExport);
    const dataUrl = await renderSvgCloneToJpegDataUrl(clone, wPx, hPx);
    printJpegDataUrlToScale(dataUrl, box.w, box.h);
  }

  /* ---------------- Pan handlers ---------------- */


















  const rendererSettings: GuidelinesSettings = {
    script, rowGapMM, margins, xHeightMM, nibMM, copperplateRatioPreset,
    copperplateUnits: { desc: copperplateDescUnits, x: copperplateXUnits, asc: copperplateAscUnits },
    penAngleDeg, xNib, ascNib, descNib,
    slant: { angle: slantAngleDeg, secondEnabled: enableSlant2, secondAngle: slantAngle2, spacingMM: slantSpacingMM, contrast: slantLineContrast },
    grid: { widthMode: gridWidthMode, customWidthMM: customGridWidthMM, contrast: gridContrast, thickness: gridThickness, horizontal: showGridHorizontal, vertical: showGridVertical, nibAngleGuide: showNibAngleGuide },
    constructionGuides,
    appearance: { baselineIndicator: showBaselineIndicator, baselineColor, waistlineColor, xLineContrast, xLineThickness, midpointDashGap: midlineDashGap, midpointDashContrast: midlineDashContrast, highContrast: highContrastMode, centerLine: showCenterLine },
  };
  const centerX = margins.left + (box.w - margins.left - margins.right) / 2;

  return (
    <EditorWorkspace preview={<>
<section className=" ">
        <div className="preview-panel  mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 sm:p-6">
          <PreviewToolbar camera={camera}><Button onMouseDown={e => e.preventDefault()} onClick={camera.top} className="min-h-10   text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                Top
              </Button>
<Button onMouseDown={e => e.preventDefault()} onClick={downloadSVG} className="  text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                SVG
              </Button>
<Button onMouseDown={e => e.preventDefault()} onClick={downloadPDF} className="  text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                PDF
              </Button>
<Button onMouseDown={e => e.preventDefault()} onClick={printToScale} className="  text-sm rounded-lg text-white bg-indigo-600 hover:bg-indigo-500">
                Print
              </Button></PreviewToolbar>

          {/* Darker stage behind paper */}
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className="editor-svg"
              style={{ background: '#cbd5e1' }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <clipPath id="pageClip">
                  <rect x={0} y={0} width={box.w} height={box.h} />
                </clipPath>

                {/* Clip guides to left/right margins and bottom margin ONLY.
      Do NOT clip at the top so the first row is always fully visible. */}
                <clipPath id="guidesClipBottomOnly">
                  <rect
                    x={margins.left}
                    y={0}
                    width={box.w - margins.left - margins.right}
                    height={box.h - margins.bottom}
                  />
                </clipPath>

                {/* Copperplate: show slants only inside guideline row bands */}
                <GuidelinesRowMask guideSets={guideSets} box={box} />
              </defs>



              {/* stage bg (kept only for on-screen; removed in export) */}
              <rect id="stage-bg" x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />

              {/* Paper */}
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

              <GuidelinesRenderer box={{ width: box.w, height: box.h }} settings={rendererSettings} idPrefix="standalone-guidelines" />
            </svg>

          </div>
          <PreviewMeta>
            <span>Baselines: {guideSets.length}</span>
            <span>Line height: {lineHeight.toFixed(1)} mm</span>
            <span>Row gap: {rowGapMM.toFixed(1)} mm</span>
            <span>Row step: {rowStepMM.toFixed(1)} mm</span>
          </PreviewMeta>
        </div>
      </section>
</>} inspector={<><InspectorIntro>Generate printable guidelines for Copperplate, blackletter, and Insular Majuscule using straight baselines.
          </InspectorIntro>
<section className="    mx-auto grid grid-cols-1  items-start gap-6">
        {/* Step 1 */}
        <DisclosureSection title="Document & Appearance" defaultOpen headerAction={<InfoTip side="right">Guidelines are spaced by x-height + ascender + descender.</InfoTip>}>


          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="font-medium text-slate-700">Paper size</label>
              <Select
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={paper}
                onChange={e => {
                  const id = e.target.value as PaperId;
                  setPaper(id);
                  setOrientation(PAPERS_MM[id].defaultOrientation);
                  camera.fit('page');
                }}
              >
                {Object.entries(PAPERS_MM).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="font-medium text-slate-700">Orientation</label>
              <Select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={orientation} onChange={e => setOrientation(e.target.value as Orientation)}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Select>
            </div>

            <div>
              <label className="font-medium text-slate-700">Row gap (mm)</label>
              <NumericInput
                type="number"
                step="0.1"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={rowGapMM}
                onChange={(e) => setRowGapMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>
          </div>

          <div className="my-5 border-t border-slate-200/70" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
            <div className="flex min-w-0 flex-col items-stretch gap-2">
              <label className="block font-medium text-slate-700">Top margin</label>
              <div className="relative flex-1 min-w-0">
                <NumericInput
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full p-2 pr-10 rounded-lg border border-slate-300"
                  value={marginTopMM}
                  onChange={(e) => setMarginTopMM(parseFloat(e.target.value || '0') || 0)}
                />
                <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">mm</span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-stretch gap-2">
              <label className="block font-medium text-slate-700">Bottom margin</label>
              <div className="relative flex-1 min-w-0">
                <NumericInput
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full p-2 pr-10 rounded-lg border border-slate-300"
                  value={marginBottomMM}
                  onChange={(e) => setMarginBottomMM(parseFloat(e.target.value || '0') || 0)}
                />
                <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">mm</span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-stretch gap-2">
              <label className="block font-medium text-slate-700">Left margin</label>
              <div className="relative flex-1 min-w-0">
                <NumericInput
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full p-2 pr-10 rounded-lg border border-slate-300"
                  value={marginLeftMM}
                  onChange={(e) => setMarginLeftMM(parseFloat(e.target.value || '0') || 0)}
                />
                <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">mm</span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-stretch gap-2">
              <label className="block font-medium text-slate-700">Right margin</label>
              <div className="relative flex-1 min-w-0">
                <NumericInput
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full p-2 pr-10 rounded-lg border border-slate-300"
                  value={marginRightMM}
                  onChange={(e) => setMarginRightMM(parseFloat(e.target.value || '0') || 0)}
                />
                <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">mm</span>
              </div>
            </div>

            <div className="col-span-full">
              <div className="my-2 border-t border-slate-200/70" />
            </div>

            <div className="col-span-full">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Baseline */}
                <div className="flex min-w-0 flex-col items-stretch gap-2">
                  <div className="min-w-0 text-sm font-medium text-slate-700">Baseline</div>
                  <Button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowBaselineIndicator(v => !v)}
                    className={`shrink-0 inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
        ${showBaselineIndicator
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
        ${showBaselineIndicator ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {showBaselineIndicator ? 'On' : 'Off'}
                  </Button>
                </div>

                {/* High-contrast */}
                <div className="flex min-w-0 flex-col items-stretch gap-2">
                  <div className="min-w-0 text-sm font-medium text-slate-700">High-contrast</div>
                  <Button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setHighContrastMode((prev) => {
                        const next = !prev;
                        if (next) {
                          gridContrastBeforeHigh.current = gridContrast;
                          setGridContrast(0.75);
                        } else {
                          setGridContrast(gridContrastBeforeHigh.current ?? 0.5);
                          gridContrastBeforeHigh.current = null;
                        }
                        return next;
                      });
                    }}
                    className={`shrink-0 inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
        ${highContrastMode
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
        ${highContrastMode ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {highContrastMode ? 'On' : 'Off'}
                  </Button>
                </div>

                {/* Center */}
                <div className="flex min-w-0 flex-col items-stretch gap-2">
                  <div className="min-w-0 text-sm font-medium text-slate-700">Center</div>
                  <Button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowCenterLine(v => !v)}
                    className={`shrink-0 inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
        ${showCenterLine
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
        ${showCenterLine ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {showCenterLine ? 'On' : 'Off'}
                  </Button>
                </div>
              </div>
            </div>
            <div className="col-span-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Baseline color */}
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700">Baseline color</span>
                  <input
                    type="color"
                    className="h-10 w-10 shrink-0 p-0 rounded-md border border-slate-300 bg-white"
                    value={baselineColor}
                    onChange={(e) => {
                      setBaselineColor(e.target.value);
                      setHighContrastMode(false);
                    }}
                  />
                </label>

                {/* Waistline color */}
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700">Waistline color</span>
                  <input
                    type="color"
                    className="h-10 w-10 shrink-0 p-0 rounded-md border border-slate-300 bg-white"
                    value={waistlineColor}
                    onChange={(e) => {
                      setWaistlineColor(e.target.value);
                      setHighContrastMode(false);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="col-span-full">
              <div className="my-5 border-t border-slate-200/70" />
            </div>

            {/* X-line contrast */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <label className="font-medium text-slate-700">X-line contrast</label>
                <span className="text-xs text-slate-500">{Math.round((highContrastMode ? 1 : xLineContrast) * 100)}%</span>
              </div>
              <Slider
                type="range"
                min="0"
                max="1"
                step="0.01"
                className="mt-2 w-full"
                value={highContrastMode ? 1 : xLineContrast}
                onChange={(e) => {
                  setXLineContrast(parseFloat(e.target.value));
                  setHighContrastMode(false);
                }}
              />
              <p className="mt-1 text-xs text-slate-500">
                Affects only ascender, waistline, baseline, descender. Contrast scales alpha; hue is preserved.
              </p>
            </div>

            {/* X-line thickness */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <label className="font-medium text-slate-700">X-line thickness</label>
                <span className="text-xs text-slate-500">{(highContrastMode ? 1.8 : xLineThickness).toFixed(2)}×</span>
              </div>
              <Slider
                type="range"
                min="0.6"
                max="2.5"
                step="0.05"
                className="mt-2 w-full"
                value={highContrastMode ? 1.8 : xLineThickness}
                onChange={(e) => {
                  setXLineThickness(parseFloat(e.target.value));
                  setHighContrastMode(false);
                }}
              />
              <p className="mt-1 text-xs text-slate-500">Multiplies the stroke thickness of the main four X-lines.</p>
            </div>


          </div>
        </DisclosureSection>

        {/* Step 2 */}
        <DisclosureSection title="Script & Dimensions" defaultOpen headerAction={<InfoTip side="right">
              {script === 'Copperplate'
                ? 'Copperplate uses x-height (mm) with optional calibration for lowercase scale and spacing.'
                : 'Heights are nibs × nib size (mm).'}
            </InfoTip>}>


          {/* Top controls */}
          <div className="mt-5 space-y-5">
            {/* Row 1: Script + X-height (keep 2-up on small screens; collapse only on very narrow) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex min-w-0 flex-col items-stretch gap-2">
                <label className="block font-medium text-slate-700">Script</label>
                <div className="flex-1 min-w-0">
                  <Select
                    className="w-full p-2 rounded-lg border border-slate-300"
                    value={script}
                    onChange={(e) => setScript(e.target.value as ScriptId)}
                  >
                    <option value="Copperplate">Copperplate</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="TexturaQuadrata">Textura Quadrata</option>
                     <option value="InsularMajuscule">Insular Majuscule</option>
                  </Select>
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-stretch gap-2">
                <label className="block font-medium text-slate-700">
                  {script === 'Copperplate' ? 'X-height (mm)' : 'x-height (nibs)'}
                </label>

                <div className="flex-1 min-w-0">
                  {script === 'Copperplate' ? (
                    <NumericInput
                      type="number"
                      step={0.5}
                      min={2}
                      max={10}
                      className="w-full p-2 rounded-lg border border-slate-300"
                      value={xHeightMMText}
                      onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                      onChange={(e) => setXHeightMMText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();

                        const current = parseFloat(xHeightMMText);
                        const safe = Number.isFinite(current) ? current : 6;
                        const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                        const stepped = stepHalfFrom(safe, dir);
                        const clamped = clamp(stepped, 2, 10);
                        setXHeightMMText(String(clamped));
                      }}
                      onBlur={() => {
                        const v = parseFloat(xHeightMMText);
                        if (!Number.isFinite(v)) {
                          setXHeightMMText('6');
                          return;
                        }
                        // Keep manual entries as-is (no snapping), just clamp to allowed range:
                        setXHeightMMText(String(clamp(v, 2, 10)));
                      }}
                    />
                  ) : (
                    <NumericInput
                      type="number"
                      step={0.5}
                      min={1}
                      max={8}
                      className="w-full p-2 rounded-lg border border-slate-300"
                      value={xNib}
                      onChange={(e) => setXNib(parseFloat(e.target.value || '5'))}
                    />
                  )}
                </div>
              </div>
            </div>

            {script === 'Copperplate' ? (
              /* Copperplate-only options (unchanged content, just keeps it in the “top controls” zone) */
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex min-w-0 flex-col items-stretch gap-2">
                    <label className="block font-medium text-slate-700">Guideline ratio (desc : x : asc)</label>
                    <div className="flex-1 min-w-0">
                      <Select
                        className="w-full p-2 rounded-lg border border-slate-300"
                        value={copperplateRatioPreset}
                        onChange={(e) => setCopperplateRatioPreset(e.target.value as CopperplateRatioPreset)}
                      >
                        <option value="2:1:2">2 : 1 : 2</option>
                        <option value="3:2:3">3 : 2 : 3</option>
                        <option value="1:1:1">1 : 1 : 1</option>
                        <option value="custom">Custom…</option>
                      </Select>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Ascender/descender scale from x-height.</p>
                </div>

                {copperplateRatioPreset === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Desc */}
                    <div>
                      <label className="font-medium text-slate-700">Desc units</label>
                      <NumericInput
                        type="number"
                        min={0}
                        step="0.5"
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={copperplateDescUnitsText}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCopperplateDescUnitsText(next);
                          const parsed = parseFloat(next);
                          if (Number.isFinite(parsed)) setCopperplateDescUnits(Math.max(0, parsed));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          const current = parseFloat(copperplateDescUnitsText);
                          const safe = Number.isFinite(current) ? current : copperplateDescUnits;
                          const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;
                          const stepped = stepHalfFrom(safe, dir);
                          const next = Math.max(0, stepped);
                          setCopperplateDescUnitsText(String(next));
                          setCopperplateDescUnits(next);
                        }}
                        onBlur={() => {
                          const v = parseFloat(copperplateDescUnitsText);
                          if (!Number.isFinite(v)) {
                            setCopperplateDescUnitsText(String(copperplateDescUnits));
                            return;
                          }
                          const next = Math.max(0, v);
                          setCopperplateDescUnitsText(String(next));
                          setCopperplateDescUnits(next);
                        }}
                      />
                    </div>

                    {/* X */}
                    <div>
                      <label className="font-medium text-slate-700">X units</label>
                      <NumericInput
                        type="number"
                        min={0.5}
                        step="0.5"
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={copperplateXUnitsText}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCopperplateXUnitsText(next);
                          const parsed = parseFloat(next);
                          if (Number.isFinite(parsed)) setCopperplateXUnits(Math.max(0.1, parsed));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          const current = parseFloat(copperplateXUnitsText);
                          const safe = Number.isFinite(current) ? current : copperplateXUnits;
                          const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;
                          const stepped = stepHalfFrom(safe, dir);
                          const next = Math.max(0.5, stepped);
                          setCopperplateXUnitsText(String(next));
                          setCopperplateXUnits(next);
                        }}
                        onBlur={() => {
                          const v = parseFloat(copperplateXUnitsText);
                          if (!Number.isFinite(v)) {
                            setCopperplateXUnitsText(String(copperplateXUnits));
                            return;
                          }
                          const next = Math.max(0.5, v);
                          setCopperplateXUnitsText(String(next));
                          setCopperplateXUnits(next);
                        }}
                      />
                    </div>

                    {/* Asc */}
                    <div>
                      <label className="font-medium text-slate-700">Asc units</label>
                      <NumericInput
                        type="number"
                        min={0}
                        step="0.5"
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={copperplateAscUnitsText}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCopperplateAscUnitsText(next);
                          const parsed = parseFloat(next);
                          if (Number.isFinite(parsed)) setCopperplateAscUnits(Math.max(0, parsed));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          const current = parseFloat(copperplateAscUnitsText);
                          const safe = Number.isFinite(current) ? current : copperplateAscUnits;
                          const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;
                          const stepped = stepHalfFrom(safe, dir);
                          const next = Math.max(0, stepped);
                          setCopperplateAscUnitsText(String(next));
                          setCopperplateAscUnits(next);
                        }}
                        onBlur={() => {
                          const v = parseFloat(copperplateAscUnitsText);
                          if (!Number.isFinite(v)) {
                            setCopperplateAscUnitsText(String(copperplateAscUnits));
                            return;
                          }
                          const next = Math.max(0, v);
                          setCopperplateAscUnitsText(String(next));
                          setCopperplateAscUnits(next);
                        }}
                      />
                    </div>
                  </div>
                )}



                {/* Calibration block unchanged */}

              </div>
            ) : (
              <>
                {/* Blackletter controls */}
                <div className="mt-5 space-y-5">

                  {/* Row 2: nib size / pen angle / grid width / angle guide */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                    {/* Nib size */}
                    <div>
                      <label className="font-medium text-slate-700">Nib size (mm)</label>
                      <NumericInput
                        type="number"
                        step="any"
                        min={0.2}
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={nibText}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        onChange={(e) => setNibText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();

                          const current = parseFloat(nibText);
                          const safe = Number.isFinite(current) ? current : 2;
                          const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                          const stepped = stepHalfFrom(safe, dir);
                          setNibText(String(Math.max(0.2, stepped)));
                        }}
                        onBlur={() => {
                          const v = parseFloat(nibText);
                          if (!Number.isFinite(v)) {
                            setNibText('2');
                            return;
                          }
                          setNibText(String(Math.max(0.2, v)));
                        }}
                      />
                    </div>

                    {/* Pen angle */}
                    <div>
                      <label className="font-medium text-slate-700">Pen angle (°)</label>
                      <Select
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={penAngleDeg}
                        onChange={(e) => setPenAngleDeg(parseInt(e.target.value, 10) as 15 | 35 | 40 | 45)}
                      >
                        <option value={15}>15°</option>
                         <option value={35}>35°</option>
                        <option value={40}>40°</option>
                        <option value={45}>45°</option>
                      </Select>
                    </div>

                    {/* Grid width */}
                    {showGridControls ? (
                      <div className="space-y-2">
                        <label className="font-medium text-slate-700">Grid width</label>
                        <Select
                          className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                          value={gridWidthMode}
                          onChange={(e) => setGridWidthMode(e.target.value as 'effective' | 'actual' | 'custom')}
                        >
                          <option value="effective">Stroke-width</option>
                          <option value="actual">Actual nib</option>
                          <option value="custom">Custom</option>
                        </Select>
                        {gridWidthMode === 'custom' && <label className="block font-medium text-slate-700">Custom grid width<div className="relative"><NumericInput className="mt-1 w-full rounded-lg border border-slate-300 p-2 pr-10" type="number" min="0.1" step="0.1" value={customGridWidthMM} onChange={e => { const next = Number(e.target.value); if (Number.isFinite(next) && next >= .1) setCustomGridWidthMM(next); }} /><span className="pointer-events-none absolute right-3 top-3 text-sm text-slate-400">mm</span></div></label>}
                      </div>
                    ) : (
                      <div />
                    )}

                    {/* Angle guide toggle */}
                    {showGridControls ? (
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700">Angle guide</div>
                        <Button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowNibAngleGuide((v) => !v)}
                          className={`mt-1 inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
                            ${showNibAngleGuide
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
                            ${showNibAngleGuide ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                            <span className="h-3 w-3 rounded-full bg-white shadow" />
                          </span>
                          {showNibAngleGuide ? 'On' : 'Off'}
                        </Button>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* Row 3: ascender / descender */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="font-medium text-slate-700">Ascender (nibs)</label>
                      <NumericInput
                        type="number"
                        step={0.5}
                        min={0}
                        max={8}
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={ascNib}
                        onChange={(e) => setAscNib(parseFloat(e.target.value || '2'))}
                      />
                    </div>
                    <div>
                      <label className="font-medium text-slate-700">Descender (nibs)</label>
                      <NumericInput
                        type="number"
                        step={0.5}
                        min={0}
                        max={8}
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={descNib}
                        onChange={(e) => setDescNib(parseFloat(e.target.value || '2'))}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3"><h3 className="mb-2 text-sm font-semibold text-slate-700">Construction guides</h3><ConstructionGuideControls script={script} value={constructionGuides} onChange={setConstructionGuides} /></div>
                </div>
              </>
            )}
          </div>

          <div className="my-5 border-t border-slate-200/70" />

          {/* Sliders (unchanged) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
            {script === 'Copperplate' && (
              <>
                {/* 1st asc/desc dash spacing */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="font-medium text-slate-700">1st asc/desc spacing</label>
                    <span className="text-xs text-slate-500">{midlineDashGap.toFixed(1)} mm</span>
                  </div>
                  <Slider
                    type="range"
                    min="2"
                    max="14"
                    step="0.5"
                    className="mt-2 w-full"
                    value={midlineDashGap}
                    onChange={(e) => setMidlineDashGap(parseFloat(e.target.value))}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Controls the gap between dashes on the 1st ascender/descender reference lines.
                  </p>
                </div>

                {/* 1st asc/desc contrast */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="font-medium text-slate-700">1st asc/desc contrast</label>
                    <span className="text-xs text-slate-500">{Math.round((highContrastMode ? 1 : midlineDashContrast) * 100)}%</span>
                  </div>
                  <Slider
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    className="mt-2 w-full"
                    value={highContrastMode ? 1 : midlineDashContrast}
                    onChange={(e) => {
                      setMidlineDashContrast(parseFloat(e.target.value));
                      setHighContrastMode(false);
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Adjusts only the 1st ascender/descender dashed reference lines.
                  </p>
                </div>
              </>
            )}

{script === 'Copperplate' && (
  <>
    <div className="col-span-full">
      <div className="my-5 border-t border-slate-200/70" />
    </div>

    {/* Slant angle */}
    <div>
      <div className="flex min-w-0 flex-col items-stretch gap-2">
        <label className="block font-medium text-slate-700">Slant angle</label>
        <div className="relative flex-1 min-w-0">
          <NumericInput
            type="number"
            step={1}
            min={0}
            max={90}
            className="w-full p-2 pr-10 rounded-lg border border-slate-300"
            value={slantAngleText}
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            onChange={(e) => setSlantAngleText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();

              const current = parseInt(slantAngleText, 10);
              const safe = Number.isFinite(current) ? current : 55;
              const dir = e.key === 'ArrowUp' ? 1 : -1;
              setSlantAngleText(String(safe + dir));
            }}
            onBlur={() => {
              const v = parseInt(slantAngleText, 10);
              if (!Number.isFinite(v)) {
                setSlantAngleText('55');
                return;
              }
              setSlantAngleText(String(Math.min(90, Math.max(0, v))));
            }}
          />
          <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-600">°</span>
        </div>
      </div>
    </div>

    <div>
      <div className="flex min-w-0 flex-col items-stretch gap-2">
        <div className="flex items-center gap-2">
          <label className="font-medium text-slate-700">Slant 2</label>
          <Toggle
            type="checkbox"
            checked={enableSlant2}
            onChange={(e) => setEnableSlant2(e.target.checked)}
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <NumericInput
            type="number"
            step={1}
            min={0}
            max={90}
            className={`w-full p-2 pr-10 rounded-lg border border-slate-300 ${enableSlant2 ? '' : 'bg-slate-50 opacity-60 cursor-not-allowed'}`}
            value={slantAngle2}
            disabled={!enableSlant2}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setSlantAngle2(Number.isFinite(v) ? v : 55);
            }}
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            onBlur={() => setSlantAngle2((v) => Math.min(90, Math.max(0, v)))}
          />
          <span className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-600">°</span>
        </div>
      </div>
    </div>

    {/* Slant spacing */}
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="font-medium text-slate-700">Slant spacing</label>
        <span className="text-xs text-slate-500">
          {slantSpacingMM.toFixed(1)} mm
        </span>
      </div>
      <Slider
        type="range"
        min="4"
        max="30"
        step="0.5"
        className="mt-2 w-full"
        value={slantSpacingMM}
        onChange={(e) => setSlantSpacingMM(parseFloat(e.target.value))}
      />
    </div>

    {/* Slant contrast */}
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="font-medium text-slate-700">Slant contrast</label>
        <span className="text-xs text-slate-500">
          {Math.round((highContrastMode ? 1 : slantLineContrast) * 100)}%
        </span>
      </div>
      <Slider
        type="range"
        min="0"
        max="1"
        step="0.01"
        className="mt-2 w-full"
        value={highContrastMode ? 1 : slantLineContrast}
        onChange={(e) => {
          setSlantLineContrast(parseFloat(e.target.value));
          setHighContrastMode(false);
        }}
      />
    </div>
  </>
)}



            {showGridControls && (
              <>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="font-medium text-slate-700">Grid contrast</label>
                    <span className="text-xs text-slate-500">{Math.round(gridContrast * 100)}%</span>
                  </div>
                  <Slider
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    className="mt-2 w-full"
                    value={gridContrast}
                    onChange={(e) => {
                      setGridContrast(parseFloat(e.target.value));
                      setHighContrastMode(false);
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">Controls the contrast of the square grid only.</p>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <label className="font-medium text-slate-700">Grid thickness</label>
                    <span className="text-xs text-slate-500">{gridThickness.toFixed(2)}×</span>
                  </div>
                  <Slider
                    type="range"
                    min="0.6"
                    max="1.4"
                    step="0.05"
                    className="mt-2 w-full"
                    value={gridThickness}
                    onChange={(e) => {
                      setGridThickness(parseFloat(e.target.value));
                      setHighContrastMode(false);
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">Multiplies the square grid stroke thickness.</p>
                </div>
              </>
            )}
          </div>

          {showGridControls && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700">Horizontal grid lines</div>
                <Button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowGridHorizontal((v) => !v)}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
            ${showGridHorizontal
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <span
                    className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
              ${showGridHorizontal ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <span className="h-3 w-3 rounded-full bg-white shadow" />
                  </span>
                  {showGridHorizontal ? 'On' : 'Off'}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700">Vertical grid lines</div>
                <Button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowGridVertical((v) => !v)}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
            ${showGridVertical
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <span
                    className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
              ${showGridVertical ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <span className="h-3 w-3 rounded-full bg-white shadow" />
                  </span>
                  {showGridVertical ? 'On' : 'Off'}
                </Button>
              </div>
            </div>
          )}
        </DisclosureSection>

      </section>
</>}></EditorWorkspace>
  );
}
