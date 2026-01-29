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
type ViewMode = 'autofit' | 'fullpage';

type Pt = { x: number; y: number };

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);

const CAL_STORAGE_KEY_PREFIX = 'ct_guidelines_calibration_v2_xh_';
const keyForXHeight = (x: number) => `${CAL_STORAGE_KEY_PREFIX}${x.toFixed(1)}`;

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
  const [view, setView] = useState<ViewMode>('fullpage');

  // “next whole 0.5” in the direction of travel
  const stepHalfFrom = (current: number, dir: 1 | -1) => {
    const eps = 1e-9;
    const x2 = current * 2;
    const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
    return next2 / 2;
  };

  const [script, setScript] = useState<ScriptId>('TexturaQuadrata');

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

  const [useCalibration, setUseCalibration] = useState(false);
  const [calWordLowerMM, setCalWordLowerMM] = useState('');
  const [calWordDoubleMM, setCalWordDoubleMM] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userScaleFactor, setUserScaleFactor] = useState(1);
  const [userSpaceFactor, setUserSpaceFactor] = useState(1);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const dragRef = useRef<{
    px: number;
    py: number;
    panX: number;
    panY: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

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
    () => ({ xMM: xHeightMM, ascMM: xHeightMM * 0.5, descMM: xHeightMM * 0.3 }),
    [xHeightMM],
  );

  const guideHeights = script === 'Copperplate' ? copperplateHeights : blackletterHeights;
  const xMM = guideHeights.xMM;
  const ascMM = guideHeights.ascMM;
  const descMM = guideHeights.descMM;

  const swThin = Math.max(0.35, Math.min(0.7, Math.min(box.w, box.h) * 0.0025));
  const swBold = swThin * 1.8;

  const guideTemplate = script === 'Copperplate' ? 'copperplate' : 'blackletter';

  const margins = useMemo(
    () => ({
      top: 12,
      bottom: 12,
      left: 12,
      right: 12,
    }),
    [],
  );

  const lineHeight = ascMM + xMM + descMM;

  const baselinePositions = useMemo(() => {
    if (lineHeight <= 0) return [] as number[];
    const positions: number[] = [];
    const startY = margins.top + ascMM;
    const endY = box.h - margins.bottom - descMM;
    for (let y = startY; y <= endY + 0.0001; y += lineHeight) {
      positions.push(y);
    }
    return positions;
  }, [ascMM, descMM, box.h, lineHeight, margins.top, margins.bottom]);

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

  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const vb = useMemo(() => {
    const stagePadMM = 22;

    let minX: number;
    let minY: number;
    let vw: number;
    let vh: number;

    if (view === 'fullpage' || guideSets.length === 0) {
      vw = box.w / Math.max(1, zoom);
      vh = box.h / Math.max(1, zoom);
      minX = (box.w - vw) / 2;
      minY = (box.h - vh) / 2;
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

      vw = Math.max(1, maxX0 - minX0) / Math.max(1, zoom);
      vh = Math.max(1, maxY0 - minY0) / Math.max(1, zoom);
      minX = cx - vw / 2;
      minY = cy - vh / 2;
    }

    const minXc = minX + pan.x - stagePadMM;
    const minYc = minY + pan.y - stagePadMM;
    const vwc = vw + stagePadMM * 2;
    const vhc = vh + stagePadMM * 2;

    return { minX: minXc, minY: minYc, vw: vwc, vh: vhc, str: `${minXc} ${minYc} ${vwc} ${vhc}` };
  }, [view, box, guideSets, zoom, pan]);

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
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onMouseDown={e => e.preventDefault()} onClick={() => setZoom(z => Math.max(1, z / 1.25))} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                –
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setZoom(z => Math.min(12, z * 1.25))} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                +
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={resetView} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                Reset view
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
              className={`block mx-auto w-full h-[64vh] touch-none ${isPanning ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'}`}
              style={{ background: '#cbd5e1' }}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <defs>
                <clipPath id="pageClip">
                  <rect x={0} y={0} width={box.w} height={box.h} />
                </clipPath>
              </defs>

              {/* stage bg (kept only for on-screen; removed in export) */}
              <rect id="stage-bg" x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />

              {/* Paper */}
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

              <g clipPath="url(#pageClip)">
                {/* Guides */}
                {guideSets.map((guideSet, index) => (
                  <GuideOverlay
                    key={`guide-${index}`}
                    guideSet={guideSet}
                    style={{
                      thin: swThin,
                      bold: swBold,
                      colors: {
                        thin: '#111827',
                        bold: '#111827',
                        tick: '#e2e8f0',
                        frame: '#cbd5e1',
                      },
                    }}
                  />
                ))}
              </g>
            </svg>

            <div className="pointer-events-none absolute right-3 bottom-2 text-[13px] text-slate-700 text-right space-y-0.5">
              <div>
                Baselines: {guideSets.length} · Line height: {lineHeight.toFixed(1)} mm
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="font-medium text-slate-700">Script</label>
              <select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={script} onChange={e => setScript(e.target.value as ScriptId)}>
                <option value="Copperplate">Copperplate</option>
                <option value="Fraktur">Fraktur</option>
                <option value="TexturaQuadrata">Textura Quadrata</option>
              </select>
            </div>

            <div>
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

          {script === 'Copperplate' ? (
            <div className="mt-3 space-y-4">
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
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
