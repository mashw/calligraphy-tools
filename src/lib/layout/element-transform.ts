import { buildCalligramModel } from '@/lib/calligram/model';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import { boundsOfRotatedFrame, frameCenter } from './geometry';
import type { Frame, LayoutElement } from './types';

export function elementVisualFrame(element:LayoutElement,frame:Frame=element.frame):Frame{
  if(element.type!=='curved-title'&&element.type!=='calligram')return frame;
  const bounds=element.type==='curved-title'
    ?buildCurvedTitleModel({w:frame.width,h:frame.height},element.settings).visualBounds
    :buildCalligramModel({w:frame.width,h:frame.height},element.settings).visualBounds;
  return{x:frame.x+bounds.x,y:frame.y+bounds.y,width:bounds.width,height:bounds.height};
}

export const elementRotationCenter=(element:LayoutElement,frame:Frame=element.frame)=>frameCenter(elementVisualFrame(element,frame));

export const rotatedElementBounds=(element:LayoutElement,frame:Frame=element.frame)=>
  boundsOfRotatedFrame(elementVisualFrame(element,frame),element.type==='page'?0:element.rotationDeg??0,elementRotationCenter(element,frame));
