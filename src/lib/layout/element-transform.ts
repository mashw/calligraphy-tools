import { buildCalligramModel } from '@/lib/calligram/model';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import { boundsOfRotatedFrame, frameCenter } from './geometry';
import type { Frame, LayoutElement } from './types';

const visualBounds = new WeakMap<object, { width: number; height: number; bounds: Frame }>();

export function elementVisualFrame(element:LayoutElement,frame:Frame=element.frame):Frame{
  if(element.type!=='curved-title'&&element.type!=='calligram')return frame;
  const { width, height } = frame;
  const settings = element.settings;
  let cached = visualBounds.get(settings);
  if (!cached || cached.width !== width || cached.height !== height) {
    const box = { w: width, h: height };
    const bounds = element.type === 'curved-title'
      ? buildCurvedTitleModel(box, element.settings).visualBounds
      : buildCalligramModel(box, element.settings).visualBounds;
    cached = { width, height, bounds };
    visualBounds.set(settings, cached);
  }
  const { bounds } = cached;
  return{x:frame.x+bounds.x,y:frame.y+bounds.y,width:bounds.width,height:bounds.height};
}

export const elementRotationCenter=(element:LayoutElement,frame:Frame=element.frame)=>frameCenter(elementVisualFrame(element,frame));

export function rotatedElementBounds(element: LayoutElement, frame: Frame = element.frame) {
  const visual = elementVisualFrame(element, frame);
  return boundsOfRotatedFrame(visual, element.type === 'page' ? 0 : element.rotationDeg ?? 0, frameCenter(visual));
}
