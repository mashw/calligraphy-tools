import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHAPE_OPTIONS, shapeBoundaryPoints, shapeContainsPoint, shapeGeometryFrame, shapePathData } from '../src/lib/layout/shape.ts';

test('circle containment uses an inscribed constrained frame',()=>{
  assert.deepEqual(shapeGeometryFrame('circle',120,80),{x:20,y:0,width:80,height:80});
  assert(shapeContainsPoint('circle',100,100,{x:50,y:50}));
  assert(!shapeContainsPoint('circle',100,100,{x:0,y:0}));
});

test('circle writing spans narrow towards its top and bottom',()=>{
  const widthAt=(y:number)=>Array.from({length:1001},(_,i)=>i/10).filter(x=>shapeContainsPoint('circle',100,100,{x,y})).length/10;
  assert(widthAt(50)>widthAt(15));
  assert(widthAt(15)>widthAt(2));
});

for(const kind of ['heart','gothicArch','scallopedCircle'] as const)test(`${kind} has a sane closed region`,()=>{
  const boundary=shapeBoundaryPoints(kind,100,100);
  assert(boundary.length>50);
  assert(boundary.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  assert(shapeContainsPoint(kind,100,100,{x:50,y:50}));
  assert(!shapeContainsPoint(kind,100,100,{x:-1,y:-1}));
});

test('every mask kind supplies direct SVG path geometry',()=>{
  for(const {kind} of SHAPE_OPTIONS)assert.match(shapePathData(kind,120,80,3),/^M .+ Z$/,kind);
});

test('Layout guideline clipPath contains a path rather than ShapeGeometry wrapper',()=>{
  const source=readFileSync(new URL('../src/components/layout/LayoutStage.tsx',import.meta.url),'utf8');
  assert.match(source,/<clipPath id=\{clipId\}><path d=\{shapePathData\(/);
  assert.doesNotMatch(source,/<clipPath id=\{clipId\}><ShapeGeometry/);
});
