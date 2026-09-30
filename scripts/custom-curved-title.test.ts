import assert from 'node:assert/strict';
import test from 'node:test';
import { fitCustomCurve, importCustomCurveSvg } from '../src/lib/curved-title/custom-curve.ts';
import { buildTextSpanMarkers } from '../src/lib/curved-title/span-markers.ts';

const svg=(d:string,extra='')=>`<svg viewBox="0 0 200 100"><g transform="translate(10 20)" ${extra}><path d="${d}" fill="none"/></g></svg>`;
const finite=(curve:ReturnType<typeof importCustomCurveSvg>)=>curve.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));

test('imports absolute and relative line paths deterministically',()=>{const a=importCustomCurveSvg(svg('M0 0 L50 20 L100 0'),'a.svg'),b=importCustomCurveSvg(svg('m0 0 l50 20 l50 -20'),'b.svg');assert.deepEqual(a.points,b.points);assert(finite(a));assert.equal(a.points[0].x,-.5);assert.equal(a.points.at(-1)?.x,.5);assert.deepEqual(a,importCustomCurveSvg(svg('M0 0 L50 20 L100 0'),'a.svg'));});
test('imports cubic, smooth, horizontal, vertical, quadratic and smooth quadratic commands',()=>{for(const d of ['M0 0 C20 40 80 40 100 0 S180 -40 200 0','M0 0 H50 V25 H100','M0 0 Q50 50 100 0 T200 0']){const c=importCustomCurveSvg(svg(d),'commands.svg');assert(c.points.length>40);assert(finite(c));}});
test('applies nested group and path transforms before normalising',()=>{const plain=importCustomCurveSvg('<svg><path d="M0 0 L100 50"/></svg>','plain.svg'),moved=importCustomCurveSvg('<svg><g transform="translate(20 30)"><path transform="scale(2)" d="M0 0 L100 50"/></g></svg>','moved.svg');assert.equal(plain.points.length,moved.points.length);plain.points.forEach((p,i)=>{assert(Math.abs(p.x-moved.points[i].x)<1e-12);assert(Math.abs(p.y-moved.points[i].y)<1e-12);});});
test('viewBox units are normalised and target fitting preserves aspect ratio',()=>{const c=importCustomCurveSvg('<svg viewBox="100 50 400 200"><path d="M100 50 L300 150 L500 50"/></svg>','viewbox.svg');const small=fitCustomCurve(c,{w:100,h:80}),large=fitCustomCurve(c,{w:200,h:300});const bounds=(p:{x:number;y:number}[])=>({w:Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x)),h:Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))});const a=bounds(small),b=bounds(large);assert.equal(a.w,84);assert.equal(b.w,168);assert(Math.abs(a.h/a.w-b.h/b.w)<1e-12);});
test('rejects closed, disconnected, multiple, malformed and zero-width paths',()=>{for(const source of [svg('M0 0 L10 10 Z'),svg('M0 0 L10 0 M20 0 L30 0'),'<svg><path d="M0 0 L10 0"/><path d="M0 1 L10 1"/></svg>',svg('M0 0 A bananas'),svg('M0 0 V100')])assert.throws(()=>importCustomCurveSvg(source,'bad.svg'));});

test('text-span markers use measured span positions and local curve normals',()=>{
  const baseline=[{x:0,y:0},{x:10,y:10},{x:20,y:10}],span={sStart:4,sEnd:16};
  const markers=buildTextSpanMarkers(baseline,span,5)!;
  assert(markers);
  assert.notDeepEqual(markers.start.from,baseline[0]);
  assert.notDeepEqual(markers.end[0].from,baseline.at(-1));
  const tangent={x:Math.SQRT1_2,y:Math.SQRT1_2},markerVector={x:markers.start.to.x-markers.start.from.x,y:markers.start.to.y-markers.start.from.y};
  assert(Math.abs(tangent.x*markerVector.x+tangent.y*markerVector.y)<1e-9,'start mark is perpendicular to the local curve');
  assert.equal(markers.end.length,2);
  assert.equal(buildTextSpanMarkers(baseline,null,5),null);
  assert.equal(buildTextSpanMarkers(baseline,{sStart:5,sEnd:5},5),null);
});
