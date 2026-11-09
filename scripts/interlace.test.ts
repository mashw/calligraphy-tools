import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialSheet, strand, topology, renderSheet, rememberCrossing, resolveChoices, sameCrossing, canJoin } from '../src/lib/interlace/model';
import { openSheet } from '../src/lib/interlace/document';
import { scenePdf, sceneSvg } from '../src/lib/woven/vector-export';
import { DEFAULT_DESIGN } from '../src/lib/woven/design';
import { buildWovenRouteModel } from '../src/lib/woven/model';
const fixture=()=>openSheet(JSON.parse(readFileSync(new URL('../tests/fixtures/interlace-join.json',import.meta.url),'utf8'))).sheet;

test('woven presets retain alternating self crossings and source identity on direction, start and scale edits',()=>{
  for(const shape of ['rosette','figure-eight'] as const) {
    const sheet=initialSheet(),s=sheet.strands[0];
    s.source={kind:shape};s.design.rotation=31;s.scale=85;
    const g=topology(sheet);assert.equal(g.hits.length,shape==='rosette'?6:1);
    const hit=g.hits[0];sheet.overrides=[{...hit,over:hit.over==='a'?'b':'a'}];
    s.design.start=75;s.design.reverse=true;s.scale=92;
    const changed=topology(sheet);assert.equal(changed.kept.length,1);
    assert.equal(changed.hits.find(h=>sameCrossing(h,hit))?.over,sheet.overrides[0].over);
  }
});
test('mixed composition preserves explicit choices across reorder and JSON round trip',()=>{
  const sheet=fixture();
  const rosette=strand('rose','Rosette',{kind:'rosette'},{...DEFAULT_DESIGN,width:80,height:80,centerX:92,centerY:120});
  sheet.strands.push(rosette);const graph=topology(sheet);
  const self=graph.hits.find(h=>h.a.id==='rose' && h.b.id==='rose')!;
  const mixed=graph.hits.find(h=>h.a.id!==h.b.id && (h.a.id==='rose'||h.b.id==='rose'))!;
  assert.ok(self);assert.ok(mixed);
  sheet.overrides=[self,mixed].map(h=>({...h,over:h.over==='a'?'b':'a'}));sheet.strands.reverse();
  assert.equal(topology(sheet).kept.length,2);
  const saved=openSheet(JSON.parse(JSON.stringify(sheet))).sheet;
  assert.equal(sceneSvg(renderSheet(saved)),sceneSvg(renderSheet(sheet)));
  assert.ok(new TextDecoder().decode(scenePdf(renderSheet(saved))).startsWith('%PDF'));
});
test('ambiguous and missing passages drop overrides',()=>{
  const h=topology(fixture()).hits[0];
  assert.deepEqual(resolveChoices([], [h]),[]);
  const saved=rememberCrossing(h,[h]);
  assert.deepEqual(resolveChoices([{...h,handedness:-h.handedness!}], [saved]),[]);
  assert.deepEqual(resolveChoices([h,{...h,a:{...h.a,t:h.a.t+.005}}],[h]),[]);
});
test('Copperplate endpoint seam carries rails and slant phase through beside a physical crossing cut',()=>{
  const sheet=fixture(),g=topology(sheet);
  assert.ok(canJoin(g.entries[0],g.entries[1]));
  const cross=g.hits.find(h=>h.a.id==='cross'||h.b.id==='cross')!;
  sheet.overrides=[{...cross,over:cross.a.id==='right'?'a':'b'}];
  const scene=renderSheet(sheet);
  assert.ok(scene.strokes.some(s=>s.role==='primary' && s.points[0].x<84 && s.points.at(-1)!.x>86));
  const vertical=scene.strokes.filter(s=>s.role==='primary' && Math.abs(s.points[0].x-s.points.at(-1)!.x)<.01);
  assert.ok(vertical.length>=4);
  for(const rail of vertical) assert.ok(rail.points.every(p=>p.y<119)||rail.points.every(p=>p.y>121));
  const xml=sceneSvg(scene);assert.match(xml,/width="210mm" height="297mm"/);assert.doesNotMatch(xml,/<mask|clipPath/);
  const continuous=scene.strokes.filter(s=>s.role==='slant' && s.points.some(p=>p.x>80 && p.x<90));
  assert.ok(continuous.length>0);
});
test('Woven import resolves original manual crossing on the same passage, including reversed shapes',()=>{
  for(const reverse of [false,true]){
    const design={...DEFAULT_DESIGN,reverse,rotation:25,overrides:{'crossing-0':'b' as const}};
    const original=buildWovenRouteModel(design),sheet=openSheet(JSON.parse(JSON.stringify(design))).sheet;
    const hit=topology(sheet).hits.find(h=>Math.hypot(h.point.x-original.crossings[0].point.x,h.point.y-original.crossings[0].point.y)<.01);
    assert.ok(hit);assert.equal(sheet.overrides.length,1);assert.equal(hit.over,reverse?'a':'b');
  }
});

test('page boundaries physically trim plot strokes',()=>{
  const sheet=fixture();sheet.strands=sheet.strands.slice(0,1);sheet.joins=[];
  sheet.strands[0].design.centerX=5;
  const strokes=renderSheet(sheet).strokes;
  assert.ok(strokes.some(s=>s.role==='primary' && s.points[0].x===0));
  assert.ok(strokes.every(s=>s.points.every(p=>p.x>=0 && p.x<=210 && p.y>=0 && p.y<=297)));
});

test('Cricut uses physical centrelines, mat safety and an opt-in ruler', async()=>{
  const {buildInterlacePlotterExport,DEFAULT_INTERLACE_PLOTTER_OPTIONS: defaults}=await import('../src/lib/interlace/plotter-export');
  const sheet=fixture();
  const clean=buildInterlacePlotterExport(sheet,'12x12');
  const ruler=buildInterlacePlotterExport(sheet,'12x12',{...defaults,ruler:true});
  assert.equal(clean.safety.reasons.length,0);
  assert.equal(ruler.polylineCount,clean.polylineCount+7);
  assert.match(clean.svg,/fill="none"/);
  assert.doesNotMatch(clean.svg,/<mask|clipPath|<image/);
  sheet.strands[0].design.centerX=5;
  assert.ok(buildInterlacePlotterExport(sheet,'12x12').safety.unsafePolylineCount>0);
  sheet.paper='A3';sheet.orientation='landscape';
  assert.equal(buildInterlacePlotterExport(sheet,'12x12').safety.pageFitsPhysicalMat,false);
});
