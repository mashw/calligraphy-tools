import { add, cubic, fmt, scale, unit } from '../geometry';
import type { BorderStroke, ConstructionMark, Point } from '../types';
import { shadeLeaf } from './shading';
import type { DetailLevel, ShadingDensity } from './types';

export type RaffleLandmarks = {
  spring: Point; principalVein: Point; belly: Point; primaryTip: Point;
  lobuleTips: Point[]; notches: Point[]; eye: Point; returnToStem: Point;
};
export type RaffleParameters = {
  spring: Point; direction: Point; outward: Point; length: number; width: number;
  detail: DetailLevel; organic: number; motif: number; layer: number;
  shading?: false | ShadingDensity;
};
export type RaffleGeometry = { strokes: BorderStroke[]; construction: ConstructionMark[]; landmarks: RaffleLandmarks };

const local=(p:RaffleParameters,u:number,v:number)=>add(add(p.spring,scale(p.direction,p.length*u)),scale(p.outward,p.width*v));

/** A complete one-sided acanthus division with subordinate lobules and a cut-in eye. */
export function buildRaffle(p:RaffleParameters):RaffleGeometry {
  const direction=unit(p.direction),outward=unit(p.outward),q={...p,direction,outward};
  const spring=q.spring,belly=local(q,.13,.64),primaryTip=local(q,.82,.74+p.organic*.06);
  const lobuleCount=p.detail==='low'?2:p.detail==='high'?4:3;
  const lobuleTips:Point[]=[],notches:Point[]=[];
  for(let i=0;i<lobuleCount;i++){
    const t=(i+1)/(lobuleCount+1), size=(1-t)*.34+.12;
    lobuleTips.push(local(q,.2+t*.5,.82+size+(i===1?p.organic*.08:0)));
    notches.push(local(q,.24+t*.5,.63-size*.18));
  }
  const eye=local(q,.33,.075),returnToStem=local(q,.055,.025),principalVein=local(q,.57,.5);
  let outline=`M ${fmt(spring)} C ${fmt(local(q,.035,.2))} ${fmt(local(q,.06,.55))} ${fmt(belly)}`;
  for(let i=0;i<lobuleTips.length;i++) outline+=` C ${fmt(local(q,.18+i*.13,.86))} ${fmt(local(q,.22+i*.14,1.05))} ${fmt(lobuleTips[i])} C ${fmt(local(q,.29+i*.14,.9))} ${fmt(notches[i])} ${fmt(notches[i])}`;
  outline+=` C ${fmt(local(q,.7,.65))} ${fmt(local(q,.77,.83))} ${fmt(primaryTip)} C ${fmt(local(q,.91,.57))} ${fmt(local(q,.73,.2))} ${fmt(eye)} C ${fmt(local(q,.24,.015))} ${fmt(returnToStem)} ${fmt(spring)} Z`;
  const meta={motif:p.motif,motifKind:'raffle' as const,layer:p.layer};
  const strokes:BorderStroke[]=[
    {d:outline,role:'outline',surface:'face',...meta},
    {d:cubic(spring,local(q,.17,.04),local(q,.37,.25),principalVein),role:'pipe',surface:'face',...meta},
    {d:cubic(local(q,.28,.035),local(q,.31,-.035),local(q,.38,.01),local(q,.4,.13)),role:'eye',surface:'recess',...meta},
  ];
  if(p.detail!=='low') for(let i=0;i<lobuleTips.length;i+=p.detail==='high'?1:2) strokes.push({d:cubic(local(q,.2,.08),local(q,.3+i*.1,.24),notches[i],lobuleTips[i]),role:'vein',surface:i===0?'fold':'face',...meta});
  if(p.detail==='high') strokes.push({d:cubic(primaryTip,local(q,.82,.47),local(q,.58,.17),eye),role:'outline',surface:'underside',...meta});
  if(p.shading)strokes.push(...shadeLeaf(spring,direction,outward,p.length,p.width,p.shading,p.motif).map(stroke=>({...stroke,motifKind:'raffle' as const,layer:p.layer})));
  return {strokes,landmarks:{spring,principalVein,belly,primaryTip,lobuleTips,notches,eye,returnToStem},construction:[{kind:'root',a:spring},{kind:'axis',a:spring,b:principalVein},...lobuleTips.map(tip=>({kind:'lobe' as const,a:spring,b:tip}))]};
}
