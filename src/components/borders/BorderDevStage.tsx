'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { generateAcanthus, generateSingleLeaf } from '@/lib/borders/acanthus/generate';
import type { AcanthusOptions } from '@/lib/borders/acanthus/types';
import { frameAt, guidePathFromElement } from '@/lib/borders/guide-path';
import type { GuidePath } from '@/lib/borders/types';

export default function BorderDevStage({ d, closed, reverse, options, showConstruction, singleLeaf = false }: { d: string; closed: boolean; reverse: boolean; options: AcanthusOptions; showConstruction: boolean; singleLeaf?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null), [guide, setGuide] = useState<GuidePath | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { try { if (pathRef.current) { setGuide(guidePathFromElement(pathRef.current, d, closed, reverse)); setError(null); } } catch (e) { setGuide(null); setError(e instanceof Error ? e.message : 'Could not sample path.'); } }, [d, closed, reverse]);
  const geometry = useMemo(() => singleLeaf ? generateSingleLeaf(options) : guide ? generateAcanthus(guide, options) : null, [guide, options, singleLeaf]);
  const stations = useMemo(() => {
    if (!guide) return [];
    const count = Math.min(70, Math.ceil(guide.length / 8));
    return Array.from({ length: count }, (_, i) => frameAt(guide, guide.length * i / Math.max(1, count - (guide.closed ? 0 : 1))));
  }, [guide]);
  return <div className="relative min-h-[650px] overflow-hidden rounded-xl border border-slate-300 bg-[#fffef9] shadow-inner">
    <svg className="h-full min-h-[650px] w-full" viewBox="0 0 600 430" aria-label="Procedural acanthus geometry preview">
      <path ref={pathRef} d={d} fill="none" stroke="none" />
      {geometry?.strokes.map((stroke, i) => <path key={i} d={stroke.d} fill="none" stroke={stroke.role === 'shading' ? '#42403b' : '#111'} strokeWidth={stroke.motifKind === 'stem' ? (stroke.motif === -1 ? 1.7 : .55) : stroke.role === 'outline' ? 1.15 : stroke.role === 'shading' ? .52 : .72} strokeDasharray={stroke.motif === -2 ? '2 3' : undefined} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
      {showConstruction && <g fill="none" vectorEffect="non-scaling-stroke">
        {!singleLeaf && <path d={d} stroke="#e11d48" strokeWidth="1.2" strokeDasharray="4 3" />}
        {stations.map((f, i) => <g key={i}><circle cx={f.point.x} cy={f.point.y} r="1.25" fill={Math.abs(f.curvature) > .055 ? '#f97316' : '#2563eb'} /><path d={`M ${f.point.x} ${f.point.y} l ${f.tangent.x * 6} ${f.tangent.y * 6}`} stroke="#2563eb" strokeWidth=".65"/><path d={`M ${f.point.x} ${f.point.y} l ${f.normal.x * 4} ${f.normal.y * 4}`} stroke="#10b981" strokeWidth=".55"/></g>)}
        {guide?.corners.map(s => { const f = frameAt(guide, s); return <circle key={s} cx={f.point.x} cy={f.point.y} r="5" stroke="#f97316" strokeWidth="1.3" />; })}
        {geometry?.construction.map((m, i) => m.kind === 'root' ? <circle key={i} cx={m.a.x} cy={m.a.y} r="2.2" fill="#7c3aed" /> : m.kind === 'tight' ? <circle key={i} cx={m.a.x} cy={m.a.y} r="5" fill="#ef444455" stroke="#ef4444" /> : <path key={i} d={`M ${m.a.x} ${m.a.y} L ${m.b?.x} ${m.b?.y}`} stroke={m.kind === 'lobe' ? '#0d9488' : '#8b5cf6'} strokeWidth=".5" strokeDasharray="2 2" />)}
        {guide && <path d={`M ${guide.frames[0].point.x} ${guide.frames[0].point.y} l ${guide.frames[0].tangent.x * 12} ${guide.frames[0].tangent.y * 12}`} stroke="#e11d48" strokeWidth="2" markerEnd="url(#arrow)" />}
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#e11d48" /></marker></defs>
      </g>}
    </svg>
    {error && <p className="absolute inset-x-4 top-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {showConstruction && <div className="absolute bottom-3 left-3 rounded bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow"><b>Construction:</b> red spine/direction · blue stations/tangents · green normals · purple roots/axes · orange bends · red tight regions</div>}
  </div>;
}
