'use client';

import React, { useMemo, useRef, useState } from 'react';

import GuideOverlay from '@/components/preview/GuideOverlay';
import { PAPERS_MM, pathD } from '@/lib/curve-helpers';
import { BLACKLETTER_GUIDE_DEFAULTS, buildGuideSet } from '@/lib/guides/guide-template';
import { findCrossingsForStraps } from '@/lib/paths/intersections';
import { polylineSubpathD } from '@/lib/paths/polyline-subpath';
import { samplePathDToPolyline } from '@/lib/paths/sample-svg-path';
import { transformPolyline } from '@/lib/paths/transform';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type CrossingsFilter = 'all' | 'selected';

type Strap = {
  id: string;
  name: string;
  d: string;
  color: string;
  script: ScriptId;
  nibMMText: string;
  nibAngleDeg: 35 | 40 | 45;
  xHeightMMText?: string;
  offset: { x: number; y: number };
  scalePct: number;
  rotDeg: number;
  snapped: boolean;
};

type StrapGroup = {
  id: string;
  name: string;
  strapIds: string[];
  collapsed: boolean;
};

const BOX = { w: PAPERS_MM.A4.w, h: PAPERS_MM.A4.h };
const SNAP_IN_MM = 6;
const RELEASE_MM = 10;
const CROSS_EPS_MM = 1.2;
const CROSSING_MAX_SEGMENTS = 2800;
const PALETTE = ['#1d4ed8', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#dc2626', '#65a30d', '#4f46e5', '#c2410c', '#0f766e', '#be123c', '#4338ca'];

function circlePathD(r = 40) {
  return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
}

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function guideMetrics(strap: Strap) {
  const nibMM = Math.max(0.2, Number.parseFloat(strap.nibMMText) || 2.5);
  if (strap.script === 'Copperplate') {
    const xMM = Math.max(0.5, Number.parseFloat(strap.xHeightMMText ?? '6') || 6);
    const ascMM = xMM * 1.5;
    const descMM = xMM * 1.5;
    const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);
    return { xMM, ascMM, descMM, actualNibMM: nibMM, bandWidthMM };
  }

  const angleRad = (strap.nibAngleDeg * Math.PI) / 180;
  const effectiveNib = Math.max(0.2, nibMM * Math.cos(angleRad));
  const ascMM = BLACKLETTER_GUIDE_DEFAULTS.ascNib * nibMM;
  const descMM = BLACKLETTER_GUIDE_DEFAULTS.descNib * nibMM;
  const xMM = BLACKLETTER_GUIDE_DEFAULTS.xNib * nibMM;
  const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);
  return {
    xMM,
    ascMM,
    descMM,
    actualNibMM: effectiveNib,
    bandWidthMM,
  };
}

export default function PathGuidesPage() {
  const centerX = BOX.w / 2;
  const centerY = BOX.h / 2;
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
  const [crossingOverrides, setCrossingOverrides] = useState<Record<string, string>>({});
  const [showDebugPoints] = useState(false);

  const [straps, setStraps] = useState<Strap[]>(() => ([{
    id: uid('strap'),
    name: 'Circle',
    d: circlePathD(40),
    color: PALETTE[0],
    script: 'Copperplate',
    nibMMText: '2.5',
    nibAngleDeg: 45,
    xHeightMMText: '6',
    offset: { x: centerX, y: centerY },
    scalePct: 100,
    rotDeg: 0,
    snapped: false,
  }]));
  const [activeId, setActiveId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ mode: 'none' | 'pan' | 'strap'; pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number }; strapId?: string; startOffset?: { x: number; y: number }; startSnapped?: boolean }>({
    mode: 'none',
    pointerId: -1,
    startClient: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const activeStrap = straps.find((s) => s.id === (activeId ?? straps[0]?.id)) ?? straps[0] ?? null;

  const renderData = useMemo(() => straps.map((strap) => {
    const sampled = samplePathDToPolyline(strap.d, 1.25);
    const transformed = transformPolyline(sampled, { scalePct: strap.scalePct, rotDeg: strap.rotDeg, offset: strap.offset });
    const metrics = guideMetrics(strap);
    const guideSet = !simplify && transformed.length > 1
      ? buildGuideSet(strap.script === 'Copperplate' ? 'copperplate' : 'blackletter', {
        baseline: transformed,
        xMM: metrics.xMM,
        ascMM: metrics.ascMM,
        descMM: metrics.descMM,
        tickStepMM: Math.max(2, metrics.actualNibMM),
        actualNibMM: metrics.actualNibMM,
      })
      : null;

    return { strap, transformed, guideSet, metrics };
  }), [simplify, straps]);

  const totalSegments = useMemo(
    () => renderData.reduce((sum, r) => sum + Math.max(0, r.transformed.length - 1), 0),
    [renderData],
  );
  const crossingPerformanceWarning = totalSegments > CROSSING_MAX_SEGMENTS;

  const crossings = useMemo(() => {
    if (crossingPerformanceWarning) return [];
    const base = findCrossingsForStraps(
      renderData.map((r) => ({ id: r.strap.id, pts: r.transformed })),
      CROSS_EPS_MM,
    );
    return base.map((c) => ({ ...c, overId: crossingOverrides[c.id] ?? c.overId }));
  }, [crossingOverrides, crossingPerformanceWarning, renderData]);

  const crossingsDisplay = useMemo(() => {
    const filtered = crossingsFilter === 'selected' && activeStrap
      ? crossings.filter((c) => c.aId === activeStrap.id || c.bId === activeStrap.id)
      : crossings;
    return showAllCrossings ? filtered : filtered.slice(0, 50);
  }, [activeStrap, crossings, crossingsFilter, showAllCrossings]);

  const vb = useMemo(() => {
    if (view === 'fullpage') return { minX: 0, minY: 0, vw: BOX.w, vh: BOX.h, str: `0 0 ${BOX.w} ${BOX.h}` };
    const safeZoom = Math.max(0.35, zoom);
    const vw = BOX.w / safeZoom;
    const vh = BOX.h / safeZoom;
    const minX = (BOX.w - vw) / 2 - pan.x;
    const minY = (BOX.h - vh) / 2 - pan.y;
    return { minX, minY, vw, vh, str: `${minX} ${minY} ${vw} ${vh}` };
  }, [pan, view, zoom]);

  const transformedById = useMemo(() => new Map(renderData.map((r) => [r.strap.id, r.transformed])), [renderData]);
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
  const map = new Map<string, typeof crossings>();
  crossings.forEach((c) => {
    const under = c.aId === c.overId ? c.bId : c.aId;
    if (!map.has(under)) map.set(under, []);
    map.get(under)!.push(c);
  });
  return map;
}, [crossings]);

  const setCrossingOver = (crossingId: string, overId: string) => {
    setCrossingOverrides((prev) => ({ ...prev, [crossingId]: overId }));
    setActiveCrossingId(crossingId);
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
    dragRef.current = {
      mode: 'strap',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPan: pan,
      strapId,
      startOffset: strap.offset,
      startSnapped: strap.snapped,
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

    if (snapped) {
      if (Math.abs(nextX - centerX) > RELEASE_MM) snapped = false;
      else nextX = centerX;
    }
    if (!snapped && Math.abs(nextX - centerX) <= SNAP_IN_MM) {
      nextX = centerX;
      snapped = true;
    }

    setStraps((prev) => prev.map((s) => (s.id === drag.strapId ? { ...s, offset: { x: nextX, y: nextY }, snapped } : s)));
  };

  const onSvgPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current = { mode: 'none', pointerId: -1, startClient: { x: 0, y: 0 }, startPan: { x: 0, y: 0 } };
    }
  };

  const addCircle = () => {
    const i = straps.length;
    const step = 6;
    const pattern = [
      { x: 0, y: 0 },
      { x: step, y: 0 },
      { x: 0, y: step },
      { x: -step, y: 0 },
      { x: 0, y: -step },
      { x: step, y: step },
      { x: -step, y: step },
      { x: step, y: -step },
      { x: -step, y: -step },
    ];
    const offset = pattern[i % pattern.length];

    const next: Strap = {
      id: uid('strap'),
      name: `Circle ${straps.length + 1}`,
      d: circlePathD(40),
      color: PALETTE[straps.length % PALETTE.length],
      script: 'Copperplate',
      nibMMText: '2.5',
      nibAngleDeg: 45,
      xHeightMMText: '6',
      offset,
      scalePct: 100,
      rotDeg: 0,
      snapped: false,
    };
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
        created.push({
          id: uid('strap'),
          name: `${file.name.replace(/\.svg$/i, '')} ${idx + 1}`,
          d,
          color: PALETTE[(straps.length + created.length) % PALETTE.length],
          script: 'Copperplate',
          nibMMText: '2.5',
          nibAngleDeg: 45,
          xHeightMMText: '6',
          offset: { x: centerX, y: centerY },
          scalePct: 100,
          rotDeg: 0,
          snapped: false,
        });
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
          <h1 className="text-3xl font-semibold tracking-tight">Calligraphy Tools <span className="text-indigo-600">— Path Guides</span></h1>
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
        width={BOX.w}
        height={BOX.h}
      >
        {/* Always start fully visible over the whole page (NOT viewBox). */}
        <rect x={0} y={0} width={BOX.w} height={BOX.h} fill="white" />

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
              <rect x={0} y={0} width={BOX.w} height={BOX.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <line x1={centerX} y1={0} x2={centerX} y2={BOX.h} stroke="#e2e8f0" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

              {renderData.map(({ strap, transformed, guideSet, metrics }) => (
                <g
  key={strap.id}
  mask={
    !simplify && underCrossings.get(strap.id)?.length
      ? `url(#mask-${strap.id})`
      : undefined
  }
>
                  {transformed.length > 1 && (
                    <path
                      d={pathD(transformed)}
                      fill="none"
                      stroke={strap.color}
                      strokeWidth={simplify ? metrics.bandWidthMM : 0.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents={simplify ? 'stroke' : 'none'}
                      onPointerDown={simplify ? beginStrapDrag(strap.id) : undefined}
                    />
                  )}
                  {!simplify && guideSet && (
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

                  {showDebugPoints && !simplify && transformed.map((pt, i) => (
                    <g key={`dbg-${strap.id}-${i}`}>
                      <circle cx={pt.x} cy={pt.y} r={0.8} fill="#ef4444" vectorEffect="non-scaling-stroke" />
                      <text x={pt.x + 1} y={pt.y - 1} fontSize="2.6" fill="#b91c1c">{i}</text>
                    </g>
                  ))}
                </g>
              ))}

              {simplify && crossings.map((crossing) => {
                const over = strapById.get(crossing.overId);
                const overPts = transformedById.get(crossing.overId);
                if (!over || !overPts) return null;

                const overSeg = crossing.overId === crossing.aId ? crossing.aSeg : crossing.bSeg;
                const overT = crossing.overId === crossing.aId ? crossing.aT : crossing.bT;
                const halfLenMM = Math.min(14, Math.max(5, over.metrics.bandWidthMM * 0.75));
                const dOver = polylineSubpathD(overPts, overSeg, overT, halfLenMM);
                if (!dOver) return null;

                return (
                  <g key={`weave-${crossing.id}`} pointerEvents="none">
                    <path d={dOver} fill="none" stroke={over.strap.color} strokeWidth={over.metrics.bandWidthMM} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}

              {showCrossings && crossings.map((crossing, idx) => (
                <g
                  key={`marker-${crossing.id}`}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextOver = crossing.overId === crossing.aId ? crossing.bId : crossing.aId;
                    setCrossingOver(crossing.id, nextOver);
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
          {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
          <div className="mt-4 space-y-2">
            {straps.map((strap, idx) => (
              <div key={strap.id} className="rounded-lg border border-slate-200 p-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: strap.color }} />
                <span className="flex-1 truncate">{strap.name}</span>
                <button onClick={() => setActiveId(strap.id)} className="px-2 py-1 rounded border border-slate-300">Select</button>
                <button onClick={() => {
                  const duplicate = { ...strap, id: uid('strap'), name: `${strap.name} copy`, color: PALETTE[(straps.length + 1) % PALETTE.length] };
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
          {!activeStrap && <p className="mt-3 text-slate-500">Select a strap.</p>}
          {activeStrap && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs text-slate-600">Script</label>
                <select className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.script} onChange={(e) => updateStrap(activeStrap.id, { script: e.target.value as ScriptId })}>
                  {Object.keys(SCRIPT_PROFILES).map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600">Nib size (mm)</label>
                <input className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.nibMMText} onChange={(e) => updateStrap(activeStrap.id, { nibMMText: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-600">Nib angle</label>
                <select className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.nibAngleDeg} onChange={(e) => updateStrap(activeStrap.id, { nibAngleDeg: Number(e.target.value) as 35 | 40 | 45 })}>
                  <option value={35}>35°</option><option value={40}>40°</option><option value={45}>45°</option>
                </select>
              </div>
              {activeStrap.script === 'Copperplate' && (
                <div>
                  <label className="text-xs text-slate-600">x-height (mm)</label>
                  <input className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.xHeightMMText ?? '6'} onChange={(e) => updateStrap(activeStrap.id, { xHeightMMText: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Rotation (deg)</label>
                  <input type="number" className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.rotDeg} onChange={(e) => updateStrap(activeStrap.id, { rotDeg: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Scale (%)</label>
                  <input type="number" className="w-full mt-1 p-2 rounded-lg border border-slate-300" value={activeStrap.scalePct} onChange={(e) => updateStrap(activeStrap.id, { scalePct: Math.max(1, Number(e.target.value) || 100) })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateStrap(activeStrap.id, { offset: { ...activeStrap.offset, x: centerX }, snapped: true })} className="px-2 py-1 rounded border border-slate-300">Center horizontally</button>
                <button onClick={() => updateStrap(activeStrap.id, { rotDeg: 0, scalePct: 100 })} className="px-2 py-1 rounded border border-slate-300">Reset transform</button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 3 — Weave / Layer order</h2>
          <p className="mt-1 text-xs text-slate-600">Order controls render stack. First = bottom, last = top.</p>
          <div className="mt-3 space-y-2">
            {straps.map((strap) => (
              <div key={strap.id} draggable onDragStart={() => setDragListId(strap.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => {
                if (dragListId) reorderStraps(dragListId, strap.id);
                setDragListId(null);
              }} className="rounded-lg border border-slate-200 p-2 flex items-center gap-2 cursor-move">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: strap.color }} />
                <span className="flex-1">{strap.name}</span>
                <button onClick={() => setStraps((prev) => [...prev.filter((s) => s.id !== strap.id), strap])} className="px-2 py-1 rounded border border-slate-300">Bring to front</button>
                <button onClick={() => setStraps((prev) => [strap, ...prev.filter((s) => s.id !== strap.id)])} className="px-2 py-1 rounded border border-slate-300">Send to back</button>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-800">Crossings</h3>
            <p className="mt-1 text-xs text-slate-600">Detected crossings: {crossings.length}</p>
            <select className="mt-2 w-full rounded-lg border border-slate-300 p-2" value={crossingsFilter} onChange={(e) => setCrossingsFilter(e.target.value as CrossingsFilter)}>
              <option value="all">All crossings</option>
              <option value="selected" disabled={!activeStrap}>Only selected strap</option>
            </select>
            {crossings.length > 50 && (
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
                      <button onClick={() => setCrossingOver(crossing.id, crossing.aId)} className={`px-2 py-1 rounded border text-xs ${crossing.overId === crossing.aId ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-slate-300'}`}>{aName} over</button>
                      <button onClick={() => setCrossingOver(crossing.id, crossing.bId)} className={`px-2 py-1 rounded border text-xs ${crossing.overId === crossing.bId ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-slate-300'}`}>{bName} over</button>
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
