'use client';

import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import {
  PAPERS_MM,
  SCRIPT_DEFAULTS,
  lengthPoly,
  Pt,
  pointAt,
  offset,
  pathD,
} from '@/lib/curve-helpers';

import {
  clamp,
} from '@/lib/line-widths';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';
import type { ScriptContext } from '@/lib/scripts/types';
import { measureRun } from '@/lib/measure/measure-run';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { buildGuideSet } from '@/lib/guides/guide-template';
import GuideOverlay from '@/components/preview/GuideOverlay';

type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type AlignMode = 'start' | 'center' | 'end';
type ViewMode = 'autofit' | 'fullpage' | 'custom';
type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';

const MAIN_DEFAULTS = {
  Fraktur: { radiusMM: 45, nibMMText: '4', nibAngleDeg: 40 as const, xNib: 4.5, ascNib: 2, descNib: 2 },
  TexturaQuadrata: { radiusMM: 45, nibMMText: '4', nibAngleDeg: 45 as const, xNib: 5, ascNib: 2, descNib: 2 },
  Copperplate: { radiusMM: 70, nibMMText: '4', nibAngleDeg: 45 as const, xHeightMMText: '6.0', ratioId: '3:2:3' as const },
};

const CIRCLE_DEFAULTS = {
  Fraktur: { innerRadiusMM: 21, innerScript: 'Fraktur' as const, innerNibMMText: '2', outerRadiusMM: 78, outerScript: 'Fraktur' as const, outerNibMMText: '2' },
  TexturaQuadrata: { innerRadiusMM: 21, innerScript: 'Fraktur' as const, innerNibMMText: '2', outerRadiusMM: 80, outerScript: 'Fraktur' as const, outerNibMMText: '2' },
  Copperplate: { innerRadiusMM: 50, innerScript: 'Copperplate' as const, innerNibMMText: '3.5', outerRadiusMM: 92, outerScript: 'Copperplate' as const, outerNibMMText: '3.5' },
};

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);
const MIDLINE_DASH_GAP = 12;

const CAL_STORAGE_KEY_PREFIX = 'ct_curveplanner_calibration_v2_xh_';
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

type InsetLabeledFieldProps = {
  label: string;
  disabled?: boolean;
  className?: string;
  rightAdornment?: React.ReactNode;
  adornmentClassName?: string;
  children: React.ReactNode;
};

function InsetLabeledField({ label, disabled = false, className = '', rightAdornment, adornmentClassName = 'right-3', children }: InsetLabeledFieldProps) {
  return (
    <div className={`relative rounded-lg border border-slate-300 overflow-hidden ${disabled ? 'bg-slate-50' : 'bg-white'} ${className}`}>
      <div className="absolute inset-x-0 top-0 h-5 bg-slate-50/80 border-b border-slate-300 px-3 flex items-center z-10 pointer-events-none">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
      </div>
      <div className="relative pt-5">
        {children}
        {rightAdornment && (
          <span className={`pointer-events-none select-none absolute ${adornmentClassName} top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500`}>
            {rightAdornment}
          </span>
        )}
      </div>
    </div>
  );
}


const INSET_CONTROL_BASE = 'w-full border-0 rounded-none px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:text-slate-400 disabled:cursor-not-allowed';
const INSET_CONTROL_MM = `${INSET_CONTROL_BASE} pr-10`;
const INSET_CONTROL_WIDE = `${INSET_CONTROL_BASE} pr-14`;
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

export default function CalligramPage() {
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [view, setView] = useState<ViewMode>('fullpage');
  const [customOrigin, setCustomOrigin] = useState<'autofit' | 'fullpage'>('fullpage');

  const snapHalf = (v: number) => Math.round(v * 2) / 2;

  // “next whole 0.5” in the direction of travel
  const stepHalfFrom = (current: number, dir: 1 | -1) => {
    const eps = 1e-9;
    const x2 = current * 2;
    const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
    return next2 / 2;
  };
  const snap05 = (v: number) => Math.round(v / 0.5) * 0.5;

  const [script, setScript] = useState<ScriptId>('TexturaQuadrata');
  const [radiusMM, setRadiusMM] = useState(MAIN_DEFAULTS.TexturaQuadrata.radiusMM);
  const [innerOffsetMM, setInnerOffsetMM] = useState(MAIN_DEFAULTS.TexturaQuadrata.radiusMM - CIRCLE_DEFAULTS.TexturaQuadrata.innerRadiusMM);
  const [outerOffsetMM, setOuterOffsetMM] = useState(
    Math.max(0, CIRCLE_DEFAULTS.TexturaQuadrata.outerRadiusMM - MAIN_DEFAULTS.TexturaQuadrata.radiusMM),
  );

  const [startAngleDeg, setStartAngleDeg] = useState(-90);
  const [direction, setDirection] = useState<'ccw' | 'cw'>('cw');
  const [align, setAlign] = useState<AlignMode>('start');
  const [text, setText] = useState('Merry Christmas');
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');

  const [xHeightMM, setXHeightMM] = useState(parseFloat(MAIN_DEFAULTS.Copperplate.xHeightMMText));
  const [capStyle] = useState<'simple' | 'flourished'>('flourished');
  const [nibText, setNibText] = useState(MAIN_DEFAULTS.TexturaQuadrata.nibMMText);
  const [topBandEnabled, setTopBandEnabled] = useState(false);
  const [bottomBandEnabled, setBottomBandEnabled] = useState(false);
  const [topBandScript, setTopBandScript] = useState<ScriptId>(CIRCLE_DEFAULTS.TexturaQuadrata.innerScript);
  const [bottomBandScript, setBottomBandScript] = useState<ScriptId>(CIRCLE_DEFAULTS.TexturaQuadrata.outerScript);
  const [topBandSizeText, setTopBandSizeText] = useState(CIRCLE_DEFAULTS.TexturaQuadrata.innerNibMMText);
  const [bottomBandSizeText, setBottomBandSizeText] = useState(CIRCLE_DEFAULTS.TexturaQuadrata.outerNibMMText);
  const [copperplateRatioPreset, setCopperplateRatioPreset] = useState<CopperplateRatioPreset>(MAIN_DEFAULTS.Copperplate.ratioId);
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
  const topBandSizeMM = useMemo(() => {
    const v = parseFloat(topBandSizeText);
    return Number.isFinite(v) ? v : nibMM;
  }, [topBandSizeText, nibMM]);
  const bottomBandSizeMM = useMemo(() => {
    const v = parseFloat(bottomBandSizeText);
    return Number.isFinite(v) ? v : nibMM;
  }, [bottomBandSizeText, nibMM]);
  const [penAngleDeg, setPenAngleDeg] = useState<35 | 40 | 45>(MAIN_DEFAULTS.TexturaQuadrata.nibAngleDeg);
  const [xNib, setXNib] = useState(MAIN_DEFAULTS.TexturaQuadrata.xNib);

  const [ascNib, setAscNib] = useState(MAIN_DEFAULTS.TexturaQuadrata.ascNib);
  const [descNib, setDescNib] = useState(MAIN_DEFAULTS.TexturaQuadrata.descNib);

  const [useCalibration, setUseCalibration] = useState(false);
  const [calWordLowerMM, setCalWordLowerMM] = useState('');
  const [calWordDoubleMM, setCalWordDoubleMM] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userScaleFactor, setUserScaleFactor] = useState(1);
  const [userSpaceFactor, setUserSpaceFactor] = useState(1);

  const [showBoxes, setShowBoxes] = useState(false);
  const [showSpanFill, setShowSpanFill] = useState(true);


  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 640px)').matches
    : false));
  const DEFAULT_ZOOM = isNarrow ? 5 : 4;
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const DEFAULT_AUTOFIT_ZOOM = 4;
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [isCurveDragging, setIsCurveDragging] = useState(false);

  const dragRef = useRef<{
    px: number;
    py: number;
    panX: number;
    panY: number;
    mode?: 'pan';
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [previewPxH, setPreviewPxH] = useState(0);

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

  const fs = (mm: number) => mm / Math.max(zoom, 0.001);

  // ---------- Page box (mm) ----------
  const raw = PAPERS_MM[paper];
  const box = useMemo(() => {
    if (orientation === 'landscape' && raw.w < raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    if (orientation === 'portrait' && raw.w > raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    return { w: raw.w, h: raw.h, label: raw.label };
  }, [raw, orientation]);

  // ---------- Derived sizes ----------
  const rad = (penAngleDeg * Math.PI) / 180;
  const effectiveNibMM = useMemo(() => (script === 'Copperplate' ? nibMM : nibMM * Math.cos(rad)), [script, nibMM, rad]);
  const effectiveTopNibMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM : topBandSizeMM * Math.cos(rad)),
    [topBandScript, topBandSizeMM, rad],
  );
  const effectiveBottomNibMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM : bottomBandSizeMM * Math.cos(rad)),
    [bottomBandScript, bottomBandSizeMM, rad],
  );

  const texturaXHeightMM = xNib * nibMM;

  const blackletterHeights = useMemo(
    () => ({ xMM: texturaXHeightMM, ascMM: ascNib * nibMM, descMM: descNib * nibMM }),
    [texturaXHeightMM, ascNib, descNib, nibMM],
  );

  const capMM = script === 'Copperplate'
    ? xHeightMM * 1.05
    : (SCRIPT_DEFAULTS.TexturaQuadrata?.capHeight ?? 7) * nibMM;

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

  // ---------- Measurement (shared) ----------
  const copper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);

    return buildCopperplateContext({
      xHeightMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [xHeightMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const ctx = useMemo<ScriptContext>(() => {
    if (script === 'Copperplate') return copper.ctx;
    return {
      xHeightMM: texturaXHeightMM,
      nibMM: effectiveNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [script, copper.ctx, texturaXHeightMM, effectiveNibMM]);

  const run = useMemo(() => measureRun(text, SCRIPT_PROFILES[script], ctx), [text, script, ctx]);
  const topCopper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);
    return buildCopperplateContext({
      xHeightMM: topBandSizeMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [topBandSizeMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);
  const bottomCopper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);
    return buildCopperplateContext({
      xHeightMM: bottomBandSizeMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [bottomBandSizeMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const topCtx = useMemo<ScriptContext>(() => {
    if (topBandScript === 'Copperplate') return topCopper.ctx;
    return {
      xHeightMM: xNib * topBandSizeMM,
      nibMM: effectiveTopNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [topBandScript, topCopper.ctx, topBandSizeMM, effectiveTopNibMM, xNib]);
  const bottomCtx = useMemo<ScriptContext>(() => {
    if (bottomBandScript === 'Copperplate') return bottomCopper.ctx;
    return {
      xHeightMM: xNib * bottomBandSizeMM,
      nibMM: effectiveBottomNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [bottomBandScript, bottomCopper.ctx, bottomBandSizeMM, effectiveBottomNibMM, xNib]);
  const topRun = useMemo(
    () => measureRun(topText, SCRIPT_PROFILES[topBandScript], topCtx),
    [topText, topBandScript, topCtx],
  );
  const bottomRun = useMemo(
    () => measureRun(bottomText, SCRIPT_PROFILES[bottomBandScript], bottomCtx),
    [bottomText, bottomBandScript, bottomCtx],
  );

  // ---------- Circle geometry ----------
  const circumference = useMemo(() => 2 * Math.PI * Math.max(1, radiusMM), [radiusMM]);
  // Force +theta to move clockwise on screen (y grows downward)
  const dirSign = direction === 'cw' ? 1 : -1;
  const startAngleRad = (startAngleDeg * Math.PI) / 180;

  const buildCircleBaseline = (r: number): Pt[] => {
    const radius = Math.max(1, r);
    const L = 2 * Math.PI * radius;
    const N = Math.max(180, Math.min(1440, Math.round(L)));
    const cx = box.w / 2;
    const cy = box.h / 2;
    const pts: Pt[] = [];
    for (let i = 0; i < N; i++) {
      const s = (i / N) * L;
      const theta = startAngleRad + dirSign * (s / radius);
      pts.push({ x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) });
    }
    return pts;
  };

  const baseline = useMemo<Pt[]>(() => buildCircleBaseline(radiusMM), [box, radiusMM, startAngleRad, dirSign]);

  const avgRadiusFromCenter = (pts: Pt[]) => {
    if (!pts.length) return radiusMM;
    const cx = box.w / 2;
    const cy = box.h / 2;
    return pts.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
  };

  const normalSignForBaseline = (pts: Pt[]) => {
    // We want NEGATIVE offsets to move OUTWARD (bigger radius).
    const test = offset(pts, -1);
    const r0 = avgRadiusFromCenter(pts);
    const r1 = avgRadiusFromCenter(test);
    return (r1 > r0 ? 1 : -1) as 1 | -1;
  };

  const mainNormalSign = useMemo(() => normalSignForBaseline(baseline), [baseline]);

  const arcLen = circumference;
  const wrapLength = (s: number, L: number) => (L > 0 ? ((s % L) + L) % L : 0);
  const pointAtWrapped = (pts: Pt[], s: number, L: number) => pointAt(pts, wrapLength(s, L));
  const guideTemplate = script === 'Copperplate' ? 'copperplate' : 'blackletter';

  const tickStepMM = useMemo(
    () =>
      script === 'Copperplate'
        ? Math.max(xMM * 0.9, 3)
        : effectiveNibMM,
    [script, xMM, effectiveNibMM],
  );




  // ---------- Layout along the curve ----------
  type Place = { ch: string; w: number; h: number; sMid: number };

  const computeLayout = (
    runData: ReturnType<typeof measureRun>,
    bandBaseline: Pt[],
    bandArcLen: number,
    bandXMM: number,
    bandNibMM: number,
    bandCapMM: number,
    scriptId: ScriptId,
  ) => {
    const glyphs = runData.glyphs;

    // Pass 1: place using measured advances
    const placeWithAdvances = (advances: number[]) => {
      const totalAdvance = advances.reduce((a, v) => a + v, 0);
      let s0 = 0;
      if (align === 'center') s0 = Math.max(0, (bandArcLen - totalAdvance) / 2);
      if (align === 'end') s0 = Math.max(0, bandArcLen - totalAdvance);

      const placements: Place[] = [];
      let cursor = s0;
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const adv = advances[i] ?? g.advMM;
        if (g.kind === 'space') {
          cursor += adv;
          continue;
        }

        const w = g.wMM;
        const isCap = g.ch >= 'A' && g.ch <= 'Z';
        const h = isCap ? bandCapMM : bandXMM;

        const mid = cursor + w / 2;
        placements.push({ ch: g.ch, w, h, sMid: mid });
        cursor += adv;
      }

      return { placements, totalAdvance };
    };

    const adv1 = glyphs.map((g) => g.advMM);
    const pass1 = placeWithAdvances(adv1);

    if (pass1.placements.length === 0) {
      const overBy0 = Math.max(0, pass1.totalAdvance - bandArcLen);
      return { placements: pass1.placements, needed: pass1.totalAdvance, overBy: overBy0 };
    }

    if (scriptId === 'Copperplate') {
      const overBy = Math.max(0, pass1.totalAdvance - bandArcLen);
      return { placements: pass1.placements, needed: pass1.totalAdvance, overBy };
    }

    // Pass 2: add a small extra spacing bump on turns (blackletter readability)
    const adv2 = adv1.slice();
    for (let i = 0; i < pass1.placements.length; i++) {
      const pl = pass1.placements[i];
      const sMid = pl.sMid;
      const sL = sMid - pl.w / 2;
      const sR = sMid + pl.w / 2;

      const nL = pointAtWrapped(bandBaseline, sL, bandArcLen).n;
      const nR = pointAtWrapped(bandBaseline, sR, bandArcLen).n;

      const dot = nL.x * nR.x + nL.y * nR.y;
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const turnRad = Math.acos(clampedDot);
      const turnDeg = (turnRad * 180) / Math.PI;

      const THRESH = 6;
      const MAX = 28;
      const t = Math.max(0, Math.min(1, (turnDeg - THRESH) / (MAX - THRESH)));

      const baseBump = bandNibMM * 0.25;
      const heightFactor = 0.6 + 0.4 * Math.min(1, pl.h / bandXMM);
      const extra = t * baseBump * heightFactor;

      // Find the glyph index corresponding to this placement (skip spaces)
      // Conservative: add the bump to the first non-space glyph after this one.
      if (extra > 0) {
        // Locate by counting non-space glyphs.
        let k = 0
        for (let gi = 0; gi < glyphs.length; gi++) {
          if (glyphs[gi].kind === 'space') continue
          if (k === i) {
            if (gi < adv2.length - 1) adv2[gi] += extra
            break
          }
          k += 1
        }
      }
    }

    const pass2 = placeWithAdvances(adv2);
    const overBy = Math.max(0, pass2.totalAdvance - bandArcLen);
    return { placements: pass2.placements, needed: pass2.totalAdvance, overBy };
  };

  const layout = useMemo(() => computeLayout(run, baseline, arcLen, xMM, effectiveNibMM, capMM, script), [run, baseline, arcLen, xMM, effectiveNibMM, capMM, script, align]);

  const span = useMemo(() => {
    if (!layout.placements.length) return null;
    const first = layout.placements[0];
    const last = layout.placements[layout.placements.length - 1];
    const sStart = Math.max(0, first.sMid - first.w / 2);
    const sEnd = last.sMid + last.w / 2;
    return { sStart, sEnd };
  }, [layout, arcLen]);

  const guideSet = useMemo(
    () =>
      buildGuideSet(guideTemplate, {
        baseline,
        xMM,
        ascMM,
        descMM,
        normalSign: mainNormalSign,
        tickStepMM,
        tickAnchorS: span ? span.sStart : undefined,
        actualNibMM: nibMM,
      }),
    [baseline, guideTemplate, xMM, ascMM, descMM, mainNormalSign, tickStepMM, nibMM, span],
  );

  const mainAscTopOffsetMM = useMemo(
    () => Math.abs(avgRadiusFromCenter(guideSet.ascLine) - avgRadiusFromCenter(guideSet.baseLine)),
    [guideSet.ascLine, guideSet.baseLine, box, radiusMM],
  );
  const mainDescBottomOffsetMM = useMemo(
    () => Math.abs(avgRadiusFromCenter(guideSet.descLine) - avgRadiusFromCenter(guideSet.baseLine)),
    [guideSet.descLine, guideSet.baseLine, box, radiusMM],
  );

  const outerOffsetMinMM = useMemo(() => Math.max(0, mainAscTopOffsetMM), [mainAscTopOffsetMM]);
  const outerOffsetMaxMM = 200;
  const clampedOuterOffsetMM = Math.max(outerOffsetMinMM, Math.min(outerOffsetMaxMM, outerOffsetMM));

const topXMM = useMemo(
  () => (topBandScript === 'Copperplate' ? topBandSizeMM : topBandSizeMM * xNib),
  [topBandScript, topBandSizeMM, xNib],
);

// Minimum inward offset so that INNER waistline (baseline + topXMM) cannot exceed
// the MAIN descender-bottom ring (most inner ring of main guides).
// Constraint: (innerRadius + topXMM) <= (radiusMM - mainDescBottomOffsetMM)
// where innerRadius = radiusMM - innerOffset
// => radiusMM - innerOffset + topXMM <= radiusMM - mainDescBottomOffsetMM
// => innerOffset >= topXMM + mainDescBottomOffsetMM
const innerOffsetMinMM = useMemo(
  () => Math.max(0, topXMM + mainDescBottomOffsetMM),
  [topXMM, mainDescBottomOffsetMM],
);

// Maximum inward offset so the inner circle baseline never collapses past a small radius
const innerOffsetMaxMM = useMemo(
  () => Math.max(innerOffsetMinMM, radiusMM - 5),
  [innerOffsetMinMM, radiusMM],
);

const clampedInnerOffsetMM = Math.max(innerOffsetMinMM, Math.min(innerOffsetMM, innerOffsetMaxMM));

useEffect(() => {
  setInnerOffsetMM(prev => Math.max(innerOffsetMinMM, Math.min(prev, innerOffsetMaxMM)));
}, [innerOffsetMinMM, innerOffsetMaxMM]);

  useEffect(() => {
    setOuterOffsetMM(prev => Math.max(outerOffsetMinMM, Math.min(prev, outerOffsetMaxMM)));
  }, [outerOffsetMinMM, outerOffsetMaxMM]);

  const innerRadiusMM = useMemo(() => Math.max(5, radiusMM - clampedInnerOffsetMM), [radiusMM, clampedInnerOffsetMM]);
  const innerRadiusMinMM = 5;
const innerRadiusMaxMM = useMemo(
  () => Math.max(innerRadiusMinMM, radiusMM - innerOffsetMinMM),
  [radiusMM, innerOffsetMinMM],
);

  
  const outerRadiusMM = useMemo(() => Math.max(1, radiusMM + clampedOuterOffsetMM), [radiusMM, clampedOuterOffsetMM]);

  const topBaseline = useMemo<Pt[]>(() => buildCircleBaseline(innerRadiusMM), [box, innerRadiusMM, startAngleRad, dirSign]);
  const innerNormalSign = useMemo(() => normalSignForBaseline(topBaseline), [topBaseline]);
  const topArcLen = useMemo(() => 2 * Math.PI * innerRadiusMM, [innerRadiusMM]);
  const topAscMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM * (2.5 / 2) : topBandSizeMM * ascNib),
    [topBandScript, topBandSizeMM, ascNib],
  );
  const topDescMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM * (2.5 / 2) : topBandSizeMM * descNib),
    [topBandScript, topBandSizeMM, descNib],
  );
  const topCapMM = useMemo(
    () => (topBandScript === 'Copperplate'
      ? topXMM * 1.05
      : (SCRIPT_DEFAULTS.TexturaQuadrata?.capHeight ?? 7) * topBandSizeMM),
    [topBandScript, topXMM, topBandSizeMM],
  );
  const topTickStepMM = useMemo(
    () => (topBandScript === 'Copperplate' ? Math.max(topXMM * 0.9, 3) : effectiveTopNibMM),
    [topBandScript, topXMM, effectiveTopNibMM],
  );
  const topLayout = useMemo(
    () => computeLayout(topRun, topBaseline, topArcLen, topXMM, effectiveTopNibMM, topCapMM, topBandScript),
    [topRun, topBaseline, topArcLen, topXMM, effectiveTopNibMM, topCapMM, topBandScript, align],
  );
  const topSpan = useMemo(() => {
    if (!topLayout.placements.length) return null;
    const first = topLayout.placements[0];
    const last = topLayout.placements[topLayout.placements.length - 1];
    const sStart = first.sMid - first.w / 2;
    const sEnd = last.sMid + last.w / 2;
    return { sStart, sEnd };
  }, [topLayout, topArcLen]);
  const topGuideSet = useMemo(
    () => buildGuideSet(topBandScript === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline: topBaseline,
      xMM: topXMM,
      ascMM: topAscMM,
      descMM: topDescMM,
      normalSign: innerNormalSign,
      tickStepMM: topTickStepMM,
      tickAnchorS: topSpan ? topSpan.sStart : undefined,
      actualNibMM: topBandSizeMM,
    }),
    [topBandScript, topBaseline, topXMM, topAscMM, topDescMM, innerNormalSign, topTickStepMM, topSpan, topBandSizeMM],
  );

  const bottomXMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM : bottomBandSizeMM * xNib),
    [bottomBandScript, bottomBandSizeMM, xNib],
  );
  const bottomAscMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM * (2.5 / 2) : bottomBandSizeMM * ascNib),
    [bottomBandScript, bottomBandSizeMM, ascNib],
  );
  const bottomDescMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM * (2.5 / 2) : bottomBandSizeMM * descNib),
    [bottomBandScript, bottomBandSizeMM, descNib],
  );
  const bottomCapMM = useMemo(
    () => (bottomBandScript === 'Copperplate'
      ? bottomXMM * 1.05
      : (SCRIPT_DEFAULTS.TexturaQuadrata?.capHeight ?? 7) * bottomBandSizeMM),
    [bottomBandScript, bottomXMM, bottomBandSizeMM],
  );
  const bottomBaseline = useMemo<Pt[]>(() => buildCircleBaseline(outerRadiusMM), [box, outerRadiusMM, startAngleRad, dirSign]);
  const outerNormalSign = useMemo(() => normalSignForBaseline(bottomBaseline), [bottomBaseline]);
  const bottomArcLen = useMemo(() => 2 * Math.PI * outerRadiusMM, [outerRadiusMM]);
  const bottomTickStepMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? Math.max(bottomXMM * 0.9, 3) : effectiveBottomNibMM),
    [bottomBandScript, bottomXMM, effectiveBottomNibMM],
  );
  const bottomLayout = useMemo(
    () => computeLayout(bottomRun, bottomBaseline, bottomArcLen, bottomXMM, effectiveBottomNibMM, bottomCapMM, bottomBandScript),
    [bottomRun, bottomBaseline, bottomArcLen, bottomXMM, effectiveBottomNibMM, bottomCapMM, bottomBandScript, align],
  );
  const bottomSpan = useMemo(() => {
    if (!bottomLayout.placements.length) return null;
    const first = bottomLayout.placements[0];
    const last = bottomLayout.placements[bottomLayout.placements.length - 1];
    const sStart = first.sMid - first.w / 2;
    const sEnd = last.sMid + last.w / 2;
    return { sStart, sEnd };
  }, [bottomLayout, bottomArcLen]);
  const bottomGuideSet = useMemo(
    () => buildGuideSet(bottomBandScript === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline: bottomBaseline,
      xMM: bottomXMM,
      ascMM: bottomAscMM,
      descMM: bottomDescMM,
      normalSign: outerNormalSign,
      tickStepMM: bottomTickStepMM,
      tickAnchorS: bottomSpan ? bottomSpan.sStart : undefined,
      actualNibMM: bottomBandSizeMM,
    }),
    [bottomBandScript, bottomBaseline, bottomXMM, bottomAscMM, bottomDescMM, outerNormalSign, bottomTickStepMM, bottomSpan, bottomBandSizeMM],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const rBase = avgRadiusFromCenter(guideSet.baseLine);
    const rWaist = avgRadiusFromCenter(guideSet.waistLine);
    const rAsc = avgRadiusFromCenter(guideSet.ascLine);
    const rDesc = avgRadiusFromCenter(guideSet.descLine);
    console.log('main radii', { rDesc, rBase, rWaist, rAsc });
  }, [guideSet]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const rBase = avgRadiusFromCenter(topGuideSet.baseLine);
    const rWaist = avgRadiusFromCenter(topGuideSet.waistLine);
    const rAsc = avgRadiusFromCenter(topGuideSet.ascLine);
    const rDesc = avgRadiusFromCenter(topGuideSet.descLine);
    console.log('inner radii', { rDesc, rBase, rWaist, rAsc });
  }, [topGuideSet]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const rBase = avgRadiusFromCenter(bottomGuideSet.baseLine);
    const rWaist = avgRadiusFromCenter(bottomGuideSet.waistLine);
    const rAsc = avgRadiusFromCenter(bottomGuideSet.ascLine);
    const rDesc = avgRadiusFromCenter(bottomGuideSet.descLine);
    console.log('outer radii', { rDesc, rBase, rWaist, rAsc });
  }, [bottomGuideSet]);

  const midAscPts = useMemo(() => {
    if (script !== 'Copperplate' || ascMM <= 0) return null;
    return offset(baseline, -(xMM + ascMM * 0.5));
  }, [script, baseline, xMM, ascMM]);

  const midDescPts = useMemo(() => {
    if (script !== 'Copperplate' || descMM <= 0) return null;
    return offset(baseline, descMM * 0.5);
  }, [script, baseline, descMM]);






  const spanPoly = useMemo(() => {
    if (!span) return null;

    // sample density (mm along arc)
    const ds =
      script === 'Copperplate'
        ? Math.max(0.5, xMM * 0.2)
        : Math.max(0.5, effectiveNibMM * 0.5);

    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];

    for (let s = span.sStart; s <= span.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAtWrapped(baseline, s, arcLen);
      basePts.push({ x: p.x, y: p.y });
      waistPts.push({ x: p.x - n.x * xMM * mainNormalSign, y: p.y - n.y * xMM * mainNormalSign });
    }

    if (basePts.length < 2 || waistPts.length < 2) return null;

    // polygon: waist forward, baseline back
    return [...waistPts, ...basePts.reverse()];
  }, [span, script, xMM, effectiveNibMM, baseline, arcLen, mainNormalSign]);

  const topHasText = topText.trim().length > 0;
  const bottomHasText = bottomText.trim().length > 0;

  const topSpanPoly = useMemo(() => {
    if (!topSpan || !topBandEnabled || !topHasText || !topLayout.placements.length) return null;
    const ds = topBandScript === 'Copperplate' ? Math.max(0.5, topXMM * 0.2) : Math.max(0.5, effectiveTopNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = topSpan.sStart; s <= topSpan.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAtWrapped(topBaseline, s, topArcLen);
      basePts.push({ x: p.x, y: p.y });
      waistPts.push({ x: p.x - n.x * topXMM * innerNormalSign, y: p.y - n.y * topXMM * innerNormalSign });
    }
    return { waistPts, basePts };
  }, [topSpan, topBandEnabled, topHasText, topLayout.placements.length, topBandScript, topXMM, innerNormalSign, effectiveTopNibMM, topBaseline, topArcLen]);

  const bottomSpanPoly = useMemo(() => {
    if (!bottomSpan || !bottomBandEnabled || !bottomHasText || !bottomLayout.placements.length) return null;
    const ds = bottomBandScript === 'Copperplate' ? Math.max(0.5, bottomXMM * 0.2) : Math.max(0.5, effectiveBottomNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = bottomSpan.sStart; s <= bottomSpan.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAtWrapped(bottomBaseline, s, bottomArcLen);
      basePts.push({ x: p.x, y: p.y });
      waistPts.push({ x: p.x - n.x * bottomXMM * outerNormalSign, y: p.y - n.y * bottomXMM * outerNormalSign });
    }
    return { waistPts, basePts };
  }, [bottomSpan, bottomBandEnabled, bottomHasText, bottomLayout.placements.length, bottomBandScript, bottomXMM, outerNormalSign, effectiveBottomNibMM, bottomBaseline, bottomArcLen]);

  const baselineLength = arcLen;
  const overWarn = layout.overBy > 0;

  const renderLetterBoxes = (
    placements: Place[],
    baseGuideLine: Pt[],
    waistGuideLine: Pt[],
    bandArcLen: number,
    bandHeightMM: number,
    scriptId: ScriptId,
    keyPrefix: string,
  ) => placements.map((pl, i) => {
    const sMid = pl.sMid;
    const halfW = pl.w / 2;
    const h = bandHeightMM;

    const sL = Math.max(0, Math.min(bandArcLen, sMid - halfW));
    const sR = Math.max(0, Math.min(bandArcLen, sMid + halfW));

    const steps = Math.max(16, Math.ceil((sR - sL) / 2));
    const isCopper = scriptId === 'Copperplate';
    const wrap01 = (u: number) => ((u % 1) + 1) % 1;
    const SLANT_DEG = 55;
    const dx = bandHeightMM / Math.tan((SLANT_DEG * Math.PI) / 180);
    const pointAtByU = (pts: Pt[], u: number) => {
      const L = lengthPoly(pts);
      return pointAt(pts, wrapLength(u * L, L));
    };

    const basePts: { x: number; y: number }[] = [];
    const waistPts: { x: number; y: number }[] = [];

    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const s = sL + (sR - sL) * u;
      const uNorm = wrap01(s / bandArcLen);
      const uTop = isCopper ? wrap01((s + dx) / bandArcLen) : wrap01(uNorm);

      basePts.push(pointAtByU(baseGuideLine, wrap01(uNorm)).p);
      waistPts.push(pointAtByU(waistGuideLine, uTop).p);
    }

    const isCap = pl.ch >= 'A' && pl.ch <= 'Z';
    const fillCol = isCap ? 'rgba(99,102,241,0.10)' : 'rgba(16,185,129,0.10)';
    const strokeCol = isCap ? '#6366f1' : '#10b981';
    const boxPathD = (() => {
      const top = waistPts.map((pt) => `${pt.x},${pt.y}`).join(' L ');
      const bot = [...basePts].reverse().map((pt) => `${pt.x},${pt.y}`).join(' L ');
      return `M ${top} L ${bot} Z`;
    })();

    return (
      <g key={`${keyPrefix}-${i}`}>
        <path
          d={boxPathD}
          fill={fillCol}
          stroke={strokeCol}
          strokeWidth={swThin}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  });

  const getGuideCenter = () => {
    const pts = [
      ...guideSet.ascLine,
      ...guideSet.waistLine,
      ...guideSet.baseLine,
      ...guideSet.descLine,
    ];
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  };

  const computeBaseViewFor = (
    viewArg: ViewMode,
    zoomArg: number,
    originArg: 'autofit' | 'fullpage',
  ) => {
    const topPadPX = 30;
    const padMode: 'autofit' | 'fullpage' =
      viewArg === 'custom' ? originArg : (viewArg === 'fullpage' ? 'fullpage' : 'autofit');

    const fitZoom = viewArg === 'autofit' ? DEFAULT_AUTOFIT_ZOOM : 1;
    const zoomForView = viewArg === 'custom' ? zoomArg : fitZoom;

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

    if (padMode === 'fullpage') {
      if (viewArg === 'custom') {
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
      const pts = [
        ...guideSet.ascLine,
        ...guideSet.waistLine,
        ...guideSet.baseLine,
        ...guideSet.descLine,
      ];
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

  const computeBaseView = () => computeBaseViewFor(view, zoom, customOrigin);

  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const vb = useMemo(() => {
    const { minX, minY, vw, vh, stagePadMM, extraTopMM } = computeBaseView();

    let minXc = minX + pan.x - stagePadMM;
    let minYc = minY + pan.y - stagePadMM - extraTopMM;
    let vwc = vw + stagePadMM * 2;
    let vhc = vh + stagePadMM * 2;

    if (view === 'autofit') {
      const minVwc = box.w + stagePadMM * 2;
      if (vwc < minVwc) {
        vwc = minVwc;
        minXc = -stagePadMM + pan.x;
      }
    }

    return { minX: minXc, minY: minYc, vw: vwc, vh: vhc, str: `${minXc} ${minYc} ${vwc} ${vhc}` };
  }, [view, box, guideSet, zoom, pan, previewPxH, DEFAULT_AUTOFIT_ZOOM, customOrigin]);


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

    bakeExportStrokes(svg, clone, box.w);
    stripNoExport(clone);

    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'curved-title.svg');
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
    clone.setAttribute('width', String(wpx));
    clone.setAttribute('height', String(hpx));

    bakeExportStrokes(svg, clone, box.w);
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
    downloadBlob(pdfBlob, 'curved-title.pdf');
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

  /* ---------------- Pan & Curve Drag handlers ---------------- */
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, panX: pan.x, panY: pan.y, mode: 'pan' };
    setIsCurveDragging(false);
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
    setIsCurveDragging(false);

  }

  function applyDefaultsForScript(nextScript: ScriptId) {
    const main = MAIN_DEFAULTS[nextScript];
    const circles = CIRCLE_DEFAULTS[nextScript];

    setScript(nextScript);
    setRadiusMM(main.radiusMM);
    setNibText(main.nibMMText);
    setPenAngleDeg(main.nibAngleDeg);

    if (nextScript === 'Copperplate') {
      const copper = MAIN_DEFAULTS.Copperplate;
      setXHeightMM(parseFloat(copper.xHeightMMText));
      setCopperplateRatioPreset(copper.ratioId);
    } else if (nextScript === 'Fraktur') {
      const blackletter = MAIN_DEFAULTS.Fraktur;
      setXNib(blackletter.xNib);
      setAscNib(blackletter.ascNib);
      setDescNib(blackletter.descNib);
    } else {
      const blackletter = MAIN_DEFAULTS.TexturaQuadrata;
      setXNib(blackletter.xNib);
      setAscNib(blackletter.ascNib);
      setDescNib(blackletter.descNib);
    }

    setInnerOffsetMM(Math.max(0, main.radiusMM - circles.innerRadiusMM));
    setOuterOffsetMM(Math.max(0, circles.outerRadiusMM - main.radiusMM));
    setTopBandScript(circles.innerScript);
    setTopBandSizeText(circles.innerNibMMText);
    setBottomBandScript(circles.outerScript);
    setBottomBandSizeText(circles.outerNibMMText);
  }

  function applyViewPreset(nextView: ViewMode) {
    setView(nextView);
    setPan({ x: 0, y: 0 });
  }

  function adjustZoom(direction: 'in' | 'out') {
    const nextOrigin =
      view === 'fullpage' ? 'fullpage' : (view === 'autofit' ? 'autofit' : customOrigin);
    setCustomOrigin(nextOrigin);

    const currentEffectiveZoom =
      view === 'custom'
        ? zoom
        : view === 'autofit'
          ? DEFAULT_AUTOFIT_ZOOM
          : 1;

    const step = view === 'autofit' ? 1.10 : 1.25;

    const nextZoom =
      direction === 'in'
        ? currentEffectiveZoom * step
        : currentEffectiveZoom / step;

    const { cx, cy } = getGuideCenter();
    const { minX, minY, vw, vh, stagePadMM, extraTopMM } = computeBaseViewFor(
      'custom',
      nextZoom,
      nextOrigin,
    );
    const vwc = vw + stagePadMM * 2;
    const vhc = vh + stagePadMM * 2;

    const panX = (cx - vwc / 2) - (minX - stagePadMM);
    const panY = (cy - vhc / 2) - (minY - stagePadMM - extraTopMM);

    setView('custom');
    setZoom(nextZoom);
    setPan({ x: panX, y: panY });
  }


  return (
    <main className="min-h-screen text-sm text-slate-900 relative">
      {/* FULL-VIEWPORT “PAINT OVER” LAYER */}
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      {/* Header */}
      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Calligraphy Tools <span className="text-indigo-600">— Calligram Planner</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan circular calligrams for Copperplate and Textura Quadrata. Letters stay upright; guides follow the circle.
          </p>
        </div>
      </header>

      {/* Preview */}
      <section className="px-6">




        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-start gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">Preview</h3>
                <InfoTip side="right">
                  Drag anywhere to pan. Zoom with ±.
                </InfoTip>
              </div>
              <div className="flex items-center gap-2">
  
  <select
    className="p-1.5 text-sm rounded-lg border border-slate-300"
    value={view}
    onChange={e => {
      applyViewPreset(e.target.value as ViewMode);
    }}
  >
    <option value="autofit">Auto-fit circle</option>
    <option value="fullpage">Full page / envelope</option>
    <option value="custom">Custom</option>
  </select>
</div>

            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => adjustZoom('out')}
                className="shrink-0 px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                –
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => adjustZoom('in')}
                className="shrink-0 px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                +
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => applyViewPreset('autofit')}
                className="shrink-0 px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                Reset view
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={downloadSVG}
                className="shrink-0 ml-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                SVG
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={downloadPDF}
                className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                PDF
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={printToScale}
                className="shrink-0 px-3 py-1.5 text-sm rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                Print
              </button>
            </div>
          </div>


          {/* Darker stage behind paper */}
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className="block mx-auto w-full h-[38vh] sm:h-[44vh] md:h-[50vh] touch-none cursor-grab active:cursor-grabbing"
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
              </defs>

              {/* stage bg (kept only for on-screen; removed in export) */}
              <rect id="stage-bg" x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />

              {/* Paper */}
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

              <g clipPath="url(#pageClip)">
                {midAscPts && (
                  <path
                    d={pathD(midAscPts)}
                    fill="none"
                    stroke="rgba(17, 24, 39, 0.35)"
                    strokeWidth={0.9}
                    strokeDasharray={`10 ${MIDLINE_DASH_GAP}`}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                  />
                )}
                {midDescPts && (
                  <path
                    d={pathD(midDescPts)}
                    fill="none"
                    stroke="rgba(17, 24, 39, 0.35)"
                    strokeWidth={0.9}
                    strokeDasharray={`10 ${MIDLINE_DASH_GAP}`}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                  />
                )}
                {/* Guides */}
                <GuideOverlay
                  guideSet={guideSet}
                  style={{
                    thin: swBold,
                    bold: swBold,
                    colors: {
                      thin: isCurveDragging ? '#7c3aed' : '#111827',
                      bold: isCurveDragging ? '#7c3aed' : '#111827',
                      tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                      frame: '#cbd5e1',
                    },
                  }}
                />

                {topBandEnabled && (
                  <GuideOverlay
                    guideSet={topGuideSet}
                    style={{
                      thin: swBold,
                      bold: swBold,
                      colors: {
                        thin: isCurveDragging ? '#7c3aed' : '#111827',
                        bold: isCurveDragging ? '#7c3aed' : '#111827',
                        tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                        frame: '#cbd5e1',
                      },
                    }}
                  />
                )}

                {bottomBandEnabled && (
                  <GuideOverlay
                    guideSet={bottomGuideSet}
                    style={{
                      thin: swBold,
                      bold: swBold,
                      colors: {
                        thin: isCurveDragging ? '#7c3aed' : '#111827',
                        bold: isCurveDragging ? '#7c3aed' : '#111827',
                        tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                        frame: '#cbd5e1',
                      },
                    }}
                  />
                )}

                {showSpanFill && spanPoly && (
                  <>
                    <path
                      d={pathD(spanPoly)}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={pathD(spanPoly)}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                    />
                  </>
                )}
                {showSpanFill && topSpanPoly && (
                  <>
                    <path
                      d={`M ${topSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${topSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${topSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${topSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                    />
                  </>
                )}

                {showSpanFill && bottomSpanPoly && (
                  <>
                    <path
                      d={`M ${bottomSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${bottomSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${bottomSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${bottomSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                    />
                  </>
                )}

                {/* Letter boxes: true rectangles */}
                {showBoxes && renderLetterBoxes(layout.placements, guideSet.baseLine, guideSet.waistLine, arcLen, xMM, script, 'main')}
                {showBoxes && topBandEnabled && renderLetterBoxes(topLayout.placements, topGuideSet.baseLine, topGuideSet.waistLine, topArcLen, topXMM, topBandScript, 'top')}
                {showBoxes && bottomBandEnabled && renderLetterBoxes(bottomLayout.placements, bottomGuideSet.baseLine, bottomGuideSet.waistLine, bottomArcLen, bottomXMM, bottomBandScript, 'bottom')}

                <circle cx={box.w / 2} cy={box.h / 2} r={1.6} fill="#000000" />
              </g>
            </svg>

            <div className="pointer-events-none absolute right-3 bottom-2 text-[13px] text-slate-700 text-right space-y-0.5">
              {overWarn && <div className="text-[13px] text-red-600 font-medium">Title exceeds circle</div>}
              <div>
                Circle length: {baselineLength.toFixed(1)} mm · Script length: {run.totalAdvanceMM.toFixed(1)} mm
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="px-6 py-5 max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 1 — Basics</h2>
            <InfoTip side="right">Circle is fixed at page center.</InfoTip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div className="sm:col-span-2">
              <InsetLabeledField label="Script">
                <select className={INSET_CONTROL_BASE} value={script} onChange={e => applyDefaultsForScript(e.target.value as ScriptId)}>
                  <option value="Copperplate">Copperplate</option>
                  <option value="Fraktur">Fraktur</option>
                  <option value="TexturaQuadrata">Textura Quadrata</option>
                </select>
              </InsetLabeledField>
            </div>

            <div>
              <InsetLabeledField label="Paper size">
                <select
                  className={INSET_CONTROL_BASE}
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
              </InsetLabeledField>
            </div>

            <div>
              <InsetLabeledField label="Orientation">
                <select className={INSET_CONTROL_BASE} value={orientation} onChange={e => setOrientation(e.target.value as Orientation)}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </InsetLabeledField>
            </div>

            <div className="sm:col-span-2">
              <div className="my-3 border-t border-slate-200/70" />
            </div>

            <div className="sm:col-span-2">
              <InsetLabeledField label="Radius">
                <div className="px-3 py-2">
                  <input
                    type="range"
                    min={10}
                    max={Math.max(10, Math.floor(Math.min(box.w, box.h) / 2) - 4)}
                    step={1}
                    value={radiusMM}
                    onChange={e => setRadiusMM(Math.max(10, Number(e.target.value) || 10))}
                    className="w-full"
                  />
                  <div className="text-xs font-medium text-slate-500 mt-1">{radiusMM} mm</div>
                </div>
              </InsetLabeledField>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 2 — Script Options</h2>
            <InfoTip side="right">
              {script === 'Copperplate'
                ? 'Copperplate uses x-height (mm).'
                : 'Heights are nibs × nib size (mm).'}
            </InfoTip>
          </div>

          {script === 'Copperplate' ? (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <InsetLabeledField label="X-height" rightAdornment="mm">
                    <select
                      className={INSET_CONTROL_MM}
                      value={xHeightMM}
                      onChange={(e) => setXHeightMM(parseFloat(e.target.value))}
                    >
                      {X_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v.toFixed(1)}
                        </option>
                      ))}
                    </select>
                  </InsetLabeledField>
                </div>
                <InsetLabeledField label="Guideline ratio (desc : x : asc)">
                <select
                  className={INSET_CONTROL_BASE}
                  value={copperplateRatioPreset}
                  onChange={(e) => setCopperplateRatioPreset(e.target.value as CopperplateRatioPreset)}
                >
                  <option value="2:1:2">2 : 1 : 2 (default)</option>
                  <option value="3:2:3">3 : 2 : 3</option>
                  <option value="1:1:1">1 : 1 : 1</option>
                  <option value="custom">Custom…</option>
                </select>
                </InsetLabeledField>
              </div>


              {copperplateRatioPreset === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <InsetLabeledField label="Desc units">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateDescUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateDescUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateDescUnits(Math.max(0, parsed));
                        }
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
                    </InsetLabeledField>
                  </div>
                  <div>
                    <InsetLabeledField label="X units">
                    <input
                      type="number"
                      min={0.5}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateXUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateXUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateXUnits(Math.max(0.1, parsed));
                        }
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
                    </InsetLabeledField>
                  </div>
                  <div>
                    <InsetLabeledField label="Asc units">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateAscUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateAscUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateAscUnits(Math.max(0, parsed));
                        }
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
                    </InsetLabeledField>
                  </div>
                </div>
              )}


            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <InsetLabeledField label="Nib size" rightAdornment="mm">
                  <input
                    type="number"
                    step="any"
                    min={0.2}
                    className={INSET_CONTROL_MM}
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
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="x-height (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <input type="number" step={0.5} min={1} max={8} className={INSET_CONTROL_WIDE} value={xNib} onChange={e => setXNib(parseFloat(e.target.value || '5'))} />
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="Ascender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <input type="number" step={0.5} min={0} max={8} className={INSET_CONTROL_WIDE} value={ascNib} onChange={e => setAscNib(parseFloat(e.target.value || '3'))} />
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="Descender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <input type="number" step={0.5} min={0} max={8} className={INSET_CONTROL_WIDE} value={descNib} onChange={e => setDescNib(parseFloat(e.target.value || '2'))} />
                </InsetLabeledField>
              </div>
              <div className="col-span-2">
                <InsetLabeledField label="Nib angle (°)">
                <select
                  className={INSET_CONTROL_BASE}
                  value={penAngleDeg}
                  onChange={(e) => setPenAngleDeg(parseInt(e.target.value, 10) as 35 | 40 | 45)}
                >
                  <option value={35}>35°</option>
                  <option value={40}>40°</option>
                  <option value={45}>45°</option>
                </select>
                </InsetLabeledField>
              </div>
            </div>
          )}

          <div className="my-3 border-t border-slate-200/70" />
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-700">Inner circle</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={topBandEnabled} onChange={e => setTopBandEnabled(e.target.checked)} aria-label="Inner circle" />
                  <span className="w-9 h-5 bg-slate-300 rounded-full transition-colors peer-checked:bg-indigo-600" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
                <div className="ml-auto flex items-center gap-2 min-w-[14rem]">
                  <span className="text-xs text-slate-600">Radius</span>
                  <input
  type="range"
  min={innerRadiusMinMM}
  max={innerRadiusMaxMM}
  step={0.5}
  value={innerRadiusMM}
  onChange={e => {
    const r = Number(e.target.value) || innerRadiusMinMM;
    const nextOffset = radiusMM - r; // larger radius => smaller inward offset
    setInnerOffsetMM(Math.max(innerOffsetMinMM, Math.min(nextOffset, innerOffsetMaxMM)));
  }}
  disabled={!topBandEnabled}
  className="w-full disabled:opacity-50"
/>
<span className="text-xs font-medium text-slate-500 w-[3.5rem] text-right">{innerRadiusMM.toFixed(1)} mm</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InsetLabeledField label="Script" disabled={!topBandEnabled}>
                  <select
                    className={INSET_CONTROL_BASE}
                    value={topBandScript}
                    onChange={e => setTopBandScript(e.target.value as ScriptId)}
                    disabled={!topBandEnabled}
                  >
                    <option value="TexturaQuadrata">TexturaQuadrata</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="Copperplate">Copperplate</option>
                  </select>
                </InsetLabeledField>
                <InsetLabeledField label={topBandScript === 'Copperplate' ? 'x-height' : 'Nib size'} disabled={!topBandEnabled} rightAdornment="mm">
                    <input
                      type="number"
                      step="any"
                      min={0.2}
                      className={INSET_CONTROL_MM}
                      value={topBandSizeText}
                      onChange={e => setTopBandSizeText(e.target.value)}
                      disabled={!topBandEnabled}
                    />
                </InsetLabeledField>
              </div>
            </div>

            <div className="my-3 border-t border-slate-200/70" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-700">Outer circle</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={bottomBandEnabled} onChange={e => setBottomBandEnabled(e.target.checked)} aria-label="Outer circle" />
                  <span className="w-9 h-5 bg-slate-300 rounded-full transition-colors peer-checked:bg-indigo-600" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
                <div className="ml-auto flex items-center gap-2 min-w-[14rem]">
                  <span className="text-xs text-slate-600">Radius</span>
                  <input
                    type="range"
                    min={radiusMM + outerOffsetMinMM}
                    max={radiusMM + outerOffsetMaxMM}
                    step={0.5}
                    value={outerRadiusMM}
                    onChange={e => {
                      const r = Number(e.target.value) || radiusMM + outerOffsetMinMM;
                      const nextOffset = r - radiusMM;
                      setOuterOffsetMM(Math.max(outerOffsetMinMM, Math.min(nextOffset, outerOffsetMaxMM)));
                    }}
                    disabled={!bottomBandEnabled}
                    className="w-full disabled:opacity-50"
                  />
                  <span className="text-xs font-medium text-slate-500 w-[3.5rem] text-right">{outerRadiusMM.toFixed(1)} mm
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InsetLabeledField label="Script" disabled={!bottomBandEnabled}>
                  <select
                    className={INSET_CONTROL_BASE}
                    value={bottomBandScript}
                    onChange={e => setBottomBandScript(e.target.value as ScriptId)}
                    disabled={!bottomBandEnabled}
                  >
                    <option value="TexturaQuadrata">TexturaQuadrata</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="Copperplate">Copperplate</option>
                  </select>
                </InsetLabeledField>
                <InsetLabeledField label={bottomBandScript === 'Copperplate' ? 'x-height' : 'Nib size'} disabled={!bottomBandEnabled} rightAdornment="mm">
                    <input
                      type="number"
                      step="any"
                      min={0.2}
                      className={INSET_CONTROL_MM}
                      value={bottomBandSizeText}
                      onChange={e => setBottomBandSizeText(e.target.value)}
                      disabled={!bottomBandEnabled}
                    />
                </InsetLabeledField>
              </div>
            </div>
          </div>
        </div>


        {/* Step 3 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 3 — Text Fit Guide</h2>
            <InfoTip side="right">Check text fit and preview overlays.</InfoTip>
          </div>

          <div className="grid grid-cols-1 gap-4 mt-3 select-none">
            <InsetLabeledField label="Title text">
              <input className={INSET_CONTROL_BASE} value={text} onChange={e => setText(e.target.value)} />
            </InsetLabeledField>

            {topBandEnabled && (
              <InsetLabeledField label="Inner text">
                <input className={INSET_CONTROL_BASE} value={topText} onChange={e => setTopText(e.target.value)} />
              </InsetLabeledField>
            )}

            {bottomBandEnabled && (
              <InsetLabeledField label="Outer text">
                <input className={INSET_CONTROL_BASE} value={bottomText} onChange={e => setBottomText(e.target.value)} />
              </InsetLabeledField>
            )}
          </div>

          <div className="my-3 border-t border-slate-200/70" />
          <div className="mt-4 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={showBoxes}
                onChange={e => setShowBoxes(e.target.checked)}
              />
              Letter bounding boxes
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={showSpanFill}
                onChange={e => setShowSpanFill(e.target.checked)}
              />
              Title span fill
            </label>
          </div>
        </div>
      </section>
    </main>
  );
}
