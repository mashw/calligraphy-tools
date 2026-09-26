'use client';

import { renaissancePrimitives } from '@/lib/borders/acanthus/renaissance/generated-primitives';
import { deformPrimitive, normalizedLobes, straightTarget, targetPath } from '@/lib/borders/acanthus/renaissance/geometry';
import { generateRenaissanceHalfLeaf } from '@/lib/borders/acanthus/renaissance/half-leaf';
import type { TargetCurve } from '@/lib/borders/acanthus/renaissance/types';

const large=normalizedLobes.large, angle=Math.atan2(large.end.y-large.start.y,large.end.x-large.start.x);
const identity=straightTarget(large.start,angle,large.chord);
const curved=(amount:number):TargetCurve=>{const dx=large.end.x-large.start.x,dy=large.end.y-large.start.y,n={x:-dy/large.chord,y:dx/large.chord};return {p0:large.start,c1:{x:large.start.x+dx*.3+n.x*amount,y:large.start.y+dy*.3+n.y*amount},c2:{x:large.start.x+dx*.7+n.x*amount,y:large.start.y+dy*.7+n.y*amount},p1:large.end};};
const studies=[
  ['A. Source / identity',identity,1],['B. Wider',identity,1.42],['C. Narrower',identity,.62],
  ['D. Shorter',straightTarget(large.start,angle,large.chord*.68),1],['E. Gentle curved target',curved(48),1],['F. Strong curved target',curved(105),.92],
] as const;
const sourceNames=['medium-lobe-contour','small-lobe-contour','deep-eye','terminal-open','terminal-closed','turnover'] as const;

function DebugShape({curve,width}:{curve:TargetCurve;width:number}){const result=deformPrimitive(large,curve,width);return <svg viewBox="-45 -115 485 470" className="h-[285px] w-full overflow-visible"><path d={result.d} fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d={targetPath(curve)} fill="none" stroke="#e11d48" strokeWidth="1.2" strokeDasharray="6 5"/>{[0,.25,.5,.75,1].map(u=>{const p={x:(1-u)**3*curve.p0.x+3*(1-u)**2*u*curve.c1.x+3*(1-u)*u*u*curve.c2.x+u**3*curve.p1.x,y:(1-u)**3*curve.p0.y+3*(1-u)**2*u*curve.c1.y+3*(1-u)*u*u*curve.c2.y+u**3*curve.p1.y};return <circle key={u} cx={p.x} cy={p.y} r="2.3" fill="#2563eb"/>})}<circle cx={result.start.x} cy={result.start.y} r="5" fill="#16a34a"/><circle cx={result.end.x} cy={result.end.y} r="5" fill="#dc2626"/><circle cx={result.crest.x} cy={result.crest.y} r="6" fill="none" stroke="#f59e0b" strokeWidth="2"/><path d={`M ${result.crest.x-7} ${result.crest.y} h 14 M ${result.crest.x} ${result.crest.y-7} v 14`} stroke="#f59e0b"/></svg>}

export default function RenaissancePrimitiveLab(){
  const leaves=[7,18,31,44].map((seed,i)=>generateRenaissanceHalfLeaf(seed,{x:8,y:92},i===3?.95:1));
  return <section className="mx-auto mt-8 max-w-[1500px] rounded-2xl border border-amber-200 bg-[#fffdf5] p-5 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">Authored contour DNA · experimental</p><h2 className="mt-1 text-2xl font-semibold">Renaissance primitive deformation study</h2><p className="mt-2 max-w-4xl text-sm text-slate-600">The black contours below are transported directly from the committed Illustrator Béziers. Green/red mark semantic START/END eyes, amber marks the automatically detected dominant crest, and the dashed magenta line is the target curve.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{studies.map(([label,curve,width])=><article key={label} className="rounded-xl border border-slate-200 bg-white p-3"><h3 className="font-semibold">{label}</h3><DebugShape curve={curve} width={width}/></article>)}</div>
    <h3 className="mt-8 text-lg font-semibold">Unchanged imported source references</h3><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sourceNames.map(name=>{const p=renaissancePrimitives[name],v=p.viewBox;return <article key={name} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between text-sm"><b>{name}</b><span className="text-slate-500">1 {p.closed?'closed':'open'} path</span></div><svg viewBox={v.join(' ')} className="mt-2 h-[230px] w-full"><path d={p.sourceD} fill="none" stroke="#171717" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg></article>})}</div>
    <h3 className="mt-8 text-xl font-semibold">First generated half-leaf experiments</h3><p className="mt-1 max-w-4xl text-sm text-slate-600">Each continuous silhouette stitches deformed large/medium/small open contours at shared eye stations. The only procedural closing geometry is the restrained inner return pipe; no shading or legacy raffle anatomy is used.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">{leaves.map(leaf=><article key={leaf.seed} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex justify-between"><b>Seed {leaf.seed}</b><span className="text-xs uppercase tracking-wide text-slate-500">{leaf.sequence.join(' / ')}</span></div><svg viewBox="-15 -35 225 155" className="mt-2 h-[300px] w-full"><path d={leaf.outline} fill="#fef3c7" stroke="#171717" strokeWidth="1.5" strokeLinejoin="round"/>{leaf.targets.map((c,i)=><path key={i} d={targetPath(c)} fill="none" stroke="#e11d48" strokeWidth=".65" strokeDasharray="3 3"/>)}<path d={leaf.spine} fill="none" stroke="#7c3aed" strokeWidth=".8" strokeDasharray="4 3"/>{leaf.joins.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.1" fill={i?'#dc2626':'#16a34a'}/>)}{leaf.crests.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.4" fill="none" stroke="#f59e0b" strokeWidth="1.2"/>)}</svg></article>)}</div>
  </section>;
}
