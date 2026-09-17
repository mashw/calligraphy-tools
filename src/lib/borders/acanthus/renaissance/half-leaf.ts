import type { Point } from '../../types';
import { deformPrimitive, normalizedLobes, targetPath } from './geometry';
import type { TargetCurve } from './types';

export type LobeSize='large'|'medium'|'small';
export type HalfLeafStudy={seed:number;outline:string;outerEdge:string;returnEdge:string;spine:string;targets:TargetCurve[];joins:Point[];crests:Point[];sequence:LobeSize[]};
const sequences:LobeSize[][]=[['large','large','medium','small'],['large','medium','medium','small'],['medium','large','medium','small'],['large','medium','small'],['large','medium','large','medium','small']];
const random=(seed:number)=>{let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};};
const fmt=(p:Point)=>`${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/** One continuous authored outer contour plus a deliberately simple generated
 * return pipe. The seed selects rhythm and independently perturbs stations. */
export function generateRenaissanceHalfLeaf(seed:number,origin:Point={x:0,y:0},scale=1):HalfLeafStudy{
  const rng=random(seed),sequence=sequences[seed%sequences.length],count=sequence.length;
  const joins:Array<Point>=[origin];
  for(let i=1;i<=count;i++){
    const t=i/count, rise=(56+seed%4*5)*scale;
    joins.push({x:origin.x+(t*178+(rng()-.5)*18+(Math.sin(t*Math.PI)*18*(seed%2?1:-1)))*scale,y:origin.y-(Math.sin(t*Math.PI)*rise+(rng()-.5)*8)*scale});
  }
  const targets:TargetCurve[]=[],crests:Point[]=[]; let outerEdge='';
  sequence.forEach((size,i)=>{
    const a=joins[i],b=joins[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),tx=dx/len,ty=dy/len,nx=-ty,ny=tx;
    const bend=((rng()-.35)*28+(i%2?7:-4))*scale,curve={p0:a,c1:{x:a.x+dx*.31+nx*bend,y:a.y+dy*.31+ny*bend},c2:{x:a.x+dx*.69+nx*bend*.65,y:a.y+dy*.69+ny*bend*.65},p1:b};
    targets.push(curve); const width=(.34+.18*rng())*(1-i/(count*2.8));
    const deformed=deformPrimitive(normalizedLobes[size],curve,width,4); crests.push(deformed.crest);
    outerEdge+=i?deformed.d.replace(/^M [^C]+/,''):deformed.d;
  });
  const tip=joins[count],root=joins[0],returnControl={x:origin.x+82*scale,y:origin.y+22*scale};
  const returnEdge=`C ${fmt({x:tip.x-35*scale,y:tip.y+32*scale})} ${fmt(returnControl)} ${fmt(root)}`;
  return {seed,outerEdge,returnEdge,outline:`${outerEdge} ${returnEdge} Z`,spine:`M ${fmt(root)} Q ${fmt({x:origin.x+88*scale,y:origin.y-35*scale*(seed%2?1.25:.75)})} ${fmt(tip)}`,targets,joins,crests,sequence};
}

export const targetCurvePath=targetPath;
