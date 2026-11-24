import { DEFAULT_TEXT_PLAN } from '../src/lib/interlace/text-fit.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, parseDesign, selectWovenPreset, strapLettering } from '../src/lib/woven/design.ts';
import { buildWovenModel, buildWovenRouteModel } from '../src/lib/woven/model.ts';
import { newElement, pageElement, type WovenElement } from '../src/lib/layout/types.ts';
import { designFromComposition, editableComposition, openSheet, fitWovenPreset } from '../src/lib/interlace/document.ts';
import { layoutWovenDesign, layoutWovenModel, layoutWovenTags, wovenSettings } from '../src/lib/layout/woven.ts';
import { parseLayoutDesign, serializeLayoutDesign } from '../src/lib/layout/design-file.ts';
import { buildPlotterExport } from '../src/lib/layout/plotter-export.ts';
import { layeredLayoutPdf } from '../src/lib/layout/woven-pdf.ts';

for(const preset of ['rosette','figure-eight'] as const) {
  test(`${preset}: moving translates every guide and annotation without changing crossings`,()=>{
    const design={...DEFAULT_DESIGN,preset},a=buildWovenModel(design,{furniture:false}),b=buildWovenModel({...design,centerX:125,centerY:178.5},{furniture:false});
    const translate=(p:{x:number;y:number})=>({x:p.x+20,y:p.y+30});
    assert.deepEqual(a.crossings.map(c=>c.id),b.crossings.map(c=>c.id));
    for(const key of ['clean','annotated'] as const) {
      assert.equal(a[key].strokes.length,b[key].strokes.length);
      a[key].strokes.forEach((stroke,i)=>stroke.points.forEach((point,j)=>{const expected=translate(point),actual=b[key].strokes[i].points[j];assert.ok(Math.abs(actual.x-expected.x)<1e-7&&Math.abs(actual.y-expected.y)<1e-7);}));
      a[key].labels.forEach((label,i)=>{const expected=translate(label.point),actual=b[key].labels[i].point;assert.ok(Math.abs(actual.x-expected.x)<1e-7&&Math.abs(actual.y-expected.y)<1e-7);});
    }
    const lite=buildWovenRouteModel(design);
    assert.deepEqual(lite.route,a.route);assert.deepEqual(lite.intervals,a.intervals);assert.deepEqual(lite.choices,a.choices);assert.deepEqual(lite.warnings,a.warnings);
    assert.ok(!a.annotated.labels.some(l=>/50 mm|WRITING PLAN/.test(l.text)));
  });
}

test('standalone v1 positions are optional, round-trip, and reject invalid values',()=>{
  assert.equal(parseDesign(DEFAULT_DESIGN).centerX,undefined);
  const moved={...DEFAULT_DESIGN,centerX:-20.25,centerY:180.125};assert.deepEqual(parseDesign(moved),moved);
  for(const value of [NaN,Infinity,'12',10001])assert.throws(()=>parseDesign({...moved,centerX:value}));
});

test('native Layout Woven matches standalone geometry and round-trips alongside older elements',()=>{
  const woven=newElement('woven',1,{width:210,height:297}) as WovenElement;
  woven.settings.overrides={'crossing-0':'b'};woven.rotationDeg=32;woven.frame.x=12.5;woven.frame.width=130.25;
  assert.deepEqual(layoutWovenModel(woven),buildWovenModel(layoutWovenDesign(woven),{furniture:false}));
  const elements=[woven,newElement('shape',1,{width:210,height:297}),newElement('curved-title',1,{width:210,height:297}),pageElement()];
  assert.deepEqual(parseLayoutDesign(serializeLayoutDesign(elements,woven.id)),{elements,selectedElementId:woven.id});
  assert.ok(!('width' in woven.settings)&&!('rotation' in woven.settings)&&!('centerX' in woven.settings));
  for(const patch of [{loop:.9},{script:'invalid'},{overrides:{'bad':'a'}},{slantStyle:'invalid'},{nib:-1}])assert.throws(()=>parseLayoutDesign(serializeLayoutDesign([{...woven,settings:{...woven.settings,...patch}} as WovenElement,pageElement()],woven.id)));
});

test('Cricut exports Woven centreline vectors with physical transforms, layer ids, clipping and visibility',()=>{
  const woven=newElement('woven',1,{width:210,height:297}) as WovenElement;
  woven.frame={x:35,y:80,width:110,height:110};woven.rotationDeg=15;
  const combined=buildPlotterExport([woven,pageElement()],{},'12x12');
  assert.ok(combined.polylineCount>50);assert.ok(!combined.svg.includes('<image'));
  const physicalWidth=Number(combined.svg.match(/width="([\d.]+)in"/)![1])*25.4;
  const viewWidth=Number(combined.svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/)![1]);
  assert.ok(Math.abs(physicalWidth-viewWidth)<.001,'Cricut crop retains mm scale');
  const layers=buildPlotterExport([woven,pageElement()],{},'12x12',{layering:'elements'});
  assert.match(layers.svg,/Woven/);
  assert.equal(buildPlotterExport([{...woven,visible:false},pageElement()],{},'12x12').polylineCount,buildPlotterExport([pageElement()],{},'12x12').polylineCount);
  const moved=buildPlotterExport([{...woven,frame:{...woven.frame,x:75}},pageElement()],{},'12x12');assert.notEqual(moved.svg,combined.svg);
  const cover=newElement('shape',1,{width:210,height:297});cover.frame={...woven.frame};
  assert.ok(buildPlotterExport([cover,woven,pageElement()],{},'12x12').polylineCount<combined.polylineCount);
  const copperplate={...woven,settings:{...woven.settings,script:'Copperplate' as const,nib:1,secondSlant:true,secondAngle:70}};
  assert.ok(buildPlotterExport([copperplate,pageElement()],{},'12x12',{secondarySlantGuides:false}).polylineCount<buildPlotterExport([copperplate,pageElement()],{},'12x12').polylineCount);
});

test('Woven-only Layout PDF contains physical vector paths and no raster images',async()=>{
  const woven=newElement('woven',1,{width:210,height:297}) as WovenElement;woven.rotationDeg=35;
  const pdf=await (await layeredLayoutPdf(null as unknown as SVGSVGElement,[woven,pageElement()],{width:210,height:297})).text();
  assert.match(pdf,/% Woven vector layer/);assert.match(pdf,/MediaBox \[0 0 595\.27559 841\.88976\]/);assert.ok(!pdf.includes('/Subtype /Image'));
  const offset=Number(pdf.match(/startxref\n(\d+)/)![1]);assert.equal(pdf.slice(offset,offset+4),'xref');
});

test('Gothic cap weave keeps four closed straps and 36 editable crossings in Woven and Layout', () => {
  const design = fitWovenPreset(selectWovenPreset(DEFAULT_DESIGN, 'gothic-cap-weave'));
  const model = buildWovenRouteModel(parseDesign(design));
  assert.equal(model.crossings.length, 36);
  const entries = model.composition?.graph.entries;
  assert.equal(entries?.length, 4);
  assert.ok(entries?.every(entry => entry.route.closed));
  assert.equal(entries[2].s.design.nib, entries[0].s.design.nib * (2 / 3));
  assert.equal(model.choices['crossing-1'], 'b');
  const changed = buildWovenRouteModel({...design, overrides:{'crossing-1':'a'}});
  assert.equal(changed.choices['crossing-1'], 'a');

  const element = newElement('woven', 1, {width:210, height:297}) as WovenElement;
  element.settings = wovenSettings(design);
  element.frame = {...element.frame, width:design.width, height:design.height};
  const reopened = parseLayoutDesign(serializeLayoutDesign([element, pageElement()], element.id));
  const restored = reopened.elements.find(item => item.type === 'woven');
  assert.ok(restored);
  assert.equal(restored.settings.preset, 'gothic-cap-weave');
  assert.deepEqual(buildWovenRouteModel(layoutWovenDesign(restored)).choices, model.choices);
});

test('released lettering survives save/open and relinking keeps crossing choices', () => {
  const design = fitWovenPreset(selectWovenPreset(DEFAULT_DESIGN, 'gothic-cap-weave'));
  const initial = buildWovenRouteModel(design);
  const narrow = initial.composition!.sheet.strands[2];
  const style = {...strapLettering(narrow.design),script:'Copperplate' as const,nib:1,xNib:3};
  const saved = parseDesign(JSON.parse(JSON.stringify({...design,independentStraps:true,strapStyles:{[narrow.id]:style}})));
  const released = buildWovenRouteModel(saved);
  assert.deepEqual(released.choices,initial.choices);
  const strands = released.composition!.sheet.strands;
  assert.equal(strands[2].design.script,'Copperplate');
  assert.equal(strands[2].design.xNib,3);
  assert.equal(strands[1].design.script,'Fraktur');
  assert.equal(buildWovenRouteModel({...saved,independentStraps:false}).composition!.sheet.strands[2].design.nib,narrow.design.nib);
});

test('rotated oversized Woven tags fit on the actual page even when all cells contain ink', () => {
  const page = {width:80,height:60};
  const frame = {x:-20,y:-25,width:120,height:110};
  const tags = ['Wide upper','Narrow lower'].map(text => ({text,size:3,point:{x:200,y:180}}));
  const scene = {tags,strokes:[{points:[{x:0,y:55},{x:120,y:55}],width:250,color:'#000'}]};
  const placed = layoutWovenTags(scene,frame,90,page);
  assert.equal(placed.length,tags.length);
  assert.notEqual(placed[0].point.y,placed[1].point.y);
  for(const t of placed) {
    const half = t.text.length*t.size*.76/2;
    assert.ok(t.point.x-half >= 0 && t.point.x+half <= page.width);
    assert.ok(t.point.y-t.size >= 0 && t.point.y+t.size*.3 <= page.height);
  }
});

test('custom Woven composition returns from Layout with authored strands, text and crossings', () => {
  const sheet = openSheet(fitWovenPreset(selectWovenPreset(DEFAULT_DESIGN,'gothic-cap-weave'))).sheet;
  sheet.overrides[0].over = sheet.overrides[0].over === 'a' ? 'b' : 'a';
  sheet.strands[0].textPlan = {...DEFAULT_TEXT_PLAN,text:'Example', preview:true};
  const element = newElement('woven',1,{width:210,height:297}) as WovenElement;
  element.settings = wovenSettings(designFromComposition(sheet));
  const doc = parseLayoutDesign(serializeLayoutDesign([element,pageElement()],element.id));
  const item = doc.elements.find(e=>e.type==='woven')!;
  const design = layoutWovenDesign(item);
  const restored = editableComposition(design);
  assert.equal(restored.strands[0].textPlan?.text,'Example');
  assert.deepEqual(restored.strands.map(s=>s.id),sheet.strands.map(s=>s.id));
  assert.equal(buildWovenRouteModel(design).choices['crossing-0'],sheet.overrides[0].over);
  assert.equal(restored.overrides[0].over,sheet.overrides[0].over);
});

test('Layout strap text survives reopening single and multi-strap presets in Woven', () => {
  for (const preset of ['rosette','gothic-cap-weave'] as const) {
    const design = selectWovenPreset(DEFAULT_DESIGN,preset);
    const straps = editableComposition(design).strands;
    const strapTexts = Object.fromEntries(straps.map(s => [s.id, 'Text for '+s.id]));
    const reopened = editableComposition(parseDesign({...design,strapTexts}));
    for (const s of reopened.strands) assert.equal(s.textPlan?.text,strapTexts[s.id]);
  }
});

test('Four-scroll ribbon weave keeps separate narrow writing paths through Layout Save/Open', () => {
  const design = fitWovenPreset(selectWovenPreset(DEFAULT_DESIGN, 'spiral-ribbon-weave'));
  const standalone = buildWovenRouteModel(design);
  const strands = standalone.composition?.sheet.strands;
  assert.equal(strands?.length, 6);
  assert.equal(new Set(strands?.map(strand => strand.id)).size, 6);
  assert.equal(strands?.filter(strand => strand.design.nib === design.nib).length, 2);
  assert.equal(strands?.filter(strand => strand.design.nib === design.nib / 3).length, 4);
  assert.ok(standalone.crossings.length > 5);
  assert.ok(standalone.composition?.graph.hits.some(hit => hit.a.id.endsWith('-inner') && hit.b.id.endsWith('-outer')));

  const element = newElement('woven', 1, { width: 210, height: 297 }) as WovenElement;
  element.settings = wovenSettings({ ...design, strapTexts: { 'scroll-1-inner': 'Inner lettering' } });
  element.frame = { x: 40, y: 34, width: design.width, height: design.height };
  const reopened = parseLayoutDesign(serializeLayoutDesign([element, pageElement()], element.id)).elements[0];
  assert.equal(reopened.type, 'woven');
  if (reopened.type !== 'woven') throw Error('Missing Woven element');
  const layout = buildWovenRouteModel(layoutWovenDesign(reopened));
  assert.equal(layout.composition?.sheet.strands.length, 6);
  const inner = layout.composition?.sheet.strands.find(strand => strand.id === 'scroll-1-inner');
  assert.equal(inner?.textPlan?.text, 'Inner lettering');

  const strokes = layoutWovenModel(reopened).clean.strokes;
  assert.ok(strokes.length > 100);
  assert.ok(strokes.every(stroke => stroke.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
});
