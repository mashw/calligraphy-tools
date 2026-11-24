import { rotatePoint } from './geometry';
import { placeSheetTags } from '../guides/sheet-labels';
import type { Scene } from '../woven/vector-export';
import { DEFAULT_DESIGN, parseDesign, type Design } from '@/lib/woven/design';
import { buildWovenModel, buildWovenRouteModel } from '@/lib/woven/model';
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
type WovenPreview = { geometryDesign: Design; route: ReturnType<typeof buildWovenRouteModel> };
const previews = new WeakMap<WovenSettings, Map<string, WovenPreview>>();
const textOnlySettings = new WeakMap<WovenSettings, WovenSettings>();

// Text editing updates the saved settings. Keep the existing geometry as the
// preview source until a geometry or appearance control actually changes it.
export function withWovenTextSettings(previous: WovenSettings, next: WovenSettings) {
  textOnlySettings.set(next, textOnlySettings.get(previous) ?? previous);
  return next;
}

export function layoutWovenPreview(settings: WovenSettings, width: number, height: number) {
  const geometrySettings = textOnlySettings.get(settings) ?? settings;
  let sizes = previews.get(geometrySettings);
  if (!sizes) {
    sizes = new Map();
    previews.set(geometrySettings, sizes);
  }
  const size = String(width) + ":" + height;
  const frame = { x: 0, y: 0, width, height };
  let preview = sizes.get(size);
  if (!preview) {
    const geometryDesign = wovenDesignForFrame(geometrySettings, frame);
    preview = { geometryDesign, route: buildWovenRouteModel(geometryDesign) };
    if (sizes.size >= 3) sizes.delete(sizes.keys().next().value!);
    sizes.set(size, preview);
  }
  const design = settings === geometrySettings ? preview.geometryDesign : wovenDesignForFrame(settings, frame);
  return { ...preview, design };
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
