import { add, cubic, fmt, scale, unit } from '../geometry';
import type { BorderStroke, ConstructionMark, PathFrame, Point } from '../types';
import { shadeLeaf } from './shading';
import { constructRaffle } from './raffle';
import type { DetailLevel, ShadingDensity } from './types';

export type ComponentKind = 'half' | 'sweep' | 'turnover' | 'junction';
export type ComponentParameters = { length:number; width:number; side:-1|1; detail:DetailLevel; motif:number; bend?:number; layer?:number; shading?:false|ShadingDensity; organic?:number };
export type AcanthusComponent = { strokes:BorderStroke[]; construction:ConstructionMark[]; tip:Point };

type Basis={root:Point;forward:Point;out:Point;length:number;width:number};
const at=(b:Basis,u:number,v:number)=>add(add(b.root,scale(b.forward,b.length*u)),scale(b.out,b.width*v));
const meta=(p:ComponentParameters,kind:ComponentKind,surface:'face'|'fold'|'underside'|'recess'='face')=>({motif:p.motif,motifKind:kind,layer:p.layer??p.motif,surface} as const);
const basis=(frame:PathFrame,p:ComponentParameters,along:number,outward:number):Basis=>{
  const forward=unit(add(scale(frame.tangent,along),scale(frame.normal,p.side*outward)));
  return {root:frame.point,forward,out:{x:-forward.y*p.side,y:forward.x*p.side},length:p.length,width:p.width};
};
const appendShading=(strokes:BorderStroke[],b:Basis,p:ComponentParameters,kind:ComponentKind)=>{if(p.shading)strokes.push(...shadeLeaf(b.root,b.forward,b.out,b.length,b.width,p.shading,p.motif).map(stroke=>({...stroke,motifKind:kind,layer:p.layer??p.motif})));};

/** Independent one-sided mass: a root, deep eye, broad raffle and nested lobules. */
export function buildHalfLeaf(frame:PathFrame,p:ComponentParameters):AcanthusComponent {
  const b=basis(frame,p,.86,.4),root=at(b,0,0),tip=at(b,1,.13),strokes:BorderStroke[]=[{d:cubic(root,at(b,.25,.015),at(b,.7,.07),tip),role:'midrib',...meta(p,'half')}],construction:ConstructionMark[]=[{kind:'root',a:root},{kind:'axis',a:root,b:tip}];
  const sizes=[.62,.55,.46,.37,.28];let spring=at(b,.025,.04),outline=`M ${fmt(at(b,-.015,.16))} Q ${fmt(at(b,0,.08))} ${fmt(spring)}`;
  for(let i=0;i<sizes.length;i++){
    const direction=unit(add(scale(b.forward,.86),scale(b.out,.52-i*.055)));
    const raffle=constructRaffle({spring,direction,outward:b.out,length:p.length*sizes[i],width:p.width*(1-i*.105),detail:p.detail,organic:(p.organic??0)*(i%2?.65:-.4),motif:p.motif*10+i,layer:(p.layer??p.motif)+i,shading:p.shading});
    outline+=` ${raffle.outwardContour} ${raffle.returnContour}`;spring=raffle.landmarks.eye;
    strokes.push(...raffle.structuralStrokes);construction.push(...raffle.construction);
  }
  // A single hooked terminal completes the shared surface before its inner edge returns to the root.
  outline+=` C ${fmt(at(b,.84,.2))} ${fmt(at(b,.94,.34))} ${fmt(tip)} C ${fmt(at(b,1.015,.04))} ${fmt(at(b,.86,-.015))} ${fmt(at(b,.68,.025))} C ${fmt(at(b,.42,.01))} ${fmt(at(b,.12,-.02))} ${fmt(at(b,-.015,.16))} Z`;
  strokes.unshift({d:outline,role:'outline',...meta(p,'half')});
  return {strokes,tip,construction};
}

/** Directional scroll leaf: long with the stem, opening gradually into a hooked end. */
export function buildSweepLeaf(frame:PathFrame,p:ComponentParameters):AcanthusComponent {
  const b=basis(frame,p,.94,.28+(p.bend??0)*.12),root=at(b,0,0),eye=at(b,.43,.08),tip=at(b,.98,.32),hook=at(b,.86,.08);
  const d=`M ${fmt(root)} C ${fmt(at(b,.16,.08))} ${fmt(at(b,.28,.38))} ${fmt(at(b,.38,.62))} C ${fmt(at(b,.44,.88))} ${fmt(at(b,.53,.92))} ${fmt(at(b,.58,.7))} C ${fmt(at(b,.64,.52))} ${fmt(at(b,.67,.82))} ${fmt(at(b,.76,.72))} C ${fmt(at(b,.86,.61))} ${fmt(at(b,.91,.48))} ${fmt(tip)} C ${fmt(at(b,1.03,.16))} ${fmt(at(b,.94,-.02))} ${fmt(hook)} C ${fmt(at(b,.72,.05))} ${fmt(at(b,.57,.12))} ${fmt(eye)} C ${fmt(at(b,.31,.03))} ${fmt(at(b,.14,-.025))} ${fmt(root)} Z`;
  const strokes:BorderStroke[]=[{d,role:'outline',...meta(p,'sweep')},{d:cubic(root,at(b,.28,0),at(b,.65,.08),hook),role:'pipe',...meta(p,'sweep')},{d:cubic(at(b,.34,.015),at(b,.4,-.02),at(b,.45,.02),at(b,.5,.16)),role:'eye',...meta(p,'sweep','recess')},{d:cubic(tip,at(b,1,.14),at(b,.94,.04),hook),role:'outline',...meta(p,'sweep','underside')}];
  if(p.detail!=='low') strokes.push({d:cubic(at(b,.22,.01),at(b,.4,.22),at(b,.45,.55),at(b,.57,.7)),role:'vein',...meta(p,'sweep')},{d:cubic(at(b,.36,.03),at(b,.58,.2),at(b,.67,.44),at(b,.76,.7)),role:'vein',...meta(p,'sweep','fold')});
  appendShading(strokes,b,p,'sweep');
  return {strokes,tip,construction:[{kind:'root',a:root},{kind:'axis',a:root,b:tip},{kind:'lobe',a:eye,b:at(b,.58,.7)}]};
}

export function buildTurnover(frame:PathFrame,p:ComponentParameters):AcanthusComponent {
  const b=basis(frame,p,.72,.7),root=at(b,0,0),tip=at(b,.58,.68),returnTip=at(b,.43,.08);
  const d=`M ${fmt(root)} C ${fmt(at(b,.12,.08))} ${fmt(at(b,.3,.6))} ${fmt(tip)} C ${fmt(at(b,.72,.72))} ${fmt(at(b,.77,.39))} ${fmt(at(b,.65,.25))} C ${fmt(at(b,.58,.14))} ${fmt(at(b,.5,.03))} ${fmt(returnTip)} C ${fmt(at(b,.25,.02))} ${fmt(at(b,.1,.01))} ${fmt(root)} Z`;
  const strokes:BorderStroke[]=[{d,role:'outline',...meta(p,'turnover')},{d:cubic(root,at(b,.18,.02),at(b,.38,.15),tip),role:'pipe',...meta(p,'turnover')},{d:cubic(tip,at(b,.69,.48),at(b,.57,.2),returnTip),role:'outline',...meta(p,'turnover','underside')},{d:cubic(at(b,.36,.04),at(b,.4,-.03),at(b,.48,.02),at(b,.53,.15)),role:'eye',...meta(p,'turnover','recess')}];
  appendShading(strokes,b,p,'turnover');
  return {strokes,tip,construction:[{kind:'root',a:root},{kind:'axis',a:root,b:tip}]};
}

export function buildJunction(frame:PathFrame,p:ComponentParameters):AcanthusComponent {
  const b=basis(frame,p,.9,.18),root=at(b,0,0),tip=at(b,.5,.18),eye=at(b,.24,.07);
  return {strokes:[{d:cubic(at(b,-.12,0),root,at(b,.28,.02),at(b,.62,0)),role:'midrib',...meta(p,'junction')},{d:cubic(root,at(b,.12,.01),at(b,.3,.09),tip),role:'pipe',...meta(p,'junction')},{d:cubic(at(b,.17,.02),at(b,.2,-.03),at(b,.28,0),at(b,.31,.11)),role:'eye',...meta(p,'junction','recess')}],tip,construction:[{kind:'root',a:root},{kind:'axis',a:root,b:tip},{kind:'lobe',a:root,b:eye}]};
}
