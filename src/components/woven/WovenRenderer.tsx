'use client';
import { TEXT_SPAN_STYLE } from '@/lib/guides/text-span-style';
import { DEFAULT_TEXT_PLAN, textFit, wovenCompositionTextFit, wovenStrandTextPlan } from '@/lib/interlace/text-fit';
import { initialSheet, interlaceGuideTags, strand, writingRoutes } from '@/lib/interlace/model';
import { SheetLabels } from '@/components/preview/SheetLabels';
import { clipSlantToBand } from '@/lib/guides/slant-paths';
import { scrollRibbonGroup } from '@/lib/woven/spiral-ribbon-weave';
import { guideLabel, routeTag } from '@/lib/guides/sheet-labels';
import { borderGuideTags, writingBands } from '@/lib/woven/bands';
import { memo, useMemo } from 'react';
import type { Design } from '@/lib/woven/design';
import { buildWovenModel, buildWovenRouteModel } from '@/lib/woven/model';
import { sliceGuide } from '@/lib/woven/geometry';
import { pointsD, type Scene } from '@/lib/woven/vector-export';
import type { Frame, WovenElement } from '@/lib/layout/types';
import { layoutWovenTags, layoutWovenPreview } from '@/lib/layout/woven';

export function WovenFitSpan({fit}:{fit:ReturnType<typeof textFit>}) {
  return <g data-no-export="true" pointerEvents="none">{fit.lines.flatMap(line=>line.spanPolygons).map((polygon,index) =>
    polygon.length > 2 && <path key={index} d={pointsD(polygon)+' Z'} {...TEXT_SPAN_STYLE} strokeWidth=".35" vectorEffect="non-scaling-stroke"/>
  )}</g>;
}

export const WovenFitPreview = memo(function WovenFitPreview({design,model}:{design:Design;model:ReturnType<typeof buildWovenRouteModel>}) {
  const fits = useMemo(() => {
    if (model.composition) {
      const {sheet,graph} = model.composition;
      return sheet.strands.flatMap(s => {
        if (!s.visible) return [];
        const textPlan = wovenStrandTextPlan(design, s);
        return textPlan.text ? [wovenCompositionTextFit(design, sheet, { ...s, textPlan }, graph)] : [];
      });
    }
    const text = design.strapTexts?.woven;
    if (!text) return [];
    const sheet = initialSheet();
    sheet.paper = design.paper;
    sheet.orientation = design.orientation;
    const s = strand('woven','Main strap',{kind:design.preset==='figure-eight'?'figure-eight':'rosette'},design);
    s.textPlan = {...DEFAULT_TEXT_PLAN,text,countHidden:design.hiddenTextStraps?.includes(s.id)};
    sheet.strands = [s];
    return [textFit(sheet,s,undefined,model)];
  },[design,model]);
  return <>{fits.map((fit,i)=><WovenFitSpan key={i} fit={fit}/>)}</>;
});

export function LayoutWovenRenderer({element,frame,simplify,page,rotation}:{page:{width:number;height:number};rotation:number;element:WovenElement;frame:Frame;simplify:boolean}) {
  const settings=element.settings, {width,height}=frame;
  const { design, geometryDesign, route } = useMemo(() => layoutWovenPreview(settings, width, height), [settings, width, height]);
  const full = useMemo(() => simplify ? null : buildWovenModel(geometryDesign, { furniture: false, routeModel: route }), [geometryDesign, route, simplify]);
  const scene = full && (design.annotated ? full.annotated : full.clean);
  const artwork = useMemo(() => scene && { ...scene, tags: undefined }, [scene]);
  const hitPath = useMemo(() => pointsD(route.route.points), [route]);
  const tags = useMemo(()=>{
    if (!geometryDesign.showGuideTags) return [];
    if (scene) return layoutWovenTags(scene,frame,rotation,page);
    const composition = route.composition;
    const primary = routeTag(guideLabel(geometryDesign.script,route.x,geometryDesign.nib),route.route.points,route.halfBand+4,.32);
    const labels = composition ? interlaceGuideTags(composition.sheet,composition.graph.entries)
      : [...(primary ? [primary] : []), ...borderGuideTags(writingBands(geometryDesign,route.x,route.asc,route.desc),route.route.points,false,.32)];
    const paths = composition ? composition.graph.entries.map(e => e.route) : [route.route];
    return layoutWovenTags({tags:labels,strokes:paths.map(path=>({points:path.points,width:1.2,color:'#52677c'}))},frame,rotation,page);
  },[scene,geometryDesign,route,frame,rotation,page]);
  return <>
    <g transform={`translate(${frame.x} ${frame.y})`}>
      {simplify ? <WovenSimplified model={route}/> : artwork && <WovenScene scene={artwork}/>}
      {!simplify && <WovenFitPreview design={design} model={route}/>}
      <path data-woven-hit="true" data-no-export="true" d={hitPath} fill="none" stroke="transparent" strokeWidth={Math.max(5,route.halfBand*2)} pointerEvents="stroke"/>
    </g>
    <g pointerEvents="none" transform={`rotate(${-rotation} ${frame.x+width/2} ${frame.y+height/2})`}><SheetLabels tags={tags}/></g>
  </>;
}

export const WovenScene = memo(function WovenScene({scene}:{scene:Scene}) {
  return <g data-woven-detail="true" pointerEvents="none">
    {scene.strokes.map((stroke,i)=><path key={i} d={pointsD(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinejoin="round" strokeLinecap="round"/>)}
    {scene.tags && <SheetLabels tags={scene.tags} />}
    {scene.labels.map((label,i)=><text key={i} data-no-export={label.previewOnly ? 'true' : undefined} x={label.point.x} y={label.point.y} fill={label.color} fontSize={label.size} fontFamily="Helvetica,Arial,sans-serif">{label.text}</text>)}
  </g>;
});

export const WovenSimplified = memo(function WovenSimplified({model}:{model:ReturnType<typeof buildWovenRouteModel>}) {
  const { composition } = model;
  const scroll = composition?.graph.entries.some(({ s }) => s.group === scrollRibbonGroup);
  const paths = scroll && composition
    ? writingRoutes(composition.sheet, composition.graph).flatMap(({ route, regions }) =>
        regions.flatMap(({ interval, polygons }) => {
          const centreline = sliceGuide(route, route.points, interval);
          return polygons.reduce((pieces, polygon) =>
            pieces.flatMap(points => clipSlantToBand(points, polygon, false)), [centreline]);
        }))
    : model.intervals.map(interval => sliceGuide(model.route, model.route.points, interval));
  return <g data-woven-simplified="true" pointerEvents="none">
    {paths.map((points, i) => <path key={i} d={pointsD(points)} fill="none" stroke="#52677c" strokeWidth={1.2}
      strokeLinecap={scroll ? 'butt' : 'round'} />)}
    {model.crossings.map(crossing=><circle key={crossing.id} cx={crossing.point.x} cy={crossing.point.y} r={1.8} fill="none" stroke="#9f483b" strokeWidth={.3}/>)}
  </g>;
});

export default function WovenRenderer({design,simplify=false}:{design:Design;simplify?:boolean}) {
  const route=useMemo(()=>buildWovenRouteModel(design),[design]);
  const full=useMemo(()=>simplify?null:buildWovenModel(design,{furniture:false,routeModel:route}),[design,route,simplify]);
  return <>
    {simplify?<WovenSimplified model={route}/>:<WovenScene scene={design.annotated?full!.annotated:full!.clean}/>}
    <path data-woven-hit="true" data-no-export="true" d={pointsD(route.route.points)} fill="none" stroke="transparent" strokeWidth={Math.max(5,route.halfBand*2)} pointerEvents="stroke"/>
  </>;
}
