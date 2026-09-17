import type { Point } from '../../types';
import { renaissancePrimitives } from './generated-primitives';
import type { NormalizedPrimitive, NormalPoint, SourcePrimitive, TargetCurve } from './types';

const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y});
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
const mul=(a:Point,n:number):Point=>({x:a.x*n,y:a.y*n});
const length=(a:Point)=>Math.hypot(a.x,a.y);
const unit=(a:Point)=>{const l=length(a)||1;return mul(a,1/l)};
const fmt=(p:Point)=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
const cubicPoint=(c:TargetCurve,t:number):Point=>{const m=1-t;return {x:m*m*m*c.p0.x+3*m*m*t*c.c1.x+3*m*t*t*c.c2.x+t*t*t*c.p1.x,y:m*m*m*c.p0.y+3*m*m*t*c.c1.y+3*m*t*t*c.c2.y+t*t*t*c.p1.y}};
const cubicDerivative=(c:TargetCurve,t:number):Point=>{const m=1-t;return {x:3*m*m*(c.c1.x-c.p0.x)+6*m*t*(c.c2.x-c.c1.x)+3*t*t*(c.p1.x-c.c2.x),y:3*m*m*(c.c1.y-c.p0.y)+6*m*t*(c.c2.y-c.c1.y)+3*t*t*(c.p1.y-c.c2.y)}};
const bezierPoint=(s:{p0:Point;c1:Point;c2:Point;p1:Point},t:number)=>cubicPoint(s,t);
const bezierDerivative=(s:{p0:Point;c1:Point;c2:Point;p1:Point},t:number)=>cubicDerivative(s,t);

export function normalizePrimitive(source:SourcePrimitive):NormalizedPrimitive{
  const start=source.segments[0].p0,end=source.segments[source.segments.length-1].p1,delta=sub(end,start),chord=length(delta);
  if(chord<1e-6) throw new Error(`${source.name}: open primitive endpoints must not coincide.`);
  const along=unit(delta),normal={x:-along.y,y:along.x};
  const normalized=(p:Point):NormalPoint=>{const q=sub(p,start);return {...p,u:(q.x*along.x+q.y*along.y)/chord,v:(q.x*normal.x+q.y*normal.y)/chord};};
  const normalizedSegments=source.segments.map(s=>({p0:normalized(s.p0),c1:normalized(s.c1),c2:normalized(s.c2),p1:normalized(s.p1)}));
  const samples=normalizedSegments.flatMap(segment=>Array.from({length:33},(_,i)=>normalized(bezierPoint(segment,i/32))));
  const crest=samples.reduce((best,p)=>Math.abs(p.v)>Math.abs(best.v)?p:best,samples[0]);
  return {...source,start,end,chord,along,normal,normalizedSegments,crest};
}

export const normalizedLobes={
  large:normalizePrimitive(renaissancePrimitives['large-lobe-contour']),
  medium:normalizePrimitive(renaissancePrimitives['medium-lobe-contour']),
  small:normalizePrimitive(renaissancePrimitives['small-lobe-contour']),
};

const targetFrame=(curve:TargetCurve,u:number)=>{const tangent=unit(cubicDerivative(curve,u)),normal={x:-tangent.y,y:tangent.x};return {point:cubicPoint(curve,u),normal};};
const mapPoint=(primitive:NormalizedPrimitive,curve:TargetCurve,widthScale:number,p:NormalPoint)=>{const frame=targetFrame(curve,p.u);return add(frame.point,mul(frame.normal,p.v*primitive.chord*widthScale));};
const mapDerivative=(primitive:NormalizedPrimitive,curve:TargetCurve,widthScale:number,p:NormalPoint,du:number,dv:number)=>{
  const h=1e-4,a=targetFrame(curve,p.u-h),b=targetFrame(curve,p.u+h),positionDerivative=mul(sub(b.point,a.point),1/(2*h)),normalDerivative=mul(sub(b.normal,a.normal),1/(2*h));
  return add(mul(positionDerivative,du),add(mul(normalDerivative,p.v*primitive.chord*widthScale),mul(targetFrame(curve,p.u).normal,dv*primitive.chord*widthScale)));
};

/** Piecewise cubic transport through the target's moving Frenet frame. Each
 * source cubic is subdivided, then fitted with endpoint positions and exact
 * mapped endpoint derivatives. Identity transport therefore remains exact. */
export function deformPrimitive(primitive:NormalizedPrimitive,curve:TargetCurve,widthScale=1,subdivisions=4){
  let d=''; let first:Point|null=null,last:Point|null=null;
  for(const segment of primitive.normalizedSegments){
    for(let step=0;step<subdivisions;step++){
      const a=step/subdivisions,b=(step+1)/subdivisions,pa=bezierPoint(segment,a),pb=bezierPoint(segment,b),da=bezierDerivative(segment,a),db=bezierDerivative(segment,b);
      const na={...pa,u:(sub(pa,primitive.start).x*primitive.along.x+sub(pa,primitive.start).y*primitive.along.y)/primitive.chord,v:(sub(pa,primitive.start).x*primitive.normal.x+sub(pa,primitive.start).y*primitive.normal.y)/primitive.chord};
      const nb={...pb,u:(sub(pb,primitive.start).x*primitive.along.x+sub(pb,primitive.start).y*primitive.along.y)/primitive.chord,v:(sub(pb,primitive.start).x*primitive.normal.x+sub(pb,primitive.start).y*primitive.normal.y)/primitive.chord};
      const duA=(da.x*primitive.along.x+da.y*primitive.along.y)/primitive.chord, dvA=(da.x*primitive.normal.x+da.y*primitive.normal.y)/primitive.chord;
      const duB=(db.x*primitive.along.x+db.y*primitive.along.y)/primitive.chord, dvB=(db.x*primitive.normal.x+db.y*primitive.normal.y)/primitive.chord;
      const p0=mapPoint(primitive,curve,widthScale,na),p1=mapPoint(primitive,curve,widthScale,nb),scale=1/(3*subdivisions);
      const c1=add(p0,mul(mapDerivative(primitive,curve,widthScale,na,duA,dvA),scale)),c2=sub(p1,mul(mapDerivative(primitive,curve,widthScale,nb,duB,dvB),scale));
      if(!first){first=p0;d=`M ${fmt(p0)}`;} d+=` C ${fmt(c1)} ${fmt(c2)} ${fmt(p1)}`; last=p1;
    }
  }
  return {d,start:first!,end:last!,crest:mapPoint(primitive,curve,widthScale,primitive.crest)};
}

export function straightTarget(start:Point,angle:number,targetLength:number):TargetCurve{const v={x:Math.cos(angle)*targetLength,y:Math.sin(angle)*targetLength};return {p0:start,c1:add(start,mul(v,1/3)),c2:add(start,mul(v,2/3)),p1:add(start,v)};}
export function targetPath(c:TargetCurve){return `M ${fmt(c.p0)} C ${fmt(c.c1)} ${fmt(c.c2)} ${fmt(c.p1)}`;}
export function sourcePath(source:SourcePrimitive){return source.sourceD;}
