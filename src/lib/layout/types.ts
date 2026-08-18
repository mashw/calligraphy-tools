import { PAPERS_MM, type Orientation, type PaperId } from '@/lib/curve-helpers';
import { createDefaultGuidelinesSettings, type GuidelinesSettings } from '@/lib/guides/straight/settings';

export type ElementType = 'page' | 'guidelines' | 'calligram' | 'curved-title' | 'shape';
export type Frame = { x: number; y: number; width: number; height: number };
type ElementBase = { id: string; name: string; frame: Frame; locked: boolean };
export type PageElement = ElementBase & { id: 'page'; type: 'page'; locked: true; settings: { paper: PaperId; orientation: Orientation } };
export type GuidelinesElement = ElementBase & { type: 'guidelines'; settings: GuidelinesSettings };
export type PlaceholderElement = ElementBase & { type: 'calligram' | 'curved-title' | 'shape' };
export type LayoutElement = PageElement | GuidelinesElement | PlaceholderElement;
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function pageSize(element: PageElement) { const raw=PAPERS_MM[element.settings.paper]; return element.settings.orientation==='landscape'&&raw.w<raw.h||element.settings.orientation==='portrait'&&raw.w>raw.h?{width:raw.h,height:raw.w}:{width:raw.w,height:raw.h}; }
export const pageElement = (): PageElement => ({ id:'page',type:'page',name:'Page',locked:true,settings:{paper:'A4',orientation:PAPERS_MM.A4.defaultOrientation},frame:{x:0,y:0,width:210,height:297} });
const labels = { guidelines:'Guidelines',calligram:'Calligram','curved-title':'Curved title',shape:'Shape' } as const;
export function newElement(type: Exclude<ElementType,'page'>, count:number, page:{width:number;height:number}): LayoutElement {
  const proportional=type==='calligram'||type==='curved-title';
  const width=Math.min(type==='guidelines'?150:72,Math.max(20,page.width-30)); const height=Math.min(type==='guidelines'?180:proportional?65:50,Math.max(20,page.height-30));
  const base={id:`${type}-${crypto.randomUUID()}`,type,name:`${labels[type]} ${count}`,locked:false,frame:{x:Math.max(5,(page.width-width)/2),y:Math.max(5,(page.height-height)/2),width,height}};
  if(type==='guidelines') return {...base,type,settings:createDefaultGuidelinesSettings()};
  return {...base,type};
}
export function isProportional(element:LayoutElement){return element.type==='calligram'||element.type==='curved-title';}
