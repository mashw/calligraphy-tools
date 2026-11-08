'use client';
import { useMemo } from 'react';
import type { Design } from '@/lib/woven/design';
import { buildWovenModel, buildWovenRouteModel } from '@/lib/woven/model';
import { sliceGuide } from '@/lib/woven/geometry';
import { pointsD, type Scene } from '@/lib/woven/vector-export';
import type { Frame, WovenElement } from '@/lib/layout/types';
import { wovenDesignForFrame } from '@/lib/layout/woven';

export function LayoutWovenRenderer({element,frame,simplify}:{element:WovenElement;frame:Frame;simplify:boolean}) {
  const settings=element.settings, {width,height}=frame;
  const design=useMemo(()=>wovenDesignForFrame(settings,{x:0,y:0,width,height}),[settings,width,height]);
  return <g transform={`translate(${frame.x} ${frame.y})`}><WovenRenderer design={design} simplify={simplify}/></g>;
}

export function WovenScene({scene}:{scene:Scene}) {
  return <g data-woven-detail="true" pointerEvents="none">
    {scene.strokes.map((stroke,i)=><path key={i} d={pointsD(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinejoin="round" strokeLinecap="round"/>)}
    {scene.labels.map((label,i)=><text key={i} x={label.point.x} y={label.point.y} fill={label.color} fontSize={label.size} fontFamily="Helvetica,Arial,sans-serif">{label.text}</text>)}
  </g>;
}

export function WovenSimplified({model}:{model:ReturnType<typeof buildWovenRouteModel>}) {
  return <g data-woven-simplified="true" pointerEvents="none">
    {model.intervals.map((interval,i)=><path key={i} d={pointsD(sliceGuide(model.route,model.route.points,interval))} fill="none" stroke="#52677c" strokeWidth={1.2} strokeLinecap="round"/>)}
    {model.crossings.map(crossing=><circle key={crossing.id} cx={crossing.point.x} cy={crossing.point.y} r={1.8} fill="none" stroke="#9f483b" strokeWidth={.3}/>)}
  </g>;
}

export default function WovenRenderer({design,simplify=false}:{design:Design;simplify?:boolean}) {
  const route=useMemo(()=>buildWovenRouteModel(design),[design]);
  const full=useMemo(()=>simplify?null:buildWovenModel(design,{furniture:false}),[design,simplify]);
  return <>
    {simplify?<WovenSimplified model={route}/>:<WovenScene scene={design.annotated?full!.annotated:full!.clean}/>}
    <path data-woven-hit="true" data-no-export="true" d={pointsD(route.route.points)} fill="none" stroke="transparent" strokeWidth={Math.max(5,route.halfBand*2)} pointerEvents="stroke"/>
  </>;
}
