import { PAPERS_MM, type Orientation, type PaperId } from '@/lib/curve-helpers';
import { createDefaultGuidelinesSettings, type GuidelinesSettings } from '@/lib/guides/straight/settings';
import { createDefaultShapeSettings, isConstrainedShape, type ShapeSettings } from './shape';
import { createDefaultCurvedTitleSettings, type CurvedTitleSettings } from '@/lib/curved-title/settings';
import { createDefaultCalligramSettings, type CalligramSettings } from '@/lib/calligram/settings';
import type { ArtworkDocument } from './artwork';

export type ElementType = 'page' | 'guidelines' | 'calligram' | 'curved-title' | 'shape' | 'artwork';
export type Frame = { x: number; y: number; width: number; height: number };
export type Margins = { top: number; right: number; bottom: number; left: number };
export type LayoutPaperId = PaperId | 'Custom';
type ElementBase = { id: string; name: string; frame: Frame; locked: boolean };
type MovableElementBase = ElementBase & { paddingMM: number };
export type PageElement = ElementBase & { id: 'page'; type: 'page'; locked: true; settings: { paper: LayoutPaperId; orientation: Orientation; customWidthMM: number; customHeightMM: number; margins: Margins; centerLines: { vertical: boolean; horizontal: boolean } } };
export type GuidelinesElement = MovableElementBase & { type: 'guidelines'; allowPartialGuidelines: boolean; fitText: string; settings: GuidelinesSettings };
export type ShapeElement = MovableElementBase & { type: 'shape'; settings: ShapeSettings };
export type CurvedTitleElement = MovableElementBase & { type: 'curved-title'; settings: CurvedTitleSettings };
export type CalligramElement = MovableElementBase & { type: 'calligram'; settings: CalligramSettings };
export type ArtworkElement = MovableElementBase & { type:'artwork'; sourceFilename:string; document:ArtworkDocument; intrinsicAspectRatio:number; settings:{lockProportions:boolean;opacity:number;occludeLowerLayers:boolean;occludeClosedShapes:boolean} };
export type LayoutElement = PageElement | GuidelinesElement | ShapeElement | CurvedTitleElement | CalligramElement | ArtworkElement;
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type ResizeAspectMode = 'free' | 'corners' | 'all';

export function pageSize(element: PageElement) {
  if (element.settings.paper === 'Custom') return { width: element.settings.customWidthMM, height: element.settings.customHeightMM };
  const raw=PAPERS_MM[element.settings.paper]; return element.settings.orientation==='landscape'&&raw.w<raw.h||element.settings.orientation==='portrait'&&raw.w>raw.h?{width:raw.h,height:raw.w}:{width:raw.w,height:raw.h};
}
export const pageElement = (): PageElement => ({ id:'page',type:'page',name:'Page',locked:true,settings:{paper:'A4',orientation:PAPERS_MM.A4.defaultOrientation,customWidthMM:210,customHeightMM:297,margins:{top:15,right:10,bottom:15,left:10},centerLines:{vertical:false,horizontal:false}},frame:{x:0,y:0,width:210,height:297} });
const labels = { guidelines:'Guidelines',calligram:'Calligram','curved-title':'Curved title',shape:'Shape' } as const;
export function newElement(type: Exclude<ElementType,'page'|'artwork'>, count:number, page:{width:number;height:number}): LayoutElement {
  const proportional=type==='calligram';
  const width=Math.min(type==='guidelines'?150:type==='shape'?40:type==='curved-title'?page.width*.8:type==='calligram'?140:72,Math.max(20,page.width-30)); const height=type==='calligram'?width:Math.min(type==='guidelines'?180:type==='shape'?35:type==='curved-title'?60:proportional?65:50,Math.max(20,page.height-30));
  const base={id:`${type}-${crypto.randomUUID()}`,type,name:`${labels[type]} ${count}`,locked:false,paddingMM:0,frame:{x:Math.max(5,(page.width-width)/2),y:type==='curved-title'?Math.max(5,(page.height-height)*.2):Math.max(5,(page.height-height)/2),width,height}};
  if(type==='guidelines') { const settings=createDefaultGuidelinesSettings(); settings.margins={top:0,right:0,bottom:0,left:0}; return {...base,type,allowPartialGuidelines:true,fitText:'',settings}; }
  if(type==='shape') return {...base,type,settings:createDefaultShapeSettings()};
  if(type==='curved-title') return {...base,type,settings:createDefaultCurvedTitleSettings()};
  if(type==='calligram') return {...base,type,settings:createDefaultCalligramSettings()};
  throw new Error(`Unsupported element type: ${type satisfies never}`);
}
export function resizeAspectMode(element: LayoutElement): ResizeAspectMode {
  if(element.type==='artwork')return element.settings.lockProportions?'all':'free';
  if (
    element.type === 'calligram'
    || (element.type === 'shape' && isConstrainedShape(element.settings))
  ) {
    return 'all';
  }

  return 'corners';
}

export function isProportional(element: LayoutElement) {
  return resizeAspectMode(element) === 'all';
}
