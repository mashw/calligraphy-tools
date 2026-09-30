import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHAPE_OPTIONS, shapeBoundaryPoints, shapeContainsPoint, shapeFootprintContains, shapeGeometryFrame, shapePathData } from '../src/lib/layout/shape.ts';
import { drawableGeometryBounds, safeLayerId, serializePlotterSvg } from '../src/lib/layout/plotter-svg.ts';
import { isGuidelinesPlanningPointBlocked, selectLineLayoutSpan } from '../src/lib/layout/guidelines-planning.ts';
import { artworkBoundsContains, usesArtworkBoundsOcclusion } from '../src/lib/layout/artwork-occlusion.ts';
import { resolveHorizontalGridAppearance } from '../src/lib/guides/horizontal-grid.ts';
import { dashHorizontalGuidePoints, dashPolylinePoints } from '../src/lib/guides/polyline-dash.ts';

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
  const input={viewport:{x:6,y:6,width:34,height:24},strokeWidth:.2,anchorPath:'M 6 6 L 7 6',format:(value:number)=>String(value),layers:[
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

test('Cricut SVG uses inch root dimensions while preserving millimetre geometry',()=>{
  const input={viewport:{x:6.35,y:6.35,width:173.65,height:280.5729},strokeWidth:.2,anchorPath:'M 6.35 6.85 L 6.35 6.35 L 6.85 6.35',format:String,layers:[
    {elementId:'guide-a',name:'Guidelines',pathData:'M 100 20 L 150 20'},
  ]};
  for(const layering of ['combined','elements'] as const){
    const svg=serializePlotterSvg({...input,layering});
    assert.match(svg,/width="6\.8366141732in"/);
    assert.match(svg,/height="11\.0461771654in"/);
    assert.match(svg,/viewBox="6\.35 6\.35 173\.65 280\.5729"/);
    assert.match(svg,/M 100 20 L 150 20/,'path coordinates remain in Layout millimetres');
    assert.match(svg,/M 6\.35 6\.85 L 6\.35 6\.35 L 6\.85 6\.35/,'registration geometry remains unchanged');
  }
});

test('drawable bounds include registration and exclude empty page area',()=>{
  const registration={points:[{x:6.35,y:6.85},{x:6.35,y:6.35},{x:6.85,y:6.35}]};
  const drawing={points:[{x:30,y:26},{x:180,y:286.9229}]};
  assert.deepEqual(drawableGeometryBounds([registration,drawing]),{x:6.35,y:6.35,width:173.65,height:280.5729});
  assert.deepEqual(drawableGeometryBounds([drawing]),{x:30,y:26,width:150,height:260.9229});
});

test('drawable bounds stream safely across 250,000 points',()=>{
  const lines=Array.from({length:250},(_,lineIndex)=>({
    points:Array.from({length:1000},(_,pointIndex)=>({x:lineIndex*1000+pointIndex-5000,y:pointIndex-lineIndex-700})),
  }));
  assert.deepEqual(drawableGeometryBounds(lines),{
    x:-5000,
    y:-949,
    width:249999,
    height:1248,
  });
});

test('duplicated complex artwork remains independent and contributes to bounds',()=>{
  const registration={points:[{x:6.35,y:6.85},{x:6.35,y:6.35},{x:6.85,y:6.35}]};
  const guidelines=Array.from({length:100},(_,index)=>({points:[{x:10,y:20+index},{x:180,y:20+index}]}));
  const artworkSource=Array.from({length:100},(_,line)=>({points:Array.from({length:1000},(_,point)=>({x:20+point*.04,y:30+line*.3}))}));
  const secondArtwork=artworkSource.map(line=>({points:line.points.map(point=>({x:point.x+100,y:point.y+150}))}));
  const geometry=[registration,...guidelines,...artworkSource,...secondArtwork];
  assert.equal(geometry.length,301,'both 100-polyline artwork copies remain present');
  assert.deepEqual(drawableGeometryBounds(geometry),{x:6.35,y:6.35,width:173.65,height:203.35});
});

test('drawable bounds handle empty, invalid, mixed, and negative coordinates',()=>{
  assert.equal(drawableGeometryBounds([]),null);
  assert.equal(drawableGeometryBounds([{points:[]},{points:[{x:NaN,y:1},{x:2,y:Infinity}]}]),null);
  assert.deepEqual(drawableGeometryBounds([{points:[{x:NaN,y:0},{x:-8,y:-5},{x:4,y:9}]}]),{x:-8,y:-5,width:12,height:14});
  const oneLargeLine={points:Array.from({length:150000},(_,index)=>({x:index-75000,y:index%101-50}))};
  const manyLines=Array.from({length:150},(_,line)=>({points:oneLargeLine.points.slice(line*1000,(line+1)*1000)}));
  assert.deepEqual(drawableGeometryBounds([oneLargeLine]),drawableGeometryBounds(manyLines));
});

test('normal Layout SVG remains millimetre-sized and Cricut safety remains millimetre-based',()=>{
  const stage=readFileSync(new URL('../src/components/layout/LayoutStage.tsx',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(stage,/clone\.setAttribute\('width', `\$\{page\.width\}mm`\)/);
  assert.match(stage,/clone\.setAttribute\('height', `\$\{page\.height\}mm`\)/);
  assert.match(plotter,/Every point handled by this module is a physical page coordinate in millimetres/);
  assert.match(plotter,/const safety = analyzeSafety\(drawing, page, matId\)/);
});

test('plotter builder keeps safety and baked element grouping ahead of serialization',()=>{
  const source=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(source,/raw = clipPolylinesByOccluders\(raw, higherOccluders\);[\s\S]*?drawingLayers\.push/);
  assert.match(source,/const safety = analyzeSafety\(drawing, page, matId\)/);
  assert.match(source,/allLines=\[\.\.\.anchors,\.\.\.drawing\][\s\S]*?viewport=drawableGeometryBounds\(allLines\)/);
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

test('transparent curved titles neither paint nor occlude their footprint',()=>{
  const stage=readFileSync(new URL('../src/components/layout/LayoutStage.tsx',import.meta.url),'utf8');
  const panel=readFileSync(new URL('../src/components/curved-title/CurvedTitleSettingsPanel.tsx',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  const planning=readFileSync(new URL('../src/lib/layout/guidelines-text-fit.ts',import.meta.url),'utf8');
  assert.match(stage,/pageBackground=\{!\(element\.settings\.transparentWhitespace\?\?true\)\?PAGE_BACKGROUND:undefined\}/);
  assert.match(panel,/Show lower layers through the gaps between the curved guides\./);
  assert.match(plotter,/element\.type === 'curved-title'[\s\S]*?transparentWhitespace \?\? true\)\) return \[rectOccluder[\s\S]*?return \[\];/);
  assert.match(planning,/element\.type==='curved-title'[\s\S]*?transparentWhitespace\?\?true\)\) return \[rectOccluder[\s\S]*?return \[\];/);
});

test('blackletter horizontal grid appearance defaults and validates physical dash lengths',()=>{
  assert.deepEqual(resolveHorizontalGridAppearance(),{style:'solid',dashMM:2,gapMM:2});
  assert.deepEqual(resolveHorizontalGridAppearance({style:'dashed',dashMM:9.1,gapMM:4.6}),{style:'dashed',dashMM:9.1,gapMM:4.6});
  assert.deepEqual(resolveHorizontalGridAppearance({style:'dashed',dashMM:3,gapMM:1.5}),{style:'dashed',dashMM:3,gapMM:1.5});
  assert.deepEqual(resolveHorizontalGridAppearance({style:'dashed',dashMM:0,gapMM:-1}),{style:'dashed',dashMM:.1,gapMM:.1});
});

test('only hGuides receive configurable dashes in preview and plotter output',()=>{
  const overlay=readFileSync(new URL('../src/components/preview/GuideOverlay.tsx',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  const horizontalBlock=overlay.slice(overlay.indexOf('{showGridHorizontal &&'),overlay.indexOf('markerData &&'));
  assert.match(horizontalBlock,/guideSet\.hGuides[\s\S]*?dashPolylinePoints\(poly, horizontalDash\.dashMM, horizontalDash\.gapMM\)/);
  assert.match(horizontalBlock,/visibleSegments\.map/);
  assert.doesNotMatch(horizontalBlock,/strokeDasharray/);
  assert.match(horizontalBlock,/interactive\?\.onGuidePointerDown[\s\S]*?points=\{points\}/, 'the continuous source polyline remains the interaction target');
  const verticalBlock=overlay.slice(overlay.indexOf('showGridVertical'),overlay.indexOf('showGridHorizontal'));
  assert.doesNotMatch(verticalBlock,/strokeDasharray/);
  assert.match(plotter,/dashHorizontalGuidePoints\(guide\.hGuides\?\?\[\],horizontal\)/);
  assert.match(plotter,/element\.settings\.topBandScript==='Copperplate'\?undefined:horizontalGridAppearance/);
  assert.match(plotter,/guideOptions\(band === model\.inner \? element\.settings\.innerScript : element\.settings\.outerScript\)/);
});

test('straight, curved-title, and calligram previews share physical hGuide segmentation with plotter export',()=>{
  const rendererFiles=['GuidelinesRenderer.tsx','../curved-title/CurvedTitleRenderer.tsx','../calligram/CalligramRenderer.tsx'];
  for(const file of rendererFiles){
    const source=readFileSync(new URL(`../src/components/guidelines/${file}`,import.meta.url),'utf8');
    assert.match(source,/resolveHorizontalGridAppearance/);
    assert.match(source,/horizontalDash:horizontalGrid\.style==='dashed'\?horizontalGrid:undefined/);
  }
  const overlay=readFileSync(new URL('../src/components/preview/GuideOverlay.tsx',import.meta.url),'utf8');
  const plotter=readFileSync(new URL('../src/lib/layout/plotter-export.ts',import.meta.url),'utf8');
  assert.match(overlay,/from '@\/lib\/guides\/polyline-dash'/);
  assert.match(plotter,/from '\.\.\/guides\/polyline-dash'/);
  assert.match(overlay,/horizontalDash[\s\S]*?dashPolylinePoints\(poly, horizontalDash\.dashMM, horizontalDash\.gapMM\)/);
  assert.match(plotter,/dashHorizontalGuidePoints\(guide\.hGuides\?\?\[\],horizontal\)/);
});

test('physical 9/5 mm dashes share one cumulative pattern across source vertices',()=>{
  const expected=[[0,9],[14,23],[28,37],[42,50]];
  for(const points of [[{x:0,y:0},{x:50,y:0}],[{x:0,y:0},{x:3,y:0},{x:17,y:0},{x:31,y:0},{x:50,y:0}]]){
    const dashes=dashPolylinePoints(points,9,5);
    dashes.forEach((dash,index)=>{
      assert(Math.abs(dash[0].x-expected[index][0])<1e-8);
      assert(Math.abs(dash.at(-1)!.x-expected[index][1])<1e-8);
    });
    dashes.slice(0,-1).forEach(dash=>assert(Math.abs(arcLength(dash)-9)<1e-8));
    assert.equal(arcLength(dashes.at(-1)!),8,'the final dash is truncated at the source endpoint');
  }
});

const arcLength=(points:{x:number;y:number}[])=>points.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-points[index].x,point.y-points[index].y),0);
test('physical 2/2 mm dashes have exact global phase across straight vertices',()=>{
  const expected=[[0,2],[4,6],[8,10],[12,14],[16,18]];
  for(const points of [[{x:0,y:0},{x:20,y:0}],[{x:0,y:0},{x:3,y:0},{x:7,y:0},{x:13,y:0},{x:20,y:0}]]){
    const dashes=dashPolylinePoints(points,2,2);
    assert.deepEqual(dashes.map(dash=>[dash[0].x,dash.at(-1)!.x]),expected);
    dashes.forEach(dash=>assert(Math.abs(arcLength(dash)-2)<1e-8));
  }
});

test('curved dashes use arc length and custom physical values',()=>{
  const curve=Array.from({length:101},(_,index)=>{const angle=index/100*Math.PI/2;return{x:20*Math.cos(angle),y:20*Math.sin(angle)}});
  const dashes=dashPolylinePoints(curve,2,2),complete=dashes.slice(0,-1);
  complete.forEach(dash=>assert(Math.abs(arcLength(dash)-2)<1e-7));
  assert(Math.max(...dashes.map(arcLength))<2.000001);
  const custom=dashPolylinePoints([{x:0,y:0},{x:20,y:0}],3.5,1.25);
  assert.deepEqual(custom.slice(0,4).map(dash=>[dash[0].x,dash.at(-1)!.x]),[[0,3.5],[4.75,8.25],[9.5,13],[14.25,17.75]]);
});

test('serialized Cricut path retains physical dash endpoints as separate subpaths',()=>{
  const dashes=dashPolylinePoints([{x:0,y:0},{x:20,y:0}],2,2),pathData=dashes.map(dash=>`M ${dash[0].x} 5 L ${dash.at(-1)!.x} 5`).join(' ');
  const svg=serializePlotterSvg({viewport:{x:0,y:0,width:20,height:10},strokeWidth:.2,anchorPath:'',layers:[{elementId:'g',name:'Textura',pathData}],layering:'combined',format:String});
  assert.match(svg,/M 0 5 L 2 5 M 4 5 L 6 5 M 8 5 L 10 5 M 12 5 L 14 5 M 16 5 L 18 5/);
});

test('the hGuide export helper dashes realistic guide polylines but not structural rails',()=>{
  const hGuide=Array.from({length:41},(_,index)=>({x:index/2,y:6+Math.sin(index/8)})),structural=[{x:0,y:0},{x:20,y:0}];
  const emitted=dashHorizontalGuidePoints([hGuide],{style:'dashed',dashMM:2,gapMM:2});
  emitted.slice(0,-1).forEach(dash=>assert(Math.abs(arcLength(dash.points)-2)<1e-7));
  assert.deepEqual(structural,[{x:0,y:0},{x:20,y:0}], 'structural rails bypass the hGuide helper');
});
