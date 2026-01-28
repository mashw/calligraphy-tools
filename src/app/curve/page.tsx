'use client';

import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import {
  PAPERS_MM,
  SCRIPT_DEFAULTS,
  Pt,
  PtCubic,
  sample,
  lengthPoly,
  pointAt,
  buildPreset,
  transformCubic,
} from '@/lib/curve-helpers';

import {
  CAL_WORD,
  CAL_WORD_DOUBLE,
  clamp,
} from '@/lib/line-widths';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';
import type { ScriptContext } from '@/lib/scripts/types';
import { measureRun } from '@/lib/measure/measure-run';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { buildGuideSet, BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';
import GuideOverlay from '@/components/preview/GuideOverlay';

type PaperId = keyof typeof PAPERS_MM;
type CurvePresetId = 'simpleArch' | 'highArch' | 'shallowArch' | 'compoundArch' | 'zanerian';
type Orientation = 'portrait' | 'landscape';
type AlignMode = 'start' | 'center' | 'end';
type ViewMode = 'autofit' | 'fullpage';

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);

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

export default function CurvedTitlePage() {
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const [view, setView] = useState<ViewMode>('autofit');

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
  const [curve, setCurve] = useState<CurvePresetId>('zanerian');
  const [align, setAlign] = useState<AlignMode>('center');
  const [text, setText] = useState('Merry Christmas');

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

  const [showBoxes, setShowBoxes] = useState(false);
  const [showSpanFill, setShowSpanFill] = useState(true);

  const [rotDeg, setRotDeg] = useState(0);
  const [scalePct, setScalePct] = useState(100);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [savedViewBeforeCurveDrag, setSavedViewBeforeCurveDrag] = useState<ViewMode | null>(null);
  const [savedZoomBeforeCurveDrag, setSavedZoomBeforeCurveDrag] = useState<number | null>(null);

  const [curveOffset, setCurveOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isCurveDragging, setIsCurveDragging] = useState(false);

  const dragRef = useRef<{
    px: number;
    py: number;
    panX: number;
    panY: number;
    mode?: 'pan' | 'curve';
    ox?: number;
    oy?: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Sticky centering: snap + hysteresis
  const snapStateRef = useRef<{ snapped: boolean }>({ snapped: true });

  // Sensible feel in mm (snap in, release further out)
  const SNAP_IN_MM = 6;    // if within 6mm of center, snap
  const RELEASE_MM = 12;   // if snapped, must move beyond 12mm to release
  const CENTER_EPS_MM = 0.5; // considered "centered" for showing indicator

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

  const fs = (mm: number) => mm / Math.max(zoom, 0.001);

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

  const capMM = script === 'Copperplate'
    ? xHeightMM * 1.05
    : (SCRIPT_DEFAULTS.TexturaQuadrata?.capHeight ?? 7) * nibMM;

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

  // ---------- Curve geometry ----------
  const cubicRaw = useMemo<PtCubic>(() => buildPreset(curve, box), [curve, box]);

  const cubic: PtCubic = useMemo(
    () => transformCubic(cubicRaw, box.w / 2, box.h / 2, scalePct / 100, rotDeg),
    [cubicRaw, box, scalePct, rotDeg],
  );

  const baselineBase = useMemo<Pt[]>(() => {
    const extra = (cubic as PtCubic)._extraSegs;
    if (extra && extra.length) {
      const pts: Pt[] = [];
      for (const s of extra) {
        const p0 = { x: s[0], y: s[1] };
        const p1 = { x: s[2], y: s[3] };
        const p2 = { x: s[4], y: s[5] };
        const p3 = { x: s[6], y: s[7] };
        const seg = sample(p0, p1, p2, p3, 220);
        if (pts.length) seg.shift();
        pts.push(...seg);
      }
      return pts;
    }
    return sample(cubic.p0, cubic.p1, cubic.p2, cubic.p3, 900);
  }, [cubic]);

  const baselineBaseCenterX = useMemo(() => {
    if (!baselineBase.length) return box.w / 2;
    const xs = baselineBase.map(p => p.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }, [baselineBase, box.w]);

  // The curveOffset.x that makes the curve horizontally centered
  const centerDx = useMemo(() => box.w / 2 - baselineBaseCenterX, [box.w, baselineBaseCenterX]);

  // Determine if currently centered (for showing indicator)
  const centeredDistMM = useMemo(() => (baselineBaseCenterX + curveOffset.x) - box.w / 2, [baselineBaseCenterX, curveOffset.x, box.w]);
  const isCenteredHorizontally = Math.abs(centeredDistMM) <= CENTER_EPS_MM;

  const translatePoly = (poly: Pt[], dx: number, dy: number) => poly.map(p => ({ x: p.x + dx, y: p.y + dy }));

  const baseline = useMemo(() => translatePoly(baselineBase, curveOffset.x, curveOffset.y), [baselineBase, curveOffset]);
  const arcLen = useMemo(() => lengthPoly(baseline), [baseline]);
  const guideTemplate = script === 'Copperplate' ? 'copperplate' : 'blackletter';
  const guideSet = useMemo(
    () =>
      buildGuideSet(guideTemplate, {
        baseline,
        xMM,
        ascMM,
        descMM,
        tickStepMM:
          script === 'Copperplate'
            ? Math.max(xMM * 0.9, 3) // sparse, calm Copperplate ticks
            : effectiveNibMM,        // exact 1× effective nib
      }),
    [baseline, guideTemplate, xMM, ascMM, descMM, effectiveNibMM, script],
  );

  // ---------- Layout along the curve ----------
  type Place = { ch: string; w: number; h: number; sMid: number };

  const layout = useMemo(() => {
    const glyphs = run.glyphs;

    // Pass 1: place using measured advances
    const placeWithAdvances = (advances: number[]) => {
      const totalAdvance = advances.reduce((a, v) => a + v, 0);
      let s0 = 0;
      if (align === 'center') s0 = Math.max(0, (arcLen - totalAdvance) / 2);
      if (align === 'end') s0 = Math.max(0, arcLen - totalAdvance);

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
        const h = isCap ? capMM : xMM;

        const mid = cursor + w / 2;
        placements.push({ ch: g.ch, w, h, sMid: mid });
        cursor += adv;
      }

      return { placements, totalAdvance };
    };

    const adv1 = glyphs.map((g) => g.advMM);
    const pass1 = placeWithAdvances(adv1);

    if (pass1.placements.length === 0) {
      const overBy0 = Math.max(0, pass1.totalAdvance - arcLen);
      return { placements: pass1.placements, needed: pass1.totalAdvance, overBy: overBy0 };
    }

    if (script === 'Copperplate') {
      const overBy = Math.max(0, pass1.totalAdvance - arcLen);
      return { placements: pass1.placements, needed: pass1.totalAdvance, overBy };
    }

    // Pass 2: add a small extra spacing bump on turns (blackletter readability)
    const adv2 = adv1.slice();
    for (let i = 0; i < pass1.placements.length; i++) {
      const pl = pass1.placements[i];
      const sMid = Math.min(arcLen, Math.max(0, pl.sMid));
      const sL = Math.max(0, Math.min(arcLen, sMid - pl.w / 2));
      const sR = Math.max(0, Math.min(arcLen, sMid + pl.w / 2));

      const nL = pointAt(baseline, sL).n;
      const nR = pointAt(baseline, sR).n;

      const dot = nL.x * nR.x + nL.y * nR.y;
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const turnRad = Math.acos(clampedDot);
      const turnDeg = (turnRad * 180) / Math.PI;

      const THRESH = 6;
      const MAX = 28;
      const t = Math.max(0, Math.min(1, (turnDeg - THRESH) / (MAX - THRESH)));

      const baseBump = effectiveNibMM * 0.25;
      const heightFactor = 0.6 + 0.4 * Math.min(1, pl.h / xMM);
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
    const overBy = Math.max(0, pass2.totalAdvance - arcLen);
    return { placements: pass2.placements, needed: pass2.totalAdvance, overBy };
  }, [run, arcLen, align, baseline, capMM, xMM, nibMM, script]);

  const span = useMemo(() => {
    if (!layout.placements.length) return null;
    const first = layout.placements[0];
    const last = layout.placements[layout.placements.length - 1];
    const sStart = Math.max(0, first.sMid - first.w / 2);
    const sEnd = Math.min(arcLen, last.sMid + last.w / 2);
    return { sStart, sEnd };
  }, [layout, arcLen]);

  const spanPoly = useMemo(() => {
    if (!span) return null;
    const ds = script === 'Copperplate' ? Math.max(0.5, xMM * 0.2) : Math.max(0.5, effectiveNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = span.sStart; s <= span.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAt(baseline, Math.min(arcLen, s));
      waistPts.push({ x: p.x - n.x * xMM, y: p.y - n.y * xMM });
      basePts.push({ x: p.x, y: p.y });
    }
    return { waistPts, basePts };
  }, [span, baseline, arcLen, xMM, effectiveNibMM]);

  const startPt = baseline[0];
  const endPt = baseline[baseline.length - 1];
  const endpointsDistance = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
  const baselineLength = arcLen;
  const pageCenter = { x: box.w / 2, y: box.h / 2 };
  const radiusToStart = Math.hypot(pageCenter.x - startPt.x, pageCenter.y - startPt.y);
  const overWarn = layout.overBy > 0;

  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const vb = useMemo(() => {
    const stagePadMM = 22;

    let minX: number;
    let minY: number;
    let vw: number;
    let vh: number;

    if (view === 'fullpage') {
      vw = box.w / Math.max(1, zoom);
      vh = box.h / Math.max(1, zoom);
      minX = (box.w - vw) / 2;
      minY = (box.h - vh) / 2;
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
  }, [view, box, guideSet, zoom, pan]);

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

    if (dragRef.current.mode === 'curve') {
      const proposedX = (dragRef.current.ox ?? curveOffset.x) + (e.clientX - dragRef.current.px) * mmPerPxX;
      const proposedY = (dragRef.current.oy ?? curveOffset.y) + (e.clientY - dragRef.current.py) * mmPerPxY;

      // Clamp
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const nx = clamp(proposedX, -box.w, box.w);
      const ny = clamp(proposedY, -box.h, box.h);

      // Sticky horizontal centre:
      // target x offset that centers curve = centerDx
      const diffToCenter = nx - centerDx;
      const snapped = snapStateRef.current.snapped;

      let finalX = nx;
      let nextSnapped = snapped;

      if (snapped) {
        // Keep snapped until user drags far enough to "break free"
        if (Math.abs(diffToCenter) > RELEASE_MM) {
          nextSnapped = false;
          finalX = nx;
        } else {
          finalX = centerDx;
        }
      } else {
        // Not snapped: snap in if close enough (gives that “magnetic” feel)
        if (Math.abs(diffToCenter) < SNAP_IN_MM) {
          nextSnapped = true;
          finalX = centerDx;
        } else {
          finalX = nx;
        }
      }

      snapStateRef.current.snapped = nextSnapped;
      setCurveOffset({ x: finalX, y: ny });
      return;
    }

    // Pan stage
    const nx = dragRef.current.panX - (e.clientX - dragRef.current.px) * mmPerPxX;
    const ny = dragRef.current.panY - (e.clientY - dragRef.current.py) * mmPerPxY;
    setPan({ x: nx, y: ny });
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const wasCurve = dragRef.current?.mode === 'curve';
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    setIsCurveDragging(false);

    if (wasCurve && savedViewBeforeCurveDrag) {
      setView(savedViewBeforeCurveDrag);
      setSavedViewBeforeCurveDrag(null);

      if (savedZoomBeforeCurveDrag != null) {
        setZoom(savedZoomBeforeCurveDrag);
        setSavedZoomBeforeCurveDrag(null);
      }

      setPan({ x: 0, y: 0 });
    }
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function resetGuidePlacement() {
    snapStateRef.current.snapped = true;
    setCurveOffset({ x: centerDx, y: 0 });
  }

  function centerCurveHorizontally() {
    snapStateRef.current.snapped = true;
    setCurveOffset(prev => ({ x: centerDx, y: prev.y }));
  }

  function resetTransform() {
    setRotDeg(0);
    setScalePct(100);
  }

  function onGuidePointerDown(e: React.PointerEvent<SVGPathElement | SVGLineElement>) {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);

    if (view !== 'fullpage') {
      setSavedViewBeforeCurveDrag(prev => (prev === null ? view : prev));
      setSavedZoomBeforeCurveDrag(prev => (prev === null ? zoom : prev));
      setView('fullpage');
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }

    dragRef.current = {
      px: e.clientX,
      py: e.clientY,
      panX: pan.x,
      panY: pan.y,
      mode: 'curve',
      ox: curveOffset.x,
      oy: curveOffset.y,
    };
    setIsCurveDragging(true);
  }

  // Ensure initial state is centered horizontally (and snapped)
  useLayoutEffect(() => {
    // Only on first mount or when paper/orientation/curve changes radically
    // keep user’s y offset, but enforce initial horizontal centering
    snapStateRef.current.snapped = true;
    setCurveOffset(prev => ({ x: centerDx, y: prev.y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper, orientation, curve]);

  return (
    <main className="min-h-screen text-slate-900 relative">
      {/* FULL-VIEWPORT “PAINT OVER” LAYER */}
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      {/* Header */}
      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Calligraphy Tools <span className="text-indigo-600">— Curved Title Planner</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan curved headings (“resolutions”) for Copperplate and Textura Quadrata. Letters stay upright; guides follow the curve.
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
                  Drag anywhere to pan. Zoom with ±. Drag any guideline to move the curve guide (sticky centering on X).
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
                  <option value="autofit">Auto-fit curve</option>
                  <option value="fullpage">Full page / envelope</option>
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
              <button onMouseDown={e => e.preventDefault()} onClick={resetGuidePlacement} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
                Reset guide placement
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={centerCurveHorizontally} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
                Center horizontally
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
              className={`block mx-auto w-full h-[64vh] touch-none ${isCurveDragging ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'}`}
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
                <GuideOverlay
                  guideSet={guideSet}
                  style={{
                    thin: swThin,
                    bold: swBold,
                    colors: {
                      thin: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                      bold: isCurveDragging ? '#7c3aed' : '#111827',
                      tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                      frame: '#cbd5e1',
                    },
                  }}
                  interactive={{
                    onGuidePointerDown,
                    hitStrokeWidthMM: Math.max(8, swBold * 8),
                  }}
                />

                {showSpanFill && spanPoly && (
                  <>
                    <path
                      d={`M ${spanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${spanPoly.basePts
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
                      d={`M ${spanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${spanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                      className="cursor-move"
                      onPointerDown={onGuidePointerDown}
                    />
                  </>
                )}

                {/* Letter boxes: true rectangles */}
                {showBoxes &&
                  layout.placements.map((pl, i) => {
                    const sMid = Math.min(arcLen, Math.max(0, pl.sMid));
                    const halfW = pl.w / 2;
                    const h = script === 'Copperplate' ? xHeightMM : xMM;


                    // Use left/right edge frames so the box conforms to the curve across its width
                    const sL = Math.max(0, Math.min(arcLen, sMid - halfW));
                    const sR = Math.max(0, Math.min(arcLen, sMid + halfW));

                    const CL = pointAt(baseline, sL);
                    const CR = pointAt(baseline, sR);

                    const pL = CL.p;
                    const pR = CR.p;

                    const nL = CL.n;
                    const nR = CR.n;

                    // Copperplate: slant “uprights” forward 55° relative to local baseline
                    const isCopper = script === 'Copperplate';
                    const SLANT_FROM_BASELINE_DEG = 55;

                    // Sample the baseline and the waist (offset by -h along normal) so the fill follows the curve.
                    const steps = Math.max(16, Math.ceil((sR - sL) / 2)); // ~1 point per 2mm, with a sensible minimum

                    const basePts: { x: number; y: number }[] = [];
                    const waistPts: { x: number; y: number }[] = [];



                    for (let k = 0; k <= steps; k++) {
                      const u = k / steps;
                      const s = sL + (sR - sL) * u;

                      const C = pointAt(guideSet.baseLine, s)
                      const p = C.p;
                      const n = C.n;

                      // Baseline point
                      basePts.push({ x: p.x, y: p.y });

                      // Copperplate slant: move the TOP sample forward along arc-length (towards next letter)
                      const dx = isCopper ? (h / Math.tan((SLANT_FROM_BASELINE_DEG * Math.PI) / 180)) : 0;
                      const sTop = Math.max(0, Math.min(arcLen, isCopper ? (s + dx) : s));

                      const Ct = pointAt(guideSet.baseLine, sTop);

                      waistPts.push({ x: Ct.p.x - Ct.n.x * h, y: Ct.p.y - Ct.n.y * h });

                    }

                    // Convenience endpoints if you still want them (uprights connect these)
                    const bottomLeft = basePts[0];
                    const bottomRight = basePts[basePts.length - 1];
                    const topLeft = waistPts[0];
                    const topRight = waistPts[waistPts.length - 1];




                    const isCap = pl.ch >= 'A' && pl.ch <= 'Z';
                    const fillCol = isCap ? 'rgba(99,102,241,0.10)' : 'rgba(16,185,129,0.10)';
                    const strokeCol = isCap ? '#6366f1' : '#10b981';
                    const pathD = (() => {
                      const top = waistPts.map((pt) => `${pt.x},${pt.y}`).join(' L ');
                      const bot = [...basePts].reverse().map((pt) => `${pt.x},${pt.y}`).join(' L ');
                      return `M ${top} L ${bot} Z`;
                    })();

                    return (
                      <g key={i}>

                        <path
                          d={pathD}
                          fill={fillCol}
                          stroke={strokeCol}
                          strokeWidth={swThin}
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}

                {/* Endpoints */}
                <circle cx={startPt.x} cy={startPt.y} r={1} fill="#0ea5e9" />
                <circle cx={endPt.x} cy={endPt.y} r={1} fill="#0ea5e9" />

                {/* GREEN CENTER INDICATOR:
                    - Visible whenever horizontally centered (even if moved)
                    - NOT exported/printed
                */}
                {isCenteredHorizontally && (
                  <g data-no-export="true">
                    <circle cx={box.w / 2} cy={box.h / 2} r={1.1} fill="#22c55e" />
                    <line
                      x1={pageCenter.x}
                      y1={pageCenter.y}
                      x2={startPt.x}
                      y2={startPt.y}
                      stroke="#94a3b8"
                      strokeDasharray="4 3"
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={pageCenter.x} y={pageCenter.y + 6} textAnchor="middle" fontSize={fs(3)} fill="#64748b">
                      Centre → start {radiusToStart.toFixed(1)} mm
                    </text>
                  </g>
                )}
              </g>
            </svg>

            <div className="pointer-events-none absolute right-3 bottom-2 text-[13px] text-slate-700 text-right space-y-0.5">
              {overWarn && <div className="text-[13px] text-red-600 font-medium">Title exceeds curve</div>}
              <div>
                Curve length: {baselineLength.toFixed(1)} mm · Script length: {run.totalAdvanceMM.toFixed(1)} mm
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
            <InfoTip side="right">Curve guide movement snaps to horizontal centre unless you pull far enough to release.</InfoTip>
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
              <label className="font-medium text-slate-700">Curve</label>
              <select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={curve} onChange={e => setCurve(e.target.value as CurvePresetId)}>
                <option value="simpleArch">Simple Arch</option>
                <option value="highArch">High Arch</option>
                <option value="shallowArch">Shallow Arch</option>
                <option value="compoundArch">Compound Arch</option>
                <option value="zanerian">Zanerian Resolution</option>
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

            <div>
              <label className="font-medium text-slate-700">Text alignment</label>
              <select className="mt-1 w-full p-2 rounded-lg border border-slate-300" value={align} onChange={e => setAlign(e.target.value as AlignMode)}>
                <option value="start">Start</option>
                <option value="center">Centered</option>
                <option value="end">End</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="font-medium text-slate-700">Title text</label>
              <input className="mt-1 w-full p-3 rounded-lg border border-slate-300 text-base" value={text} onChange={e => setText(e.target.value)} />
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
  step={0.5}
  min={0.2}
  className="mt-1 w-full p-2 rounded-lg border border-slate-300"
  value={nibText}
  onChange={(e) => {
    const raw = e.target.value;
    const next = parseFloat(raw);
    const current = parseFloat(nibText);

    // Let the user type freely (including partial states like "" or "2.")
    if (!Number.isFinite(next) || !Number.isFinite(current)) {
      setNibText(raw);
      return;
    }

    // If it looks like a stepper change, force “whole 0.5” stepping.
    // (Steppers typically change by a fixed delta; typed changes can be arbitrary.)
    const delta = next - current;
    const looksLikeStep = Math.abs(delta) > 0 && Math.abs(delta) <= 1.0;

    if (looksLikeStep) {
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      const stepped = stepHalfFrom(current, dir);
      setNibText(String(Math.max(0.2, stepped)));
    } else {
      setNibText(raw);
    }
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
    const v = parseFloat(nibText);
    if (!Number.isFinite(v)) {
      setNibText('2');
      return;
    }
    setNibText(String(Math.max(0.2, snapHalf(v))));
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

          <div className="mt-4 space-y-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} />
              Show letter bounding boxes
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={showSpanFill} onChange={e => setShowSpanFill(e.target.checked)} />
              Show title span fill
            </label>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">Step 3 — Curve Transform</h2>
            <InfoTip side="right">Rotate and scale the curve.</InfoTip>
          </div>

          <div className="grid grid-cols-1 gap-4 mt-3 select-none">
            <div>
              <label className="font-medium text-slate-700">Rotation (°)</label>
              <input type="range" min={-30} max={30} step={1} value={rotDeg} onChange={e => setRotDeg(parseInt(e.target.value, 10))} className="w-full" />
              <div className="text-xs text-slate-500 mt-1">{rotDeg}°</div>
            </div>

            <div>
              <label className="font-medium text-slate-700">Scale (%)</label>
              <input type="range" min={60} max={140} step={1} value={scalePct} onChange={e => setScalePct(parseInt(e.target.value, 10))} className="w-full" />
              <div className="text-xs text-slate-500 mt-1">{scalePct}%</div>
            </div>
          </div>

          <div className="mt-4">
            <button onMouseDown={e => e.preventDefault()} onClick={resetTransform} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
              Reset rotation &amp; scale
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
