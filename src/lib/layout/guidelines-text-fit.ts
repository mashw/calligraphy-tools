import { buildCopperplateContext } from '@/lib/copperplate/context';
import { calculateStraightGuidelines } from '@/lib/guides/straight/model';
import { measureRun } from '@/lib/measure/measure-run';
import { SCRIPT_PROFILES } from '@/lib/scripts';
import { buildCalligramModel } from '@/lib/calligram/model';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import { occupiedRect } from './geometry';
import { shapePolygonPoints } from './shape';
import { pageSize, type GuidelinesElement, type LayoutElement, type PageElement } from './types';
import { pathHasOnlyClosedSubpaths, type ArtworkNode } from './artwork';

type Point = { x: number; y: number };
type Occluder = { bounds: { x: number; y: number; width: number; height: number }; contains: (point: Point) => boolean; dispose?:()=>void };
export type VisibleGuideSpan = { rowIndex: number; x1: number; x2: number; ascY: number; waistY: number; baseY: number; descY: number };
export type EstimatedSpanPlacement = VisibleGuideSpan & { consumedMM: number; slantShiftMM: number };
export type GuidelinesTextFitPlan = { visibleSpans: VisibleGuideSpan[]; placements: EstimatedSpanPlacement[]; requiredMM: number; availableMM: number; remainingMM: number; fits: boolean };
export type TextFitColor = { fill: string; stroke: string };
export type GuidelinesTextFitEntry = { plan: GuidelinesTextFitPlan; color: TextFitColor };
export const TEXT_FIT_COLORS: readonly TextFitColor[] = [
  {fill:'rgba(99, 102, 241, 0.20)',stroke:'rgba(79, 70, 229, 0.70)'},
  {fill:'rgba(14, 165, 233, 0.18)',stroke:'rgba(2, 132, 199, 0.70)'},
  {fill:'rgba(13, 148, 136, 0.18)',stroke:'rgba(15, 118, 110, 0.70)'},
  {fill:'rgba(139, 92, 246, 0.18)',stroke:'rgba(124, 58, 237, 0.70)'},
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
  const {frame,settings}=element,border=(settings.appearance==='border'||settings.appearance==='fillAndBorder')?settings.borderWidthMM/2:0,pad=Math.max(0,element.paddingMM+border),local=(p:Point)=>({x:p.x-frame.x,y:p.y-frame.y}),bounds={x:frame.x-pad,y:frame.y-pad,width:frame.width+2*pad,height:frame.height+2*pad};
  if(settings.kind==='ellipse'||settings.kind==='circle') return {bounds,contains:p=>{const q=local(p),rx=frame.width/2+pad,ry=frame.height/2+pad;return ((q.x-frame.width/2)/rx)**2+((q.y-frame.height/2)/ry)**2<=1;}};
  if(settings.kind==='rectangle'||settings.kind==='square') return rectOccluder(bounds);
  if(settings.kind==='roundedRectangle'||settings.kind==='roundedSquare') return {bounds,contains:p=>{const q=local(p),r=Math.min(settings.cornerRadiusMM,frame.width/2,frame.height/2)+pad,cx=frame.width/2,cy=frame.height/2,dx=Math.max(Math.abs(q.x-cx)-(frame.width/2-r),0),dy=Math.max(Math.abs(q.y-cy)-(frame.height/2-r),0);return dx*dx+dy*dy<=r*r;}};
  const points=shapePolygonPoints(settings.kind,frame.width,frame.height).split(/\s+/).map(pair=>{const[x,y]=pair.split(',').map(Number);return{x:x+frame.x,y:y+frame.y};});
  return polygonOccluder(points,pad);
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

function elementOccluders(element: LayoutElement): Occluder[] {
  if(element.type==='page') return [];
  if(element.type==='shape') return [shapeOccluder(element)];
  if(element.type==='guidelines') return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
  if(element.type==='artwork'){const occluder=artworkOccluder(element);return occluder?[occluder]:[];}
  if(element.type==='curved-title') {
    if(!(element.settings.transparentWhitespace??true)) return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
    const model=buildCurvedTitleModel({w:element.frame.width,h:element.frame.height},element.settings),points=model.footprintPoints.map(p=>({x:p.x+element.frame.x,y:p.y+element.frame.y}));
    return [polygonOccluder(points,element.paddingMM)];
  }
  if(!(element.settings.transparentWhitespace??true)) return [rectOccluder(occupiedRect(element.frame,element.paddingMM))];
  const model=buildCalligramModel({w:element.frame.width,h:element.frame.height},element.settings);
  return model.bands.map(band=>polygonOccluder([...band.guideSet.ascLine,...[...band.guideSet.descLine].reverse()].map(p=>({x:p.x+element.frame.x,y:p.y+element.frame.y})),element.paddingMM));
}

export function buildGuidelinesVisibleSpans(element: GuidelinesElement, page: PageElement, elements: LayoutElement[]): VisibleGuideSpan[] {
  const pageBox=pageSize(page),model=calculateStraightGuidelines({width:element.frame.width,height:element.frame.height},element.settings),index=elements.findIndex(item=>item.id===element.id),occluders=elements.slice(0,Math.max(0,index)).flatMap(elementOccluders),spans:VisibleGuideSpan[]=[];
  model.guideSets.forEach((guide,rowIndex)=>{
    const asc=guide.ascLine[0].y,waist=guide.waistLine[0].y,base=guide.baseLine[0].y,desc=guide.descLine[0].y,pageAsc=element.frame.y+asc,pageDesc=element.frame.y+desc;
    if(asc<0||desc>element.frame.height||pageAsc<0||pageDesc>pageBox.height)return;
    const rawX1=element.frame.x+guide.baseLine[0].x,rawX2=element.frame.x+guide.baseLine.at(-1)!.x,x1=Math.max(0,rawX1),x2=Math.min(pageBox.width,rawX2);if(x2<=x1)return;
    let start:number|null=null;const step=.5;
    for(let x=x1;x<x2-.0001;x+=step){const end=Math.min(x2,x+step),mid=(x+end)/2;let blocked=false;for(let y=pageAsc;y<=pageDesc+.001&&!blocked;y+=.5){const point={x:mid,y:Math.min(pageDesc,y)};blocked=occluders.some(o=>inBounds(point,o.bounds)&&o.contains(point));}if(!blocked){const point={x:mid,y:pageDesc};blocked=occluders.some(o=>inBounds(point,o.bounds)&&o.contains(point));}if(!blocked){if(start===null)start=x;}else if(start!==null){spans.push({rowIndex,x1:start,x2:x,ascY:pageAsc,waistY:element.frame.y+waist,baseY:element.frame.y+base,descY:pageDesc});start=null;}}
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

export function buildGuidelinesVisibilityCacheKey(element:GuidelinesElement,page:PageElement,higherElements:LayoutElement[]){return JSON.stringify({frame:element.frame,settings:element.settings,page,higher:higherElements.map(item=>item.type==='guidelines'?{...item,fitText:''}:item)});}

export function buildGuidelinesTextFitPlan(element: GuidelinesElement, visibleSpans: VisibleGuideSpan[]): GuidelinesTextFitPlan {
  const measurementText=element.fitText.replace(/\s*\n+\s*/g,' ').replace(/\s+/g,' ').trim();
  if(!measurementText)return{visibleSpans:[],placements:[],requiredMM:0,availableMM:0,remainingMM:0,fits:true};
  const settings=element.settings,effectiveNib=settings.nibMM*Math.cos(settings.penAngleDeg*Math.PI/180),ctx=settings.script==='Copperplate'?buildCopperplateContext({xHeightMM:settings.xHeightMM,capStyle:'simple',calibration:{enabled:false}}).ctx:{xHeightMM:settings.xNib*effectiveNib,nibMM:effectiveNib,scale:1,spaceMult:1,capStyle:'simple' as const},run=measureRun(measurementText,SCRIPT_PROFILES[settings.script],ctx),slant=settings.script==='Copperplate'?settings.xHeightMM/Math.tan(55*Math.PI/180):0;
  const capacities=visibleSpans.map(span=>Math.max(0,span.x2-span.x1-slant)),availableMM=capacities.reduce((sum,value)=>sum+value,0),placements:EstimatedSpanPlacement[]=[];let remaining=run.totalAdvanceMM;
  visibleSpans.forEach((span,index)=>{if(remaining<=0)return;const consumed=Math.min(remaining,capacities[index]);if(consumed>0)placements.push({...span,consumedMM:consumed,slantShiftMM:slant});remaining-=consumed;});
  return{visibleSpans,placements,requiredMM:run.totalAdvanceMM,availableMM,remainingMM:Math.max(0,remaining),fits:remaining<=.001};
}
