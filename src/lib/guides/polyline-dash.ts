export type DashPoint={x:number;y:number};
export const CRICUT_PRIMARY_GUIDE_DASH_MM=6;
export const CRICUT_PRIMARY_GUIDE_GAP_MM=4;
const EPS=1e-7;
const distance=(a:DashPoint,b:DashPoint)=>Math.hypot(b.x-a.x,b.y-a.y);
const interpolate=(a:DashPoint,b:DashPoint,t:number):DashPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Splits a millimetre-space polyline into physical dash segments with one continuous phase. */
export function dashPolylinePoints(points:DashPoint[],dashMM:number,gapMM:number){
  const dash=Math.max(EPS,dashMM),gap=Math.max(EPS,gapMM);
  if(points.length<2)return[];
  const lengths:number[]=[0];for(let index=1;index<points.length;index++)lengths.push(lengths[index-1]+distance(points[index-1],points[index]));
  const total=lengths.at(-1)!;if(total<=EPS)return[];
  const pointAt=(at:number)=>{let index=1;while(index<lengths.length-1&&lengths[index]<at-EPS)index++;const start=lengths[index-1],length=lengths[index]-start;return length<=EPS?points[index]:interpolate(points[index-1],points[index],Math.max(0,Math.min(1,(at-start)/length)));};
  const result:DashPoint[][]=[];
  for(let start=0;start<total-EPS;start+=dash+gap){const end=Math.min(total,start+dash);if(end-start<=EPS)continue;const segment=[pointAt(start)];for(let index=1;index<lengths.length-1;index++)if(lengths[index]>start+EPS&&lengths[index]<end-EPS)segment.push(points[index]);segment.push(pointAt(end));if(segment.some((point,index)=>index&&distance(segment[index-1],point)>EPS))result.push(segment);}
  return result;
}

export function dashHorizontalGuidePoints(guides:DashPoint[][],appearance:{style:'solid'|'dashed';dashMM:number;gapMM:number}){
  return guides.flatMap((points,index)=>(appearance.style==='dashed'?dashPolylinePoints(points,appearance.dashMM,appearance.gapMM):[points]).map(points=>({guideIndex:index,points})));
}

/** Applies the Cricut-only primary-line treatment without affecting any grid geometry. */
export function cricutGuidePathSegments(kind:'asc'|'waist'|'base'|'desc',points:DashPoint[],enabled:boolean){
  return enabled&&(kind==='waist'||kind==='base')
    ? dashPolylinePoints(points,CRICUT_PRIMARY_GUIDE_DASH_MM,CRICUT_PRIMARY_GUIDE_GAP_MM)
    : [points];
}
