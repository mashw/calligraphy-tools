import { PAPERS_MM, type Orientation, type PaperId } from '@/lib/curve-helpers';
import { createDefaultGuidelinesSettings, type GuidelinesSettings } from '@/lib/guides/straight/settings';
import { createDefaultShapeSettings, isConstrainedShape, type ShapeSettings } from './shape';

export type ElementType = 'page' | 'guidelines' | 'calligram' | 'curved-title' | 'shape';
export type Frame = { x: number; y: number; width: number; height: number };
export type Margins = { top: number; right: number; bottom: number; left: number };
type ElementBase = { id: string; name: string; frame: Frame; locked: boolean };
type MovableElementBase = ElementBase & { paddingMM: number };
export type PageElement = ElementBase & { id: 'page'; type: 'page'; locked: true; settings: { paper: PaperId; orientation: Orientation; margins: Margins; centerLines: { vertical: boolean; horizontal: boolean } } };
export type GuidelinesElement = MovableElementBase & { type: 'guidelines'; settings: GuidelinesSettings };
export type ShapeElement = MovableElementBase & { type: 'shape'; settings: ShapeSettings };
export type PlaceholderElement = MovableElementBase & { type: 'calligram' | 'curved-title' };
export type LayoutElement = PageElement | GuidelinesElement | ShapeElement | PlaceholderElement;
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function pageSize(element: PageElement) { const raw=PAPERS_MM[element.settings.paper]; return element.settings.orientation==='landscape'&&raw.w<raw.h||element.settings.orientation==='portrait'&&raw.w>raw.h?{width:raw.h,height:raw.w}:{width:raw.w,height:raw.h}; }
export const pageElement = (): PageElement => ({ id:'page',type:'page',name:'Page',locked:true,settings:{paper:'A4',orientation:PAPERS_MM.A4.defaultOrientation,margins:{top:15,right:10,bottom:15,left:10},centerLines:{vertical:false,horizontal:false}},frame:{x:0,y:0,width:210,height:297} });
const labels = { guidelines:'Guidelines',calligram:'Calligram','curved-title':'Curved title',shape:'Shape' } as const;
export function newElement(type: Exclude<ElementType,'page'>, count:number, page:{width:number;height:number}): LayoutElement {
  const proportional=type==='calligram'||type==='curved-title';
  const width=Math.min(type==='guidelines'?150:type==='shape'?40:72,Math.max(20,page.width-30)); const height=Math.min(type==='guidelines'?180:type==='shape'?35:proportional?65:50,Math.max(20,page.height-30));
  const base={id:`${type}-${crypto.randomUUID()}`,type,name:`${labels[type]} ${count}`,locked:false,paddingMM:0,frame:{x:Math.max(5,(page.width-width)/2),y:Math.max(5,(page.height-height)/2),width,height}};
  if(type==='guidelines') { const settings=createDefaultGuidelinesSettings(); settings.margins={top:0,right:0,bottom:0,left:0}; return {...base,type,settings}; }
  if(type==='shape') return {...base,type,settings:createDefaultShapeSettings()};
  return {...base,type};
}
export function isProportional(element:LayoutElement){return element.type==='calligram'||element.type==='shape'&&isConstrainedShape(element.settings);}
