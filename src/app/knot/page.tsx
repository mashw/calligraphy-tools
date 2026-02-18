'use client';

import React, { useMemo, useState } from 'react';

type SymmetryMode = 'vertical' | 'horizontal' | 'rotational';
type OverState = 'A' | 'B';

type Pt = { x: number; y: number };
type Crossing = {
  id: number;
  point: Pt;
  sA: number;
  sB: number;
  over: OverState;
};

const BOX = { w: 220, h: 220 };
const INITIAL_SETTINGS = { seed: 12345, symmetry: 'vertical' as SymmetryMode, complexity: 5 };
const INITIAL_GENERATION = generateKnotSkeleton(
  INITIAL_SETTINGS.seed,
  INITIAL_SETTINGS.symmetry,
  INITIAL_SETTINGS.complexity,
);

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
  const h = 72 + complexity * 4;
  const w = 58 + complexity * 3;
  const phase = rng() * Math.PI * 2;
  const wobble = 12 + complexity * 1.8;
  const n = 84;

  const half: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const y = cy - h + u * h * 2;
    const x =
      cx +
      w * Math.sin(Math.PI * u) * Math.sin((complexity * 0.8 + 1.5) * Math.PI * u + phase) +
      wobble * Math.sin((4 + complexity * 0.35) * Math.PI * u + phase * 0.6);
    half.push({ x, y });
  }

  const mirror = (p: Pt): Pt => {
    if (symmetryMode === 'vertical') return { x: cx - (p.x - cx), y: p.y };
    if (symmetryMode === 'horizontal') return { x: p.x, y: cy - (p.y - cy) };
    return { x: cx - (p.x - cx), y: cy - (p.y - cy) };
  };

  const mirrored = half
    .slice(1, -1)
    .reverse()
    .map(mirror);

  const points = [...half, ...mirrored];
  const path = pathFromPoints(points);

  const sampled: Pt[] = [];
  const sampleN = 720;
  for (let i = 0; i < sampleN; i++) {
    const t = (i / sampleN) * points.length;
    const idx = Math.floor(t) % points.length;
    const next = (idx + 1) % points.length;
    const local = t - Math.floor(t);
    sampled.push({
      x: points[idx].x + (points[next].x - points[idx].x) * local,
      y: points[idx].y + (points[next].y - points[idx].y) * local,
    });
  }

  return { path, sampled };
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
        c => Math.hypot(c.point.x - hit.point.x, c.point.y - hit.point.y) < 1,
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

      <section className="px-6 pb-8">
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-5">
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-800">Step 1 — Generate</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Seed</span>
                  <input
                    type="number"
                    value={seed}
                    onChange={e => {
                      const nextSeed = Number(e.target.value) || 0;
                      setSeed(nextSeed);
                      regenerate(nextSeed, symmetryMode, complexity);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <button
                  onClick={randomizeSeed}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                >
                  Regenerate
                </button>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Symmetry</span>
                  <select
                    value={symmetryMode}
                    onChange={e => {
                      const nextSymmetry = e.target.value as SymmetryMode;
                      setSymmetryMode(nextSymmetry);
                      regenerate(seed, nextSymmetry, complexity);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="rotational">Rotational</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Complexity: {complexity}</span>
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
                    className="mt-1 w-full"
                  />
                </label>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-800">Step 2 — Strap</h2>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Strap width: {strapWidth.toFixed(1)} mm</span>
                  <input
                    type="range"
                    min={2}
                    max={22}
                    step={0.5}
                    value={strapWidth}
                    onChange={e => setStrapWidth(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Crossing gap: {crossingGap.toFixed(1)} mm</span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={crossingGap}
                    onChange={e => setCrossingGap(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showShadow}
                    onChange={e => setShowShadow(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Show under-shadow</span>
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

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 md:sticky md:top-6">
            <h3 className="font-semibold text-slate-800 mb-3">Preview</h3>
            <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} className="w-full h-auto rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <defs>
                <filter id="underShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0.5" dy="0.8" stdDeviation="1" floodColor="#0f172a" floodOpacity="0.25" />
                </filter>
              </defs>

              <path d={generatedPaths[0]} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3" />

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
    </main>
  );
}

export default KnotPage;
