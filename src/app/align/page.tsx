'use client';

import React, { useEffect, useMemo, useState, useLayoutEffect } from 'react';

import type { LineMetric, Alignment } from '@/lib/line-widths';
import {
  CAL_WORD,
  CAL_WORD_DOUBLE,
  clamp,
  measureLines,
} from '@/lib/line-widths';

import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';
import { SCRIPT_DEFAULTS, lengthPoly, pointAt } from '@/lib/curve-helpers';
import type { ScriptContext } from '@/lib/scripts/types';
import { measureRun } from '@/lib/measure/measure-run';
import { lineMetricFromMeasuredRun } from '@/lib/measure/measure-lines-generic';
import { buildCopperplateModel } from '@/lib/scripts/copperplate';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { buildGuideSet, type GuideTemplateId, BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';
import { buildStageFrame } from '@/lib/preview/stage';
import GuideOverlay from '@/components/preview/GuideOverlay';

/** ============================================================
 * Calligraphy Tools — Line Planner (Copperplate + Textura Quadrata)
 * ============================================================ */

// 55° stroke slant from the baseline => skewX(35°) from vertical in SVG
const SLANT_DEG = 35;

// Global opacity controls for orange space boxes
const SPACE_BOX_FILL_OPACITY = 0.05;
const SPACE_BOX_STROKE_OPACITY = 0.1;

/* ----------------------------- Small helpers ---------------------------- */

function mm(n: number, dp = 1) {
  return `${n.toFixed(dp)} mm`;
}

const snap = (v: number) => Math.round(v) + 0.5;
const TICK_STROKE = 2;
const LINE_STROKE = 2;
const BOX_STROKE = 0.9; // Curve uses swThin; Align uses a fixed px stroke that looks similar

/* ------------------------- Constants / UI Options ------------------------ */

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);

// Per–x-height local storage key
const CAL_STORAGE_KEY_PREFIX = 'ct_lineplanner_calibration_v2_xh_';
const keyForXHeight = (x: number) => `${CAL_STORAGE_KEY_PREFIX}${x.toFixed(1)}`;

/* ---------------- Reusable InfoTip ---------------- */

type InfoTipProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'left' | 'bottom';
};

function InfoTip({ title, children, className = '', side = 'right' }: InfoTipProps) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
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

    const prevVis = tip.style.visibility;
    const prevDisp = tip.style.display;
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    const tr = tip.getBoundingClientRect();
    tip.style.visibility = prevVis;
    tip.style.display = prevDisp;

    const space = {
      left: wr.left,
      right: vw - wr.right,
      top: wr.top,
      bottom: vh - wr.bottom,
    };
    const fits = (s: typeof side) =>
      s === 'left' || s === 'right'
        ? space[s] >= tr.width + gap
        : s === 'top' || s === 'bottom'
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
          : 'left-full top-1/2 -translate-x-1/2 ml-2';

  const arrow =
    computedSide === 'top'
      ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-700'
      : computedSide === 'left'
        ? 'left-full top-1/2 -translate-y-1/2 border-l-slate-700'
        : computedSide === 'bottom'
          ? 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-700'
          : 'right-full top-1/2 border-r-slate-700 -translate-y-1/2';

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onTouchStart={() => setOpen((o) => !o)}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 cursor-help select-none"
        title={title}
      >
        <span className="text-[11px] font-bold select-none">i</span>
      </span>

      <div
        ref={tipRef}
        role="tooltip"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`absolute ${pos} z-20
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

/* ---------------------------- Line Preview SVG --------------------------- */

type LinePreviewProps = {
  index: number;
  metric: LineMetric;
  alignment: Alignment;
  xHeight: number;
  pxPerMM: number;
  leftEdgeX: number;
  rightEdgeX: number;
  centerX: number;
  lineGap: number;
  baselineTopY: number;
  showLetterBoxes: boolean;
  guideTemplate: GuideTemplateId;
  guideHeights: { xMM: number; ascMM: number; descMM: number; capMM: number };
};

function LinePreview(props: LinePreviewProps) {
  const {
    index,
    metric,
    alignment,
    xHeight,
    pxPerMM,
    leftEdgeX,
    rightEdgeX,
    centerX,
    lineGap,
    baselineTopY,
    showLetterBoxes,
    guideTemplate,
    guideHeights,
  } = props;

  const { lengthMM, segments } = metric;

  const pxScale = pxPerMM || 5;
  const Lmm = lengthMM;
  const Lpx = Lmm * pxScale;

  const baselineY = baselineTopY + index * lineGap;
  const yLine = snap(baselineY);

  let startXRaw: number;
  let endXRaw: number;
  let refX: number;
  let labelText: string;

  if (alignment === 'center') {
    startXRaw = centerX - Lpx / 2;
    endXRaw = centerX + Lpx / 2;
    refX = centerX;
    labelText = `${(Lmm / 2).toFixed(1)} mm from center`;
  } else {
    startXRaw = rightEdgeX - Lpx;
    endXRaw = rightEdgeX;
    refX = rightEdgeX;
    labelText = `${Lmm.toFixed(1)} mm from right`;
  }

  const xStart = snap(startXRaw);
  const xEnd = snap(endXRaw);
  

  const spanY = baselineY - 14;
  const baseBoxH = (guideTemplate === 'blackletter' ? guideHeights.xMM : xHeight) * pxScale;
  const useSkew = guideTemplate === 'copperplate';

    // Extend baseline used for box construction so Copperplate top-edge advance (dx)
  // doesn't clamp at the end and kink the last upright edge.
  const SLANT_FROM_BASELINE_DEG = 55;
  const dxMax = useSkew ? (baseBoxH / Math.tan((SLANT_FROM_BASELINE_DEG * Math.PI) / 180)) : 0;

  const baselinePx = [
    { x: xStart, y: baselineY },
    { x: xEnd + dxMax, y: baselineY },
  ];
  const arcLen = lengthPoly(baselinePx);


  const guideSet = useMemo(() => {
    if (guideTemplate !== 'blackletter') return null;
    const baseline = [
      { x: 0, y: 0 },
      { x: Lmm, y: 0 },
    ];
    const baseGuideSet = buildGuideSet('blackletter', {
      baseline,
      xMM: guideHeights.xMM,
      ascMM: guideHeights.ascMM,
      descMM: guideHeights.descMM,
      tickStepMM: Math.max(guideHeights.xMM * 0.2, 1),
    });
    return baseGuideSet;
  }, [guideTemplate, guideHeights, Lmm]);

  return (
    <g>
      <line x1={leftEdgeX} y1={yLine} x2={rightEdgeX} y2={yLine} stroke="#e2e8f0" />

      {showLetterBoxes &&
        segments.map((seg, i2) => {
          const segStartPx = xStart + seg.startMM * pxScale;
          const segEndPx = xStart + seg.endMM * pxScale;
          const segWidthPx = Math.max(1, segEndPx - segStartPx);

          const isLetter = seg.kind === 'letter';
          const ch = isLetter ? seg.ch : '';
          const isCap = isLetter && /[A-Z]/.test(ch);

          const boxH =
          !isLetter
            ? baseBoxH
            : guideTemplate === 'blackletter'
              ? (isCap ? guideHeights.capMM * pxScale : guideHeights.xMM * pxScale)
              : baseBoxH;
                       // Build a Curve-style conforming box path (in px units).
          const sL = Math.max(0, Math.min(arcLen, seg.startMM * pxScale));
          const sR = Math.max(0, Math.min(arcLen, seg.endMM * pxScale));
          const span = Math.max(0.0001, sR - sL);

          // Copperplate: slant “uprights” forward 55° relative to baseline (Curve logic).
          const isCopper = useSkew;
          const dx = isCopper ? (boxH / Math.tan((SLANT_FROM_BASELINE_DEG * Math.PI) / 180)) : 0;

          // px sampling: roughly one point per 6px, min 8 points.
          const steps = Math.max(8, Math.ceil(span / 6));

          const basePts: { x: number; y: number }[] = [];
          const waistPts: { x: number; y: number }[] = [];

          for (let k = 0; k <= steps; k++) {
            const u = k / steps;
            const s = sL + span * u;

            const C = pointAt(baselinePx, s);
            basePts.push({ x: C.p.x, y: C.p.y });

            const sTop = Math.max(0, Math.min(arcLen, s + dx));
            const Ct = pointAt(baselinePx, sTop);
            waistPts.push({ x: Ct.p.x - Ct.n.x * boxH, y: Ct.p.y - Ct.n.y * boxH });
          }

          const top = waistPts.map((pt) => `${pt.x},${pt.y}`).join(' L ');
          const bot = [...basePts].reverse().map((pt) => `${pt.x},${pt.y}`).join(' L ');
          const pathD = `M ${top} L ${bot} Z`;
     
          if (isLetter) {
            const fillColor = isCap ? 'rgba(99,102,241,0.10)' : 'rgba(16,185,129,0.10)';
            const strokeColor = isCap ? '#6366f1' : '#10b981';

            return (
              <path
                key={`box-${index}-${i2}`}
                d={pathD}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={BOX_STROKE}
                vectorEffect="non-scaling-stroke"
              />
            );
          }

          const orangeFill = `rgba(249, 115, 22, ${SPACE_BOX_FILL_OPACITY})`;
          const orangeStroke = `rgba(249, 115, 22, ${SPACE_BOX_STROKE_OPACITY})`;

          return (
            <path
            key={`space-${index}-${i2}`}
            d={pathD}
            fill={orangeFill}
            stroke={orangeStroke}
            strokeWidth={BOX_STROKE}
            vectorEffect="non-scaling-stroke"
          />
          );
        })}

      <text x={(startXRaw + refX) / 2} y={spanY - 4} textAnchor="middle" className="ct-svg-text" fill="#475569">
        {labelText}
      </text>

      {(() => {
  const tickH =
  guideTemplate === 'blackletter'
    ? (guideHeights.capMM * pxScale)
    : baseBoxH;


  // Always draw the baseline stroke (matches Curve's bold guide vibe)
  const baselineStroke = (
    <line
      x1={xStart}
      y1={yLine}
      x2={xEnd}
      y2={yLine}
      stroke="#111827"
      strokeWidth={LINE_STROKE}
      strokeLinecap="square"
    />
  );

  // Copperplate: skewed ticks (existing behavior)
  if (useSkew) {
    return (
      <>
        <g transform={`translate(${xStart},${yLine}) skewX(${-SLANT_DEG})`}>
          <line x1={0} y1={0} x2={0} y2={-tickH} stroke="#0f172a" strokeWidth={TICK_STROKE} strokeLinecap="square" />
        </g>
        <g transform={`translate(${xEnd},${yLine}) skewX(${-SLANT_DEG})`}>
          <line x1={0} y1={0} x2={0} y2={-tickH} stroke="#0f172a" strokeWidth={TICK_STROKE} strokeLinecap="square" />
        </g>
        {baselineStroke}
      </>
    );
  }

  // Non-copper scripts: vertical ticks
  return (
    <>
      <line x1={xStart} y1={yLine} x2={xStart} y2={yLine - tickH} stroke="#0f172a" strokeWidth={TICK_STROKE} strokeLinecap="square" />
      <line x1={xEnd} y1={yLine} x2={xEnd} y2={yLine - tickH} stroke="#0f172a" strokeWidth={TICK_STROKE} strokeLinecap="square" />
      {baselineStroke}
    </>
  );
})()}


      {guideTemplate === 'blackletter' && guideSet && (
        <g transform={`translate(${xStart},${yLine}) scale(${pxScale})`}>
          <GuideOverlay
            guideSet={guideSet}
            style={{
              thin: 1,
              bold: 2,
              colors: {
                thin: '#e2e8f0',
                bold: '#111827',
                tick: '#e2e8f0',
              },
            }}
          />
        </g>
      )}
    </g>
  );
}

/* ======================================================================== */
/*                                  Page                                    */
/* ======================================================================== */

export default function Home() {
  const [script, setScript] = useState<ScriptId>('Copperplate');

  const [linesInput, setLinesInput] = useState('');
  const [xHeight, setXHeight] = useState(6);
  const [pxPerMM, setPxPerMM] = useState(5);
  const [alignment, setAlignment] = useState<Alignment>('center');

  // Copperplate-only controls
  const [capStyle, setCapStyle] = useState<'simple' | 'flourished'>('flourished');

  // Textura-only controls
  const [nibMM, setNibMM] = useState(2);
  const [penAngleDeg, setPenAngleDeg] = useState<35 | 40 | 45>(45);
  const [xNib, setXNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.xNib);

  const [showLetterBoxes, setShowLetterBoxes] = useState(true);
  const [vw, setVw] = useState<number | null>(null);

  // Calibration state (Copperplate only)
  const [useCalibration, setUseCalibration] = useState(false);
  const [calWordLowerMM, setCalWordLowerMM] = useState('');
  const [calWordDoubleMM, setCalWordDoubleMM] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userScaleFactor, setUserScaleFactor] = useState(1);
  const [userSpaceFactor, setUserSpaceFactor] = useState(1);

 

  const guideTemplateForScript = (current: ScriptId): GuideTemplateId =>
    current === 'Copperplate' ? 'copperplate' : 'blackletter';


  const handleStepButtonMouseDown: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
  };

  // If user switches away from Copperplate, disable calibration.
  useEffect(() => {
    if (script !== 'Copperplate') {
      setUseCalibration(false);
      setShowAdvanced(false);
    }
  }, [script]);

  // Load calibration for current x-height (Copperplate only)
  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeight);
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
  }, [xHeight, script]);

  // Persist calibration for current x-height (Copperplate only)
  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeight);
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
  }, [xHeight, script, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const handleResetAllCalibration = () => {
    setUseCalibration(false);
    setCalWordLowerMM('');
    setCalWordDoubleMM('');
    setUserScaleFactor(1);
    setUserSpaceFactor(1);
    setShowAdvanced(false);
    try {
      const key = keyForXHeight(xHeight);
      if (typeof window !== 'undefined') localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (vw == null) return;
    if (vw >= 700) setPxPerMM(5);
    else if (vw >= 500) setPxPerMM(4.5);
    else setPxPerMM(4);
  }, [vw]);

  const lines = useMemo(() => linesInput.split('\n').map((s) => s.trimEnd()).filter(Boolean), [linesInput]);

  // Build a shared Copperplate context (centralized) so Curve can reuse this later.
  const copper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);

    return buildCopperplateContext({
      xHeightMM: xHeight,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [xHeight, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const effectiveNibMM = useMemo(() => {
    if (script === 'Copperplate') return nibMM;
    const rad = (penAngleDeg * Math.PI) / 180;
    return nibMM * Math.cos(rad);
  }, [script, nibMM, penAngleDeg]);
  

  const texturaXHeightMM = xNib * effectiveNibMM;
  const scriptCtx = useMemo<ScriptContext>(() => {
    if (script === 'Copperplate') return copper.ctx;
  
    return {
      xHeightMM: texturaXHeightMM,
      nibMM: effectiveNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [script, copper.ctx, texturaXHeightMM, effectiveNibMM]);
  

  const lineMetrics = useMemo<LineMetric[]>(() => {
    if (script === 'Copperplate') {
      const model = buildCopperplateModel(scriptCtx);
      return measureLines(lines, model, alignment);
    }

    const profile = SCRIPT_PROFILES[script];
    return lines.map((line) => {
      const run = measureRun(line, profile, scriptCtx);
      return lineMetricFromMeasuredRun(line, run, alignment);
    });
  }, [script, lines, alignment, scriptCtx]);

  const maxMM = useMemo(() => lineMetrics.reduce((m, { lengthMM }) => Math.max(m, lengthMM), 0), [lineMetrics]);

  const baseMargin = useMemo(() => {
    const w = vw ?? 1000;
    if (w < 500) return 24;
    if (w < 700) return 40;
    return 80;
  }, [vw]);

  const minWidth = 760;
  const maxWidthPx = 1100;
  const lineGap = 42;
  const guideTemplate = useMemo(() => guideTemplateForScript(script), [script]);
  const guideHeights = useMemo(() => {
    if (guideTemplate !== 'blackletter') {
      // keep existing copperplate-ish visual behaviour
      return { xMM: xHeight, ascMM: 0, descMM: 0, capMM: xHeight * 1.05 };
    }
  
    const defaults =
      SCRIPT_DEFAULTS[script as keyof typeof SCRIPT_DEFAULTS] ?? SCRIPT_DEFAULTS.TexturaQuadrata;
  
    const capHeightNibs = defaults?.capHeight ?? 7;
  
    return {
      xMM: xNib * effectiveNibMM,
      descMM: 0,
      ascMM: 0,
      capMM: capHeightNibs * effectiveNibMM,
    };
  }, [guideTemplate, xHeight, xNib, effectiveNibMM, script]);
  

  const stageFrame = useMemo(
    () =>
      buildStageFrame({
        maxMM,
        pxPerMM: pxPerMM || 5,
        baseMargin,
        minWidthPx: minWidth,
        maxWidthPx,
        lineGapPx: lineGap,
        lineCount: lineMetrics.length,
      }),
    [maxMM, pxPerMM, baseMargin, minWidth, maxWidthPx, lineGap, lineMetrics.length],
  );

  const effectiveScaleNumeric = script === 'Copperplate' && useCalibration ? copper.debug.effectiveScaleNumeric : 1;
  const effectiveSpaceNumeric = script === 'Copperplate' && useCalibration ? copper.debug.effectiveSpaceNumeric : 1;

  const effectiveScaleDisplay = effectiveScaleNumeric.toFixed(3);
  const effectiveSpaceDisplay = effectiveSpaceNumeric.toFixed(3);

  const scaleColorClass =
    effectiveScaleNumeric > 1.0005
      ? 'text-indigo-500'
      : effectiveScaleNumeric < 0.9995
        ? 'text-orange-500'
        : 'text-slate-500';

  const spaceColorClass =
    effectiveSpaceNumeric > 1.0005
      ? 'text-indigo-500'
      : effectiveSpaceNumeric < 0.9995
        ? 'text-orange-500'
        : 'text-slate-500';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        .ct-svg-text { font-size: clamp(12.5px, 1.35vw, 14.5px); }
        @media (max-width: 700px) { .ct-svg-text { font-size: clamp(13px, 2.4vw, 14px); } }
        @media (max-width: 500px) { .ct-svg-text { font-size: clamp(13.5px, 3.2vw, 14.5px); } }
      `}</style>

      <header className="px-6 pt-8 pb-6">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Calligraphy Tools <span className="text-indigo-600">— Line Planner</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan exact start marks from a centerline or right edge. Copperplate uses join + entry/exit + word-space modelling.
            Textura Quadrata uses nib-unit widths and spacing.
          </p>
        </div>
      </header>

      {/* PREVIEW */}
      <section className="px-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">Preview</h3>
              <InfoTip side="right">
                Copperplate: includes entry stroke before the first letter and (if ending on lowercase) an exit stroke after the last lowercase.
                Word spaces include exit + gap + entry. Calibration adjusts lowercase scale + spacing.
                Textura: nib-based widths + spacing.
              </InfoTip>
            </div>
          </div>

          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${stageFrame.widthPx} ${stageFrame.heightPx}`}
              className="block mx-auto w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
              shapeRendering="crispEdges"
            >
              <rect x={0} y={0} width={stageFrame.widthPx} height={stageFrame.heightPx} fill="white" />

              {alignment === 'center' ? (
                <>
                  <line
                    x1={stageFrame.centerX}
                    y1={10}
                    x2={stageFrame.centerX}
                    y2={stageFrame.heightPx - 10}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                  />
                  <text x={stageFrame.centerX + 6} y={18} className="ct-svg-text" fill="#64748b">
                    centerline
                  </text>
                </>
              ) : (
                <>
                  <line
                    x1={stageFrame.rightEdgeX}
                    y1={10}
                    x2={stageFrame.rightEdgeX}
                    y2={stageFrame.heightPx - 10}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={stageFrame.rightEdgeX - 6}
                    y={18}
                    className="ct-svg-text"
                    fill="#64748b"
                    textAnchor="end"
                  >
                    right edge
                  </text>
                </>
              )}

              {lineMetrics.map((metric, idx) => (
                <LinePreview
                  key={idx}
                  index={idx}
                  metric={metric}
                  alignment={alignment}
                  xHeight={xHeight}
                  pxPerMM={pxPerMM}
                  leftEdgeX={stageFrame.leftEdgeX}
                  rightEdgeX={stageFrame.rightEdgeX}
                  centerX={stageFrame.centerX}
                  lineGap={stageFrame.lineGapPx}
                  baselineTopY={stageFrame.baselineTopY}
                  showLetterBoxes={showLetterBoxes}
                  guideTemplate={guideTemplate}
                  guideHeights={guideHeights}
                />
              ))}
            </svg>
          </div>
        </div>
      </section>

      {/* Step 1 + Step 2 */}
      <section className="px-6 py-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* STEP 1 — Basics */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-800">Step 1 — Basics</h2>
                <InfoTip side="right">Choose script + working sizes and alignment.</InfoTip>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <div>
                  <label className="font-medium text-slate-700">Script</label>
                  <select
                    className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={script}
                    onChange={(e) => setScript(e.target.value as ScriptId)}
                  >
                    <option value="Copperplate">Copperplate</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="TexturaQuadrata">Textura Quadrata</option>
                  </select>
                </div>

                <div>
                  <label className="font-medium text-slate-700">Alignment</label>
                  <select
                    className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={alignment}
                    onChange={(e) => setAlignment(e.target.value as Alignment)}
                  >
                    <option value="center">Center aligned</option>
                    <option value="right">Right aligned</option>
                  </select>
                </div>

                {script === 'Copperplate' ? (
                  <>
                    <div>
                      <label className="font-medium text-slate-700">X-height (mm)</label>
                      <select
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={xHeight}
                        onChange={(e) => setXHeight(parseFloat(e.target.value))}
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
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                        value={capStyle}
                        onChange={(e) => setCapStyle(e.target.value as 'simple' | 'flourished')}
                        disabled={useCalibration}
                      >
                        <option value="simple">Simple (body widths)</option>
                        <option value="flourished">Flourished (full widths)</option>
                      </select>
                      {useCalibration && <p className="mt-1 text-[11px] text-slate-400">Disabled while calibration is enabled.</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="font-medium text-slate-700">Nib size (mm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={nibMM}
                        onChange={(e) => setNibMM(clamp(parseFloat(e.target.value || '2') || 2, 0.5, 10))}
                      />
                      <div className="mt-3">
  <label className="font-medium text-slate-700">Pen angle (°)</label>
  <select
    className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    value={penAngleDeg}
    onChange={(e) => setPenAngleDeg(parseInt(e.target.value, 10) as 35 | 40 | 45)}
  >
    <option value={35}>35°</option>
    <option value={40}>40°</option>
    <option value={45}>45°</option>
  </select>
  <p className="mt-1 text-[11px] text-slate-400">
    Converts nib units using effective downstroke width (nib × cos(angle)).
  </p>
</div>

                      <p className="mt-1 text-[11px] text-slate-400">Textura widths are in nib units.</p>
                    </div>
                  </>
                )}

                <label className="inline-flex items-center gap-2 text-sm text-slate-800 sm:col-span-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={showLetterBoxes}
                    onChange={(e) => setShowLetterBoxes(e.target.checked)}
                  />
                  Show letter bounding boxes
                </label>
              </div>
            </div>

            {/* STEP 2 — Enter lines */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-800">Step 2 — Enter lines</h2>
                <InfoTip side="right">Type one line per row.</InfoTip>
              </div>
              <textarea
                className="w-full h-36 p-3 mt-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
                value={linesInput}
                onChange={(e) => setLinesInput(e.target.value)}
                placeholder="One line per row"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Calibration (Copperplate only) */}
      {script === 'Copperplate' && (
        <section className="px-6 pb-6">
          <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-800">Calibration (optional)</h2>
                <InfoTip side="right">
                  Write each reference exactly as shown at your chosen x-height, measure its total length in millimetres,
                  and enter the value. Calibration adjusts lowercase scale and spacing. Stored per x-height.
                </InfoTip>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onMouseDown={handleStepButtonMouseDown}
                  onClick={handleResetAllCalibration}
                  className="px-3 py-1.5 text-xs rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 transition select-none"
                >
                  Reset all calibration (this x-height)
                </button>
                <button
                  type="button"
                  onMouseDown={handleStepButtonMouseDown}
                  onClick={() => setUseCalibration((v) => !v)}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
                ${
                  useCalibration
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                >
                  <span
                    className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
                  ${useCalibration ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <span className="h-3 w-3 rounded-full bg-white shadow" />
                  </span>
                  {useCalibration ? 'Calibration: On' : 'Calibration: Off'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col h-full">
                <div className="mb-1">
                  <div className="font-medium text-slate-700">1. Lowercase word</div>
                  <div className="text-xs font-mono text-indigo-500">{CAL_WORD}</div>
                </div>
                <p className="text-xs text-slate-500">
                  Write <span className="font-mono text-indigo-500">{CAL_WORD}</span> once and measure the total length.
                </p>
                <div className="mt-auto flex items-center gap-1 pt-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder="e.g. 105.0"
                    value={calWordLowerMM}
                    onChange={(e) => setCalWordLowerMM(e.target.value)}
                    disabled={!useCalibration}
                  />
                  <span className="text-xs text-slate-500">mm</span>
                </div>
              </div>

              <div className="flex flex-col h-full">
                <div className="mb-1">
                  <div className="font-medium text-slate-700">2. Spacing (double word)</div>
                  <div className="text-xs font-mono text-indigo-500">{CAL_WORD_DOUBLE}</div>
                </div>
                <p className="text-xs text-slate-500">
                  Now write <span className="font-mono text-indigo-500">{CAL_WORD}</span> again, with your normal word space
                  between, and measure the total length including the space.
                </p>
                <div className="mt-auto flex items-center gap-1 pt-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder="e.g. 210.0"
                    value={calWordDoubleMM}
                    onChange={(e) => setCalWordDoubleMM(e.target.value)}
                    disabled={!useCalibration}
                  />
                  <span className="text-xs text-slate-500">mm</span>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <button
                type="button"
                onMouseDown={handleStepButtonMouseDown}
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-indigo-600 select-none"
                disabled={!useCalibration}
              >
                <span className={`inline-block transform transition-transform ${showAdvanced && useCalibration ? 'rotate-90' : 'rotate-0'}`}>
                  ▶
                </span>
                <span>Advanced tweaks</span>
                {!useCalibration && <span className="ml-1 text-[10px] text-slate-400">(enable calibration to adjust)</span>}
              </button>

              {showAdvanced && useCalibration && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">Overall scale</span>
                      <span className={`font-mono ${scaleColorClass}`}>×{effectiveScaleDisplay}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Fine-tune length relative to the calibrated lowercase. 1.00 = no extra change.</p>
                    <div className="mt-1 inline-flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserScaleFactor((v) => clamp(v - 0.02, 0.7, 1.3))}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        –0.02
                      </button>
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserScaleFactor(1)}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserScaleFactor((v) => clamp(v + 0.02, 0.7, 1.3))}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        +0.02
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">Spacing factor</span>
                      <span className={`font-mono ${spaceColorClass}`}>×{effectiveSpaceDisplay}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Fine-tune joins and word spaces relative to the calibrated spacing. 1.00 = no extra change.</p>
                    <div className="mt-1 inline-flex items-center gap-2">
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserSpaceFactor((v) => clamp(v - 0.05, 0.5, 1.5))}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        –0.05
                      </button>
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserSpaceFactor(1)}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onMouseDown={handleStepButtonMouseDown}
                        onClick={() => setUserSpaceFactor((v) => clamp(v + 0.05, 0.5, 1.5))}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 select-none"
                      >
                        +0.05
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Results */}
      <section className="px-6 pb-8">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2 text-slate-700">#</th>
                  <th className="text-left p-2 text-slate-700">Line</th>
                  <th className="text-right p-2 text-slate-700">Length</th>
                  <th className="text-right p-2 text-slate-700">Start from reference</th>
                </tr>
              </thead>
              <tbody>
                {lineMetrics.map((metric, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{metric.text || <em>(empty)</em>}</td>
                    <td className="p-2 text-right">{mm(metric.lengthMM)}</td>
                    <td className="p-2 text-right">
                      {mm(metric.startFromRefMM)} {alignment === 'center' ? 'from center' : 'from right edge'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
