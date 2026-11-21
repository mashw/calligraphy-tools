import { calculateStraightGuidelines, straightRow } from '../guides/straight/model';
import { activeCustomMask, customMaskGeometry, polygonWritingSpans, CUSTOM_MASK_PADDING_MM } from './custom-mask';
import { editableGuides, guideTransform } from './guideline-arrangement';
import { shapeBoundaryPoints } from './shape';
import type { GuidelinesElement } from './types';

export function maskedGuideField(element: GuidelinesElement | undefined, model: ReturnType<typeof calculateStraightGuidelines>) {
  if (!element?.mask?.enabled || model.rowStepMM <= 0) return;
  const { frame, mask, settings } = element;
  const custom = activeCustomMask(element);
  const boundary = custom ? customMaskGeometry(custom, frame)
    : mask.kind !== 'customSvg' ? {points: shapeBoundaryPoints(mask.kind, frame.width, frame.height, mask.cornerRadiusMM), error: 0} : undefined;
  if (!boundary?.points.length) return;
  const padding = custom ? mask.internalPaddingMM ?? CUSTOM_MASK_PADDING_MM : 0;
  const corners = [{x:0,y:0},{x:frame.width,y:0},{x:0,y:frame.height},{x:frame.width,y:frame.height}];
  const local = corners.map(guideTransform(element).inverse);
  const first = settings.margins.top + model.ascMM + model.xMM;
  const indices = new Set<number>();
  const low = Math.floor((Math.min(...local.map(p=>p.y))-first-model.descMM)/model.rowStepMM);
  const high = Math.ceil((Math.max(...local.map(p=>p.y))-settings.margins.top)/model.rowStepMM);
  for (let index=low; index<=high; index++) indices.add(index);
  for (const key of Object.keys(mask.arrangement?.rows ?? {})) {
    const [script, suffix] = key.split('#');
    if (script === settings.script) indices.add(Number(suffix.split('/')[0]));
  }
  const original = editableGuides(element, model.guideSets);
  return [...indices].flatMap(index => {
    const y = first + index * model.rowStepMM;
    const originals = mask.arrangement?.cuts ? original.filter((row,i)=>(row.sourceRow??i)===index) : [];
    if (!originals.length) originals.push(model.guideSets[index] ?? straightRow(settings,model,y,settings.margins.left,frame.width-settings.margins.right));
    return originals.flatMap((piece,i) => {
      const transform = guideTransform(element,piece,index);
      const points = corners.map(transform.inverse);
      const top = piece.ascLine[0].y, bottom = piece.descLine[0].y;
      if (bottom < Math.min(...points.map(p=>p.y)) || top > Math.max(...points.map(p=>p.y))) return [];
      const left = Math.max(i ? piece.left! : -Infinity, Math.min(...points.map(p=>p.x))-1);
      const right = Math.min(i+1<originals.length ? piece.right! : Infinity, Math.max(...points.map(p=>p.x))+1);
      if (right<=left) return [];
      const guide = straightRow(settings,model,y,left,right);
      const middle = y-model.xMM/2;
      const spans = polygonWritingSpans({points:boundary.points.map(transform.inverse),error:boundary.error},padding+.91,
        {x1:left,x2:right,top:middle,bottom:middle,baseline:middle,slope:0},[]);
      const span=spans[0];
      return [{guide,transform,indicator:span ? Math.min(span[0]+2,(span[0]+span[1])/2) : undefined}];
    });
  });
}

export function fieldSlants(guide: ReturnType<typeof straightRow>, spacing:number, angle:number, anchor:number) {
  const top=guide.ascLine[0].y, bottom=guide.descLine[0].y;
  const slope=1/Math.tan(-angle*Math.PI/180);
  if (!(spacing>0) || !Number.isFinite(slope) || Math.abs(slope)>1000) return [];
  const left=guide.baseLine[0].x, right=guide.baseLine.at(-1)!.x;
  const start=Math.ceil((left-Math.max(top*slope,bottom*slope)-anchor)/spacing);
  const end=Math.floor((right-Math.min(top*slope,bottom*slope)-anchor)/spacing);
  return Array.from({length:Math.max(0,end-start+1)},(_,i)=>{
    const x=anchor+(start+i)*spacing;
    return {x1:x+top*slope,y1:top,x2:x+bottom*slope,y2:bottom};
  });
}
