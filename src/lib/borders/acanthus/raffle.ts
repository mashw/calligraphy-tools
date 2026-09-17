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
export type RaffleAnatomy = {
  landmarks: RaffleLandmarks;
  /** Segments begin at spring, travel over the lobules to the principal tip, then cut into the eye. */
  outwardContour: string;
  returnContour: string;
  structuralStrokes: BorderStroke[];
  construction: ConstructionMark[];
};
export type RaffleGeometry = { strokes: BorderStroke[]; construction: ConstructionMark[]; landmarks: RaffleLandmarks };

const local=(p:RaffleParameters,u:number,v:number)=>add(add(p.spring,scale(p.direction,p.length*u)),scale(p.outward,p.width*v));

/** Produces an open major division that can be stitched into a larger leaf surface. */
export function constructRaffle(p:RaffleParameters):RaffleAnatomy {
  const direction=unit(p.direction),outward=unit(p.outward),q={...p,direction,outward};
  const spring=q.spring,belly=local(q,.12,.42),primaryTip=local(q,.76,1.08+p.organic*.05);
  const lobuleCount=p.detail==='low'?2:p.detail==='high'?4:3;
  const positions=lobuleCount===2?[.24,.48]:lobuleCount===3?[.2,.4,.57]:[.17,.33,.48,.61];
  const lobuleTips:Point[]=[],notches:Point[]=[];
  for(const [i,t] of positions.entries()){
    const diminishing=1-i/positions.length;
    lobuleTips.push(local(q,t,.62+diminishing*.2+(i===1?p.organic*.035:0)));
    notches.push(local(q,t+.075,.47+diminishing*.035));
  }
  const eye=local(q,.34,.075),returnToStem=local(q,.04,.02),principalVein=local(q,.55,.68);
  let outwardContour=`C ${fmt(local(q,.025,.17))} ${fmt(local(q,.065,.37))} ${fmt(belly)}`;
  for(let i=0;i<lobuleTips.length;i++)outwardContour+=` C ${fmt(local(q,positions[i]-.045,.61))} ${fmt(local(q,positions[i]-.015,.8))} ${fmt(lobuleTips[i])} C ${fmt(local(q,positions[i]+.035,.7))} ${fmt(notches[i])} ${fmt(notches[i])}`;
  outwardContour+=` C ${fmt(local(q,.64,.62))} ${fmt(local(q,.7,1.02))} ${fmt(primaryTip)}`;
  const returnContour=`C ${fmt(local(q,.88,.77))} ${fmt(local(q,.66,.2))} ${fmt(eye)}`;
  const meta={motif:p.motif,motifKind:'raffle' as const,layer:p.layer};
  const structuralStrokes:BorderStroke[]=[
    {d:cubic(spring,local(q,.16,.035),local(q,.39,.31),principalVein),role:'pipe',surface:'face',...meta},
    {d:cubic(local(q,.27,.03),local(q,.3,-.04),local(q,.37,.005),local(q,.41,.14)),role:'eye',surface:'recess',...meta},
  ];
  if(p.detail!=='low')for(let i=0;i<lobuleTips.length;i+=p.detail==='high'?1:2)structuralStrokes.push({d:cubic(local(q,.19,.07),local(q,.28+i*.08,.2),notches[i],lobuleTips[i]),role:'vein',surface:i===0?'fold':'face',...meta});
  if(p.detail==='high')structuralStrokes.push({d:cubic(primaryTip,local(q,.79,.58),local(q,.57,.16),eye),role:'outline',surface:'underside',...meta});
  if(p.shading)structuralStrokes.push(...shadeLeaf(spring,direction,outward,p.length,p.width,p.shading,p.motif).map(stroke=>({...stroke,motifKind:'raffle' as const,layer:p.layer})));
  return {outwardContour,returnContour,structuralStrokes,landmarks:{spring,principalVein,belly,primaryTip,lobuleTips,notches,eye,returnToStem},construction:[{kind:'root',a:spring},{kind:'axis',a:spring,b:principalVein},...lobuleTips.map(tip=>({kind:'lobe' as const,a:spring,b:tip}))]};
}

/** Diagnostic wrapper; production half leaves consume the open contour sections above. */
export function buildRaffle(p:RaffleParameters):RaffleGeometry {
  const anatomy=constructRaffle(p),{spring,eye,returnToStem}=anatomy.landmarks;
  const diagnosticEdge=`${anatomy.outwardContour} ${anatomy.returnContour} C ${fmt(add(eye,scale(unit({x:returnToStem.x-eye.x,y:returnToStem.y-eye.y}),p.length*.08)))} ${fmt(returnToStem)} ${fmt(spring)} Z`;
  return {strokes:[{d:`M ${fmt(spring)} ${diagnosticEdge}`,role:'outline',surface:'face',motif:p.motif,motifKind:'raffle',layer:p.layer},...anatomy.structuralStrokes],construction:anatomy.construction,landmarks:anatomy.landmarks};
}
