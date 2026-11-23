import { rotatePoint } from './geometry';
import { placeSheetTags } from '../guides/sheet-labels';
import type { Scene } from '../woven/vector-export';
import { DEFAULT_DESIGN, parseDesign, type Design } from '@/lib/woven/design';
import { buildWovenModel } from '@/lib/woven/model';
import type { Frame, WovenElement } from './types';

// Layout owns placement, size and rotation; only generation settings are stored here.
export type WovenSettings = Omit<Design, 'version'|'paper'|'orientation'|'width'|'height'|'rotation'|'centerX'|'centerY'|'layoutFrame'>;
export function createDefaultWovenSettings(): WovenSettings {
  return wovenSettings(DEFAULT_DESIGN);
}
export function wovenSettings(design:Design):WovenSettings {
  const {version,paper,orientation,width,height,rotation,centerX,centerY,layoutFrame,...settings}=design;
  void [version,paper,orientation,width,height,rotation,centerX,centerY,layoutFrame];
  return settings;
}
export function validateWovenSettings(settings:unknown):WovenSettings {
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('Invalid Woven settings.');
  return wovenSettings(parseDesign({...settings,width:165,height:165,rotation:0,version:1}));
}
export function layoutWovenDesign(element:WovenElement,frame:Frame=element.frame):Design {
  return wovenDesignForFrame(element.settings,frame);
}
export function wovenDesignForFrame(settings:WovenSettings,frame:Frame):Design {
  return {...DEFAULT_DESIGN,...settings,width:frame.width,height:frame.height,rotation:0,centerX:frame.width/2,centerY:frame.height/2,layoutFrame:true};
}
export function layoutWovenModel(element:WovenElement,frame:Frame=element.frame) {
  return buildWovenModel(layoutWovenDesign(element,frame),{furniture:false});
}

export function layoutWovenTags(scene: Pick<Scene,'tags'|'strokes'>, frame: Frame, rotation: number, page: {width:number;height:number}) {
  if (!scene.tags?.length) return [];
  const centre = {x:frame.x+frame.width/2,y:frame.y+frame.height/2};
  const locate = (p:{x:number;y:number}) => rotatePoint({x:p.x+frame.x,y:p.y+frame.y},centre,rotation);
  return placeSheetTags(scene.tags.map(t => ({...t,point:locate(t.point)})),
    scene.strokes.map(s => ({width:s.width,points:s.points.map(locate)})), {w:page.width,h:page.height});
}
