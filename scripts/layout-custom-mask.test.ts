import { automatic,editableGuides,guideKey,guideTransform,rowKey } from '../src/lib/layout/guideline-arrangement.ts';
import { calculateStraightGuidelines } from '../src/lib/guides/straight/model.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { clipCustomMaskPolyline, customMaskWritingSpans, validateCustomMask, validateMaskPath, type CustomMask } from '../src/lib/layout/custom-mask.ts';
import { parseLayoutDesign, serializeLayoutDesign } from '../src/lib/layout/design-file.ts';
import { buildGuidelinesLineLayoutPlan, buildGuidelinesTextFitPlan, buildGuidelinesVisibleSpans } from '../src/lib/layout/guidelines-text-fit.ts';
import { newElement, pageElement, type GuidelinesElement } from '../src/lib/layout/types.ts';

const vertices=[[0,0],[100,0],[100,100],[70,100],[70,30],[30,30],[30,100],[0,100]];
const mask:CustomMask={
  filename:'arch.svg',path:'M'+vertices.map(p=>p.join(' ')).join('L')+'Z',
  boundary:vertices.map(([x,y])=>({x:x/100,y:y/100})),aspectRatio:1,matrix:[.01,0,0,.01,0,0],tolerance:0,
};
const box={width:100,height:100};
const bounds=(parts:{x:number;y:number}[][])=>parts.map(part=>part.map(p=>Number(p.x.toFixed(3))));

test('validates closed paths, including arcs and implicit line segments',()=>{
  validateMaskPath('m10 10 c0 -10 10 -10 10 0 a5 5 0 0110 10 l-20 0 z');
  validateCustomMask(mask);
  for(const path of ['M0 0H20V20','M0 0L3 4Z M1 1L2 2Z','L0 0Z','M0 0A5 5 0 2 0 10 10Z','M0 0 L1 2 C3 4Z']) {
    assert.throws(()=>validateMaskPath(path),/closed SVG path/);
  }
  assert.throws(()=>validateCustomMask({...mask,boundary:[{x:Infinity,y:0}]}));
  assert.throws(()=>validateCustomMask({...mask,matrix:[1,1,1,1,0,0]}));
});

test('concavities split physical strokes and padding follows the true boundary',()=>{
  const clip=(y:number,padding:number)=>bounds(clipCustomMaskPolyline(mask,box,padding,[{x:0,y},{x:100,y}]));
  assert.deepEqual(clip(60,0),[[.002,29.998],[70.002,99.998]]);
  assert.deepEqual(clip(60,2),[[2.002,27.998],[72.002,97.998]]);
  assert.deepEqual(clip(10,2),[[2.002,97.998]]);
  // Just above the opening, round clearance from both inner corners affects the row.
  assert.equal(clip(29,2).length,2);
  const tinyNotch:CustomMask={...mask,boundary:mask.boundary.map(p=>p.x===.7?{...p,x:.301}:p)};
  assert.equal(clipCustomMaskPolyline(tinyNotch,box,0,[{x:10,y:60},{x:90,y:60}]).length,2);
});

test('curved clearance and rotated writing bands use local physical units',()=>{
  const ellipse:CustomMask={...mask,boundary:Array.from({length:512},(_,i)=>{
    const angle=i*Math.PI/256;return {x:.5+.5*Math.cos(angle),y:.5+.5*Math.sin(angle)};
  })};
  const at=(y:number)=>bounds(clipCustomMaskPolyline(ellipse,box,5,[{x:0,y},{x:100,y}]))[0];
  assert.ok(Math.abs(at(50)[0]-5)<.01);
  assert.ok(Math.abs(at(20)[0]-(50-Math.sqrt(45**2-30**2)))<.02);
  const tallRow={x1:0,x2:100,top:10,bottom:50,baseline:40,slope:0};
  assert.deepEqual(customMaskWritingSpans(mask,box,2,tallRow),[[2,28],[72,98]]);
  const slanted=customMaskWritingSpans(mask,box,2,{...tallRow,slope:.5});
  assert.ok(slanted.every(([a,b])=>b>a && b-a<26));
});

function guidelines() {
  const element=newElement('guidelines',1,{width:210,height:297}) as GuidelinesElement;
  return {...element,settings:{...element.settings,margins:{...element.settings.margins,top:3}},frame:{x:55,y:75,...box},mask:{...element.mask,kind:'customSvg' as const,
    enabled:true,customSvg:mask,internalPaddingMM:2,showOutline:true}};
}

test('text plans use available spans, preserve custom placement and flag collisions',()=>{
  const element=guidelines(),page=pageElement();
  const spans=buildGuidelinesVisibleSpans(element,page,[]);
  assert.ok(spans.length>1);
  assert.ok(spans.some((span,i)=>span.rowIndex===spans[i+1]?.rowIndex));
  const short={...element,plannedLines:[{id:'short',text:'a',alignment:'center' as const,customStartMM:0}]};
  const plan=buildGuidelinesLineLayoutPlan(short,spans,page);
  assert.equal(plan.fits,true);
  assert.ok(plan.lines[0].availableMM!>plan.lines[0].measuredAdvanceMM);
  const tooLong=buildGuidelinesLineLayoutPlan({...short,plannedLines:[{...short.plannedLines[0],text:'Hello '.repeat(40)}]},spans,page);
  assert.ok(tooLong.lines[0].glyphs.some(g=>g.collision));
  assert.equal(tooLong.fits,false);
  const estimate=buildGuidelinesTextFitPlan({...element,fitText:'Hello'.repeat(30)},spans);
  assert.equal(estimate.fits,false);
  const blocker={...newElement('shape',1,{width:210,height:297}),frame:element.frame};
  const collision=buildGuidelinesLineLayoutPlan(short,spans,page,[],[blocker,short,page]);
  assert.equal(collision.lines[0].baselineStartX,plan.lines[0].baselineStartX);
  assert.ok(collision.lines[0].glyphs.some(g=>g.collision));
  const partlyOffPage={...short,frame:{...short.frame,x:-25,y:55},rotationDeg:30};
  const rotated=buildGuidelinesVisibleSpans(partlyOffPage,page,[]);
  assert.ok(rotated.length>0);
  assert.ok(rotated.some(span=>span.x1>partlyOffPage.frame.x+4));
});

test('custom mask, padding, sizing and placement survive Layout Save/Open',()=>{
  const element={...guidelines(),rotationDeg:27},page=pageElement();
  const decoded=parseLayoutDesign(serializeLayoutDesign([element,page],element.id));
  assert.deepEqual(decoded.elements,[element,page]);
  assert.equal(decoded.selectedElementId,element.id);
  const invalid={...element,mask:{...element.mask,internalPaddingMM:-1}};
  assert.throws(()=>parseLayoutDesign(serializeLayoutDesign([invalid,page],element.id)),/internal mask padding/);
});

test('released row and detached sections keep physical poses across regroup, resize and Save/Open',()=>{
  const e:GuidelinesElement=guidelines(),page=pageElement(),key=rowKey(e,1);
  const group={x:3,y:-4,angle:12},row={x:0,y:5,angle:8};
  e.mask.arrangement={...automatic,released:true,group,rows:{[key]:row,[key+'/1']:{x:6,y:1,angle:-7}},cuts:{[key]:[.5]}};
  const model=calculateStraightGuidelines(e.frame,e.settings);
  const rows=editableGuides(e,model.guideSets);
  const part=rows.findIndex((g,i)=>guideKey(e,g,i)===key+'/1');
  assert.ok(part>1);
  const t=guideTransform(e,rows[part],part),p={x:72,y:40},q=t.apply(p);
  const inverse=t.inverse(q);
  assert.ok(Math.hypot(inverse.x-p.x,inverse.y-p.y)<1e-10);
  assert.notDeepEqual(q,guideTransform(e,rows[part-1],part-1).apply(p));
  e.mask.arrangement.released=false;
  assert.deepEqual(guideTransform(e,rows[part],part).apply(p),q);
  const copy=structuredClone(e);copy.id+='-copy';copy.frame.width*=1.1;
  const saved=parseLayoutDesign(serializeLayoutDesign([e,copy,page],copy.id));
  assert.deepEqual(saved.elements,[e,copy,page]);
  const resized=editableGuides(copy,calculateStraightGuidelines(copy.frame,copy.settings).guideSets);
  assert.equal(guideKey(copy,resized[part],part),key+'/1');
  assert.notEqual(resized[part].left,rows[part].left);
  e.settings={...e.settings,script:e.settings.script==='Copperplate'?'Fraktur':'Copperplate'};
  assert.equal(editableGuides(e,model.guideSets).length,model.guideSets.length);
  assert.notEqual(rowKey(e,1),key);
});

test('manual writing spans stay inside both padded arms after group and row rotations',()=>{
  const e:GuidelinesElement=guidelines(),page=pageElement();
  const original=buildGuidelinesVisibleSpans(e,page,[]);
  e.mask.arrangement={...automatic,group:{x:-7,y:3,angle:12},rows:{[rowKey(e,1)]:{x:2,y:4,angle:8}}};
  const spans=buildGuidelinesVisibleSpans(e,page,[]),rows=calculateStraightGuidelines(e.frame,e.settings).guideSets;
  assert.ok(spans.length>0);
  assert.notDeepEqual(spans,original);
  const slope=e.settings.script==='Copperplate'?1/Math.tan(e.settings.slant.angle*Math.PI/180):0;
  for(const span of spans){
    const t=guideTransform(e,rows[span.rowIndex],span.rowIndex);
    for(const y of [span.ascY+.001,span.baseY,span.descY-.001]){
      const x=(span.x1+span.x2)/2+(span.baseY-y)*slope;
      const p=t.apply({x:x-e.frame.x,y:y-e.frame.y});
      assert.ok(p.x>=2&&p.y>=2&&p.x<=98&&p.y<=98);
      assert.ok(p.y<=28||p.x<=28||p.x>=72);
    }
  }
  e.mask.arrangement.group.x=1000;
  assert.equal(buildGuidelinesVisibleSpans(e,page,[]).length,0);
  e.mask.enabled=false;
  assert.deepEqual(buildGuidelinesVisibleSpans(e,page,[]),buildGuidelinesVisibleSpans({...e,mask:{...e.mask,arrangement:undefined}},page,[]));
});
