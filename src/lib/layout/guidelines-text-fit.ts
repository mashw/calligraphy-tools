import { TEXT_SPAN_STYLE } from '../guides/text-span-style';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { calculateStraightGuidelines } from '@/lib/guides/straight/model';
import { measureRun } from '@/lib/measure/measure-run';
import { SCRIPT_PROFILES } from '@/lib/scripts';
import { buildCalligramModel } from '@/lib/calligram/model';
import { boundsOfRotatedFrame, inverseRotatePoint, occupiedRect, rotatePoint } from './geometry';
import { elementRotationCenter } from './element-transform';
import { expandedShapeFrame, shapeContainsPoint, shapeFootprintContains } from './shape';
import { pageSize, type GuidelinesElement, type LayoutElement, type PageElement } from './types';
import { pathHasOnlyClosedSubpaths, type ArtworkNode } from './artwork';
import { lineMetricFromMeasuredRun } from '@/lib/measure/measure-lines-generic';
import type { PlannedLineAlignment } from './types';
import { isGuidelinesPlanningPointBlocked, selectLineLayoutSpan } from './guidelines-planning';
import { editableGuides, guideTransform } from './guideline-arrangement';
import { shapeBoundaryPoints } from './shape';
import { customMaskGeometry, polygonWritingSpans, activeCustomMask, CUSTOM_MASK_PADDING_MM, customMaskContains, usesCustomMask } from './custom-mask';

type Point = { x: number; y: number };
type Occluder = { bounds: { x: number; y: number; width: number; height: number }; contains: (point: Point) => boolean; dispose?:()=>void };
export type VisibleGuideSpan = { rowIndex: number; x1: number; x2: number; ascY: number; waistY: number; baseY: number; descY: number };
export type EstimatedSpanPlacement = VisibleGuideSpan & { consumedMM: number; slantShiftMM: number };
export type GuidelinesTextFitPlan = { visibleSpans: VisibleGuideSpan[]; placements: EstimatedSpanPlacement[]; requiredMM: number; availableMM: number; remainingMM: number; fits: boolean };
export type TextFitColor = { fill: string; stroke: string };
export type PlannedGlyphPlacement={ch:string;kind:'letter'|'space';startX:number;endX:number;collision:boolean};
export type PlannedLineResult={lineId:string;rowIndex:number|null;text:string;alignment:PlannedLineAlignment;measuredAdvanceMM:number;slantShiftMM:number;baselineStartX:number;baselineEndX:number;startFromLeftMM:number;startFromRightMM:number;maxCustomStartMM:number;glyphs:PlannedGlyphPlacement[];tooLongByMM:number;availableMM?:number;collision:boolean;waistY:number;baseY:number};
export type GuidelinesLineLayoutPlan={rows:VisibleGuideSpan[];lines:PlannedLineResult[];fits:boolean};
export type GuidelinesTextFitEntry = {mode:'estimate';plan:GuidelinesTextFitPlan;color:TextFitColor}|{mode:'line-layout';plan:GuidelinesLineLayoutPlan;color:TextFitColor};
export const TEXT_FIT_COLORS: readonly TextFitColor[] = [
  {fill:'rgba(99, 102, 241, 0.20)',stroke:'rgba(79, 70, 229, 0.70)'},
  {fill:'rgba(14, 165, 233, 0.18)',stroke:'rgba(2, 132, 199, 0.70)'},
  {fill:'rgba(13, 148, 136, 0.18)',stroke:'rgba(15, 118, 110, 0.70)'},
  TEXT_SPAN_STYLE,
  {fill:'rgba(217, 119, 6, 0.16)',stroke:'rgba(180, 83, 9, 0.68)'},
  {fill:'rgba(6, 182, 212, 0.17)',stroke:'rgba(8, 145, 178, 0.70)'},
];

const stableStringHash=(value:string)=>{let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;};
export const preferredTextFitColorIndex=(id:string)=>stableStringHash(id)%TEXT_FIT_COLORS.length;
export function resolveTextFitColors(ids:string[]){const used=new Set<number>(),out:Record<string,TextFitColor>={};ids.forEach(id=>{const preferred=preferredTextFitColorIndex(id);let index=preferred;for(let offset=0;offset<TEXT_FIT_COLORS.length;offset++){const candidate=(preferred+offset)%TEXT_FIT_COLORS.length;if(!used.has(candidate)){index=candidate;break;}}used.add(index);out[id]=TEXT_FIT_COLORS[index];});return out;}

const inBounds = (point: Point, bounds: Occluder['bounds']) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
const pointInPolygon = (point: Point, polygon: Point[]) => { let inside = false; for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) { const a=polygon[i],b=polygon[j]; if ((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside; } return inside; };
const segmentDistance = (p:Point,a:Point,b:Point) => { const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0; return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy); };
const polygonOccluder = (points: Point[], padding: number): Occluder => {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-padding,maxX=Math.max(...xs)+padding,minY=Math.min(...ys)-padding,maxY=Math.max(...ys)+padding;
  return { bounds:{x:minX,y:minY,width:maxX-minX,height:maxY-minY}, contains: point => inBounds(point,{x:minX,y:minY,width:maxX-minX,height:maxY-minY})&&(pointInPolygon(point,points)||padding>0&&points.some((p,index)=>segmentDistance(point,p,points[(index+1)%points.length])<=padding)) };
};
const rectOccluder = (bounds: Occluder['bounds']): Occluder => ({ bounds, contains: point => inBounds(point,bounds) });

function shapeOccluder(element: Extract<LayoutElement,{type:'shape'}>): Occluder {
  const {frame,settings}=element,border=(settings.appearance==='border'||settings.appearance==='fillAndBorder')?settings.borderWidthMM/2:0,pad=Math.max(0,element.paddingMM+border),bounds={x:frame.x-pad,y:frame.y-pad,width:frame.width+2*pad,height:frame.height+2*pad};
  return {bounds,contains:p=>shapeContainsPoint(settings.kind,bounds.width,bounds.height,{x:p.x-bounds.x,y:p.y-bounds.y},settings.cornerRadiusMM+pad)};
}

function artworkOccluder(element:Extract<LayoutElement,{type:'artwork'}>):Occluder|null{
  if(!element.settings.occludeLowerLayers||element.settings.opacity<=0||typeof document==='undefined')return null;
  const ns='http://www.w3.org/2000/svg',root=document.createElementNS(ns,'svg');
  root.setAttribute('viewBox',`${element.document.viewBox.x} ${element.document.viewBox.y} ${element.document.viewBox.width} ${element.document.viewBox.height}`);root.setAttribute('preserveAspectRatio','none');root.style.cssText=`position:fixed;left:-10000px;top:-10000px;width:${element.frame.width}px;height:${element.frame.height}px;opacity:0;pointer-events:none`;
  const geometries:SVGGeometryElement[]=[];
  const append=(node:ArtworkNode,parent:Element)=>{const child=document.createElementNS(ns,node.tag);Object.entries(node.attrs).forEach(([name,value])=>child.setAttribute(name,value));parent.appendChild(child);if(node.tag!=='g')geometries.push(child as SVGGeometryElement);node.children.forEach(item=>append(item,child));};
  element.document.nodes.forEach(node=>append(node,root));document.body.appendChild(root);
  const closed=(geometry:SVGGeometryElement)=>['rect','circle','ellipse','polygon'].includes(geometry.localName)||geometry.localName==='path'&&pathHasOnlyClosedSubpaths(geometry.getAttribute('d')??'');
  const visible=(geometry:SVGGeometryElement)=>{let node:Element|null=geometry;while(node&&node!==root){if(Number.parseFloat(getComputedStyle(node).opacity||'1')<=0)return false;node=node.parentElement;}return true;};
  return{bounds:element.frame,dispose:()=>root.remove(),contains:point=>{const rootMatrix=root.getScreenCTM();if(!rootMatrix)return false;const viewBox=element.document.viewBox,sourceX=viewBox.x+(point.x-element.frame.x)/element.frame.width*viewBox.width,sourceY=viewBox.y+(point.y-element.frame.y)/element.frame.height*viewBox.height,screen=new DOMPoint(sourceX,sourceY).matrixTransform(rootMatrix);return geometries.some(geometry=>{if(!visible(geometry))return false;const matrix=geometry.getScreenCTM();if(!matrix)return false;const local=screen.matrixTransform(matrix.inverse()),style=getComputedStyle(geometry),fill=style.fill!=='none',stroke=style.stroke!=='none'&&Number.parseFloat(style.strokeWidth)>0;return (fill||element.settings.occludeClosedShapes&&closed(geometry))&&geometry.isPointInFill(local)||stroke&&geometry.isPointInStroke(local);});}};
}

function unrotatedElementOccluders(element: LayoutElement): Occluder[] {
  if(element.type==='page'||element.visible===false) return [];
  if(element.type==='shape') return [shapeOccluder(element)];
  if(element.type==='guidelines') {
    if(!element.mask?.enabled)return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
    const {kind}=element.mask;
    if (kind==='customSvg') {
      const custom=activeCustomMask(element), {frame}=element;
      return custom ? [{bounds:frame,contains:p=>customMaskContains(custom,frame,{x:p.x-frame.x,y:p.y-frame.y})}] : [];
    }
    const bounds=expandedShapeFrame(element.frame,element.paddingMM);
    return [{bounds,contains:point=>shapeFootprintContains(kind,element.frame,point,element.mask.cornerRadiusMM,element.paddingMM)}];
  }
  if(element.type==='artwork'){
    if((element.settings.textFitExclusion??'bounds')==='bounds')return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
    const occluder=artworkOccluder(element);return occluder?[occluder]:[];
  }
  if(element.type==='woven')return [];
  if(element.type==='curved-title') {
    if(!(element.settings.transparentWhitespace??true)) return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
    return [];
  }
  if(!(element.settings.transparentWhitespace??true)) return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
  const model=buildCalligramModel({w:element.frame.width,h:element.frame.height},element.settings);
  return model.bands.map(band=>polygonOccluder([...band.guideSet.ascLine,...[...band.guideSet.descLine].reverse()].map(p=>({x:p.x+element.frame.x,y:p.y+element.frame.y})),element.paddingMM));
}

function elementOccluders(element:LayoutElement):Occluder[]{
  const raw=unrotatedElementOccluders(element),degrees=element.type==='page'?0:element.rotationDeg??0;
  if(!degrees)return raw;
  const centre=elementRotationCenter(element);
  return raw.map(occluder=>({bounds:boundsOfRotatedFrame(occluder.bounds,degrees,centre),contains:point=>occluder.contains(inverseRotatePoint(point,centre,degrees)),dispose:occluder.dispose}));
}

function customSlantSlope(element:GuidelinesElement) {
  return element.settings.script==='Copperplate' ? 1/Math.tan(element.settings.slant.angle*Math.PI/180) : 0;
}

function useBandPlanner(element:GuidelinesElement) {
  return usesCustomMask(element)||!!(element.mask?.enabled&&element.mask.arrangement);
}
function buildCustomWritingSpans(element:GuidelinesElement, page:PageElement):VisibleGuideSpan[] {
  const mask=activeCustomMask(element);
  if (!mask && element.mask.kind==='customSvg') return [];
  const frame=element.frame, paper=pageSize(page), model=calculateStraightGuidelines(frame,element.settings);
  const rotation=element.rotationDeg??0, center=elementRotationCenter(element);
  const local=(p:Point)=>{const q=inverseRotatePoint(p,center,rotation);return {x:q.x-frame.x,y:q.y-frame.y};};
  const corners=[{x:0,y:0},{x:paper.width,y:0},{x:paper.width,y:paper.height},{x:0,y:paper.height}].map(local);
  const edges=corners.map((p,i):[Point,Point]=>[p,corners[(i+1)%corners.length]]);
  const pageContains=(p:Point)=>{
    const q=rotatePoint({x:p.x+frame.x,y:p.y+frame.y},center,rotation);
    return q.x>=-.0001 && q.x<=paper.width+.0001 && q.y>=-.0001 && q.y<=paper.height+.0001;
  };
  const builtin=element.mask.kind;
  const boundary=mask?customMaskGeometry(mask,frame):{error:0,points:builtin==='customSvg'?[]:shapeBoundaryPoints(builtin,frame.width,frame.height,element.mask.cornerRadiusMM)};
  const slope=customSlantSlope(element);
  return editableGuides(element,model.guideSets).flatMap((guide,rowIndex)=>{
    const top=guide.ascLine[0].y, bottom=guide.descLine[0].y, baseline=guide.baseLine[0].y;
    if(top<0 || bottom>frame.height) return [];
    const shifts=[(baseline-top)*slope,(baseline-bottom)*slope];
    const x1=(guide.left??guide.baseLine[0].x)-Math.min(...shifts),x2=(guide.right??guide.baseLine.at(-1)!.x)-Math.max(...shifts);
    const t=guideTransform(element,guide,rowIndex);
    const usable=!mask&&!element.mask.textLayoutRespectsMask ? {points:corners,error:0}:boundary;
    return polygonWritingSpans({points:usable.points.map(t.inverse),error:usable.error},mask?(element.mask.internalPaddingMM??CUSTOM_MASK_PADDING_MM):0,
      {x1,x2,top,bottom,baseline,slope},edges.map(([a,b])=>[t.inverse(a),t.inverse(b)]),p=>pageContains(t.apply(p))).map(([left,right])=>({
        rowIndex,x1:frame.x+left,x2:frame.x+right,ascY:frame.y+top,
        waistY:frame.y+guide.waistLine[0].y,baseY:frame.y+baseline,descY:frame.y+bottom,
      }));
  });
}

export function buildGuidelinesVisibleSpans(element: GuidelinesElement, page: PageElement, elements: LayoutElement[]): VisibleGuideSpan[] {
  if (useBandPlanner(element)) return buildCustomWritingSpans(element,page);
  const maskKind=element.mask?.kind==='customSvg'?undefined:element.mask?.kind;
  const pageBox=pageSize(page),model=calculateStraightGuidelines({width:element.frame.width,height:element.frame.height},element.settings),index=elements.findIndex(item=>item.id===element.id),occluders=element.avoidOccludingElements!==false?elements.slice(0,Math.max(0,index)).flatMap(elementOccluders):[],spans:VisibleGuideSpan[]=[];
  model.guideSets.forEach((guide,rowIndex)=>{
    const asc=guide.ascLine[0].y,waist=guide.waistLine[0].y,base=guide.baseLine[0].y,desc=guide.descLine[0].y,pageAsc=element.frame.y+asc,pageDesc=element.frame.y+desc;
    if(asc<0||desc>element.frame.height||pageAsc<0||pageDesc>pageBox.height)return;
    const rawX1=element.frame.x+guide.baseLine[0].x,rawX2=element.frame.x+guide.baseLine.at(-1)!.x,x1=Math.max(0,rawX1),x2=Math.min(pageBox.width,rawX2);if(x2<=x1)return;
    if (!occluders.length && (!element.mask?.enabled || !maskKind || element.mask.textLayoutRespectsMask === false)) {
      spans.push({ rowIndex, x1, x2, ascY: pageAsc, waistY: element.frame.y + waist, baseY: element.frame.y + base, descY: pageDesc });
      return;
    }
    let start:number|null=null;const step=.5;
    for(let x=x1;x<x2-.0001;x+=step){const end=Math.min(x2,x+step),mid=(x+end)/2;let blocked=false;for(let y=pageAsc;y<=pageDesc+.001&&!blocked;y+=.5){const point={x:mid,y:Math.min(pageDesc,y)},externallyOccluded=occluders.some(o=>inBounds(point,o.bounds)&&o.contains(point)),insideMask=!element.mask?.enabled||!maskKind||shapeContainsPoint(maskKind,element.frame.width,element.frame.height,{x:point.x-element.frame.x,y:point.y-element.frame.y},element.mask.cornerRadiusMM);blocked=isGuidelinesPlanningPointBlocked({avoidOccludingElements:element.avoidOccludingElements!==false,externallyOccluded,maskEnabled:element.mask?.enabled??false,textLayoutRespectsMask:element.mask?.textLayoutRespectsMask??true,insideMask});}if(!blocked){const point={x:mid,y:pageDesc},externallyOccluded=occluders.some(o=>inBounds(point,o.bounds)&&o.contains(point)),insideMask=!element.mask?.enabled||!maskKind||shapeContainsPoint(maskKind,element.frame.width,element.frame.height,{x:point.x-element.frame.x,y:point.y-element.frame.y},element.mask.cornerRadiusMM);blocked=isGuidelinesPlanningPointBlocked({avoidOccludingElements:element.avoidOccludingElements!==false,externallyOccluded,maskEnabled:element.mask?.enabled??false,textLayoutRespectsMask:element.mask?.textLayoutRespectsMask??true,insideMask});}if(!blocked){if(start===null)start=x;}else if(start!==null){spans.push({rowIndex,x1:start,x2:x,ascY:pageAsc,waistY:element.frame.y+waist,baseY:element.frame.y+base,descY:pageDesc});start=null;}}
    if(start!==null)spans.push({rowIndex,x1:start,x2,ascY:pageAsc,waistY:element.frame.y+waist,baseY:element.frame.y+base,descY:pageDesc});
  });
  occluders.forEach(occluder=>occluder.dispose?.());
  return spans;
}

const visibleSpanCache = new Map<string,VisibleGuideSpan[]>();
export function getCachedGuidelinesVisibleSpans(key: string, element: GuidelinesElement, page: PageElement, elements: LayoutElement[]) {
  const cached=visibleSpanCache.get(key);if(cached)return cached;
  const spans=buildGuidelinesVisibleSpans(element,page,elements);if(visibleSpanCache.size>=50)visibleSpanCache.delete(visibleSpanCache.keys().next().value!);visibleSpanCache.set(key,spans);return spans;
}

const placementSpanCache=new Map<string,VisibleGuideSpan[]>();
export function getCachedGuidelinesPlacementSpans(element:GuidelinesElement,page:PageElement){
  const key=JSON.stringify({frame:element.frame,rotation:element.rotationDeg,settings:element.settings,mask:element.mask,page});
  const cached=placementSpanCache.get(key);if(cached)return cached;
  const spans=buildGuidelinesVisibleSpans({...element,avoidOccludingElements:false},page,[]);if(placementSpanCache.size>=50)placementSpanCache.delete(placementSpanCache.keys().next().value!);placementSpanCache.set(key,spans);return spans;
}

function buildGuidelinesCollisionSpans(element:GuidelinesElement,page:PageElement,elements:LayoutElement[]):VisibleGuideSpan[]{
  const pageBox=pageSize(page),model=calculateStraightGuidelines({width:element.frame.width,height:element.frame.height},element.settings),index=elements.findIndex(item=>item.id===element.id),occluders=element.avoidOccludingElements!==false?elements.slice(0,Math.max(0,index)).flatMap(elementOccluders):[],spans:VisibleGuideSpan[]=[];
  model.guideSets.forEach((guide,rowIndex)=>{const asc=guide.ascLine[0].y,waist=guide.waistLine[0].y,base=guide.baseLine[0].y,desc=guide.descLine[0].y,pageAsc=element.frame.y+asc,pageWaist=element.frame.y+waist,pageBase=element.frame.y+base,pageDesc=element.frame.y+desc;if(asc<0||desc>element.frame.height||pageAsc<0||pageDesc>pageBox.height)return;const rawX1=element.frame.x+guide.baseLine[0].x,rawX2=element.frame.x+guide.baseLine.at(-1)!.x,x1=Math.max(0,rawX1),x2=Math.min(pageBox.width,rawX2);if(x2<=x1)return;if(!occluders.length){spans.push({rowIndex,x1,x2,ascY:pageAsc,waistY:pageWaist,baseY:pageBase,descY:pageDesc});return;}let start:number|null=null;const step=.5;for(let x=x1;x<x2-.0001;x+=step){const end=Math.min(x2,x+step),mid=(x+end)/2;let blocked=false;for(let y=pageWaist;y<=pageBase+.001&&!blocked;y+=.5){const point={x:mid,y:Math.min(pageBase,y)};blocked=occluders.some(o=>inBounds(point,o.bounds)&&o.contains(point));}if(!blocked){if(start===null)start=x;}else if(start!==null){spans.push({rowIndex,x1:start,x2:x,ascY:pageAsc,waistY:pageWaist,baseY:pageBase,descY:pageDesc});start=null;}}if(start!==null)spans.push({rowIndex,x1:start,x2,ascY:pageAsc,waistY:pageWaist,baseY:pageBase,descY:pageDesc});});
  occluders.forEach(occluder=>occluder.dispose?.());return spans;
}
const collisionSpanCache=new Map<string,VisibleGuideSpan[]>();
export function getCachedGuidelinesCollisionSpans(key:string,element:GuidelinesElement,page:PageElement,elements:LayoutElement[]){if(useBandPlanner(element))return [];const cacheKey=`collision:${key}`,cached=collisionSpanCache.get(cacheKey);if(cached)return cached;const spans=buildGuidelinesCollisionSpans(element,page,elements);if(collisionSpanCache.size>=50)collisionSpanCache.delete(collisionSpanCache.keys().next().value!);collisionSpanCache.set(cacheKey,spans);return spans;}

export function buildGuidelinesVisibilityCacheKey(element:GuidelinesElement,page:PageElement,higherElements:LayoutElement[]){return JSON.stringify({frame:element.frame,rotation:element.rotationDeg,settings:element.settings,mask:element.mask,avoidOccludingElements:element.avoidOccludingElements!==false,page,higher:element.avoidOccludingElements!==false?higherElements.map(item=>item.type==='guidelines'?{...item,fitText:'',plannedLines:[],textMode:'estimate',rightAlignMode:'waist'}:item):[]});}

export function buildGuidelinesTextFitPlan(element: GuidelinesElement, visibleSpans: VisibleGuideSpan[]): GuidelinesTextFitPlan {
  const measurementText=element.fitText.replace(/\s*\n+\s*/g,' ').replace(/\s+/g,' ').trim();
  if(!measurementText)return{visibleSpans:[],placements:[],requiredMM:0,availableMM:0,remainingMM:0,fits:true};
  const settings=element.settings,effectiveNib=settings.nibMM*Math.cos(settings.penAngleDeg*Math.PI/180),ctx=settings.script==='Copperplate'?buildCopperplateContext({xHeightMM:settings.xHeightMM,capStyle:'simple',calibration:{enabled:false}}).ctx:{xHeightMM:settings.xNib*(settings.script==='InsularMajuscule'?settings.nibMM:effectiveNib),nibMM:effectiveNib,scale:1,spaceMult:1,capStyle:'simple' as const},run=measureRun(measurementText,SCRIPT_PROFILES[settings.script],ctx),slant=settings.script==='Copperplate'?settings.xHeightMM/Math.tan(55*Math.PI/180):0;
  if (useBandPlanner(element)) return buildCustomEstimate(element,visibleSpans,run);
  const capacities=visibleSpans.map(span=>Math.max(0,span.x2-span.x1-slant)),availableMM=capacities.reduce((sum,value)=>sum+value,0),placements:EstimatedSpanPlacement[]=[];let remaining=run.totalAdvanceMM;
  visibleSpans.forEach((span,index)=>{if(remaining<=0)return;const consumed=Math.min(remaining,capacities[index]);if(consumed>0)placements.push({...span,consumedMM:consumed,slantShiftMM:slant});remaining-=consumed;});
  return{visibleSpans,placements,requiredMM:run.totalAdvanceMM,availableMM,remainingMM:Math.max(0,remaining),fits:remaining<=.001};
}

function buildCustomEstimate(element:GuidelinesElement,spans:VisibleGuideSpan[],run:ReturnType<typeof measureRun>):GuidelinesTextFitPlan {
  const words:{width:number;space:number}[]=[];
  let width=0,space=0;
  for (const glyph of run.glyphs) {
    if (glyph.kind==='space') {
      if(width>0){words.push({width,space});width=0;}
      space=glyph.advMM;
    } else width+=glyph.advMM;
  }
  if(width>0) words.push({width,space});
  let next=0;
  const placements:EstimatedSpanPlacement[]=[];
  for (const span of spans) {
    let consumed=0;
    while (next<words.length) {
      const word=words[next], advance=word.width+(consumed>0?word.space:0);
      if (consumed+advance>span.x2-span.x1+.001) break;
      consumed+=advance;
      next++;
    }
    if (consumed>0) placements.push({...span,consumedMM:consumed,slantShiftMM:(span.baseY-span.waistY)*customSlantSlope(element)});
  }
  return {visibleSpans:spans,placements,requiredMM:run.totalAdvanceMM,
    availableMM:spans.reduce((sum,span)=>sum+span.x2-span.x1,0),
    remainingMM:words.slice(next).reduce((sum,word)=>sum+word.width+word.space,0),fits:next===words.length};
}

function measureGuidelinesRun(element:GuidelinesElement,text:string){const s=element.settings,effective=s.nibMM*Math.cos(s.penAngleDeg*Math.PI/180),ctx=s.script==='Copperplate'?buildCopperplateContext({xHeightMM:s.xHeightMM,capStyle:'simple',calibration:{enabled:false}}).ctx:{xHeightMM:s.xNib*(s.script==='InsularMajuscule'?s.nibMM:effective),nibMM:effective,scale:1,spaceMult:1,capStyle:'simple' as const};return measureRun(text,SCRIPT_PROFILES[s.script],ctx);}
export function buildGuidelinesLineLayoutPlan(element:GuidelinesElement,placementSpans:VisibleGuideSpan[],page?:PageElement,collisionSpans:VisibleGuideSpan[]=placementSpans,elements:LayoutElement[]=[]):GuidelinesLineLayoutPlan{
  if (useBandPlanner(element)) return buildCustomLineLayout(element,placementSpans,elements);
  const model=calculateStraightGuidelines({width:element.frame.width,height:element.frame.height},element.settings),pageHeight=page?pageSize(page).height:Infinity;
  const candidates=model.guideSets.flatMap((g,rowIndex)=>{const ascY=element.frame.y+g.ascLine[0].y,descY=element.frame.y+g.descLine[0].y;if(g.ascLine[0].y<0||g.descLine[0].y>element.frame.height||ascY<0||descY>pageHeight)return[];const row={rowIndex,x1:element.frame.x+g.baseLine[0].x,x2:element.frame.x+g.baseLine.at(-1)!.x,ascY,waistY:element.frame.y+g.waistLine[0].y,baseY:element.frame.y+g.baseLine[0].y,descY},spans=placementSpans.filter(span=>span.rowIndex===rowIndex).sort((a,b)=>a.x1-b.x1);return spans.length?[{row,spans}]:[];});
  const rows=candidates.map(({row,spans})=>{const widest=[...spans].sort((a,b)=>(b.x2-b.x1)-(a.x2-a.x1))[0];return{...row,x1:widest.x1,x2:widest.x2};});
  const covers=(x1:number,x2:number,spans:VisibleGuideSpan[])=>{let cursor=x1;for(const span of spans){if(span.x2<=cursor+.001)continue;if(span.x1>cursor+.001)return false;cursor=Math.max(cursor,span.x2);if(cursor>=x2-.001)return true;}return cursor>=x2-.001;};
  const lines=element.plannedLines.map((line,index):PlannedLineResult=>{const candidate=candidates[index],run=measureGuidelinesRun(element,line.text),metric=lineMetricFromMeasuredRun(line.text,run,line.alignment==='center'?'center':'right'),advance=metric.lengthMM,slant=element.settings.script==='Copperplate'?element.settings.xHeightMM/Math.tan(55*Math.PI/180):0;if(!candidate)return{lineId:line.id,rowIndex:null,text:line.text,alignment:line.alignment,measuredAdvanceMM:advance,slantShiftMM:slant,baselineStartX:0,baselineEndX:0,startFromLeftMM:0,startFromRightMM:0,maxCustomStartMM:0,glyphs:[],tooLongByMM:0,collision:false,waistY:0,baseY:0};const{row,spans}=candidate,footprint=advance+slant,selection=selectLineLayoutSpan(spans,line.alignment,footprint,(row.x1+row.x2)/2,row.x1+line.customStartMM)!;const selected=selection.span,rowCollisionSpans=collisionSpans.filter(span=>span.rowIndex===row.rowIndex).sort((a,b)=>a.x1-b.x1),start=selection.start,glyphs:PlannedGlyphPlacement[]=[];let cursor=start;run.glyphs.forEach(g=>{const a=cursor,b=cursor+g.advMM,space=g.kind==='space',end=b+(space?0:slant),outsidePlacement=!space&&(a<selected.x1-.001||end>selected.x2+.001),hitsElement=!space&&element.avoidOccludingElements!==false&&!covers(a,end,rowCollisionSpans),collision=outsidePlacement||hitsElement;glyphs.push({ch:g.ch,kind:space?'space':'letter',startX:a,endX:b,collision});cursor=b;});return{lineId:line.id,rowIndex:row.rowIndex,text:line.text,alignment:line.alignment,measuredAdvanceMM:advance,slantShiftMM:slant,baselineStartX:start,baselineEndX:start+advance,startFromLeftMM:start-row.x1,startFromRightMM:row.x2-start,maxCustomStartMM:Math.max(0,selected.x2-footprint-row.x1),glyphs,tooLongByMM:Math.max(0,footprint-(selected.x2-selected.x1)),collision:!selection.fits||glyphs.some(g=>g.collision),waistY:row.waistY,baseY:row.baseY};});return{rows,lines,fits:lines.every(line=>line.rowIndex!==null&&!line.tooLongByMM&&!line.collision)};
}

function buildCustomLineLayout(element:GuidelinesElement,spans:VisibleGuideSpan[],elements:LayoutElement[]):GuidelinesLineLayoutPlan {
  const rows=new Map<number,VisibleGuideSpan[]>();
  for (const span of spans) {
    const row=rows.get(span.rowIndex)??[];
    row.push(span);
    rows.set(span.rowIndex,row);
  }
  const bands=[...rows.values()];
  const guides=editableGuides(element,calculateStraightGuidelines(element.frame,element.settings).guideSets);
  const slope=customSlantSlope(element);
  const index=elements.findIndex(item=>item.id===element.id);
  const occluders=element.avoidOccludingElements!==false?elements.slice(0,Math.max(0,index)).flatMap(elementOccluders):[];
  const rotation=element.rotationDeg??0, center=elementRotationCenter(element);
  try {
    const lines=element.plannedLines.map((line,i):PlannedLineResult=>{
      const row=bands[i], run=measureGuidelinesRun(element,line.text), advance=run.totalAdvanceMM;
      const emptyResult={lineId:line.id,text:line.text,alignment:line.alignment,measuredAdvanceMM:advance,
        rowIndex:null,slantShiftMM:0,baselineStartX:0,baselineEndX:0,startFromLeftMM:0,startFromRightMM:0,
        maxCustomStartMM:0,glyphs:[],availableMM:0,tooLongByMM:0,collision:false,waistY:0,baseY:0};
      if (!row) return emptyResult;
      const {rowIndex,ascY,waistY,baseY,descY}=row[0],left=row[0].x1,right=row.at(-1)!.x2;
      const shift=(baseY-waistY)*slope;
      const selection=selectLineLayoutSpan(row,line.alignment,advance,(left+right)/2,left+line.customStartMM)!;
      const start=line.alignment==='custom'?Math.max(left,Math.min(right,left+line.customStartMM)):selection.start;
      const selected=line.alignment==='custom'?row.find(span=>span.x1-.001<=start && span.x2+.001>=start):selection.span;
      const availableMM=selected?selected.x2-(line.alignment==='custom'?start:selected.x1):0;
      const transform=guideTransform(element,guides[rowIndex],rowIndex);
      const hits=(x1:number,x2:number)=>{
        if (!occluders.length) return false;
        const dx=Math.max(1,Math.ceil((x2-x1)/.5)),dy=Math.max(1,Math.ceil((descY-ascY)/.5));
        for (let y=0;y<=dy;y++) {
          const py=ascY+(descY-ascY)*y/dy;
          for (let x=0;x<=dx;x++) {
            const q=transform.apply({x:x1+(x2-x1)*x/dx+(baseY-py)*slope-element.frame.x,y:py-element.frame.y});
            const p=rotatePoint({x:q.x+element.frame.x,y:q.y+element.frame.y},center,rotation);
            if (occluders.some(o=>inBounds(p,o.bounds)&&o.contains(p))) return true;
          }
        }
        return false;
      };
      let cursor=start;
      const glyphs=run.glyphs.map((glyph):PlannedGlyphPlacement=>{
        const a=cursor,b=a+glyph.advMM,space=glyph.kind==='space';
        // Include glyph body width even when kerning makes it wider than its advance.
        const bodyEnd=a+Math.max(glyph.wMM,glyph.advMM);
        cursor=b;
        return {ch:glyph.ch,kind:space?'space':'letter',startX:a,endX:b,
          collision:!space&&(!row.some(span=>span.x1<=a+.001&&span.x2>=bodyEnd-.001)||hits(a,bodyEnd))};
      });
      const tooLongByMM=Math.max(0,advance-availableMM);
      return {...emptyResult,rowIndex,slantShiftMM:shift,baselineStartX:start,baselineEndX:start+advance,
        startFromLeftMM:start-left,startFromRightMM:right-start,maxCustomStartMM:right-left,glyphs,availableMM,
        tooLongByMM:tooLongByMM>.001?tooLongByMM:0,collision:glyphs.some(glyph=>glyph.collision),waistY,baseY};
    });
    return {rows:spans,lines,fits:lines.every(line=>!line.text.trim() || (line.rowIndex!==null && !line.tooLongByMM && !line.collision))};
  } finally {occluders.forEach(o=>o.dispose?.());}
}
