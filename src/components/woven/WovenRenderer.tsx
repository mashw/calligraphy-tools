'use client';
import { SheetLabels } from '@/components/preview/SheetLabels';
import { interlaceGuideTags } from '@/lib/interlace/model';
import { guideLabel, routeTag } from '@/lib/guides/sheet-labels';
import { borderGuideTags, writingBands } from '@/lib/woven/bands';
import { useMemo } from 'react';
import type { Design } from '@/lib/woven/design';
import { buildWovenModel, buildWovenRouteModel } from '@/lib/woven/model';
import { sliceGuide } from '@/lib/woven/geometry';
import { pointsD, type Scene } from '@/lib/woven/vector-export';
import type { Frame, WovenElement } from '@/lib/layout/types';
import { layoutWovenTags, wovenDesignForFrame } from '@/lib/layout/woven';

export function LayoutWovenRenderer({element,frame,simplify,page,rotation}:{page:{width:number;height:number};rotation:number;element:WovenElement;frame:Frame;simplify:boolean}) {
  const settings=element.settings, {width,height}=frame;
  const design=useMemo(()=>wovenDesignForFrame(settings,{x:0,y:0,width,height}),[settings,width,height]);
  const route = useMemo(()=>buildWovenRouteModel(design),[design]);
  const full = useMemo(()=>simplify ? null : buildWovenModel(design,{furniture:false}),[design,simplify]);
  const scene = full && (design.annotated ? full.annotated : full.clean);
  const tags = useMemo(()=>{
    if (!design.showGuideTags) return [];
    if (scene) return layoutWovenTags(scene,frame,rotation,page);
    const composition = route.composition;
    const primary = routeTag(guideLabel(design.script,route.x,design.nib),route.route.points,route.halfBand+4,.32);
    const labels = composition ? interlaceGuideTags(composition.sheet,composition.graph.entries)
      : [...(primary ? [primary] : []), ...borderGuideTags(writingBands(design,route.x,route.asc,route.desc),route.route.points,false,.32)];
    const paths = composition ? composition.graph.entries.map(e => e.route) : [route.route];
    return layoutWovenTags({tags:labels,strokes:paths.map(path=>({points:path.points,width:1.2,color:'#52677c'}))},frame,rotation,page);
  },[scene,design,route,frame,rotation,page]);
  return <>
    <g transform={`translate(${frame.x} ${frame.y})`}>
      {simplify ? <WovenSimplified model={route}/> : scene && <WovenScene scene={{...scene,tags:undefined}}/>}
      <path data-woven-hit="true" data-no-export="true" d={pointsD(route.route.points)} fill="none" stroke="transparent" strokeWidth={Math.max(5,route.halfBand*2)} pointerEvents="stroke"/>
    </g>
    <g pointerEvents="none" transform={`rotate(${-rotation} ${frame.x+width/2} ${frame.y+height/2})`}><SheetLabels tags={tags}/></g>
  </>;
}

export function WovenScene({scene}:{scene:Scene}) {
  return <g data-woven-detail="true" pointerEvents="none">
    {scene.strokes.map((stroke,i)=><path key={i} d={pointsD(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinejoin="round" strokeLinecap="round"/>)}
    {scene.tags && <SheetLabels tags={scene.tags} />}
    {scene.labels.map((label,i)=><text key={i} data-no-export={label.previewOnly ? 'true' : undefined} x={label.point.x} y={label.point.y} fill={label.color} fontSize={label.size} fontFamily="Helvetica,Arial,sans-serif">{label.text}</text>)}
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
