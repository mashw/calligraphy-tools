import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node runs explicit .ts specifiers under --experimental-strip-types.
import { parseLayoutDesign } from './design-file.ts';

test('old Celtic IDs and grid flags migrate in saved layout designs', () => {
  const frame={x:5,y:5,width:80,height:40};
  const design={
    format:'calligraphy-tools-layout',version:1,
    selectedElementId:'title',
    elements:[
      {id:'title',type:'curved-title',name:'Title',locked:false,paddingMM:0,frame,
       settings:{script:'CelticHalfUncial',topBandScript:'CelticHalfUncial',
                 bottomBandScript:'Fraktur',showCelticGrid:true}},
      {id:'circle',type:'calligram',name:'Circle',locked:false,paddingMM:0,frame,
       settings:{script:'CelticHalfUncial',innerScript:'CelticHalfUncial',
                 outerScript:'Copperplate',showCelticGrid:false}},
      {id:'guides',type:'guidelines',name:'Guides',locked:false,paddingMM:0,frame,
       settings:{script:'CelticHalfUncial'},
       allowPartialGuidelines:true,fitText:'',textMode:'estimate',rightAlignMode:'waist',
       avoidOccludingElements:false,plannedLines:[],
       mask:{enabled:false,kind:'circle',textLayoutRespectsMask:true,showOutline:false,
             outlineColor:'#000000',outlineWidthMM:.5,cornerRadiusMM:3}},
      {id:'page',type:'page',name:'Page',locked:true,
       frame:{x:0,y:0,width:210,height:297},
       settings:{paper:'A4',orientation:'portrait',customWidthMM:210,customHeightMM:297,
                 margins:{top:0,right:0,bottom:0,left:0},
                 centerLines:{vertical:false,horizontal:false}}}
    ]
  };
  const loaded=parseLayoutDesign(JSON.stringify(design));
  assert.equal(loaded.selectedElementId,'title');
  const title=loaded.elements[0];
  const circle=loaded.elements[1];
  const guides=loaded.elements[2];
  assert.equal(title.type,'curved-title');
  assert.equal(circle.type,'calligram');
  assert.equal(guides.type,'guidelines');
  if(title.type==='curved-title'){
    assert.equal(title.settings.script,'InsularMajuscule');
    assert.equal(title.settings.topBandScript,'InsularMajuscule');
    assert.equal(title.settings.showInsularGrid,true);
    assert.equal('showCelticGrid' in title.settings,false);
  }
  if(circle.type==='calligram'){
    assert.equal(circle.settings.script,'InsularMajuscule');
    assert.equal(circle.settings.innerScript,'InsularMajuscule');
    assert.equal(circle.settings.showInsularGrid,false);
  }
  if(guides.type==='guidelines') assert.equal(guides.settings.script,'InsularMajuscule');
});
