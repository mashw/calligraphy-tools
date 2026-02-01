'use client';

import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import {
  PAPERS_MM,
} from '@/lib/curve-helpers';

import {
  CAL_WORD,
  CAL_WORD_DOUBLE,
  clamp,
} from '@/lib/line-widths';
import { type ScriptId } from '@/lib/scripts';
import { buildGuideSet, BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';
import GuideOverlay from '@/components/preview/GuideOverlay';

type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type ViewMode = 'autofit' | 'fullpage' | 'custom';

type Pt = { x: number; y: number };
type Box = { w: number; h: number };
type GuideSet = ReturnType<typeof buildGuideSet>;

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);

const CAL_STORAGE_KEY_PREFIX = 'ct_guidelines_calibration_v2_xh_';
const keyForXHeight = (x: number) => `${CAL_STORAGE_KEY_PREFIX}${x.toFixed(1)}`;



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

function buildCopperplateSlantLines(guideSets: GuideSet[], box: Box, xHeightMM: number) {
  const first = guideSets[0];
  if (!first) return [];

  const xMin = first.baseLine[0].x;
  const xMax = first.baseLine[first.baseLine.length - 1].x;
  const stepMM = Math.max(xHeightMM * 0.9, 3);

  const lines = buildPageSlantLines({
    boxW: box.w,
    boxH: box.h,
    xMin,
    xMax,
    angleDeg: -55,
    stepMM,
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
  xHeightMM,
  swThin,
}: {
  guideSets: GuideSet[];
  box: Box;
  xHeightMM: number;
  swThin: number;
}) {
  const lines = buildCopperplateSlantLines(guideSets, box, xHeightMM);
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
          stroke="#e2e8f0"
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

function b64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function makeSimplePdfFromJpeg(jpegDataUrl: string, pageWpt: number, pageHpt: number, imgW: number, imgH: number): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const imgBytes = b64ToUint8(base64);

  const EOL = '\n';
  const header = '%PDF-1.4' + EOL;

  const catalog = '1 0 obj' + EOL + '<< /Type /Catalog /Pages 2 0 R >>' + EOL + 'endobj' + EOL;
  const pages = '2 0 obj' + EOL + '<< /Type /Pages /Count 1 /Kids [3 0 R] >>' + EOL + 'endobj' + EOL;

  const page =
    `3 0 obj${EOL}` +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}` +
    `endobj${EOL}`;

  const contentStream = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;

  const contents =
    `5 0 obj${EOL}` +
    `<< /Length ${contentStream.length} >>${EOL}` +
    `stream${EOL}${contentStream}${EOL}endstream${EOL}endobj${EOL}`;

  const imgDict =
    `4 0 obj${EOL}` +
    `<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Width ${imgW} /Height ${imgH} /Length ${imgBytes.byteLength} >>${EOL}` +
    `stream${EOL}`;
  const imgEnd = `${EOL}endstream${EOL}endobj${EOL}`;

  const chunks: (string | Uint8Array)[] = [header];
  let offsetAcc = header.length;
  const xrefOffsets: number[] = [];

  const push = (s: string | Uint8Array) => {
    chunks.push(s);
    offsetAcc += typeof s === 'string' ? s.length : s.byteLength;
  };

  for (const part of [catalog, pages, page, imgDict, imgBytes, imgEnd, contents]) {
    xrefOffsets.push(offsetAcc);
    push(part);
  }

  const xrefStart = offsetAcc;
  let xref = 'xref' + EOL + `0 ${xrefOffsets.length + 1}` + EOL + '0000000000 65535 f ' + EOL;
  for (const off of xrefOffsets) xref += off.toString().padStart(10, '0') + ' 00000 n ' + EOL;

  const trailer =
    'trailer' + EOL + `<< /Size ${xrefOffsets.length + 1} /Root 1 0 R >>` + EOL + 'startxref' + EOL + xrefStart + EOL + '%EOF';

  chunks.push(xref, trailer);

  const blobParts: BlobPart[] = chunks.map((c) => (typeof c === 'string' ? c : c as unknown as BlobPart));
  return new Blob(blobParts, { type: 'application/pdf' });
}

export default function GuidelinesPage() {
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const [view, setView] = useState<ViewMode>('autofit');

  const [showBaselineIndicator, setShowBaselineIndicator] = useState(true);
  const [baselineColor, setBaselineColor] = useState('#111827');
  const [waistlineColor, setWaistlineColor] = useState('#111827');
  const [xLineContrast, setXLineContrast] = useState(1);
  const [xLineThickness, setXLineThickness] = useState(1); // multiplier
  const [highContrastMode, setHighContrastMode] = useState(false);


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








  // “next whole 0.5” in the direction of travel
  const stepHalfFrom = (current: number, dir: 1 | -1) => {
    const eps = 1e-9;
    const x2 = current * 2;
    const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
    return next2 / 2;
  };

  const [script, setScript] = useState<ScriptId>('Copperplate');


  const [xHeightMM, setXHeightMM] = useState(6);
  const [capStyle, setCapStyle] = useState<'simple' | 'flourished'>('flourished');
  const [nibText, setNibText] = useState('2');

  const nibMM = useMemo(() => {
    const v = parseFloat(nibText);
    return Number.isFinite(v) ? v : 2;
  }, [nibText]);
  const [penAngleDeg, setPenAngleDeg] = useState<35 | 40 | 45>(45);
  const [xNib, setXNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.xNib);

  const [ascNib, setAscNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.ascNib);
  const [descNib, setDescNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.descNib);
  const [rowGapMM, setRowGapMM] = useState(6);

  const [useCalibration, setUseCalibration] = useState(false);
  const [calWordLowerMM, setCalWordLowerMM] = useState('');
  const [calWordDoubleMM, setCalWordDoubleMM] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userScaleFactor, setUserScaleFactor] = useState(1);
  const [userSpaceFactor, setUserSpaceFactor] = useState(1);

  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 640px)').matches
    : false));
  const DEFAULT_ZOOM = isNarrow ? 5 : 4;
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const DEFAULT_AUTOFIT_ZOOM = 1.4;
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

  useEffect(() => {
    if (script !== 'Copperplate') {
      setUseCalibration(false);
      setShowAdvanced(false);
    }
  }, [script]);

  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeightMM);
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (!raw) {
        setUseCalibration(false);
        setCalWordLowerMM('');
        setCalWordDoubleMM('');
        setUserScaleFactor(1);
        setUserSpaceFactor(1);
        setShowAdvanced(false);
        return;
      }
      const data = JSON.parse(raw);
      setUseCalibration(!!data.useCalibration);
      setCalWordLowerMM(typeof data.calWordLowerMM === 'string' ? data.calWordLowerMM : '');
      setCalWordDoubleMM(typeof data.calWordDoubleMM === 'string' ? data.calWordDoubleMM : '');
      setUserScaleFactor(typeof data.userScaleFactor === 'number' ? clamp(data.userScaleFactor, 0.7, 1.3) : 1);
      setUserSpaceFactor(typeof data.userSpaceFactor === 'number' ? clamp(data.userSpaceFactor, 0.5, 1.5) : 1);
      setShowAdvanced(false);
    } catch {
      // ignore
    }
  }, [xHeightMM, script]);

  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeightMM);
      const data = {
        useCalibration,
        calWordLowerMM,
        calWordDoubleMM,
        userScaleFactor,
        userSpaceFactor,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch {
      // ignore
    }
  }, [xHeightMM, script, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

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

  const copperplateHeights = useMemo(
    () => ({ xMM: xHeightMM, ascMM: xHeightMM * 2, descMM: xHeightMM * 2 }),
    [xHeightMM],
  );

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

      return buildGuideSet(guideTemplate, {
        baseline,
        xMM,
        ascMM,
        descMM,
        tickStepMM:
          script === 'Copperplate'
            ? Math.max(xMM * 0.9, 3)
            : effectiveNibMM,
        actualNibMM: nibMM,
      });
    });

  }, [baselinePositions, margins.left, margins.right, box.w, guideTemplate, xMM, ascMM, descMM, script, effectiveNibMM, nibMM]);

  const computeBaseView = () => {
    const topPadPX = 30;
    const fitZoom = view === 'autofit' ? DEFAULT_AUTOFIT_ZOOM : 1;
    const zoomForView = view === 'custom' ? zoom : fitZoom;

    // Stage padding:
    // - Full page: ~5px top/bottom (converted into mm)
    // - Autofit: keep the nicer roomy stage pad in mm
    const fullPagePadPX = 5;
    const stagePadMM =
      view === 'fullpage'
        ? (() => {
          // Convert px -> mm using the visible SVG height and the page height.
          // This is "good enough" and stays stable for small margins.
          const pxH = Math.max(1, previewPxH);
          const mmPerPx = box.h / pxH;
          return fullPagePadPX * mmPerPx;
        })()
        : 22;


    let minX: number;
    let minY: number;
    let vw: number;
    let vh: number;

    if (view === 'fullpage' || guideSets.length === 0) {
      // Fullpage should always fit the whole sheet in the preview window.
      vw = box.w;
      vh = box.h;
      minX = 0;
      minY = 0;
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
    const extraTopMM = view === 'autofit' ? topPadPX * mmPerPx : 0;

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
  const MM_TO_PT = 72 / 25.4;

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

  async function downloadPDF() {
    const svg = svgRef.current;
    if (!svg) return;

    const pxPerMM = 8; // enough for clean printing
    const wpx = Math.round(box.w * pxPerMM);
    const hpx = Math.round(box.h * pxPerMM);

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    clone.setAttribute('width', String(box.w));
    clone.setAttribute('height', String(box.h));

    stripNoExport(clone);

    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

    const img = new Image();
    const dataUrl: string = await new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = wpx;
        canvas.height = hpx;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, wpx, hpx);
        ctx.drawImage(img, 0, 0, wpx, hpx);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = reject;
      img.src = url;
    });

    const pdfBlob = makeSimplePdfFromJpeg(dataUrl, box.w * MM_TO_PT, box.h * MM_TO_PT, wpx, hpx);
    downloadBlob(pdfBlob, 'guidelines.pdf');
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

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page{size:${box.w}mm ${box.h}mm;margin:0}
  html,body{height:100%;margin:0;background:#fff}
  body{display:flex;align-items:center;justify-content:center}
  svg{width:${box.w}mm;height:${box.h}mm}
</style>
</head><body>${clone.outerHTML}<script>
  window.onload=()=>{ window.print(); setTimeout(()=>window.close(), 250); }
</script></body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
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
    const { minY, stagePadMM, extraTopMM } = computeBaseView();
    void stagePadMM;
    void extraTopMM;
    setPan((p) => ({ ...p, y: -minY }));
  }

  

  function adjustZoom(direction: 'in' | 'out') {
    // Seed from what the user is currently seeing to avoid a jump:
    // - in autofit, the visible zoom is DEFAULT_AUTOFIT_ZOOM
    // - in fullpage, the visible zoom is 1 (fits whole page)
    // - in custom, the visible zoom is the zoom state
    const currentEffectiveZoom =
      view === 'custom'
        ? zoom
        : view === 'autofit'
          ? DEFAULT_AUTOFIT_ZOOM
          : 1;
  
    const next =
      direction === 'in' ? currentEffectiveZoom * 1.25 : currentEffectiveZoom / 1.25;
  
    setView('custom');
    setZoom(clamp(next, 1, 12));
  }
  
  

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
              <button onMouseDown={e => e.preventDefault()} onClick={downloadPDF} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
                PDF
              </button>
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
              preserveAspectRatio={view === 'fullpage' ? 'xMidYMid meet' : 'xMidYMin meet'}
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
                  <CopperplateSlantLines
                    guideSets={guideSets}
                    box={box}
                    xHeightMM={xHeightMM}
                    swThin={swThin}
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
                            stroke="#111827"
                            strokeWidth={swThin}
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray="6 6"
                          />
                          <line
                            x1={x1}
                            x2={x2}
                            y1={yMidDesc}
                            y2={yMidDesc}
                            stroke="#111827"
                            strokeWidth={swThin}
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray="6 6"
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

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="font-medium text-slate-700">Top margin (mm)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={marginTopMM}
                onChange={(e) => setMarginTopMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>

            <div>
              <label className="font-medium text-slate-700">Bottom margin (mm)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={marginBottomMM}
                onChange={(e) => setMarginBottomMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>

            <div>
              <label className="font-medium text-slate-700">Left margin (mm)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={marginLeftMM}
                onChange={(e) => setMarginLeftMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>

            <div>
              <label className="font-medium text-slate-700">Right margin (mm)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                value={marginRightMM}
                onChange={(e) => setMarginRightMM(parseFloat(e.target.value || '0') || 0)}
              />
            </div>
            <div className="col-span-2">
              <div className="grid grid-cols-2 gap-4">
                {/* Baseline indicator */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Baseline indicator</div>
                    <p className="text-xs text-slate-500">Toggles the interpunct circle marker.</p>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowBaselineIndicator(v => !v)}
                    className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
                      ${showBaselineIndicator ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition ${showBaselineIndicator ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {showBaselineIndicator ? 'On' : 'Off'}
                  </button>
                </div>

                {/* High contrast mode */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">High contrast mode</div>
                    <p className="text-xs text-slate-500">Forces main four lines to thick black for maximum visibility.</p>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setHighContrastMode(v => !v)}
                    className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
                      ${highContrastMode ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition ${highContrastMode ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {highContrastMode ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <div className="grid grid-cols-2 gap-4 items-start">
                <div>
                  <label className="font-medium text-slate-700">Baseline color</label>
                  <input
                    type="color"
                    className="mt-1 w-full h-10 p-1 rounded-lg border border-slate-300 bg-white"
                    value={baselineColor}
                    onChange={(e) => {
                      setBaselineColor(e.target.value);
                      setHighContrastMode(false);
                    }}
                  />
                </div>

                <div>
                  <label className="font-medium text-slate-700">Waistline color</label>
                  <input
                    type="color"
                    className="mt-1 w-full h-10 p-1 rounded-lg border border-slate-300 bg-white"
                    value={waistlineColor}
                    onChange={(e) => {
                      setWaistlineColor(e.target.value);
                      setHighContrastMode(false);
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="sm:col-span-2 grid grid-cols-2 gap-4">
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
                  onChange={(e) => setXLineContrast(parseFloat(e.target.value))}
                  disabled={highContrastMode}
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
                  onChange={(e) => setXLineThickness(parseFloat(e.target.value))}
                  disabled={highContrastMode}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Multiplies the stroke thickness of the main four X-lines.
                </p>
              </div>
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

          <div className="mt-3">
            <label className="font-medium text-slate-700">Script</label>
            <select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={script} onChange={e => setScript(e.target.value as ScriptId)}>
              <option value="Copperplate">Copperplate</option>
              <option value="Fraktur">Fraktur</option>
              <option value="TexturaQuadrata">Textura Quadrata</option>
            </select>
          </div>

          {script === 'Copperplate' ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-medium text-slate-700">X-height (mm)</label>
                  <select
                    className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                    value={xHeightMM}
                    onChange={(e) => setXHeightMM(parseFloat(e.target.value))}
                  >
                    {X_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-700">Capitals</label>
                  <select
                    className="mt-1 w-full p-2 rounded-lg border border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                    value={capStyle}
                    onChange={(e) => setCapStyle(e.target.value as 'simple' | 'flourished')}
                    disabled={useCalibration}
                  >
                    <option value="simple">Simple (body widths)</option>
                    <option value="flourished">Flourished (full widths)</option>
                  </select>
                  {useCalibration && <p className="mt-1 text-[11px] text-slate-400">Disabled while calibration is enabled.</p>}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Calibration (optional)</div>
                    <p className="text-xs text-slate-500">Stored per x-height. Adjusts lowercase scale + spacing.</p>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setUseCalibration((v) => !v)}
                    className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
                      ${useCalibration ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition ${useCalibration ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <span className="h-3 w-3 rounded-full bg-white shadow" />
                    </span>
                    {useCalibration ? 'Calibration: On' : 'Calibration: Off'}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-mono text-indigo-500">{CAL_WORD}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                      placeholder="Lowercase word (mm)"
                      value={calWordLowerMM}
                      onChange={(e) => setCalWordLowerMM(e.target.value)}
                      disabled={!useCalibration}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-mono text-indigo-500">{CAL_WORD_DOUBLE}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                      placeholder="Double word (mm)"
                      value={calWordDoubleMM}
                      onChange={(e) => setCalWordDoubleMM(e.target.value)}
                      disabled={!useCalibration}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-indigo-600 select-none"
                    disabled={!useCalibration}
                  >
                    <span className={`inline-block transform transition-transform ${showAdvanced && useCalibration ? 'rotate-90' : 'rotate-0'}`}>▶</span>
                    <span>Advanced tweaks</span>
                    {!useCalibration && <span className="ml-1 text-[10px] text-slate-400">(enable calibration to adjust)</span>}
                  </button>

                  {showAdvanced && useCalibration && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">Overall scale</span>
                          <span className="font-mono text-slate-500">×{userScaleFactor.toFixed(2)}</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.7"
                          max="1.3"
                          className="w-full p-2 rounded-lg border border-slate-300 text-sm"
                          value={userScaleFactor}
                          onChange={(e) => setUserScaleFactor(clamp(parseFloat(e.target.value || '1') || 1, 0.7, 1.3))}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">Spacing factor</span>
                          <span className="font-mono text-slate-500">×{userSpaceFactor.toFixed(2)}</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.5"
                          max="1.5"
                          className="w-full p-2 rounded-lg border border-slate-300 text-sm"
                          value={userSpaceFactor}
                          onChange={(e) => setUserSpaceFactor(clamp(parseFloat(e.target.value || '1') || 1, 0.5, 1.5))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="font-medium text-slate-700">Nib size (mm)</label>
                <input
                  type="number"
                  step="any"
                  min={0.2}
                  className="mt-1 w-full p-2 rounded-lg border border-slate-300"
                  value={nibText}
                  onWheel={(e) => {
                    // Prevent mouse wheel from stepping this number input
                    (e.currentTarget as HTMLInputElement).blur();
                  }}
                  onChange={(e) => {
                    // Allow free typing (e.g. "3.8", "2.", "")
                    setNibText(e.target.value);
                  }}
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
                    // Validate only (NO snapping)
                    const v = parseFloat(nibText);
                    if (!Number.isFinite(v)) {
                      setNibText('2');
                      return;
                    }
                    setNibText(String(Math.max(0.2, v)));
                  }}
                />

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

              </div>
              <div>
                <label className="font-medium text-slate-700">x-height (nibs)</label>
                <input type="number" step={0.5} min={1} max={8} className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={xNib} onChange={e => setXNib(parseFloat(e.target.value || '5'))} />
              </div>
              <div>
                <label className="font-medium text-slate-700">Ascender (nibs)</label>
                <input type="number" step={0.5} min={0} max={8} className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={ascNib} onChange={e => setAscNib(parseFloat(e.target.value || '3'))} />
              </div>
              <div>
                <label className="font-medium text-slate-700">Descender (nibs)</label>
                <input type="number" step={0.5} min={0} max={8} className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={descNib} onChange={e => setDescNib(parseFloat(e.target.value || '2'))} />
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
          )}
        </div>
      </section>
    </main>
  );
}
