export type GuidelinesPlanningVisibility = {
  avoidOccludingElements:boolean;
  externallyOccluded:boolean;
  maskEnabled:boolean;
  textLayoutRespectsMask:boolean;
  insideMask:boolean;
};

/** Combines the two independent text-planning constraints without affecting rendering. */
export function isGuidelinesPlanningPointBlocked(state:GuidelinesPlanningVisibility){
  return state.avoidOccludingElements&&state.externallyOccluded
    || state.maskEnabled&&state.textLayoutRespectsMask&&!state.insideMask;
}

export type PlanningSpan={x1:number;x2:number};
export function selectLineLayoutSpan(spans:PlanningSpan[],alignment:'left'|'center'|'right'|'custom',footprintMM:number,rowCenter:number,requestedStart:number){
  const ordered=[...spans].sort((a,b)=>a.x1-b.x1),fits=ordered.filter(span=>span.x2-span.x1>=footprintMM-.001);
  let span:PlanningSpan|undefined;
  if(alignment==='left')span=fits[0];
  else if(alignment==='right')span=fits.at(-1);
  else if(alignment==='center')span=[...fits].sort((a,b)=>Math.abs((a.x1+a.x2)/2-rowCenter)-Math.abs((b.x1+b.x2)/2-rowCenter))[0];
  else span=[...fits].sort((a,b)=>{const distance=(candidate:PlanningSpan)=>Math.abs(requestedStart-Math.max(candidate.x1,Math.min(candidate.x2-footprintMM,requestedStart)));return distance(a)-distance(b);})[0];
  span??=[...ordered].sort((a,b)=>(b.x2-b.x1)-(a.x2-a.x1))[0];
  if(!span)return null;
  const maxStart=Math.max(span.x1,span.x2-footprintMM);
  const start=alignment==='left'?span.x1:alignment==='right'?maxStart:alignment==='center'?(span.x1+span.x2-footprintMM)/2:Math.max(span.x1,Math.min(maxStart,requestedStart));
  return{span,start,fits:span.x2-span.x1>=footprintMM-.001};
}
