import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, parseDesign } from '../src/lib/woven/design.ts';
import { buildWovenModel, buildWovenRouteModel } from '../src/lib/woven/model.ts';
import { newElement, pageElement, type WovenElement } from '../src/lib/layout/types.ts';
import { layoutWovenDesign, layoutWovenModel } from '../src/lib/layout/woven.ts';
import { parseLayoutDesign, serializeLayoutDesign } from '../src/lib/layout/design-file.ts';
import { buildPlotterExport } from '../src/lib/layout/plotter-export.ts';
import { wovenLayoutPdf } from '../src/lib/layout/woven-pdf.ts';

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
  const pdf=await (await wovenLayoutPdf(null as unknown as SVGSVGElement,[woven,pageElement()],{width:210,height:297})).text();
  assert.match(pdf,/% Woven vector layer/);assert.match(pdf,/MediaBox \[0 0 595\.27559 841\.88976\]/);assert.ok(!pdf.includes('/Subtype /Image'));
  const offset=Number(pdf.match(/startxref\n(\d+)/)![1]);assert.equal(pdf.slice(offset,offset+4),'xref');
});
