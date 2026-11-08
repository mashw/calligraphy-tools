import { DEFAULT_DESIGN, parseDesign, type Design } from '@/lib/woven/design';
import { buildWovenModel } from '@/lib/woven/model';
import type { Frame, WovenElement } from './types';

// Layout owns placement, size and rotation; only generation settings are stored here.
export type WovenSettings = Omit<Design, 'version'|'paper'|'orientation'|'width'|'height'|'rotation'|'centerX'|'centerY'>;
export function createDefaultWovenSettings(): WovenSettings {
  return wovenSettings(DEFAULT_DESIGN);
}
export function wovenSettings(design:Design):WovenSettings {
  const {version,paper,orientation,width,height,rotation,centerX,centerY,...settings}=design;
  void [version,paper,orientation,width,height,rotation,centerX,centerY];
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
  return {...DEFAULT_DESIGN,...settings,width:frame.width,height:frame.height,rotation:0,centerX:frame.width/2,centerY:frame.height/2};
}
export function layoutWovenModel(element:WovenElement,frame:Frame=element.frame) {
  return buildWovenModel(layoutWovenDesign(element,frame),{furniture:false});
}
