'use client';

import React, { useMemo, useRef, useState } from 'react';

type SymmetryMode = 'vertical' | 'horizontal' | 'rotational';
type OverState = 'A' | 'B';
type ViewMode = 'autofit' | 'fullpage' | 'custom';

type Pt = { x: number; y: number };
type Crossing = {
  id: number;
  point: Pt;
  sA: number;
  sB: number;
  over: OverState;
};

type InfoTipProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'left' | 'bottom';
};

const BOX = { w: 220, h: 220 };
const INITIAL_SETTINGS = { seed: 12345, symmetry: 'vertical' as SymmetryMode, complexity: 5 };
const INITIAL_GENERATION = generateKnotSkeleton(
  INITIAL_SETTINGS.seed,
  INITIAL_SETTINGS.symmetry,
  INITIAL_SETTINGS.complexity,
);

function InfoTip({ title, children, className = '', side = 'right' }: InfoTipProps) {
  const [open, setOpen] = useState(false);

  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 -mb-2'
      : side === 'left'
        ? 'right-full top-1/2 -translate-y-1/2 -mr-2'
        : side === 'bottom'
          ? 'top-full left-1/2 -translate-x-1/2 mt-2'
          : 'left-full top-1/2 -translate-y-1/2 ml-2';

  const arrow =
    side === 'top'
      ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-700'
      : side === 'left'
        ? 'left-full top-1/2 -translate-y-1/2 border-l-slate-700'
        : side === 'bottom'
          ? 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-700'
          : 'right-full top-1/2 -translate-y-1/2 border-r-slate-700';

  return (
    <div
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

function mulberry32(seed: number) {
  let t = seed;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pathFromPoints(points: Pt[]) {
  if (points.length < 3) return '';
  const closed = [...points, points[0], points[1], points[2]];
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = closed[i];
    const p1 = closed[i + 1];
    const p2 = closed[i + 2];
    const p3 = closed[i + 3];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

function generateKnotSkeleton(seed: number, symmetryMode: SymmetryMode, complexity: number) {
  const rng = mulberry32(seed || 1);
  const cx = BOX.w / 2;
  const cy = BOX.h / 2;

  // Pick a “nice” (m,n) pair that yields lots of crossings but stays legible.
  // Higher complexity → higher frequencies.
  const pairs: Array<[number, number]> = [
    [2, 3],
    [3, 4],
    [3, 5],
    [4, 5],
    [4, 7],
    [5, 6],
    [5, 8],
    [6, 7],
    [7, 9],
  ];
  const idx = Math.min(pairs.length - 1, Math.max(0, Math.round((complexity - 1) * 0.9)));
  const [mBase, nBase] = pairs[idx];

  // Add small seed-based variation without turning it into mush.
  const m = mBase;
  const n = nBase;

  // Amplitudes: keep it inside the box with margin.
  const margin = 18;
  const ax = (BOX.w / 2) - margin;
  const by = (BOX.h / 2) - margin;

  // Phase handling for “symmetry mode”
  // - vertical: very clean symmetric (sin/sin)
  // - horizontal: rotate the x component 90° (cos/sin) -> different symmetry feel
  // - rotational: allow phases
  const phi = rng() * Math.PI * 2;
  const psi = rng() * Math.PI * 2;

  const N = 900; // sampling density (drives crossing detection quality)
  const pts: Pt[] = [];

  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;

    let xUnit: number;
    let yUnit: number;

    if (symmetryMode === 'vertical') {
      xUnit = Math.sin(m * t);
      yUnit = Math.sin(n * t);
    } else if (symmetryMode === 'horizontal') {
      xUnit = Math.cos(m * t);
      yUnit = Math.sin(n * t);
    } else {
      xUnit = Math.sin(m * t + phi);
      yUnit = Math.sin(n * t + psi);
    }

    pts.push({
      x: cx + ax * xUnit,
      y: cy + by * yUnit,
    });
  }

  // Smooth path for the dashed skeleton preview; use the same points as the polyline.
  const path = pathFromPoints(pts);

  return { path, sampled: pts };
}


function segIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt) {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-8) return null;

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const ta = (dx * dby - dy * dbx) / denom;
  const tb = (dx * day - dy * dax) / denom;

  if (ta <= 0.0001 || ta >= 0.9999 || tb <= 0.0001 || tb >= 0.9999) return null;

  return {
    point: { x: a1.x + ta * dax, y: a1.y + ta * day },
    ta,
    tb,
  };
}

function detectCrossings(polyline: Pt[]): Crossing[] {
  const n = polyline.length;
  if (n < 4) return [];

  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const dx = polyline[i].x - polyline[i - 1].x;
    const dy = polyline[i].y - polyline[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1] || 1;

  const found: Omit<Crossing, 'id' | 'over'>[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (Math.abs(i - j) <= 1) continue;
      const hit = segIntersection(polyline[i], polyline[i + 1], polyline[j], polyline[j + 1]);
      if (!hit) continue;

      const sA = (cum[i] + hit.ta * (cum[i + 1] - cum[i])) / total;
      const sB = (cum[j] + hit.tb * (cum[j + 1] - cum[j])) / total;

      const duplicate = found.some(
        c => Math.hypot(c.point.x - hit.point.x, c.point.y - hit.point.y) < 3,
      );
      if (!duplicate) {
        found.push({ point: hit.point, sA, sB });
      }
    }
  }

  found.sort((a, b) => Math.min(a.sA, a.sB) - Math.min(b.sA, b.sB));
  return found.map((c, idx) => ({
    id: idx + 1,
    point: c.point,
    sA: c.sA,
    sB: c.sB,
    over: idx % 2 === 0 ? 'A' : 'B',
  }));
}

function mergeIntervals(intervals: Array<[number, number]>) {
  if (!intervals.length) return [] as Array<[number, number]>;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function KnotPage() {
  const [seed, setSeed] = useState(INITIAL_SETTINGS.seed);
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>(INITIAL_SETTINGS.symmetry);
  const [complexity, setComplexity] = useState(INITIAL_SETTINGS.complexity);
  const [strapWidth, setStrapWidth] = useState(10);
  const [crossingGap, setCrossingGap] = useState(7);
  const [showShadow, setShowShadow] = useState(true);

  const [generatedPaths, setGeneratedPaths] = useState<string[]>(() => [INITIAL_GENERATION.path]);
  const [sampledPolyline, setSampledPolyline] = useState<Pt[]>(() => INITIAL_GENERATION.sampled);
  const [crossings, setCrossings] = useState<Crossing[]>(() => detectCrossings(INITIAL_GENERATION.sampled));
  const [selectedCrossingId, setSelectedCrossingId] = useState<number | null>(null);

  const [view, setView] = useState<ViewMode>('autofit');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const regenerate = (nextSeed: number, nextSymmetry: SymmetryMode, nextComplexity: number) => {
    const next = generateKnotSkeleton(nextSeed, nextSymmetry, nextComplexity);
    setGeneratedPaths([next.path]);
    setSampledPolyline(next.sampled);
    setCrossings(detectCrossings(next.sampled));
    setSelectedCrossingId(null);
  };

  const selected = useMemo(
    () => crossings.find(c => c.id === selectedCrossingId) ?? null,
    [crossings, selectedCrossingId],
  );

  const cumulative = useMemo(() => {
    const out: number[] = [0];
    for (let i = 1; i < sampledPolyline.length; i++) {
      const dx = sampledPolyline[i].x - sampledPolyline[i - 1].x;
      const dy = sampledPolyline[i].y - sampledPolyline[i - 1].y;
      out.push(out[i - 1] + Math.hypot(dx, dy));
    }
    return out;
  }, [sampledPolyline]);

  const splitSegments = useMemo(() => {
    if (!sampledPolyline.length || cumulative.length < 2) return [] as Pt[][];
    const total = cumulative[cumulative.length - 1] || 1;
    const halfGap = (crossingGap / total) * 0.5;
    const intervals = mergeIntervals(
      crossings
        .map(c => (c.over === 'A' ? c.sB : c.sA))
        .map(s => [Math.max(0, s - halfGap), Math.min(1, s + halfGap)] as [number, number]),
    );

    const inGap = (s: number) => intervals.some(([a, b]) => s >= a && s <= b);

    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (let i = 0; i < sampledPolyline.length; i++) {
      const s = (cumulative[i] || 0) / total;
      if (inGap(s)) {
        if (run.length > 1) runs.push(run);
        run = [];
      } else {
        run.push(sampledPolyline[i]);
      }
    }
    if (run.length > 1) runs.push(run);
    return runs;
  }, [crossings, crossingGap, cumulative, sampledPolyline]);

  const highlightSegments = useMemo(() => {
    if (!selected || !sampledPolyline.length || cumulative.length < 2) return [] as Pt[][];
    const total = cumulative[cumulative.length - 1] || 1;
    const win = 0.03;
    const targets = [selected.sA, selected.sB];
    return targets.map(target => {
      const pts: Pt[] = [];
      for (let i = 0; i < sampledPolyline.length; i++) {
        const s = (cumulative[i] || 0) / total;
        if (Math.abs(s - target) <= win) pts.push(sampledPolyline[i]);
      }
      return pts;
    }).filter(seg => seg.length > 1);
  }, [selected, sampledPolyline, cumulative]);

  const polylineToPath = (pts: Pt[]) =>
    pts.length ? `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} ` + pts.slice(1).map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') : '';

  const fullPolylinePath = useMemo(() => polylineToPath(sampledPolyline), [sampledPolyline]);

  const zoomedSize = useMemo(() => ({
    w: BOX.w / zoom,
    h: BOX.h / zoom,
  }), [zoom]);

  const clampedPan = useMemo(() => {
    const maxPanX = Math.max(0, (BOX.w - zoomedSize.w) / 2);
    const maxPanY = Math.max(0, (BOX.h - zoomedSize.h) / 2);
    return {
      x: clamp(pan.x, -maxPanX, maxPanX),
      y: clamp(pan.y, -maxPanY, maxPanY),
    };
  }, [pan, zoomedSize.h, zoomedSize.w]);

  const svgViewBox = useMemo(() => {
    const cx = BOX.w / 2 + clampedPan.x;
    const cy = BOX.h / 2 + clampedPan.y;
    return `${(cx - zoomedSize.w / 2).toFixed(3)} ${(cy - zoomedSize.h / 2).toFixed(3)} ${zoomedSize.w.toFixed(3)} ${zoomedSize.h.toFixed(3)}`;
  }, [clampedPan.x, clampedPan.y, zoomedSize.h, zoomedSize.w]);

  const applyViewPreset = (mode: ViewMode) => {
    if (mode === 'autofit') {
      setView(mode);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (mode === 'fullpage') {
      setView(mode);
      setZoom(0.7);
      setPan({ x: 0, y: 0 });
      return;
    }
    setView(mode);
  };

  const adjustZoom = (dir: 'in' | 'out') => {
    setZoom(prev => {
      const next = clamp(dir === 'in' ? prev * 1.12 : prev / 1.12, 0.3, 6);
      return next;
    });
    setView('custom');
  };

  const randomizeSeed = () => {
    const nextSeed = Math.floor(Math.random() * 1000000);
    setSeed(nextSeed);
    regenerate(nextSeed, symmetryMode, complexity);
  };

  const flipCrossing = (id: number) => {
    setCrossings(prev =>
      prev.map(c =>
        c.id === id
          ? { ...c, over: c.over === 'A' ? 'B' : 'A' }
          : c,
      ),
    );
  };

  const onPreviewPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    setView('custom');
  };

  const onPreviewPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dxPx = e.clientX - dragRef.current.x;
    const dyPx = e.clientY - dragRef.current.y;
    dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY };

    const dxUnits = dxPx * (zoomedSize.w / rect.width);
    const dyUnits = dyPx * (zoomedSize.h / rect.height);

    const maxPanX = Math.max(0, (BOX.w - zoomedSize.w) / 2);
    const maxPanY = Math.max(0, (BOX.h - zoomedSize.h) / 2);

    setPan(prev => ({
      x: clamp(prev.x - dxUnits, -maxPanX, maxPanX),
      y: clamp(prev.y - dyUnits, -maxPanY, maxPanY),
    }));
  };

  const onPreviewPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
  };

  return (
    <main className="min-h-screen text-sm text-slate-900 relative">
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Calligraphy Tools <span className="text-indigo-600">— Knot Tool (MVP)</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate a deterministic symmetric knot skeleton, tune strap settings, and edit crossing over/under states.
          </p>
        </div>
      </header>

      <section className="px-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-start gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">Preview</h3>
                <InfoTip side="right">Drag to pan. Zoom with ±.</InfoTip>
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="p-1.5 text-sm rounded-lg border border-slate-300"
                  value={view}
                  onChange={(e) => applyViewPreset(e.target.value as ViewMode)}
                >
                  <option value="autofit">Auto-fit</option>
                  <option value="fullpage">Full page</option>
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
              <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white">
                <input
                  type="checkbox"
                  checked={showShadow}
                  onChange={e => setShowShadow(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-700">Under-shadow</span>
              </label>
            </div>
          </div>

          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              viewBox={svgViewBox}
              onPointerDown={onPreviewPointerDown}
              onPointerMove={onPreviewPointerMove}
              onPointerUp={onPreviewPointerUp}
              onPointerCancel={onPreviewPointerUp}
              onPointerLeave={onPreviewPointerUp}
              className="block mx-auto w-full h-[38vh] sm:h-[44vh] md:h-[50vh] touch-none cursor-grab active:cursor-grabbing"
              style={{ background: '#cbd5e1' }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="underShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0.5" dy="0.8" stdDeviation="1" floodColor="#0f172a" floodOpacity="0.25" />
                </filter>
              </defs>

              <path d={generatedPaths[0]} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3" />

              <path
                d={fullPolylinePath}
                fill="none"
                stroke="#0f172a"
                strokeWidth={strapWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {splitSegments.map((segment, i) => (
                <path
                  key={i}
                  d={polylineToPath(segment)}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={strapWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={showShadow ? 'url(#underShadow)' : undefined}
                />
              ))}

              {highlightSegments.map((segment, i) => (
                <path
                  key={`h-${i}`}
                  d={polylineToPath(segment)}
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth={strapWidth + 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {crossings.map(c => (
                <g key={`m-${c.id}`} className="cursor-pointer" onClick={() => setSelectedCrossingId(c.id)}>
                  <circle
                    cx={c.point.x}
                    cy={c.point.y}
                    r={4.8}
                    fill={selectedCrossingId === c.id ? '#4f46e5' : '#ffffff'}
                    stroke={selectedCrossingId === c.id ? '#312e81' : '#334155'}
                    strokeWidth={1}
                  />
                  <text
                    x={c.point.x}
                    y={c.point.y + 0.8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={3.2}
                    fontWeight={700}
                    fill={selectedCrossingId === c.id ? '#ffffff' : '#1e293b'}
                  >
                    {c.id}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </section>

      <section className="px-6 py-5">
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-800">Step 1 — Generate</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <label className="block">
                <span className="font-medium text-slate-700">Seed</span>
                <input
                  type="number"
                  value={seed}
                  onChange={e => {
                    const nextSeed = Number(e.target.value) || 0;
                    setSeed(nextSeed);
                    regenerate(nextSeed, symmetryMode, complexity);
                  }}
                  className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="font-medium text-slate-700">Symmetry</span>
                <select
                  value={symmetryMode}
                  onChange={e => {
                    const nextSymmetry = e.target.value as SymmetryMode;
                    setSymmetryMode(nextSymmetry);
                    regenerate(seed, nextSymmetry, complexity);
                  }}
                  className="mt-1 w-full p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="rotational">Rotational</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <button
                  onClick={randomizeSeed}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                >
                  Regenerate
                </button>
              </div>
              <label className="block sm:col-span-2">
                <span className="font-medium text-slate-700">Complexity</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={complexity}
                  onChange={e => {
                    const nextComplexity = Number(e.target.value);
                    setComplexity(nextComplexity);
                    regenerate(seed, symmetryMode, nextComplexity);
                  }}
                  className="w-full"
                />
                <p className="text-xs text-slate-500 mt-1">{complexity}</p>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-800">Step 2 — Strap</h2>
            <div className="mt-3 space-y-4">
              <label className="block">
                <span className="font-medium text-slate-700">Strap width</span>
                <input
                  type="range"
                  min={2}
                  max={22}
                  step={0.5}
                  value={strapWidth}
                  onChange={e => setStrapWidth(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-slate-500 mt-1">{strapWidth.toFixed(1)} mm</p>
              </label>
              <label className="block">
                <span className="font-medium text-slate-700">Crossing gap</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={crossingGap}
                  onChange={e => setCrossingGap(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-slate-500 mt-1">{crossingGap.toFixed(1)} mm</p>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-800">Step 3 — Crossings</h2>
            <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
              {crossings.length === 0 ? (
                <p className="text-sm text-slate-500">No crossings detected with the current shape.</p>
              ) : crossings.map(c => (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 ${selectedCrossingId === c.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                >
                  <button
                    onClick={() => setSelectedCrossingId(c.id)}
                    className="w-full text-left"
                  >
                    <div className="text-sm font-medium text-slate-800">Crossing #{c.id}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Over: Branch {c.over}</div>
                  </button>
                  <button
                    onClick={() => flipCrossing(c.id)}
                    className="mt-2 px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
                  >
                    Flip
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default KnotPage;
