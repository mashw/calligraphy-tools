'use client';

import React, { useMemo, useRef, useState } from 'react';

import GuideOverlay from '@/components/preview/GuideOverlay';
import { PAPERS_MM, pathD } from '@/lib/curve-helpers';
import { BLACKLETTER_GUIDE_DEFAULTS, buildGuideSet } from '@/lib/guides/guide-template';
import { samplePathDToPolyline } from '@/lib/paths/sample-svg-path';
import { transformPolyline } from '@/lib/paths/transform';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';

type ViewMode = 'autofit' | 'fullpage' | 'custom';

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
    return { xMM, ascMM: xMM * 1.5, descMM: xMM * 1.5, actualNibMM: nibMM };
  }

  const angleRad = (strap.nibAngleDeg * Math.PI) / 180;
  const effectiveNib = nibMM * Math.cos(angleRad);
  return {
    xMM: BLACKLETTER_GUIDE_DEFAULTS.xNib * nibMM,
    ascMM: BLACKLETTER_GUIDE_DEFAULTS.ascNib * nibMM,
    descMM: BLACKLETTER_GUIDE_DEFAULTS.descNib * nibMM,
    actualNibMM: Math.max(0.2, effectiveNib),
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
    const sampled = samplePathDToPolyline(strap.d, 1.2);
    const transformed = transformPolyline(sampled, { scalePct: strap.scalePct, rotDeg: strap.rotDeg, offset: strap.offset });
    const metrics = guideMetrics(strap);
    const guideSet = transformed.length > 1
      ? buildGuideSet(strap.script === 'Copperplate' ? 'copperplate' : 'blackletter', {
        baseline: transformed,
        xMM: metrics.xMM,
        ascMM: metrics.ascMM,
        descMM: metrics.descMM,
        tickStepMM: Math.max(2, metrics.actualNibMM),
        actualNibMM: metrics.actualNibMM,
      })
      : null;

    return { strap, transformed, guideSet };
  }), [straps]);

  const vb = useMemo(() => {
    if (view === 'fullpage') return { minX: 0, minY: 0, vw: BOX.w, vh: BOX.h, str: `0 0 ${BOX.w} ${BOX.h}` };
    const safeZoom = Math.max(0.35, zoom);
    const vw = BOX.w / safeZoom;
    const vh = BOX.h / safeZoom;
    const minX = (BOX.w - vw) / 2 - pan.x;
    const minY = (BOX.h - vh) / 2 - pan.y;
    return { minX, minY, vw, vh, str: `${minX} ${minY} ${vw} ${vh}` };
  }, [pan, view, zoom]);

  const updateStrap = (id: string, patch: Partial<Strap>) => {
    setStraps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const applyViewPreset = (next: ViewMode) => {
    setView(next);
    if (next === 'autofit') {
      setZoom(1.35);
      setPan({ x: 0, y: 0 });
    }
    if (next === 'fullpage') {
      setPan({ x: 0, y: 0 });
    }
  };

  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;
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
    const start = drag.startOffset;
    let nextX = start.x + dxMM;
    const nextY = start.y + dyMM;
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
    const next: Strap = {
      id: uid('strap'),
      name: `Circle ${straps.length + 1}`,
      d: circlePathD(40),
      color: PALETTE[straps.length % PALETTE.length],
      script: 'Copperplate',
      nibMMText: '2.5',
      nibAngleDeg: 45,
      xHeightMMText: '6',
      offset: { x: centerX, y: centerY },
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
      // v1 parser: basic path-d regex extraction; ignores nested transforms and non-path shapes.
      const matches = [...text.matchAll(/<path\b[^>]*\bd=(['"])([\s\S]*?)\1/gi)];
      matches.forEach((m, idx) => {
        const d = m[2]?.trim();
        if (!d) return;
        const color = PALETTE[(straps.length + created.length) % PALETTE.length];
        created.push({
          id: uid('strap'),
          name: `${file.name.replace(/\.svg$/i, '')} ${idx + 1}`,
          d,
          color,
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
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button onClick={() => { setView('custom'); setZoom((z) => Math.max(0.35, z * 0.9)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">–</button>
              <button onClick={() => { setView('custom'); setZoom((z) => Math.min(6, z * 1.1)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">+</button>
              <button onClick={() => applyViewPreset('autofit')} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">Reset view</button>
            </div>
          </div>

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
              <rect x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />
              <rect x={0} y={0} width={BOX.w} height={BOX.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <line x1={centerX} y1={0} x2={centerX} y2={BOX.h} stroke="#e2e8f0" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

              {renderData.map(({ strap, transformed, guideSet }) => (
                <g key={strap.id}>
                  {transformed.length > 1 && (
                    <path d={pathD(transformed)} fill="none" stroke={strap.color} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  )}
                  {guideSet && (
                    <GuideOverlay
                      guideSet={guideSet}
                      style={{
                        thin: 0.45,
                        bold: 0.75,
                        colors: {
                          thin: '#475569',
                          bold: activeStrap?.id === strap.id ? '#7c3aed' : '#111827',
                          tick: '#dbeafe',
                          frame: 'transparent',
                        },
                      }}
                      interactive={{
                        onGuidePointerDown: beginStrapDrag(strap.id),
                        hitStrokeWidthMM: 6,
                      }}
                    />
                  )}
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
            <label className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
              Upload SVG(s)
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
                <button
                  onClick={() => {
                    const duplicate = { ...strap, id: uid('strap'), name: `${strap.name} copy`, color: PALETTE[(straps.length + 1) % PALETTE.length] };
                    setStraps((prev) => [...prev, duplicate]);
                  }}
                  className="px-2 py-1 rounded border border-slate-300"
                >Duplicate</button>
                <button
                  disabled={straps.length <= 1}
                  onClick={() => {
                    setStraps((prev) => prev.filter((s) => s.id !== strap.id));
                    if (activeId === strap.id) setActiveId(straps.find((s) => s.id !== strap.id)?.id ?? null);
                  }}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                >Remove</button>
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
              <div
                key={strap.id}
                draggable
                onDragStart={() => setDragListId(strap.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragListId) reorderStraps(dragListId, strap.id); setDragListId(null); }}
                className="rounded-lg border border-slate-200 p-2 flex items-center gap-2 cursor-move"
              >
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: strap.color }} />
                <span className="flex-1">{strap.name}</span>
                <button
                  onClick={() => setStraps((prev) => [...prev.filter((s) => s.id !== strap.id), strap])}
                  className="px-2 py-1 rounded border border-slate-300"
                >Bring to front</button>
                <button
                  onClick={() => setStraps((prev) => [strap, ...prev.filter((s) => s.id !== strap.id)])}
                  className="px-2 py-1 rounded border border-slate-300"
                >Send to back</button>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-800">Weave groups (coming next)</h3>
            <button
              onClick={() => {
                if (selectedForGroup.length < 2) return;
                setGroups((prev) => [...prev, { id: uid('group'), name: `Group ${prev.length + 1}`, strapIds: selectedForGroup, collapsed: false }]);
                setSelectedForGroup([]);
              }}
              className="mt-2 px-2 py-1 rounded border border-slate-300"
            >Create group from selected straps</button>
            <div className="mt-2 space-y-2">
              {groups.map((g) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-2">
                  <button className="font-medium" onClick={() => setGroups((prev) => prev.map((x) => x.id === g.id ? { ...x, collapsed: !x.collapsed } : x))}>{g.collapsed ? '▶' : '▼'} {g.name}</button>
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
