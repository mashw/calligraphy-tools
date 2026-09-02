import { add, scale, seeded, smoothPath, unit } from '../geometry';
import { frameAt } from '../guide-path';
import type { BorderGeometry, BorderStroke, GuidePath, PathFrame } from '../types';
import { buildHalfLeaf, buildJunction, buildSweepLeaf, buildTurnover, type AcanthusComponent, type ComponentKind } from './components';
import { buildLeaf } from './leaf';
import { buildRaffle } from './raffle';
import type { AcanthusOptions } from './types';

function resolvedSides(path:GuidePath,side:AcanthusOptions['side']):(-1|1)[]{
  if(side==='both')return[-1,1]; if(side==='left')return[1]; if(side==='right')return[-1];
  if(!path.closed||path.winding===0)return side==='inward'?[1]:[-1];
  const inward:-1|1=path.winding>0?1:-1; return[side==='inward'?inward:inward===1?-1:1];
}

/** The supplied guide is resampled into a deliberate two-pipe ornamental stem. */
function stemStrokes(path:GuidePath):BorderStroke[]{
  const step=Math.max(1,Math.floor(path.frames.length/180)),frames=path.frames.filter((_,i)=>i%step===0||i===path.frames.length-1);
  const centre=frames.map(f=>f.point),companion=frames.map(f=>add(f.point,scale(f.normal,1.7)));
  return [
    {d:smoothPath(centre,path.closed),role:'midrib',surface:'face',motif:-1,motifKind:'stem',layer:-20},
    {d:smoothPath(companion,path.closed),role:'pipe',surface:'fold',motif:-2,motifKind:'stem',layer:-19},
  ];
}

const make=(kind:ComponentKind,frame:PathFrame,length:number,width:number,side:-1|1,detail:AcanthusOptions['detail'],motif:number,bend:number,layer:number,shading:AcanthusOptions['shadingDensity']|false=false,organic=0):AcanthusComponent=>{
  const p={length,width,side,detail,motif,bend,layer,shading,organic};
  if(kind==='sweep')return buildSweepLeaf(frame,p);
  if(kind==='turnover')return buildTurnover(frame,p);
  if(kind==='junction')return buildJunction(frame,p);
  return buildHalfLeaf(frame,p);
};

function chooseKind(curvature:number,side:-1|1,index:number):ComponentKind{
  const force=Math.abs(curvature);
  if(force>.045)return curvature*side<0?'half':'turnover';
  if(force<.012)return index%4===1?'sweep':index%4===3?'turnover':'half';
  return curvature*side>0?'sweep':'half';
}

export function generateAcanthus(path:GuidePath,options:AcanthusOptions):BorderGeometry{
  const strokes=stemStrokes(path),construction:BorderGeometry['construction']=[];
  const pitch=Math.max(options.pitch,options.leafSize*.82),count=path.closed?Math.max(4,Math.round(path.length/pitch)):Math.max(2,Math.floor(path.length/pitch));
  const actual=path.closed?path.length/count:path.length/(count+.55),sides=resolvedSides(path,options.side);
  for(let i=0;i<count;i++){
    const s=path.closed?i*actual:actual*(.38+i),frame=frameAt(path,s);
    // Both-sided growth has a 3:2 rhythm rather than mechanical alternation.
    const side=sides.length===1?sides[0]:sides[[0,1,0,0,1][i%5]];
    const kind=chooseKind(frame.curvature,side,i),variation=(seeded(options.seed,i)-.5)*options.organic;
    const scale=kind==='sweep'?1.3:kind==='turnover'?.68:.9;
    const outside=frame.curvature*side>0, length=options.leafSize*scale*(1+variation*.1)*(outside?1.08:.94);
    const component=make(kind,frame,length,length*(.48+options.fullness*.15),side,options.detail,i,frame.curvature*options.leafSize,i*3,options.lineShading?options.shadingDensity:false,variation);
    strokes.push(...component.strokes);construction.push(...component.construction);
    // Junctions visibly collect principal pipes into the shared stem but remain sparse.
    if(i%3===0){const junction=make('junction',frame,length*.45,length*.2,side,options.detail,1000+i,0,i*3-1);strokes.push(...junction.strokes);construction.push(...junction.construction);}
  }
  return{strokes,construction};
}

export function generateSingleLeaf(options:AcanthusOptions):BorderGeometry{
  const frame:PathFrame={s:0,point:{x:300,y:350},tangent:{x:0,y:-1},normal:{x:1,y:0},curvature:0};
  const built=buildLeaf(frame,{length:150,width:68,lobes:6,side:1,sweep:-.82,compression:1,detail:options.detail,shading:options.lineShading?options.shadingDensity:false,motif:0,kind:'main',asymmetry:.1*options.organic,turnover:true});
  return{strokes:built.strokes,construction:[{kind:'root',a:frame.point},{kind:'axis',a:frame.point,b:built.tip},...built.construction]};
}

export function generateComponentStudy(options:AcanthusOptions):BorderGeometry{
  const geometry:BorderGeometry={strokes:[],construction:[]};
  const size=options.leafSize/34,full=.82+options.fullness*.3,organic=options.organic*.18,shading=options.lineShading?options.shadingDensity:false;
  const raffle=buildRaffle({spring:{x:72,y:125},direction:unit({x:.72,y:.5}),outward:unit({x:-.5,y:.72}),length:105*size,width:48*size*full,detail:options.detail,organic,motif:0,layer:0,shading});
  geometry.strokes.push(...raffle.strokes);geometry.construction.push(...raffle.construction);
  const halfFrame:PathFrame={s:0,point:{x:300,y:85},tangent:{x:1,y:0},normal:{x:0,y:1},curvature:0};
  const half=make('half',halfFrame,150*size,62*size*full,1,options.detail,1,0,3,shading,organic);geometry.strokes.push(...half.strokes);geometry.construction.push(...half.construction);
  const sweepFrame:PathFrame={s:0,point:{x:75,y:300},tangent:{x:1,y:0},normal:{x:0,y:1},curvature:.01};
  const sweep=make('sweep',sweepFrame,155*size,52*size*full,-1,options.detail,2,0,6,shading,organic);geometry.strokes.push(...sweep.strokes);geometry.construction.push(...sweep.construction);
  // The assembled sample is a real stem with three components sharing its frames.
  geometry.strokes.push({d:'M 315 330 C 375 308 450 344 530 305',role:'midrib',surface:'face',motif:-10,motifKind:'stem',layer:-10},{d:'M 315 334 C 375 312 450 348 530 309',role:'pipe',surface:'fold',motif:-11,motifKind:'stem',layer:-9});
  const attached:[ComponentKind,PathFrame,-1|1,number][]=[['half',{s:0,point:{x:350,y:321},tangent:{x:.95,y:-.3},normal:{x:.3,y:.95},curvature:0},1,.56],['turnover',{s:0,point:{x:425,y:326},tangent:{x:1,y:.1},normal:{x:-.1,y:1},curvature:0},-1,.42],['half',{s:0,point:{x:485,y:323},tangent:{x:.9,y:-.42},normal:{x:.42,y:.9},curvature:0},1,.48]];
  for(const [i,[kind,frame,side,componentScale]] of attached.entries()){const built=make(kind,frame,options.leafSize*componentScale,options.leafSize*.28*full,side,options.detail,20+i,0,10+i,shading,organic);geometry.strokes.push(...built.strokes);geometry.construction.push(...built.construction);}
  return geometry;
}
