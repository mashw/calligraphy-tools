'use client';

import React, { useMemo, useRef, useState } from 'react';

import GuideOverlay from '@/components/preview/GuideOverlay';
import { PAPERS_MM, pathD } from '@/lib/curve-helpers';
import { buildGuideSet } from '@/lib/guides/guide-template';
import { findCrossingsForStraps, type Crossing, type Pt } from '@/lib/paths/intersections';
import { samplePathDToPolyline } from '@/lib/paths/sample-svg-path';
import { transformPolyline } from '@/lib/paths/transform';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type CrossingsFilter = 'all' | 'selected';
type CopperplateRatioPreset = '3:2:3' | '2:1:2' | '1:1:1' | 'custom';
type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type PairKey = string;
type PairOverrides = Record<PairKey, Record<number, string>>;

type InsetLabeledFieldProps = {
  label: string;
  disabled?: boolean;
  className?: string;
  rightAdornment?: React.ReactNode;
  adornmentClassName?: string;
  children: React.ReactNode;
};

type Strap = {
  id: string;
  name: string;
  d: string;
  color: string;
  script: ScriptId;
  nibMMText: string;
  nibAngleDeg: 35 | 40 | 45;
  xHeightMMText?: string;
  copperplateRatioPreset?: CopperplateRatioPreset;
  copperplateDescUnitsText?: string;
  copperplateXUnitsText?: string;
  copperplateAscUnitsText?: string;
  xNibText?: string;
  ascNibText?: string;
  descNibText?: string;
  offset: { x: number; y: number };
  scalePct: number;
  rotDeg: number;
  flip: boolean;
  snapped: boolean;
  invertGuides: boolean;
};

type StrapGroup = {
  id: string;
  name: string;
  strapIds: string[];
  collapsed: boolean;
};

const SNAP_IN_MM = 6;
const RELEASE_MM = 10;
const CROSS_EPS_MM = 1.2;
const CROSSING_MAX_SEGMENTS = 2800;
const FIT_MARGIN_MM = 12;
const PALETTE = ['#1d4ed8', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#dc2626', '#65a30d', '#4f46e5', '#c2410c', '#0f766e', '#be123c', '#4338ca'];
const INSET_CONTROL_BASE = 'w-full border-0 rounded-none px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:text-slate-400 disabled:cursor-not-allowed';
const INSET_CONTROL_MM = `${INSET_CONTROL_BASE} pr-10`;
const INSET_CONTROL_WIDE = `${INSET_CONTROL_BASE} pr-14`;
const SCALE_MIN_PCT = 1;
const SCALE_MAX_PCT = 220;

const snapHalf = (v: number) => Math.round(v * 2) / 2;

const stepHalfFrom = (current: number, dir: 1 | -1) => {
  const eps = 1e-9;
  const x2 = current * 2;
  const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
  return next2 / 2;
};


const pairKey = (aId: string, bId: string): PairKey => (aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`);

const centroid = (pts: Pt[]) => {
  if (!pts.length) return { x: 0, y: 0 };
  const sum = pts.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
};

const boundsOf = (pts: Pt[]) => {
  if (!pts.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  pts.forEach((pt) => {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  });
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
};

const clampOffsetToPage = ({
  sampled,
  localCenter,
  strap,
  box,
  marginMM,
}: {
  sampled: Pt[];
  localCenter: Pt;
  strap: Pick<Strap, 'scalePct' | 'rotDeg' | 'flip' | 'offset'>;
  box: { w: number; h: number };
  marginMM: number;
}) => {
  const centered = sampled.map((p) => ({ x: p.x - localCenter.x, y: p.y - localCenter.y }));
  const transformed = transformPolyline(centered, {
    scalePct: strap.scalePct,
    rotDeg: strap.rotDeg,
    flipX: strap.flip,
    offset: { x: strap.offset.x + localCenter.x, y: strap.offset.y + localCenter.y },
  });
  const b = boundsOf(transformed);
  let adjustX = 0;
  let adjustY = 0;
  if (b.minX < marginMM) adjustX = marginMM - b.minX;
  if (b.maxX > box.w - marginMM) adjustX = (box.w - marginMM) - b.maxX;
  if (b.minY < marginMM) adjustY = marginMM - b.minY;
  if (b.maxY > box.h - marginMM) adjustY = (box.h - marginMM) - b.maxY;
  return { x: strap.offset.x + adjustX, y: strap.offset.y + adjustY };
};

const fitStrapToPage = ({
  d,
  box,
  centerX,
  centerY,
  marginMM,
}: {
  d: string;
  box: { w: number; h: number };
  centerX: number;
  centerY: number;
  marginMM: number;
}) => {
  const sampled = samplePathDToPolyline(d, 1.25);
  const localCenter = centroid(sampled);
  const b = boundsOf(sampled);
  const availW = box.w - 2 * marginMM;
  const availH = box.h - 2 * marginMM;
  const scalePct = Math.max(5, Math.min(400, Math.min(availW / Math.max(b.w, 1e-6), availH / Math.max(b.h, 1e-6)) * 100 * 0.85));
  const offset = { x: centerX - localCenter.x, y: centerY - localCenter.y };
  return { scalePct, offset };
};


const bandPolygonD = (asc: Pt[], desc: Pt[]) => {
  if (!asc?.length || !desc?.length) return '';
  const a = asc.map((p) => `${p.x},${p.y}`).join(' L ');
  const d = [...desc].reverse().map((p) => `${p.x},${p.y}`).join(' L ');
  return `M ${a} L ${d} Z`;
};

const slotOrderForPair = (crossingsForPair: Crossing[], aPts: Pt[], bPts: Pt[]) => {
  const ca = centroid(aPts);
  const cb = centroid(bPts);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy);
  const u = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const v = { x: -u.y, y: u.x };
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };

  return crossingsForPair
    .map((crossing) => {
      const rx = crossing.x - mid.x;
      const ry = crossing.y - mid.y;
      return {
        crossing,
        t: rx * u.x + ry * u.y,
        s: rx * v.x + ry * v.y,
      };
    })
    .sort((left, right) => (
      right.t - left.t
      || left.s - right.s
      || left.crossing.id.localeCompare(right.crossing.id)
    ))
    .map((entry) => entry.crossing.id);
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

function circlePathD(r = 40) {
  return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
}

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const SCRIPT_DEFAULTS = {
  TexturaQuadrata: {
    nibMMText: '4',
    nibAngleDeg: 45 as const,
    xNibText: '5',
    ascNibText: '2',
    descNibText: '2',
  },
  Fraktur: {
    nibMMText: '4',
    nibAngleDeg: 40 as const,
    xNibText: '4.5',
    ascNibText: '2',
    descNibText: '2',
  },
  Copperplate: {
    xHeightMMText: '6',
    copperplateRatioPreset: '3:2:3' as CopperplateRatioPreset,
  },
};

function applyScriptDefaults(strap: Strap, script: ScriptId): Strap {
  if (script === 'Copperplate') {
    return {
      ...strap,
      script,
      xHeightMMText: SCRIPT_DEFAULTS.Copperplate.xHeightMMText,
      copperplateRatioPreset: SCRIPT_DEFAULTS.Copperplate.copperplateRatioPreset,
      xNibText: undefined,
      ascNibText: undefined,
      descNibText: undefined,
    };
  }

  const blackletterDefaults = script === 'Fraktur'
    ? SCRIPT_DEFAULTS.Fraktur
    : SCRIPT_DEFAULTS.TexturaQuadrata;

  return {
    ...strap,
    script,
    nibMMText: blackletterDefaults.nibMMText,
    nibAngleDeg: blackletterDefaults.nibAngleDeg,
    xNibText: blackletterDefaults.xNibText,
    ascNibText: blackletterDefaults.ascNibText,
    descNibText: blackletterDefaults.descNibText,
  };
}

function guideMetrics(strap: Strap) {
  const nibMM = Math.max(0.2, Number.parseFloat(strap.nibMMText) || 2.5);

  if (strap.script === 'Copperplate') {
    const xMM = Math.max(0.5, Number.parseFloat(strap.xHeightMMText ?? '6') || 6);
    let descUnits = 3;
    let xUnits = 2;
    let ascUnits = 3;
    if (strap.copperplateRatioPreset === '2:1:2') {
      descUnits = 2;
      xUnits = 1;
      ascUnits = 2;
    } else if (strap.copperplateRatioPreset === '1:1:1') {
      descUnits = 1;
      xUnits = 1;
      ascUnits = 1;
    } else if (strap.copperplateRatioPreset === 'custom') {
      descUnits = Math.max(0, Number.parseFloat(strap.copperplateDescUnitsText ?? '3') || 3);
      xUnits = Math.max(0.5, Number.parseFloat(strap.copperplateXUnitsText ?? '2') || 2);
      ascUnits = Math.max(0, Number.parseFloat(strap.copperplateAscUnitsText ?? '3') || 3);
    }
    const unitMM = xMM / Math.max(0.5, xUnits);
    const ascMM = ascUnits * unitMM;
    const descMM = descUnits * unitMM;
    const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);
    return { xMM, ascMM, descMM, bandWidthMM, nibMM, effectiveNibMM: nibMM };
  }

  const angleRad = (strap.nibAngleDeg * Math.PI) / 180;
  const effectiveNibMM = Math.max(0.2, nibMM * Math.cos(angleRad));

  const xNib = Math.max(1, Number.parseFloat(strap.xNibText ?? '5') || 5);
  const ascNib = Math.max(0, Number.parseFloat(strap.ascNibText ?? '3') || 3);
  const descNib = Math.max(0, Number.parseFloat(strap.descNibText ?? '2') || 2);
  const ascMM = ascNib * nibMM;
  const descMM = descNib * nibMM;
  const xMM = xNib * nibMM;
  const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);

  return {
    xMM,
    ascMM,
    descMM,
    bandWidthMM,
    nibMM,              // raw nib
    effectiveNibMM,     // projected nib (for tick spacing)
  };
}

export default function PathGuidesPage() {
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const box = useMemo(() => {
    const raw = PAPERS_MM[paper];
    if (orientation === 'landscape' && raw.w < raw.h) return { w: raw.h, h: raw.w };
    if (orientation === 'portrait' && raw.w > raw.h) return { w: raw.h, h: raw.w };
    return { w: raw.w, h: raw.h };
  }, [orientation, paper]);
  const centerX = box.w / 2;
  const centerY = box.h / 2;
  const [view, setView] = useState<ViewMode>('autofit');
  const [zoom, setZoom] = useState(1.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dragListId, setDragListId] = useState<string | null>(null);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groups, setGroups] = useState<StrapGroup[]>([]);
  const [simplify, setSimplify] = useState(true);
  const [showCrossings, setShowCrossings] = useState(true);
  const [activeCrossingId, setActiveCrossingId] = useState<string | null>(null);
  const [crossingsFilter, setCrossingsFilter] = useState<CrossingsFilter>('all');
  const [showAllCrossings, setShowAllCrossings] = useState(false);
  const [crossingOverrides, setCrossingOverrides] = useState<PairOverrides>({});
  const [showDebugPoints] = useState(false);
  const [dragSimplifyStrapId, setDragSimplifyStrapId] = useState<string | null>(null);
  const [scaleInputText, setScaleInputText] = useState('');

  const [straps, setStraps] = useState<Strap[]>(() => ([applyScriptDefaults({
    id: uid('strap'),
    name: 'Circle',
    d: circlePathD(40),
    color: PALETTE[0],
    script: 'Copperplate',
    nibMMText: '2.5',
    nibAngleDeg: 45,
    xHeightMMText: '6',
    copperplateRatioPreset: '3:2:3',
    offset: { x: centerX, y: centerY },
    scalePct: 100,
    rotDeg: 0,
    flip: false,
    snapped: false,
    invertGuides: false,
  }, 'Copperplate')]));
  const [activeId, setActiveId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ mode: 'none' | 'pan' | 'strap'; pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number }; strapId?: string; startOffset?: { x: number; y: number }; startSnapped?: boolean; startLocalCenter?: { x: number; y: number } }>({
    mode: 'none',
    pointerId: -1,
    startClient: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const activeStrap = straps.find((s) => s.id === (activeId ?? straps[0]?.id)) ?? straps[0] ?? null;

  const renderData = useMemo(() => straps.map((strap) => {
    const sampled = samplePathDToPolyline(strap.d, 1.25);
    const localCenter = centroid(sampled);
    const centered = sampled.map((p) => ({ x: p.x - localCenter.x, y: p.y - localCenter.y }));
    const transformed = transformPolyline(centered, {
      scalePct: strap.scalePct,
      rotDeg: strap.rotDeg,
      flipX: strap.flip,
      offset: { x: strap.offset.x + localCenter.x, y: strap.offset.y + localCenter.y },
    });
    const metrics = guideMetrics(strap);

    const guideSet = transformed.length > 1
      ? buildGuideSet(strap.script === 'Copperplate' ? 'copperplate' : 'blackletter', {
          baseline: transformed,
          xMM: metrics.xMM,
          ascMM: metrics.ascMM,
          descMM: metrics.descMM,
    
          // ✅ tick spacing: use effective nib for blackletter (matches Calligram)
          tickStepMM: strap.script === 'Copperplate'
            ? Math.max(2, metrics.nibMM)
            : metrics.effectiveNibMM,
    
          // ✅ actualNibMM: pass the raw nib size (matches Calligram)
          actualNibMM: metrics.nibMM,
          invertGuides: strap.invertGuides,
        })
      : null;

    return { strap, transformed, guideSet, metrics, localCenter, sampled };
  }), [straps]);

  const totalSegments = useMemo(
    () => renderData.reduce((sum, r) => sum + Math.max(0, r.transformed.length - 1), 0),
    [renderData],
  );
  const crossingPerformanceWarning = totalSegments > CROSSING_MAX_SEGMENTS;
  const transformedById = useMemo(() => new Map(renderData.map((r) => [r.strap.id, r.transformed])), [renderData]);

  const baseCrossings = useMemo(() => {
    if (crossingPerformanceWarning) return [];
    return findCrossingsForStraps(
      renderData.map((r) => ({ id: r.strap.id, pts: r.transformed })),
      CROSS_EPS_MM,
    );
  }, [crossingPerformanceWarning, renderData]);

  const pairSlotsByCrossingId = useMemo(() => {
    const slots = new Map<string, { key: PairKey; slot: number }>();
    const crossingsByPair = new Map<PairKey, Crossing[]>();

    baseCrossings.forEach((crossing) => {
      const key = pairKey(crossing.aId, crossing.bId);
      if (!crossingsByPair.has(key)) crossingsByPair.set(key, []);
      crossingsByPair.get(key)!.push(crossing);
    });

    crossingsByPair.forEach((crossingsForPair) => {
      const first = crossingsForPair[0];
      const aPts = transformedById.get(first.aId) ?? [];
      const bPts = transformedById.get(first.bId) ?? [];
      const orderedIds = slotOrderForPair(crossingsForPair, aPts, bPts);
      orderedIds.forEach((crossingId, slot) => {
        slots.set(crossingId, { key: pairKey(first.aId, first.bId), slot });
      });
    });

    return slots;
  }, [baseCrossings, transformedById]);

  const crossingsWithOverrides = useMemo(
    () => baseCrossings.map((crossing) => {
      const slotMeta = pairSlotsByCrossingId.get(crossing.id);
      const overId = slotMeta ? (crossingOverrides[slotMeta.key]?.[slotMeta.slot] ?? crossing.overId) : crossing.overId;
      return { ...crossing, overId };
    }),
    [baseCrossings, crossingOverrides, pairSlotsByCrossingId],
  );

  const crossingsDisplay = useMemo(() => {
    const filtered = crossingsFilter === 'selected' && activeStrap
      ? crossingsWithOverrides.filter((c) => c.aId === activeStrap.id || c.bId === activeStrap.id)
      : crossingsWithOverrides;
    return showAllCrossings ? filtered : filtered.slice(0, 50);
  }, [activeStrap, crossingsFilter, crossingsWithOverrides, showAllCrossings]);

  const vb = useMemo(() => {
    if (view === 'fullpage') return { minX: 0, minY: 0, vw: box.w, vh: box.h, str: `0 0 ${box.w} ${box.h}` };
    const safeZoom = Math.max(0.35, zoom);
    const vw = box.w / safeZoom;
    const vh = box.h / safeZoom;
    const minX = (box.w - vw) / 2 - pan.x;
    const minY = (box.h - vh) / 2 - pan.y;
    return { minX, minY, vw, vh, str: `${minX} ${minY} ${vw} ${vh}` };
  }, [box.h, box.w, pan, view, zoom]);

  const strapById = useMemo(() => new Map(renderData.map((r) => [r.strap.id, r])), [renderData]);
  function bandWindowDFromGuideSet(
    guideSet: NonNullable<(typeof renderData)[number]["guideSet"]>,
    segIdx: number,
    windowMM: number,
  ) {
    const asc0 = guideSet.ascLine;
    const desc0 = guideSet.descLine;
    if (!asc0?.length || !desc0?.length) return "";
  
    const ascN0 = asc0.length;
    const descN0 = desc0.length;
  
    // Detect "closed" by first ~= last (tiny tolerance in mm coords).
    const ascIsClosed =
      ascN0 > 2 &&
      Math.hypot(asc0[0].x - asc0[ascN0 - 1].x, asc0[0].y - asc0[ascN0 - 1].y) < 0.05;
    const descIsClosed =
      descN0 > 2 &&
      Math.hypot(desc0[0].x - desc0[descN0 - 1].x, desc0[0].y - desc0[descN0 - 1].y) < 0.05;
  
    // If closed, drop duplicate last point.
    const asc = ascIsClosed ? asc0.slice(0, -1) : asc0;
    const desc = descIsClosed ? desc0.slice(0, -1) : desc0;
  
    const n = Math.min(asc.length, desc.length);
    if (n < 2) return "";
  
    // segIdx comes from intersections; treat as point-ish index and clamp.
    const center = Math.max(0, Math.min(n - 1, segIdx));
  
    const wrap = ascIsClosed && descIsClosed;
  
    const dist = (i: number, j: number) =>
      Math.hypot(asc[i].x - asc[j].x, asc[i].y - asc[j].y);
  
    // Walk backward/forward from center until we hit ~windowMM along the asc polyline.
    let left = center;
    let right = center;
  
    // Backwards
    let acc = 0;
    while (acc < windowMM && (wrap ? acc < windowMM : left > 0)) {
      const prev = wrap ? (left - 1 + n) % n : left - 1;
      if (!wrap && prev < 0) break;
      acc += dist(left, prev);
      left = prev;
      if (!wrap && left === 0) break;
      if (wrap && left === center) break;
    }
  
    // Forwards
    acc = 0;
    while (acc < windowMM && (wrap ? acc < windowMM : right < n - 1)) {
      const next = wrap ? (right + 1) % n : right + 1;
      if (!wrap && next >= n) break;
      acc += dist(right, next);
      right = next;
      if (!wrap && right === n - 1) break;
      if (wrap && right === center) break;
    }
  
    // Collect indices from left..right (wrap-aware)
    const ascPts: { x: number; y: number }[] = [];
    const descPts: { x: number; y: number }[] = [];
  
    if (wrap && left > right) {
      // left..end, 0..right
      for (let i = left; i < n; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
      for (let i = 0; i <= right; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
    } else {
      for (let i = left; i <= right; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
    }
  
    if (ascPts.length < 2 || descPts.length < 2) return "";
  
    const a = ascPts.map((p) => `${p.x},${p.y}`).join(" L ");
    const d = descPts
      .slice()
      .reverse()
      .map((p) => `${p.x},${p.y}`)
      .join(" L ");
    return `M ${a} L ${d} Z`;
  }

// --- Weave masking: for each UNDER strap, collect the crossings where it is UNDER ---
const underCrossings = useMemo(() => {
  const map = new Map<string, typeof crossingsWithOverrides>();
  crossingsWithOverrides.forEach((c) => {
    const under = c.aId === c.overId ? c.bId : c.aId;
    if (!map.has(under)) map.set(under, []);
    map.get(under)!.push(c);
  });
  return map;
}, [crossingsWithOverrides]);

const setCrossingOver = (crossing: Crossing, overId: string) => {
  const slotMeta = pairSlotsByCrossingId.get(crossing.id);
  if (!slotMeta) return;

  setCrossingOverrides((prev) => ({
    ...prev,
    [slotMeta.key]: {
      ...(prev[slotMeta.key] ?? {}),
      [slotMeta.slot]: overId,
    },
  }));
  setActiveCrossingId(crossing.id);
};

  const updateStrap = (id: string, patch: Partial<Strap>) => {
    setStraps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const applyViewPreset = (next: ViewMode) => {
    setView(next);
    if (next === 'autofit') {
      setZoom(1.35);
      setPan({ x: 0, y: 0 });
    }
    if (next === 'fullpage') setPan({ x: 0, y: 0 });
  };

  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    dragRef.current = {
      mode: 'pan',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPan: pan,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const beginStrapDrag = (strapId: string) => (e: React.PointerEvent<SVGPathElement | SVGLineElement | SVGPolylineElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const strap = straps.find((s) => s.id === strapId);
    if (!strap || !svgRef.current) return;
    setActiveId(strapId);
    setDragSimplifyStrapId(strapId);
    dragRef.current = {
      mode: 'strap',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPan: pan,
      strapId,
      startOffset: strap.offset,
      startSnapped: strap.snapped,
      startLocalCenter: strapById.get(strapId)?.localCenter,
    };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.mode === 'none') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dxMM = ((e.clientX - drag.startClient.x) / rect.width) * vb.vw;
    const dyMM = ((e.clientY - drag.startClient.y) / rect.height) * vb.vh;

    if (drag.mode === 'pan') {
      setView('custom');
      setPan({ x: drag.startPan.x - dxMM, y: drag.startPan.y - dyMM });
      return;
    }

    if (!drag.strapId || !drag.startOffset) return;
    let nextX = drag.startOffset.x + dxMM;
    const nextY = drag.startOffset.y + dyMM;
    let snapped = drag.startSnapped ?? false;

    const cX = drag.startLocalCenter?.x ?? 0;
    if (snapped) {
      if (Math.abs((nextX + cX) - centerX) > RELEASE_MM) snapped = false;
      else nextX = centerX - cX;
    }
    if (!snapped && Math.abs((nextX + cX) - centerX) <= SNAP_IN_MM) {
      nextX = centerX - cX;
      snapped = true;
    }

    setStraps((prev) => prev.map((s) => (s.id === drag.strapId ? { ...s, offset: { x: nextX, y: nextY }, snapped } : s)));
  };

  const onSvgPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current = { mode: 'none', pointerId: -1, startClient: { x: 0, y: 0 }, startPan: { x: 0, y: 0 } };
      setDragSimplifyStrapId(null);
    }
  };

  const addCircle = () => {
    const i = straps.length;
    const step = 10;
    const pattern = [
      { x: step, y: step },
      { x: step * 2, y: step },
      { x: step, y: step * 2 },
      { x: 0, y: step },
      { x: step, y: 0 },
      { x: step * 2, y: step * 2 },
      { x: 0, y: step * 2 },
      { x: step * 2, y: 0 },
      { x: 0, y: 0 },
    ];
    const localOffset = pattern[i % pattern.length];
    const baseD = circlePathD(40);
    const sampled = samplePathDToPolyline(baseD, 1.25);
    const localCenterPt = centroid(sampled);
    const offset = clampOffsetToPage({
      sampled,
      localCenter: localCenterPt,
      strap: { scalePct: 100, rotDeg: 0, flip: false, offset: { x: centerX + localOffset.x, y: centerY + localOffset.y } },
      box,
      marginMM: FIT_MARGIN_MM,
    });

    const next = applyScriptDefaults({
      id: uid('strap'),
      name: `Circle ${straps.length + 1}`,
      d: baseD,
      color: PALETTE[straps.length % PALETTE.length],
      script: 'Copperplate',
      nibMMText: '2.5',
      nibAngleDeg: 45,
      xHeightMMText: '6',
      copperplateRatioPreset: '3:2:3',
      offset,
      scalePct: 100,
      rotDeg: 0,
      flip: false,
      snapped: false,
      invertGuides: false,
    }, 'Copperplate');
    setStraps((prev) => [...prev, next]);
    setActiveId(next.id);
  };

  const parseUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const created: Strap[] = [];

    for (const file of Array.from(files)) {
      const text = await file.text();
      // v1 parser: regex path extraction; ignores transforms and non-<path> geometry.
      const matches = [...text.matchAll(/<path\b[^>]*\bd=(['"])([\s\S]*?)\1/gi)];
      matches.forEach((m, idx) => {
        const d = m[2]?.trim();
        if (!d) return;
        const fit = fitStrapToPage({ d, box, centerX, centerY, marginMM: FIT_MARGIN_MM });
        created.push(applyScriptDefaults({
          id: uid('strap'),
          name: `${file.name.replace(/\.svg$/i, '')} ${idx + 1}`,
          d,
          color: PALETTE[(straps.length + created.length) % PALETTE.length],
          script: 'Copperplate',
          nibMMText: '2.5',
          nibAngleDeg: 45,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: fit.offset,
          scalePct: fit.scalePct,
          rotDeg: 0,
          flip: false,
          snapped: false,
          invertGuides: false,
        }, 'Copperplate'));
      });
    }

    if (!created.length) {
      setError('No paths found in SVG');
      return;
    }

    setStraps((prev) => [...prev, ...created]);
    setActiveId(created[0].id);
  };

  const reorderStraps = (sourceId: string, targetId: string) => {
    setStraps((prev) => {
      const srcIdx = prev.findIndex((s) => s.id === sourceId);
      const dstIdx = prev.findIndex((s) => s.id === targetId);
      if (srcIdx < 0 || dstIdx < 0 || srcIdx === dstIdx) return prev;
      const copy = [...prev];
      const [item] = copy.splice(srcIdx, 1);
      copy.splice(dstIdx, 0, item);
      return copy;
    });
  };

  return (
    <main className="min-h-screen text-sm text-slate-900 relative">
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">Calligraphy Tools <span className="text-indigo-600">— Custom Guideline Tool</span></h1>
          <p className="mt-1 text-sm text-slate-600">Upload SVG paths and generate calligraphy guidelines that follow each path. Arrange and layer straps to plan interwoven layouts.</p>
        </div>
      </header>

      <section className="px-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-start gap-3 mb-2">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-slate-800">Preview</h3>
              <select className="p-1.5 text-sm rounded-lg border border-slate-300" value={view} onChange={(e) => applyViewPreset(e.target.value as ViewMode)}>
                <option value="autofit">Auto-fit straps</option>
                <option value="fullpage">Full page</option>
                <option value="custom">Custom</option>
              </select>
              <button onClick={() => setSimplify((v) => !v)} className={`px-2 py-1 text-sm rounded-lg border ${simplify ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white'}`}>Simplify</button>
              <button onClick={() => setShowCrossings((v) => !v)} className={`px-2 py-1 text-sm rounded-lg border ${showCrossings ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white'}`}>Crossings</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button onClick={() => { setView('custom'); setZoom((z) => Math.max(0.35, z * 0.9)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">–</button>
              <button onClick={() => { setView('custom'); setZoom((z) => Math.min(6, z * 1.1)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">+</button>
              <button onClick={() => applyViewPreset('autofit')} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">Reset view</button>
            </div>
          </div>

          {crossingPerformanceWarning && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              Too many points; increase step size.
            </div>
          )}

          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className="block mx-auto w-full h-[38vh] sm:h-[44vh] md:h-[50vh] touch-none cursor-grab active:cursor-grabbing"
              style={{ background: '#cbd5e1' }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
            >
{!simplify && (
  <defs>
    {[...underCrossings.entries()].map(([underId, list]) => (
      <mask
        key={`mask-${underId}`}
        id={`mask-${underId}`}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={box.w}
        height={box.h}
      >
        {/* Always start fully visible over the whole page (NOT viewBox). */}
        <rect x={0} y={0} width={box.w} height={box.h} fill="white" />

        {/* For every crossing where this strap is UNDER, cut out the OVER strap band near that crossing. */}
        {list.map((c) => {
          const overId = c.overId;
          const over = strapById.get(overId);
          if (!over?.guideSet) return null;

          const overSeg = overId === c.aId ? c.aSeg : c.bSeg;

          // Intersections give a *segment* index; center the window on the next point.
          const centerIdx = overSeg + 1;
          
          const bandD = bandWindowDFromGuideSet(
            over.guideSet,
            centerIdx,
            Math.max(12, over.metrics.bandWidthMM * 2.5),
          );
          
          
          if (!bandD) return null;

          const windowMM = Math.max(12, over.metrics.bandWidthMM * 2.5);
          
          const d0 = bandWindowDFromGuideSet(over.guideSet, centerIdx - 1, windowMM);
          const d1 = bandWindowDFromGuideSet(over.guideSet, centerIdx, windowMM);
          const d2 = bandWindowDFromGuideSet(over.guideSet, centerIdx + 1, windowMM);
          
          return (
            <g key={`hole-${underId}-${c.id}`}>
              {d0 ? <path d={d0} fill="black" /> : null}
              {d1 ? <path d={d1} fill="black" /> : null}
              {d2 ? <path d={d2} fill="black" /> : null}
            </g>
          );
        })}
      </mask>
    ))}
  </defs>
)}
              <rect x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <line x1={centerX} y1={0} x2={centerX} y2={box.h} stroke="#e2e8f0" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

              {renderData.map(({ strap, transformed, guideSet }) => {
                const strapIsTempSimplified = dragSimplifyStrapId === strap.id;
                const isSimplifiedForThisStrap = simplify || strapIsTempSimplified;

                return (
                  <g
                    key={strap.id}
                    mask={
                      !isSimplifiedForThisStrap && underCrossings.get(strap.id)?.length
                        ? `url(#mask-${strap.id})`
                        : undefined
                    }
                  >
                    {isSimplifiedForThisStrap ? (
                      guideSet && (
                        <path
                          d={bandPolygonD(guideSet.ascLine, guideSet.descLine)}
                          fill={strap.color}
                          stroke="none"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="fill"
                          onPointerDown={beginStrapDrag(strap.id)}
                        />
                      )
                    ) : transformed.length > 1 && (
                      <path
                        d={pathD(transformed)}
                        fill="none"
                        stroke={strap.color}
                        strokeWidth={0.9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                    )}
                    {!isSimplifiedForThisStrap && guideSet && (
                      <GuideOverlay
                        guideSet={guideSet}
                        style={{
                          thin: 0.45,
                          bold: 0.75,
                          colors: {
                            thin: strap.color,
                            bold: activeStrap?.id === strap.id ? '#7c3aed' : strap.color,
                            tick: '#dbeafe',
                            frame: 'transparent',
                          },
                        }}
                        interactive={{ onGuidePointerDown: beginStrapDrag(strap.id), hitStrokeWidthMM: 6 }}
                      />
                    )}

                    {showDebugPoints && !isSimplifiedForThisStrap && transformed.map((pt, i) => (
                      <g key={`dbg-${strap.id}-${i}`}>
                        <circle cx={pt.x} cy={pt.y} r={0.8} fill="#ef4444" vectorEffect="non-scaling-stroke" />
                        <text x={pt.x + 1} y={pt.y - 1} fontSize="2.6" fill="#b91c1c">{i}</text>
                      </g>
                    ))}
                  </g>
                );
              })}

              {simplify && crossingsWithOverrides.map((crossing) => {
                const over = strapById.get(crossing.overId);
                if (!over?.guideSet) return null;

                const overSeg = crossing.overId === crossing.aId ? crossing.aSeg : crossing.bSeg;
                const centerIdx = overSeg + 1;
                const dOver = bandWindowDFromGuideSet(
                  over.guideSet,
                  centerIdx,
                  Math.max(12, over.metrics.bandWidthMM * 2.5),
                );
                if (!dOver) return null;

                return (
                  <g key={`weave-${crossing.id}`} pointerEvents="none">
                    <path d={dOver} fill={over.strap.color} stroke="none" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}

              {showCrossings && crossingsWithOverrides.map((crossing, idx) => (
                <g
                  key={`marker-${crossing.id}`}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextOver = crossing.overId === crossing.aId ? crossing.bId : crossing.aId;
                    setCrossingOver(crossing, nextOver);
                  }}
                >
                  {activeCrossingId === crossing.id && (
                    <circle cx={crossing.x} cy={crossing.y} r={3} fill="none" stroke="#4f46e5" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  )}
                  <circle cx={crossing.x} cy={crossing.y} r={1.8} fill="#ffffff" stroke="#111827" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                  <text x={crossing.x + 2.6} y={crossing.y - 2.2} fontSize="3.2" fill="#111827" stroke="white" strokeWidth={0.15} paintOrder="stroke">{idx + 1}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </section>

      <section className="px-6 py-5 max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 1 — Manage straps</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={addCircle} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">Add circle (test)</button>
            <label className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Upload SVG(s)
              <input type="file" accept=".svg" multiple className="hidden" onChange={(e) => parseUpload(e.target.files)} />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InsetLabeledField label="Paper size">
              <select
                className={INSET_CONTROL_BASE}
                value={paper}
                onChange={(e) => {
                  const nextPaper = e.target.value as PaperId;
                  setPaper(nextPaper);
                  setOrientation(PAPERS_MM[nextPaper].defaultOrientation);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {Object.entries(PAPERS_MM).map(([id, p]) => (
                  <option key={id} value={id}>{p.label}</option>
                ))}
              </select>
            </InsetLabeledField>
            <InsetLabeledField label="Orientation">
              <select
                className={INSET_CONTROL_BASE}
                value={orientation}
                onChange={(e) => {
                  setOrientation(e.target.value as Orientation);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </InsetLabeledField>
          </div>
          {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
          <div className="mt-4 space-y-2">
            {straps.map((strap, idx) => (
              <div key={strap.id} className="rounded-lg border border-slate-200 p-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: strap.color }} />
                <span className="flex-1 truncate">{strap.name}</span>
                <button onClick={() => setActiveId(strap.id)} className="px-2 py-1 rounded border border-slate-300">Select</button>
                <button onClick={() => {
                  const sampled = samplePathDToPolyline(strap.d, 1.25);
                  const localCenter = centroid(sampled);
                  const duplicate = {
                    ...strap,
                    id: uid('strap'),
                    name: `${strap.name} copy`,
                    color: PALETTE[(straps.length + 1) % PALETTE.length],
                    offset: { x: strap.offset.x + 8, y: strap.offset.y + 8 },
                    flip: strap.flip,
                    snapped: false,
                    invertGuides: strap.invertGuides,
                  };
                  duplicate.offset = clampOffsetToPage({ sampled, localCenter, strap: duplicate, box, marginMM: FIT_MARGIN_MM });
                  setStraps((prev) => [...prev, duplicate]);
                }} className="px-2 py-1 rounded border border-slate-300">Duplicate</button>
                <button disabled={straps.length <= 1} onClick={() => {
                  setStraps((prev) => prev.filter((s) => s.id !== strap.id));
                  if (activeId === strap.id) setActiveId(straps.find((s) => s.id !== strap.id)?.id ?? null);
                }} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Remove</button>
                <input type="checkbox" checked={selectedForGroup.includes(strap.id)} onChange={(e) => setSelectedForGroup((prev) => e.target.checked ? [...new Set([...prev, strap.id])] : prev.filter((id) => id !== strap.id))} title="Select for group" />
                <span className="text-xs text-slate-500">#{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 2 — Strap settings</h2>
          <p className="mt-1 text-xs text-slate-600">{activeStrap?.script === 'Copperplate' ? 'Copperplate uses x-height (mm).' : 'Blackletter scripts use nib size and nib angle.'}</p>
          {!activeStrap && <p className="mt-3 text-slate-500">Select a strap.</p>}
          {activeStrap && (
            <div className="mt-3 space-y-3">
              <InsetLabeledField label="Script">
                <select className={INSET_CONTROL_BASE} value={activeStrap.script} onChange={(e) => {
                  const script = e.target.value as ScriptId;
                  setStraps((prev) => prev.map((strap) => (strap.id === activeStrap.id ? applyScriptDefaults(strap, script) : strap)));
                }}>
                  {Object.keys(SCRIPT_PROFILES).map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </InsetLabeledField>

              {activeStrap.script === 'Copperplate' ? (
                <>
                  <InsetLabeledField label="X-height" rightAdornment="mm">
                    <input type="number" min={0.5} step="0.5" className={INSET_CONTROL_MM} value={activeStrap.xHeightMMText ?? '6'} onChange={(e) => updateStrap(activeStrap.id, { xHeightMMText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                  </InsetLabeledField>
                  <InsetLabeledField label="Guideline ratio (desc : x : asc)">
                    <select className={INSET_CONTROL_BASE} value={activeStrap.copperplateRatioPreset ?? '3:2:3'} onChange={(e) => updateStrap(activeStrap.id, { copperplateRatioPreset: e.target.value as CopperplateRatioPreset })}>
                      <option value="3:2:3">3 : 2 : 3</option><option value="2:1:2">2 : 1 : 2</option><option value="1:1:1">1 : 1 : 1</option><option value="custom">Custom</option>
                    </select>
                  </InsetLabeledField>
                  {(activeStrap.copperplateRatioPreset ?? '3:2:3') === 'custom' && (
                    <div className="grid grid-cols-3 gap-2">
                      <InsetLabeledField label="Desc units">
                        <input type="number" step="0.5" min={0} className={INSET_CONTROL_BASE} value={activeStrap.copperplateDescUnitsText ?? '3'} onChange={(e) => updateStrap(activeStrap.id, { copperplateDescUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateDescUnitsText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { copperplateDescUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateDescUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateStrap(activeStrap.id, { copperplateDescUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                      <InsetLabeledField label="X units">
                        <input type="number" step="0.5" min={0.5} className={INSET_CONTROL_BASE} value={activeStrap.copperplateXUnitsText ?? '2'} onChange={(e) => updateStrap(activeStrap.id, { copperplateXUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateXUnitsText ?? '2') || 2; const next = Math.max(0.5, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { copperplateXUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateXUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0.5, snapHalf(parsed)) : 2; updateStrap(activeStrap.id, { copperplateXUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                      <InsetLabeledField label="Asc units">
                        <input type="number" step="0.5" min={0} className={INSET_CONTROL_BASE} value={activeStrap.copperplateAscUnitsText ?? '3'} onChange={(e) => updateStrap(activeStrap.id, { copperplateAscUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateAscUnitsText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { copperplateAscUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateAscUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateStrap(activeStrap.id, { copperplateAscUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <InsetLabeledField label="Nib size" rightAdornment="mm">
                    <input type="number" min={0.2} step="0.5" className={INSET_CONTROL_MM} value={activeStrap.nibMMText} onChange={(e) => updateStrap(activeStrap.id, { nibMMText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                  </InsetLabeledField>
                  <InsetLabeledField label="x-height (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                    <input type="number" step="0.5" min={1} className={INSET_CONTROL_WIDE} value={activeStrap.xNibText ?? '5'} onChange={(e) => updateStrap(activeStrap.id, { xNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.xNibText ?? '5') || 5; const next = Math.max(1, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { xNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.xNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(1, snapHalf(parsed)) : 5; updateStrap(activeStrap.id, { xNibText: String(next) }); }} />
                  </InsetLabeledField>
                  <InsetLabeledField label="Ascender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                    <input type="number" step="0.5" min={0} className={INSET_CONTROL_WIDE} value={activeStrap.ascNibText ?? '3'} onChange={(e) => updateStrap(activeStrap.id, { ascNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.ascNibText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { ascNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.ascNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateStrap(activeStrap.id, { ascNibText: String(next) }); }} />
                  </InsetLabeledField>
                  <InsetLabeledField label="Descender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                    <input type="number" step="0.5" min={0} className={INSET_CONTROL_WIDE} value={activeStrap.descNibText ?? '2'} onChange={(e) => updateStrap(activeStrap.id, { descNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.descNibText ?? '2') || 2; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateStrap(activeStrap.id, { descNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.descNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 2; updateStrap(activeStrap.id, { descNibText: String(next) }); }} />
                  </InsetLabeledField>
                  <InsetLabeledField label="Nib angle (°)">
                    <select className={INSET_CONTROL_BASE} value={activeStrap.nibAngleDeg} onChange={(e) => updateStrap(activeStrap.id, { nibAngleDeg: Number(e.target.value) as 35 | 40 | 45 })}>
                      <option value={35}>35°</option><option value={40}>40°</option><option value={45}>45°</option>
                    </select>
                  </InsetLabeledField>
                </>
              )}

              <div className="grid grid-cols-1 gap-4 select-none">
                <div>
                  <label className="font-medium text-slate-700">Rotation (°) <span className="text-indigo-600">{activeStrap.rotDeg}°</span></label>
                  <input type="range" min={-180} max={180} step={1} value={activeStrap.rotDeg} onChange={(e) => updateStrap(activeStrap.id, { rotDeg: Number.parseInt(e.target.value, 10) || 0 })} className="w-full" />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className="font-medium text-slate-700">Scale (%)</label>
                    <input
                      type="number"
                      min={SCALE_MIN_PCT}
                      max={SCALE_MAX_PCT}
                      step={1}
                      value={scaleInputText || String(Math.round(activeStrap.scalePct))}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setScaleInputText(raw);
                        if (!raw.trim()) return;
                        const parsed = Number.parseFloat(raw);
                        if (!Number.isFinite(parsed)) return;
                        const next = Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed));
                        updateStrap(activeStrap.id, { scalePct: next });
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setScaleInputText('');
                          return;
                        }
                        const parsed = Number.parseFloat(raw);
                        if (!Number.isFinite(parsed)) {
                          setScaleInputText('');
                          return;
                        }
                        const next = Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed));
                        updateStrap(activeStrap.id, { scalePct: next });
                        setScaleInputText('');
                      }}
                      className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                  <input
                    type="range"
                    min={SCALE_MIN_PCT}
                    max={SCALE_MAX_PCT}
                    step={1}
                    value={activeStrap.scalePct}
                    onChange={(e) => {
                      const parsed = Number.parseFloat(e.target.value);
                      const next = Number.isFinite(parsed)
                        ? Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed))
                        : 100;
                      updateStrap(activeStrap.id, { scalePct: next });
                    }}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => updateStrap(activeStrap.id, { offset: { ...activeStrap.offset, x: centerX }, snapped: true })} className="px-2 py-1 rounded border border-slate-300">Center horizontally</button>
                <button onClick={() => updateStrap(activeStrap.id, { rotDeg: 0, scalePct: 100 })} className="px-2 py-1 rounded border border-slate-300">Reset rotation &amp; scale</button>
                <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={activeStrap.flip}
                    onChange={(e) => updateStrap(activeStrap.id, { flip: e.target.checked })}
                  />
                  Flip strap
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={activeStrap.invertGuides}
                    onChange={(e) => updateStrap(activeStrap.id, { invertGuides: e.target.checked })}
                  />
                  Invert guidelines
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 3 — Weave / Layer order</h2>
          <p className="mt-1 text-xs text-slate-600">Order controls render stack. First = back, last = front.</p>
          {activeStrap && (() => {
            const activeIdx = straps.findIndex((s) => s.id === activeStrap.id);
            const canMoveDown = activeIdx > 0;
            const canMoveUp = activeIdx >= 0 && activeIdx < straps.length - 1;
            const moveSelected = (nextIndex: number) => {
              if (activeIdx < 0 || nextIndex < 0 || nextIndex >= straps.length || nextIndex === activeIdx) return;
              setStraps((prev) => {
                const currentIdx = prev.findIndex((s) => s.id === activeStrap.id);
                if (currentIdx < 0 || nextIndex < 0 || nextIndex >= prev.length || currentIdx === nextIndex) return prev;
                const copy = [...prev];
                const [item] = copy.splice(currentIdx, 1);
                copy.splice(nextIndex, 0, item);
                return copy;
              });
              setActiveId(activeStrap.id);
            };

            return (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button disabled={!canMoveUp} onClick={() => moveSelected(straps.length - 1)} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Bring to front</button>
                <button disabled={!canMoveDown} onClick={() => moveSelected(0)} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Send to back</button>
                <button disabled={!canMoveUp} onClick={() => moveSelected(activeIdx + 1)} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Move up</button>
                <button disabled={!canMoveDown} onClick={() => moveSelected(activeIdx - 1)} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Move down</button>
              </div>
            );
          })()}

          <div className="mt-3 space-y-2">
            {straps.map((strap) => (
              <div key={strap.id} draggable onDragStart={() => setDragListId(strap.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => {
                if (dragListId) reorderStraps(dragListId, strap.id);
                setDragListId(null);
              }} className="rounded-lg border border-slate-200 p-2 flex items-center gap-2 cursor-move">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: strap.color }} />
                <button onClick={() => setActiveId(strap.id)} className={`flex-1 text-left ${activeId === strap.id ? 'font-semibold text-indigo-700' : ''}`}>{strap.name}</button>
                <span className="text-xs text-slate-500">#{straps.findIndex((s) => s.id === strap.id) + 1}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-800">Crossings</h3>
            <p className="mt-1 text-xs text-slate-600">Detected crossings: {crossingsWithOverrides.length}</p>
            <select className="mt-2 w-full rounded-lg border border-slate-300 p-2" value={crossingsFilter} onChange={(e) => setCrossingsFilter(e.target.value as CrossingsFilter)}>
              <option value="all">All crossings</option>
              <option value="selected" disabled={!activeStrap}>Only selected strap</option>
            </select>
            {crossingsWithOverrides.length > 50 && (
              <button onClick={() => setShowAllCrossings((v) => !v)} className="mt-2 px-2 py-1 rounded border border-slate-300">{showAllCrossings ? 'Show first 50' : 'Show all'}</button>
            )}
            <div className="mt-2 max-h-48 overflow-auto space-y-2">
              {crossingsDisplay.map((crossing, idx) => {
                const aName = strapById.get(crossing.aId)?.strap.name ?? crossing.aId;
                const bName = strapById.get(crossing.bId)?.strap.name ?? crossing.bId;
                return (
                  <div key={`row-${crossing.id}`} className={`rounded-lg border p-2 ${activeCrossingId === crossing.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                    <p className="text-xs text-slate-700">#{idx + 1} {aName} × {bName}</p>
                    <div className="mt-1 flex gap-1">
                    <button onClick={() => setCrossingOver(crossing, crossing.aId)} className={`px-2 py-1 rounded border text-xs ${crossing.overId === crossing.aId ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-slate-300'}`}>{aName} over</button>
                    <button onClick={() => setCrossingOver(crossing, crossing.bId)} className={`px-2 py-1 rounded border text-xs ${crossing.overId === crossing.bId ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-slate-300'}`}>{bName} over</button>
                    </div>
                  </div>
                );
              })}
              {!crossingsDisplay.length && <p className="text-xs text-slate-500">No crossings to show.</p>}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-800">Weave groups (coming next)</h3>
            <button onClick={() => {
              if (selectedForGroup.length < 2) return;
              setGroups((prev) => [...prev, { id: uid('group'), name: `Group ${prev.length + 1}`, strapIds: selectedForGroup, collapsed: false }]);
              setSelectedForGroup([]);
            }} className="mt-2 px-2 py-1 rounded border border-slate-300">Create group from selected straps</button>
            <div className="mt-2 space-y-2">
              {groups.map((g) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-2">
                  <button className="font-medium" onClick={() => setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, collapsed: !x.collapsed } : x)))}>{g.collapsed ? '▶' : '▼'} {g.name}</button>
                  {!g.collapsed && <p className="text-xs text-slate-600 mt-1">{g.strapIds.map((id) => straps.find((s) => s.id === id)?.name ?? id).join(', ')}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
