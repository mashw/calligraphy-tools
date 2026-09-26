import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHAPE_OPTIONS, shapeBoundaryPoints, shapeContainsPoint, shapeFootprintContains, shapeGeometryFrame, shapePathData } from '../src/lib/layout/shape.ts';
import { safeLayerId, serializePlotterSvg } from '../src/lib/layout/plotter-svg.ts';
import { isGuidelinesPlanningPointBlocked, selectLineLayoutSpan } from '../src/lib/layout/guidelines-planning.ts';
import { artworkBoundsContains, usesArtworkBoundsOcclusion } from '../src/lib/layout/artwork-occlusion.ts';

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

test('masked guideline footprints contain only their shape, including padding',()=>{
  const frame={x:10,y:20,width:100,height:100};
  assert(shapeFootprintContains('circle',frame,{x:60,y:70}));
  assert(!shapeFootprintContains('circle',frame,{x:11,y:21}));
  assert(shapeFootprintContains('circle',frame,{x:8,y:70},0,3));
  assert(shapeFootprintContains('heart',frame,{x:60,y:70}));
  assert(!shapeFootprintContains('heart',frame,{x:11,y:21}));
  assert(shapeFootprintContains('gothicArch',frame,{x:60,y:70}));
  assert(!shapeFootprintContains('gothicArch',frame,{x:11,y:21}));
});

test('preview and both occlusion pipelines retain rectangles only for unmasked guidelines',()=>{
  const stage=readFileSync(new URL('../src/components/layout/LayoutStage.tsx',import.meta.url),'utf8');
  assert.match(stage,/element\.type==='guidelines'&&element\.mask\?\.enabled[\s\S]*?<path transform=/);
  for(const file of ['guidelines-text-fit.ts','plotter-export.ts']){
    const source=readFileSync(new URL(`../src/lib/layout/${file}`,import.meta.url),'utf8');
    assert.match(source,/if\(!element\.mask\?\.enabled\)return \[rectOccluder\(occupiedRect\(/,file);
    assert.match(source,/shapeFootprintContains\(element\.mask\.kind/,file);
  }
});

test('plotter SVG supports combined and one-layer-per-element output',()=>{
  const input={width:210,height:297,strokeWidth:.2,anchorPath:'M 6 6 L 7 6',format:(value:number)=>String(value),layers:[
    {elementId:'guide-a',name:'Guidelines',pathData:'M 10 10 L 20 10'},
    {elementId:'guide-b',name:'Guidelines',pathData:'M 30 30 L 40 30'},
    {elementId:'empty',name:'Empty',pathData:''},
  ]};
  const combined=serializePlotterSvg({...input,layering:'combined'});
  assert.equal((combined.match(/<path /g)??[]).length,1);
  const separate=serializePlotterSvg({...input,layering:'elements'});
  assert.equal((separate.match(/data-name="Guidelines"/g)??[]).length,2);
  assert.equal((separate.match(/id="cricut-registration"/g)??[]).length,1);
  assert.doesNotMatch(separate,/data-name="Empty"/);
  assert.notEqual(safeLayerId('Duplicate name','one'),safeLayerId('Duplicate name','two'));
  assert.match(safeLayerId('Unsafe / name','id:1'),/^[a-zA-Z][a-zA-Z0-9_-]*$/);
  assert(separate.indexOf('guide-a')<separate.indexOf('guide-b'));
  for(const geometry of ['M 10 10 L 20 10','M 30 30 L 40 30'])assert(combined.includes(geometry)&&separate.includes(geometry));
});

test('plotter builder keeps safety and baked element grouping ahead of serialization',()=>{
  const source=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(source,/raw = clipPolylinesByOccluders\(raw, higherOccluders\);[\s\S]*?drawingLayers\.push/);
  assert.match(source,/const safety = analyzeSafety\(drawing, page, matId\)/);
  assert.match(source,/anchorPath:polylinesToPathD\(anchors\)/);
});

test('external occlusion and intrinsic mask are independent planning constraints',()=>{
  const blocked=(avoidOccludingElements:boolean,textLayoutRespectsMask:boolean)=>isGuidelinesPlanningPointBlocked({avoidOccludingElements,externallyOccluded:true,maskEnabled:true,textLayoutRespectsMask,insideMask:false});
  assert.equal(blocked(true,true),true,'both constraints on');
  assert.equal(blocked(true,false),true,'external only');
  assert.equal(blocked(false,true),true,'mask only');
  assert.equal(blocked(false,false),false,'both constraints off');
});

test('visibility cache includes both planning toggles',()=>{
  const source=readFileSync(new URL('../src/lib/layout/guidelines-text-fit.ts',import.meta.url),'utf8');
  assert.match(source,/mask:element\.mask,avoidOccludingElements:element\.avoidOccludingElements/);
  assert.match(source,/occluders=element\.avoidOccludingElements!==false\?/);
});

test('Line Layout selects one fitting contiguous span for every alignment',()=>{
  const spans=[{x1:0,x2:25},{x1:40,x2:100}],footprint=30,center=50;
  assert.deepEqual(selectLineLayoutSpan(spans,'left',footprint,center,0)?.span,spans[1]);
  assert.deepEqual(selectLineLayoutSpan(spans,'right',footprint,center,0)?.span,spans[1]);
  assert.equal(selectLineLayoutSpan(spans,'center',footprint,center,0)?.start,55);
  assert.equal(selectLineLayoutSpan(spans,'custom',footprint,center,10)?.start,40);
  assert.equal(selectLineLayoutSpan(spans,'custom',footprint,center,90)?.start,70);
});

test('Line Layout reports the largest span when none fits and skips blocked rows',()=>{
  const fallback=selectLineLayoutSpan([{x1:0,x2:10},{x1:20,x2:40}],'left',30,25,0);
  assert.deepEqual(fallback?.span,{x1:20,x2:40});
  assert.equal(fallback?.fits,false);
  assert.equal(selectLineLayoutSpan([],'left',10,50,0),null);
});

test('Artwork bounds is the default planning-only exclusion mode',()=>{
  const types=readFileSync(new URL('../src/lib/layout/types.ts',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/app/layout/page.tsx',import.meta.url),'utf8');
  const planning=readFileSync(new URL('../src/lib/layout/guidelines-text-fit.ts',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(types,/textFitExclusion\?:'bounds'\|'geometry'/);
  assert.match(page,/textFitExclusion:'bounds'/);
  assert.match(planning,/textFitExclusion\?\?'bounds'\)===\'bounds\'\)return \[rectOccluder\(occupiedRect/);
  assert.doesNotMatch(plotter,/textFitExclusion/);
});

test('Artwork visual bounds occlusion is explicit, exact, and disableable',()=>{
  const bounds={x:10,y:20,width:30,height:40};
  assert.equal(usesArtworkBoundsOcclusion({occludeLowerLayers:true,opacity:100,occlusionArea:'visible-artwork'}),false);
  assert.equal(usesArtworkBoundsOcclusion({occludeLowerLayers:true,opacity:100,occlusionArea:'bounds'}),true);
  assert.equal(usesArtworkBoundsOcclusion({occludeLowerLayers:false,opacity:100,occlusionArea:'bounds'}),false);
  assert.equal(usesArtworkBoundsOcclusion({occludeLowerLayers:true,opacity:0,occlusionArea:'bounds'}),false);
  assert.equal(usesArtworkBoundsOcclusion({occludeLowerLayers:true,opacity:100}),false,'older Artwork keeps visible-artwork behavior');
  assert(artworkBoundsContains(bounds,{x:20,y:30}));
  assert(!artworkBoundsContains(bounds,{x:9.99,y:30}));
  assert(!artworkBoundsContains(bounds,{x:20,y:60.01}));
});

test('Artwork bounds uses a preview knockout and baked plotter clipping only',()=>{
  const renderer=readFileSync(new URL('../src/components/layout/ArtworkRenderer.tsx',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(renderer,/usesArtworkBoundsOcclusion\(element\.settings\)[\s\S]*?<rect[\s\S]*?fill=\{PAGE_BACKGROUND\}/);
  assert.match(plotter,/usesArtworkBoundsOcclusion\(element\.settings\)\)return \[\{bounds:element\.frame,contains:point=>artworkBoundsContains/);
  assert.match(plotter,/raw = clipPolylinesByOccluders\(raw, higherOccluders\)/);
  assert.doesNotMatch(plotter,/fill=["']white|PAGE_BACKGROUND/);
});
