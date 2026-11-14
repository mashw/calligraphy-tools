import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initialSheet, strand, topology, renderSheet } from '../src/lib/interlace/model';
import { openSheet } from '../src/lib/interlace/document';
import { exportForLayout, validateInterlaceSource, INTERLACE_SOURCE_FORMAT } from '../src/lib/interlace/layout-source';
import { DEFAULT_TEXT_PLAN, textFit, writingSpace } from '../src/lib/interlace/text-fit';
import { highContrastScene, textEstimateScene } from '../src/lib/interlace/preview';
import { DEFAULT_DESIGN } from '../src/lib/woven/design';
import { sceneSvg, scenePdf } from '../src/lib/woven/vector-export';
import { parseLayoutDesign, serializeLayoutDesign } from '../src/lib/layout/design-file';
import { pageElement, type ArtworkElement } from '../src/lib/layout/types';
import { measureRun } from '../src/lib/measure/measure-run';
import { SCRIPT_PROFILES } from '../src/lib/scripts';
import { buildCopperplateContext } from '../src/lib/copperplate/context';
const fixture=()=>openSheet(JSON.parse(readFileSync(new URL('../tests/fixtures/interlace-join.json',import.meta.url),'utf8'))).sheet;
function lineSheet(){const sheet=initialSheet();sheet.strands=[strand('line','Line',{kind:'path',d:'M-50 0H50',width:100,height:1,closed:false,points:[{x:-50,y:0},{x:50,y:0}]},{...DEFAULT_DESIGN,script:'Copperplate',xNib:4,centerX:100,centerY:100,width:100,height:1,gap:0,fullGuides:false})];return sheet;}
test('Layout SVG has tight physical bounds, transparent clipped vectors and escaped editable source',()=>{
  const sheet=fixture();sheet.strands.push(strand('rose','<script>alert("x")</script>',{kind:'rosette'},{...DEFAULT_DESIGN,width:60,height:60}));
  const hit=topology(sheet).hits[0];sheet.overrides=[{...hit,over:hit.over==='a'?'b':'a'}];sheet.strands[0].textPlan={...DEFAULT_TEXT_PLAN,text:'a & b < c',connected:true};
  const svg=exportForLayout(sheet),scene=renderSheet(sheet,undefined,{ruler:false});assert.doesNotMatch(svg,/<rect|<script|<text|<mask|clipPath|data-camera/);assert.match(svg,/&lt;script&gt;/);
  assert.equal((svg.match(/<path /g)??[]).length,scene.strokes.length);
  const size=/width="([^"]+)mm" height="([^"]+)mm" viewBox="0 0 ([^"]+)"/.exec(svg)!;assert.ok(size);assert.deepEqual(size[3].split(' ').map(Number),[Number(size[1]),Number(size[2])]);assert.ok(Number(size[2])<200);
  const json=svg.match(/<metadata[^>]*>(.*?)<\/metadata>/s)![1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const source=validateInterlaceSource(JSON.parse(json));assert.deepEqual(source.document,openSheet(sheet).sheet);assert.equal(sceneSvg(renderSheet(source.document)),sceneSvg(renderSheet(sheet)));
});
test('Layout Save/Open and duplicate retain source independent of presentation transforms',()=>{
  const source=validateInterlaceSource({format:INTERLACE_SOURCE_FORMAT,version:1,document:fixture()});
  const art:ArtworkElement={id:'art',type:'artwork',name:'Interlace',locked:true,visible:false,paddingMM:0,rotationDeg:33,frame:{x:24,y:31,width:90,height:50},sourceFilename:'interlace.svg',interlaceSource:source,intrinsicAspectRatio:1.8,document:{viewBox:{x:0,y:0,width:180,height:100},nodes:[{tag:'path',attrs:{d:'M0 0L180 100',stroke:'#000000',fill:'none'},children:[]}],warning:null},settings:{lockProportions:true,opacity:100,occludeLowerLayers:true,occludeClosedShapes:true}};
  const result=parseLayoutDesign(serializeLayoutDesign([{...structuredClone(art),id:'copy'},art,pageElement()],'art'));
  for(const item of result.elements.filter(e=>e.type==='artwork')){assert.deepEqual(item.interlaceSource,source);assert.equal(item.rotationDeg,33);assert.equal(item.frame.width,90);assert.equal(item.visible,false);}
  assert.throws(()=>parseLayoutDesign(serializeLayoutDesign([{...art,interlaceSource:{...source,version:99} as never},pageElement()],'art')),/Unsupported/);
});
test('invalid and oversized metadata and text settings are rejected',()=>{
  for(const v of [null,{format:INTERLACE_SOURCE_FORMAT,version:2},{format:INTERLACE_SOURCE_FORMAT,version:1,document:{format:'other'}},{format:INTERLACE_SOURCE_FORMAT,version:1,document:{...initialSheet(),strands:[{id:'bad'}]}}])assert.throws(()=>validateInterlaceSource(v));
  assert.throws(()=>validateInterlaceSource({padding:'x'.repeat(1_000_001)}),/limit/);
  const s=lineSheet();s.strands[0].textPlan={...DEFAULT_TEXT_PLAN,text:'x'.repeat(10001)};assert.throws(()=>openSheet(s),/Text & Fit/);
});
test('all four scripts use shared measurements with actual dimensions and spacing',()=>{
  const sheet=lineSheet(),s=sheet.strands[0];s.textPlan={...DEFAULT_TEXT_PLAN,text:'overpainting',spacing:1.2};
  for(const script of ['Copperplate','Fraktur','TexturaQuadrata','InsularMajuscule'] as const){s.design.script=script;s.design.nib=script==='Copperplate'?1:2;
    const ctx=script==='Copperplate'?buildCopperplateContext({xHeightMM:4,capStyle:'simple',calibration:{enabled:false}}).ctx:{xHeightMM:8,nibMM:2*Math.cos(Math.PI/4),scale:1,spaceMult:1};ctx.spaceMult*=1.2;
    const fit=textFit(sheet,s);assert.ok(Math.abs(fit.needed-measureRun(s.textPlan.text,SCRIPT_PROFILES[script],ctx).totalAdvanceMM)<1e-8);assert.ok(fit.fits);assert.equal(fit.available,100);
  }
});
test('open offsets, margins, reversal, alignment and overflow use physical positions',()=>{
  const sheet=lineSheet(),s=sheet.strands[0];s.textPlan={...DEFAULT_TEXT_PLAN,text:'Hi',startMM:10,startGapMM:5,endGapMM:7,align:'end'};
  const fit=textFit(sheet,s);assert.equal(fit.available,78);assert.ok(fit.fits);assert.ok(fit.lines[0].placements[0].point.x>100);
  s.textPlan.reverse=true;const reverse=textFit(sheet,s);assert.equal(reverse.available,78);assert.ok(reverse.lines[0].placements[0].point.x<100);
  s.textPlan.text='overpainting '.repeat(50);const long=textFit(sheet,s);assert.equal(long.fits,false);assert.ok(long.lines[0].placements.some(p=>p.collision));
});
test('disconnected intervals cannot be summed to claim a continuous phrase fits',()=>{
  const sheet=lineSheet(),s=sheet.strands[0];s.design.clearance=0;const cross={...structuredClone(s),id:'cross',design:{...s.design,rotation:90,xNib:20}};sheet.strands.push(cross);
  const h=topology(sheet).hits[0];sheet.overrides=[{...h,over:h.a.id==='cross'?'a':'b'}];s.textPlan={...DEFAULT_TEXT_PLAN,text:'overpainting'};
  const fit=textFit(sheet,s);assert.equal(fit.spans.length,2);assert.ok(Math.abs(fit.available-80)<1e-7);assert.ok(fit.needed<fit.available);assert.equal(fit.fits,false);
  sheet.overrides[0].over=sheet.overrides[0].over==='a'?'b':'a';assert.equal(textFit(sheet,s).fits,true);
});
test('joined routes carry text over seams but retain crossing gaps and round-trip settings',()=>{
  const sheet=fixture(),s=sheet.strands[0];s.textPlan={...DEFAULT_TEXT_PLAN,text:'Hi',connected:true,preview:true};const connected=textFit(sheet,s);assert.ok(connected.total>79);assert.ok(connected.available<connected.total);
  s.textPlan.connected=false;assert.ok(textFit(sheet,s).total<41);s.textPlan.connected=true;const restored=openSheet(JSON.parse(JSON.stringify(sheet))).sheet;assert.deepEqual(textFit(restored,restored.strands[0]),connected);
});
test('closed figure-eight and rosette intervals wrap without artificial seam breaks',()=>{
  for(const kind of ['figure-eight','rosette'] as const){const sheet=initialSheet(),s=sheet.strands[0];s.source={kind};s.design.gap=0;s.design.clearance=0;s.textPlan={...DEFAULT_TEXT_PLAN,text:'a\nb'};
    const original=writingSpace(sheet,s),usable=(v:typeof original)=>v.spans.reduce((n,s)=>n+s.end-s.start,0);assert.ok(original.spans.length>0);assert.ok(usable(original)<original.total);
    s.textPlan.startMM=20;s.textPlan.reverse=true;const reversed=writingSpace(sheet,s);assert.ok(Math.abs(usable(original)-usable(reversed))<1e-6);
    s.design.gap=20;assert.ok(usable(writingSpace(sheet,s))<=usable(reversed));
  }
});
test('high contrast changes only presentation; text boxes are separate opt-in vector geometry',()=>{
  const sheet=lineSheet(),s=sheet.strands[0],scene=renderSheet(sheet),before=sceneSvg(scene),contrast=highContrastScene(scene);
  assert.notEqual(sceneSvg(contrast),before);assert.equal(sceneSvg(scene),before);assert.deepEqual(contrast.strokes.map(s=>s.points),scene.strokes.map(s=>s.points));assert.ok(contrast.strokes.some(s=>s.guide==='baseline'&&s.color==='#111827'));assert.ok(contrast.strokes.some(s=>s.guide==='waist'&&s.color==='#1e40af'));
  s.textPlan={...DEFAULT_TEXT_PLAN,text:'Hi',preview:true};const estimate=textEstimateScene(textFit(sheet,s));assert.equal(estimate.strokes.length,4);assert.match(new TextDecoder().decode(scenePdf(estimate)),/%PDF/);assert.equal(sceneSvg(renderSheet(sheet)),before);
});
