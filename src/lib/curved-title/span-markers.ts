import type { Pt } from '../curve-helpers';
// @ts-expect-error Node's type-stripping test runner requires the source extension.
import { lengthPoly, pointAt } from '../curve-helpers.ts';

export type SpanMarkerSegment={from:Pt;to:Pt};
export type TextSpanMarkers={start:SpanMarkerSegment;end:[SpanMarkerSegment,SpanMarkerSegment]};

function normalMarker(baseline:Pt[],s:number,length:number):SpanMarkerSegment{
  const {p,n}=pointAt(baseline,s);
  return{from:p,to:{x:p.x-n.x*length,y:p.y-n.y*length}};
}

/** Physical single-start/double-end marks for an estimated lettering span. */
export function buildTextSpanMarkers(baseline:Pt[],span:{sStart:number;sEnd:number}|null,xHeightMM:number):TextSpanMarkers|null{
  if(!span||baseline.length<2||span.sEnd<=span.sStart||!Number.isFinite(xHeightMM)||xHeightMM<=0)return null;
  const arcLength=lengthPoly(baseline),start=Math.max(0,Math.min(arcLength,span.sStart)),end=Math.max(start,Math.min(arcLength,span.sEnd));
  if(end<=start)return null;
  const length=Math.max(2,xHeightMM),gap=Math.min(1.2,Math.max(.4,xHeightMM*.15),(end-start)/3);
  return{start:normalMarker(baseline,start,length),end:[normalMarker(baseline,end,length),normalMarker(baseline,Math.max(start,end-gap),length)]};
}
