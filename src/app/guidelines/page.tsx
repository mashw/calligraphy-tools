'use client';

import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import {PAPERS_MM } from '@/lib/curve-helpers';

import {
  clamp,
} from '@/lib/line-widths';
import { type ScriptId } from '@/lib/scripts';
import { buildGuideSet, BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';
import GuideOverlay from '@/components/preview/GuideOverlay';
import { openSvgPrintWindow } from '@/lib/print/open-svg-print-window';

type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type ViewMode = 'autofit' | 'fullpage' | 'custom';
type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';

type Pt = { x: number; y: number };
type Box = { w: number; h: number };
type GuideSet = ReturnType<typeof buildGuideSet>;


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
    <mask id="guidelines-row-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
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
type InfoTipProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'left' | 'bottom';
};

function InfoTip({ title, children, className = '', side = 'right' }: InfoTipProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [computedSide, setComputedSide] = useState<typeof side>(side);

  useLayoutEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;

    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wr = wrap.getBoundingClientRect();

    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    const tr = tip.getBoundingClientRect();
    tip.style.visibility = '';
    tip.style.display = '';

    const space = {
      left: wr.left,
      right: vw - wr.right,
      top: wr.top,
      bottom: vh - wr.bottom,
    };

    const fits = (s: typeof side) =>
      (s === 'left' || s === 'right')
        ? space[s] >= tr.width + gap
        : (s === 'top' || s === 'bottom')
          ? space[s] >= tr.height + gap
          : false;

    let next: typeof side = side;
    if (!fits(side)) {
      const order: Array<typeof side> = ['right', 'left', 'bottom', 'top'];
      next = order.sort((a, b) => space[b] - space[a]).find(fits) ?? side;
    }
    setComputedSide(next);
  }, [open, side]);

  const pos =
    computedSide === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 -mb-2'
      : computedSide === 'left'
        ? 'right-full top-1/2 -translate-y-1/2 -mr-2'
        : computedSide === 'bottom'
          ? 'top-full left-1/2 -translate-x-1/2 mt-2'
          : 'left-full top-1/2 -translate-y-1/2 ml-2';

  const arrow =
    computedSide === 'top'
      ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-700'
      : computedSide === 'left'
        ? 'left-full top-1/2 -translate-y-1/2 border-l-slate-700'
        : computedSide === 'bottom'
          ? 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-700'
          : 'right-full top-1/2 -translate-y-1/2 border-r-slate-700';

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onTouchStart={() => setOpen(o => !o)}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 cursor-help"
        title={title}
      >
        <span className="text-[11px] font-bold select-none">i</span>
      </span>

      <div
        ref={tipRef}
        role="tooltip"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`absolute ${pos} z-30
          ${open ? 'visible opacity-100' : 'invisible opacity-0'}
          transition-opacity duration-150
          rounded-lg shadow-lg ring-1 ring-black/10 bg-slate-700 text-white text-[13px] leading-snug
          px-3.5 py-2.5 whitespace-normal pointer-events-auto
          min-w-[16rem] max-w-[34rem]`}
      >
        {children}
        <span className={`absolute ${arrow} w-0 h-0 border-8 border-transparent`} aria-hidden="true" />
      </div>
    </div>
  );
}

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



export default function GuidelinesPage() {
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const [view, setView] = useState<ViewMode>('autofit');
  const [customOrigin, setCustomOrigin] = useState<'autofit' | 'fullpage'>('autofit');


  const [showBaselineIndicator, setShowBaselineIndicator] = useState(false);
  const [baselineColor, setBaselineColor] = useState('#111827');
  const [waistlineColor, setWaistlineColor] = useState('#111827');
  const [xLineContrast, setXLineContrast] = useState(1);
  const [xLineThickness, setXLineThickness] = useState(1); // multiplier
  const [midlineDashGap, setMidlineDashGap] = useState(6); // mm gap between dashes
  const [midlineDashContrast, setMidlineDashContrast] = useState(0.5); // alpha multiplier
  const [slantSpacingMM, setSlantSpacingMM] = useState(10);
  const [slantLineContrast, setSlantLineContrast] = useState(0.3);
  const [slantAngleText, setSlantAngleText] = useState('55');
  const [enableSlant2, setEnableSlant2] = useState(false);
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
  const [gridWidthMode, setGridWidthMode] = useState<'effective' | 'actual'>('effective');
  const [showNibAngleGuide, setShowNibAngleGuide] = useState(true);
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

  const [script, setScript] = useState<ScriptId>('Copperplate');
  const showGridControls = script === 'Fraktur' || script === 'TexturaQuadrata';
  const gridContrastBeforeHigh = useRef<number | null>(null);


  const [xHeightMMText, setXHeightMMText] = useState('6');

  const xHeightMM = useMemo(() => {
    const v = parseFloat(xHeightMMText);
    return Number.isFinite(v) ? v : 6;
  }, [xHeightMMText]);
  const [capStyle, setCapStyle] = useState<'simple' | 'flourished'>('flourished');
  const [nibText, setNibText] = useState('2');
  const [copperplateRatioPreset, setCopperplateRatioPreset] = useState<CopperplateRatioPreset>('3:2:3');
  const [copperplateDescUnitsText, setCopperplateDescUnitsText] = useState('2');
  const [copperplateXUnitsText, setCopperplateXUnitsText] = useState('1');
  const [copperplateAscUnitsText, setCopperplateAscUnitsText] = useState('2');
  const [copperplateDescUnits, setCopperplateDescUnits] = useState(2);
  const [copperplateXUnits, setCopperplateXUnits] = useState(1);
  const [copperplateAscUnits, setCopperplateAscUnits] = useState(2);

  const nibMM = useMemo(() => {
    const v = parseFloat(nibText);
    return Number.isFinite(v) ? v : 2;
  }, [nibText]);
  const [penAngleDeg, setPenAngleDeg] = useState<35 | 40 | 45>(45);
  const [xNib, setXNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.xNib);

  const [ascNib, setAscNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.ascNib);
  const [descNib, setDescNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.descNib);

  useEffect(() => {
    if (script === 'Fraktur' || script === 'TexturaQuadrata') {
      setAscNib(2);
      setDescNib(2);
    }
  }, [script]);


  const [rowGapMM, setRowGapMM] = useState(6);

  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 640px)').matches
    : false));
  const DEFAULT_ZOOM = isNarrow ? 5 : 4;
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const DEFAULT_AUTOFIT_ZOOM = 4;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const dragRef = useRef<{
    px: number;
    py: number;
    panX: number;
    panY: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [previewPxH, setPreviewPxH] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
    } else {
      mq.addListener(update);
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', update);
      } else {
        mq.removeListener(update);
      }
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setPreviewPxH(r.height);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);


  // Full-viewport paint layer to hide any layout decorations behind this route
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlBg = html.style.backgroundImage;
    const prevBodyBg = body.style.backgroundImage;

    html.style.backgroundImage = 'none';
    body.style.backgroundImage = 'none';

    return () => {
      html.style.backgroundImage = prevHtmlBg;
      body.style.backgroundImage = prevBodyBg;
    };
  }, []);

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

  const [marginTopMM, setMarginTopMM] = useState(15);
  const [marginBottomMM, setMarginBottomMM] = useState(15);
  const [marginLeftMM, setMarginLeftMM] = useState(10);
  const [marginRightMM, setMarginRightMM] = useState(10);

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

  }, [baselinePositions, margins.left, margins.right, box.w, guideTemplate, xMM, ascMM, descMM, script, effectiveNibMM, nibMM, gridWidthMode]);

  const computeBaseView = () => {
    const topPadPX = 30;

    // When in custom, keep the “feel” of where custom zoom originated.
    // This prevents the first zoom press from fullpage changing padding/anchor abruptly.
    const padMode: 'autofit' | 'fullpage' =
      view === 'custom' ? customOrigin : (view === 'fullpage' ? 'fullpage' : 'autofit');

    const fitZoom = view === 'autofit' ? DEFAULT_AUTOFIT_ZOOM : 1;
    const zoomForView = view === 'custom' ? zoom : fitZoom;

    // Stage padding:
    // - Full page: ~5px top/bottom (converted into mm)
    // - Autofit/custom-from-autofit: roomy stage pad in mm
    const fullPagePadPX = 5;
    const stagePadMM =
      padMode === 'fullpage'
        ? (() => {
          const pxH = Math.max(1, previewPxH);
          const mmPerPx = box.h / pxH;
          return fullPagePadPX * mmPerPx;
        })()
        : 22;



    let minX: number;
    let minY: number;
    let vw: number;
    let vh: number;

    if (padMode === 'fullpage' || guideSets.length === 0) {
      // Fullpage-style framing:
      // - In actual fullpage view: always show the whole sheet.
      // - In custom-from-fullpage: same framing but allow zoom to shrink the view.
      if (view === 'custom') {
        vw = box.w / Math.max(1, zoomForView);
        vh = box.h / Math.max(1, zoomForView);
        minX = (box.w - vw) / 2;
        minY = (box.h - vh) / 2;
      } else {
        vw = box.w;
        vh = box.h;
        minX = 0;
        minY = 0;
      }
    } else {
      const fitPad = 8;
      const pts = guideSets.flatMap((guideSet) => [
        ...guideSet.ascLine,
        ...guideSet.waistLine,
        ...guideSet.baseLine,
        ...guideSet.descLine,
      ]);

      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const minX0 = Math.min(...xs) - fitPad;
      const maxX0 = Math.max(...xs) + fitPad;
      const minY0 = Math.min(...ys) - fitPad;
      const maxY0 = Math.max(...ys) + fitPad;

      const cx = (minX0 + maxX0) / 2;
      const cy = (minY0 + maxY0) / 2;

      vw = Math.max(1, maxX0 - minX0) / Math.max(1, zoomForView);
      vh = Math.max(1, maxY0 - minY0) / Math.max(1, zoomForView);
      minX = cx - vw / 2;
      minY = cy - vh / 2;
      // Don’t let autofit frame drift too far below the page top;
      // we want some stage visible above y=0.
      minY = Math.min(minY, stagePadMM);
    }

    const baseVhMM = vh + stagePadMM * 2;
    const mmPerPx = previewPxH > 0 ? baseVhMM / previewPxH : 0;
    const extraTopMM = padMode === 'autofit' ? topPadPX * mmPerPx : 0;

    return {
      minX,
      minY,
      vw,
      vh,
      stagePadMM,
      extraTopMM,
    };
  };

  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const vb = useMemo(() => {
    const { minX, minY, vw, vh, stagePadMM, extraTopMM } = computeBaseView();

    let minXc = minX + pan.x - stagePadMM;
    let minYc = minY + pan.y - stagePadMM - extraTopMM;
    let vwc = vw + stagePadMM * 2;
    let vhc = vh + stagePadMM * 2;

    // Ensure the full paper width always fits inside the viewBox in autofit.
    // If we zoom in too far (or the window is narrow), vwc can become < paper width,
    // which clips the page. Clamp to at least the paper width + stage padding.
    if (view === 'autofit') {
      const minVwc = box.w + stagePadMM * 2;
      if (vwc < minVwc) {
        vwc = minVwc;
        // Center the paper horizontally with equal stage padding on both sides.
        // Paper spans [0..box.w], so padded span is [-pad..box.w+pad].
        minXc = -stagePadMM + pan.x;
      }
    }

    return { minX: minXc, minY: minYc, vw: vwc, vh: vhc, str: `${minXc} ${minYc} ${vwc} ${vhc}` };
  }, [view, box, guideSets, zoom, pan, previewPxH, DEFAULT_AUTOFIT_ZOOM]);
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

    stripNoExport(clone);

    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'guidelines.svg');
  }

  function exportPdfVector() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    clone.setAttribute('width', `${box.w}mm`);
    clone.setAttribute('height', `${box.h}mm`);

    stripNoExport(clone);

    openSvgPrintWindow(clone, {
      pageWmm: box.w,
      pageHmm: box.h,
      title: 'guidelines',
      autoPrint: true,
      autoClose: true,
    });
  }

  function printToScale() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    clone.setAttribute('width', `${box.w}mm`);
    clone.setAttribute('height', `${box.h}mm`);

    stripNoExport(clone);

    openSvgPrintWindow(clone, {
      pageWmm: box.w,
      pageHmm: box.h,
      title: 'guidelines',
      autoPrint: true,
      autoClose: true,
    });
  }

  /* ---------------- Pan handlers ---------------- */
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mmPerPxX = vb.vw / rect.width;
    const mmPerPxY = vb.vh / rect.height;

    // Pan stage
    const nx = dragRef.current.panX - (e.clientX - dragRef.current.px) * mmPerPxX;
    const ny = dragRef.current.panY - (e.clientY - dragRef.current.py) * mmPerPxY;
    setPan({ x: nx, y: ny });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    setIsPanning(false);
  }

  function resetView() {
    setView('autofit');
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }

  function goToTop() {
    // Goal: match the SAME grey gap you see after "Reset view".
    // Reset view => view='autofit', zoom=DEFAULT_ZOOM, pan={0,0}.
    // We'll compute the autofit extraTopMM using DEFAULT_ZOOM framing (not current view).

    // Current base view (for solving pan in the current mode)
    const cur = computeBaseView();

    // Compute what extraTopMM would be under resetView() conditions.
    // These constants must match computeBaseView():
    const topPadPX = 30;
    const stagePadMM_Auto = 22;

    // Under reset view, zoomForView = DEFAULT_AUTOFIT_ZOOM (=4), and stage pad is 22mm.
    // We only need vh to convert px->mm for the top gap.
    // We'll approximate vh_reset as the current vh if we're already autofit+DEFAULT_AUTOFIT_ZOOM,
    // otherwise recompute it from the guide bounds at zoom = DEFAULT_AUTOFIT_ZOOM.
    let vh_reset = cur.vh;

    // Recompute vh_reset from the guide bounds using zoom = DEFAULT_AUTOFIT_ZOOM (4).
    // This mirrors the autofit branch in computeBaseView but only for vh.
    if (guideSets.length > 0) {
      const fitPad = 8;
      const pts = guideSets.flatMap((guideSet) => [
        ...guideSet.ascLine,
        ...guideSet.waistLine,
        ...guideSet.baseLine,
        ...guideSet.descLine,
      ]);

      const ys = pts.map((p) => p.y);
      const minY0 = Math.min(...ys) - fitPad;
      const maxY0 = Math.max(...ys) + fitPad;

      const vh0 = Math.max(1, maxY0 - minY0);
      vh_reset = vh0 / Math.max(1, DEFAULT_AUTOFIT_ZOOM);
    }

    const baseVhMM_reset = vh_reset + stagePadMM_Auto * 2;
    const mmPerPx_reset = previewPxH > 0 ? baseVhMM_reset / previewPxH : 0;
    const extraTopMM_reset = topPadPX * mmPerPx_reset;

    // After reset view, the viewBox minY is effectively: -extraTopMM_reset (because minY gets clamped to stagePad).
    // So our target for the current viewBox is: minYc_target = -extraTopMM_reset.
    const minYc_target = -extraTopMM_reset;

    // Current vb formula: minYc = cur.minY + pan.y - cur.stagePadMM - cur.extraTopMM
    // Solve for pan.y:
    // pan.y = minYc_target + cur.stagePadMM + cur.extraTopMM - cur.minY
    setPan((p) => ({
      ...p,
      y: minYc_target + cur.stagePadMM + cur.extraTopMM - cur.minY,
    }));
  }





  function adjustZoom(direction: 'in' | 'out') {
    // Only set the origin WHEN LEAVING a non-custom mode.
    // If we're already in custom, keep the existing origin.
    if (view === 'fullpage') setCustomOrigin('fullpage');
    if (view === 'autofit') setCustomOrigin('autofit');

    const currentEffectiveZoom =
      view === 'custom'
        ? zoom
        : view === 'autofit'
          ? DEFAULT_AUTOFIT_ZOOM
          : 1;

    const next =
      direction === 'in'
        ? currentEffectiveZoom * 1.25
        : currentEffectiveZoom / 1.25;

    setView('custom');
    setZoom(clamp(next, 1, 12));
  }



  const centerX = margins.left + (box.w - margins.left - margins.right) / 2;

  return (
    <main className="min-h-screen text-slate-900 relative">
      {/* FULL-VIEWPORT “PAINT OVER” LAYER */}
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      {/* Header */}
      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Calligraphy Tools <span className="text-indigo-600">— Guideline Generator</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate printable guidelines for Copperplate and Textura Quadrata using straight baselines.
          </p>
        </div>
      </header>

      {/* Preview */}
      <section className="px-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">Preview</h3>
                <InfoTip side="right">
                  Drag anywhere to pan. Zoom with ±. Use full page for print-ready output.
                </InfoTip>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">View:</span>
                <select
                  className="p-1.5 text-sm rounded-lg border border-slate-300"
                  value={view}
                  onChange={e => {
                    setView(e.target.value as ViewMode);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <option value="autofit">Auto-fit guidelines</option>
                  <option value="fullpage">Full page</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onMouseDown={e => e.preventDefault()} onClick={() => adjustZoom('out')} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                –
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => adjustZoom('in')} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                +
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={resetView} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                Reset view
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={goToTop} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                Top
              </button>

              <button onMouseDown={e => e.preventDefault()} onClick={downloadSVG} className="ml-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
                SVG
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={exportPdfVector} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
                Export PDF
              </button>
              <span className="text-xs text-slate-500">Opens print dialog (use Save as PDF)</span>
              <button onMouseDown={e => e.preventDefault()} onClick={printToScale} className="px-3 py-1.5 text-sm rounded-lg text-white bg-indigo-600 hover:bg-indigo-500">
                Print
              </button>
            </div>
          </div>

          {/* Darker stage behind paper */}
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className={`block mx-auto w-full h-[38vh] sm:h-[44vh] md:h-[50vh] touch-none ${isPanning ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'}`}
              style={{ background: '#cbd5e1' }}
              preserveAspectRatio={(view === 'fullpage' || (view === 'custom' && customOrigin === 'fullpage')) ? 'xMidYMid meet' : 'xMidYMin meet'}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
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

              <g clipPath="url(#guidesClipBottomOnly)">
                {/* Guides */}
                {script === 'Copperplate' && (
                  <>
                    <CopperplateSlantLines
                      guideSets={guideSets}
                      box={box}
                      slantSpacingMM={slantSpacingMM}
                      slantAngleDeg={slantAngleDeg}
                      slantLineContrast={slantLineContrast}
                      highContrastMode={highContrastMode}
                      swThin={swThin}
                    />
                    {enableSlant2 && (
                      <CopperplateSlantLines
                        guideSets={guideSets}
                        box={box}
                        slantSpacingMM={slantSpacingMM}
                        slantAngleDeg={slantAngle2}
                        slantLineContrast={slantLineContrast}
                        highContrastMode={highContrastMode}
                        swThin={swThin}
                      />
                    )}
                  </>
                )}



                {showCenterLine && (
                  <line
                    x1={centerX}
                    x2={centerX}
                    y1={margins.top}
                    y2={box.h - margins.bottom}
                    stroke="#000"
                    strokeWidth={highContrastMode ? swBold : swThin}
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {guideSets.map((guideSet, index) => {
                  const x1 = guideSet.baseLine[0].x;
                  const x2 = guideSet.baseLine[guideSet.baseLine.length - 1].x;

                  const yMidAsc = midY(guideSet.ascLine, guideSet.waistLine);   // halfway between waist & asc
                  const yMidDesc = midY(guideSet.descLine, guideSet.baseLine);  // halfway between desc & baseline

                  const yTop = guideSet.ascLine[0].y;
                  const yBottom = guideSet.descLine[0].y;

                  const interpunctX = x1 + 3; // 3mm inset from left edge
                  const waistY = guideSet.waistLine[0].y;
                  const baseY = guideSet.baseLine[0].y;
                  const interpunctY = (waistY + baseY) / 2;
                  return (
                    <g key={`guide-${index}`}>
                      {showBaselineIndicator && (
                        <circle
                          cx={interpunctX}
                          cy={interpunctY}
                          r={0.9}
                          fill={baseColor}
                        />
                      )}                    {script === 'Copperplate' && (
                        <>
                          {/* Extra reference lines */}
                          <line
                            x1={x1}
                            x2={x2}
                            y1={yMidAsc}
                            y2={yMidAsc}
                            stroke={hexToRgba('#111827', highContrastMode ? 1 : midlineDashContrast)}

                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray={`6 ${midlineDashGap}`}

                            strokeLinecap="butt"
                            shapeRendering="crispEdges"
                          />

                          <line
                            x1={x1}
                            x2={x2}
                            y1={yMidDesc}
                            y2={yMidDesc}
                            stroke={hexToRgba('#111827', highContrastMode ? 1 : midlineDashContrast)}

                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray={`6 ${midlineDashGap}`}

                            strokeLinecap="butt"
                            shapeRendering="crispEdges"
                          />

                        </>
                      )}

                      <GuideOverlay
                        guideSet={guideSet}
                        style={{
                          thin: swBold * xLineThicknessScale,
                          bold: swBold * xLineThicknessScale,
                          colors: {
                            asc: ascColor,
                            waist: waistColor,
                            base: baseColor,
                            desc: descColor,
                            tick: script === 'Copperplate' ? 'transparent' : '#e2e8f0',
                            frame: 'transparent',
                          },
                          grid: showGridControls
                            ? {
                              thin: swBold * gridThicknessScale,
                              colors: {
                                tick: gridColor,
                              },
                              showHorizontal: showGridHorizontal,
                              showVertical: showGridVertical,
                              showNibAngleGuide,
                              nibAngleDeg: penAngleDeg,
                            }
                            : undefined,
                        }}
                      />

                    </g>
                  );
                })}

              </g>
            </svg>

            <div className="pointer-events-none absolute right-3 bottom-2 text-[13px] text-slate-700 text-right space-y-0.5">
              <div>
                Baselines: {guideSets.length} · Line height: {lineHeight.toFixed(1)} mm · Row gap: {rowGapMM.toFixed(1)} mm · Row step: {rowStepMM.toFixed(1)} mm
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="px-6 py-5 max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 1 — Basics</h2>
            <InfoTip side="right">Guidelines are spaced by x-height + ascender + descender.</InfoTip>
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="font-medium text-slate-700">Paper size</label>
              <select
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={paper}
                onChange={e => {
                  const id = e.target.value as PaperId;
                  setPaper(id);
                  setOrientation(PAPERS_MM[id].defaultOrientation);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {Object.entries(PAPERS_MM).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-medium text-slate-700">Orientation</label>
              <select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={orientation} onChange={e => setOrientation(e.target.value as Orientation)}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-slate-700">Row gap (mm)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={rowGapMM}
                onChange={(e) => setRowGapMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>
          </div>

          <div className="my-3 border-t border-slate-200/70" />

          <div className="grid grid-cols-2 gap-y-4 gap-x-10 mt-4">
            <div className="flex items-center gap-3">
              <label className="w-28 shrink-0 font-medium text-slate-700">Top margin</label>
              <div className="relative flex-1 min-w-0">
                <input
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

            <div className="flex items-center gap-3">
              <label className="w-28 shrink-0 font-medium text-slate-700">Bottom margin</label>
              <div className="relative flex-1 min-w-0">
                <input
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

            <div className="flex items-center gap-3">
              <label className="w-28 shrink-0 font-medium text-slate-700">Left margin</label>
              <div className="relative flex-1 min-w-0">
                <input
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

            <div className="flex items-center gap-3">
              <label className="w-28 shrink-0 font-medium text-slate-700">Right margin</label>
              <div className="relative flex-1 min-w-0">
                <input
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

            <div className="col-span-2">
              <div className="my-2 border-t border-slate-200/70" />
            </div>

            <div className="col-span-2">
              <div className="grid grid-cols-3 gap-4">
                {/* Baseline */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 text-sm font-medium text-slate-700">Baseline</div>
                  <button
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
                  </button>
                </div>

                {/* High-contrast */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 text-sm font-medium text-slate-700">High-contrast</div>
                  <button
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
                  </button>
                </div>

                {/* Center */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 text-sm font-medium text-slate-700">Center</div>
                  <button
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
                  </button>
                </div>
              </div>
            </div>
            <div className="col-span-2">
              <div className="grid grid-cols-2 gap-4 items-center">
                {/* Baseline color */}
                <label className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700">Baseline color</span>
                  <input
                    type="color"
                    className="h-10 w-10 p-0 rounded-md border border-slate-300 bg-white"
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
                    className="h-10 w-10 p-0 rounded-md border border-slate-300 bg-white"
                    value={waistlineColor}
                    onChange={(e) => {
                      setWaistlineColor(e.target.value);
                      setHighContrastMode(false);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="col-span-2">
              <div className="my-3 border-t border-slate-200/70" />
            </div>

            {/* X-line contrast */}
            <div>
              <div className="flex items-center justify-between">
                <label className="font-medium text-slate-700">X-line contrast</label>
                <span className="text-xs text-slate-500">{Math.round((highContrastMode ? 1 : xLineContrast) * 100)}%</span>
              </div>
              <input
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
              <div className="flex items-center justify-between">
                <label className="font-medium text-slate-700">X-line thickness</label>
                <span className="text-xs text-slate-500">{(highContrastMode ? 1.8 : xLineThickness).toFixed(2)}×</span>
              </div>
              <input
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
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 2 — Heights & Guides</h2>
            <InfoTip side="right">
              {script === 'Copperplate'
                ? 'Copperplate uses x-height (mm) with optional calibration for lowercase scale and spacing.'
                : 'Heights are nibs × nib size (mm).'}
            </InfoTip>
          </div>

          {/* Top controls */}
          <div className="mt-3 space-y-3">
            {/* Row 1: Script + X-height (keep 2-up on small screens; collapse only on very narrow) */}
            <div className="grid grid-cols-2 max-[420px]:grid-cols-1 gap-3">
              <div className="flex items-center gap-3">
                <label className="w-28 shrink-0 font-medium text-slate-700">Script</label>
                <div className="flex-1 min-w-0">
                  <select
                    className="w-full p-2 rounded-lg border border-slate-300"
                    value={script}
                    onChange={(e) => setScript(e.target.value as ScriptId)}
                  >
                    <option value="Copperplate">Copperplate</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="TexturaQuadrata">Textura Quadrata</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-28 shrink-0 font-medium text-slate-700">
                  {script === 'Copperplate' ? 'X-height (mm)' : 'x-height (nibs)'}
                </label>

                <div className="flex-1 min-w-0">
                  {script === 'Copperplate' ? (
                    <input
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
                    <input
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
                  <div className="flex items-center gap-3">
                    <label className="w-28 shrink-0 font-medium text-slate-700">Guideline ratio (desc : x : asc)</label>
                    <div className="flex-1 min-w-0">
                      <select
                        className="w-full p-2 rounded-lg border border-slate-300"
                        value={copperplateRatioPreset}
                        onChange={(e) => setCopperplateRatioPreset(e.target.value as CopperplateRatioPreset)}
                      >
                        <option value="2:1:2">2 : 1 : 2</option>
                        <option value="3:2:3">3 : 2 : 3</option>
                        <option value="1:1:1">1 : 1 : 1</option>
                        <option value="custom">Custom…</option>
                      </select>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Ascender/descender scale from x-height.</p>
                </div>

                {copperplateRatioPreset === 'custom' && (
                  <div className="grid grid-cols-2 max-[420px]:grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Desc */}
                    <div>
                      <label className="font-medium text-slate-700">Desc units</label>
                      <input
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
                      <input
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
                      <input
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
                <div className="mt-3 space-y-3">

                  {/* Row 2: nib size / pen angle / grid width / angle guide */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    {/* Nib size */}
                    <div>
                      <label className="font-medium text-slate-700">Nib size (mm)</label>
                      <input
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
                      <select
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                        value={penAngleDeg}
                        onChange={(e) => setPenAngleDeg(parseInt(e.target.value, 10) as 35 | 40 | 45)}
                      >
                        <option value={35}>35°</option>
                        <option value={40}>40°</option>
                        <option value={45}>45°</option>
                      </select>
                    </div>

                    {/* Grid width */}
                    {showGridControls ? (
                      <div>
                        <label className="font-medium text-slate-700">Grid width</label>
                        <select
                          className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                          value={gridWidthMode}
                          onChange={(e) => setGridWidthMode(e.target.value as 'effective' | 'actual')}
                        >
                          <option value="effective">Angled</option>
                          <option value="actual">Actual</option>
                        </select>
                      </div>
                    ) : (
                      <div />
                    )}

                    {/* Angle guide toggle */}
                    {showGridControls ? (
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700">Angle guide</div>
                        <button
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
                        </button>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* Row 3: ascender / descender */}
                  <div className="grid grid-cols-2 max-[420px]:grid-cols-1 gap-3">
                    <div>
                      <label className="font-medium text-slate-700">Ascender (nibs)</label>
                      <input
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
                      <input
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
                </div>
              </>
            )}
          </div>

          <div className="my-3 border-t border-slate-200/70" />

          {/* Sliders (unchanged) */}
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-4">
            {script === 'Copperplate' && (
              <>
                {/* 1st asc/desc dash spacing */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-slate-700">1st asc/desc spacing</label>
                    <span className="text-xs text-slate-500">{midlineDashGap.toFixed(1)} mm</span>
                  </div>
                  <input
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
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-slate-700">1st asc/desc contrast</label>
                    <span className="text-xs text-slate-500">{Math.round((highContrastMode ? 1 : midlineDashContrast) * 100)}%</span>
                  </div>
                  <input
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
    <div className="col-span-2">
      <div className="my-3 border-t border-slate-200/70" />
    </div>

    {/* Slant angle */}
    <div>
      <div className="flex items-center gap-3">
        <label className="w-28 shrink-0 font-medium text-slate-700">Slant angle</label>
        <div className="relative flex-1 min-w-0">
          <input
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
      <div className="flex items-center gap-3">
        <div className="w-28 shrink-0 flex items-center gap-2">
          <label className="font-medium text-slate-700">Slant 2</label>
          <input
            type="checkbox"
            checked={enableSlant2}
            onChange={(e) => setEnableSlant2(e.target.checked)}
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <input
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
      <div className="flex items-center justify-between">
        <label className="font-medium text-slate-700">Slant spacing</label>
        <span className="text-xs text-slate-500">
          {slantSpacingMM.toFixed(1)} mm
        </span>
      </div>
      <input
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
      <div className="flex items-center justify-between">
        <label className="font-medium text-slate-700">Slant contrast</label>
        <span className="text-xs text-slate-500">
          {Math.round((highContrastMode ? 1 : slantLineContrast) * 100)}%
        </span>
      </div>
      <input
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
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-slate-700">Grid contrast</label>
                    <span className="text-xs text-slate-500">{Math.round(gridContrast * 100)}%</span>
                  </div>
                  <input
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
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-slate-700">Grid thickness</label>
                    <span className="text-xs text-slate-500">{gridThickness.toFixed(2)}×</span>
                  </div>
                  <input
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
            <div className="mt-3 grid grid-cols-2 max-[520px]:grid-cols-1 gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700">Horizontal grid lines</div>
                <button
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
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700">Vertical grid lines</div>
                <button
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
                </button>
              </div>
            </div>
          )}
        </div>

      </section>
    </main>
  );
}
