import type { GuidelinesElement } from './types';
import type { calculateStraightGuidelines } from '../guides/straight/model';

type Point = {x:number;y:number};
export type Pose = Point & {angle:number};
export type Arrangement = {version:1;released:boolean;group:Pose;rows:Record<string,Pose>;cuts?:Record<string,number[]>};
export const rest:Pose = {x:0,y:0,angle:0};
export const automatic:Arrangement = {version:1,released:false,group:rest,rows:{}};
type Guide = ReturnType<typeof calculateStraightGuidelines>['guideSets'][number] & {sourceRow?:number;section?:number;left?:number;right?:number};
export function editableGuides(element:GuidelinesElement|undefined,guides:Guide[]):Guide[] {
  if(!element?.mask?.enabled||!element.mask.arrangement?.cuts)return guides;
  const cuts=element.mask.arrangement.cuts;
  return guides.flatMap((g,i)=>{
    const breaks=cuts[rowKey(element,i)];
    if(!breaks)return [{...g,sourceRow:i}];
    const x=g.baseLine[0].x,width=g.baseLine.at(-1)!.x-x;
    const bounds=[0,...breaks,1].map(f=>x+width*f);
    return bounds.slice(1).map((right,j)=>({...g,sourceRow:i,section:j,left:bounds[j],right}));
  });
}
export function guideKey(element:GuidelinesElement,g:Guide|undefined,i:number) {
  return rowKey(element,g?.sourceRow??i)+(g?.section===undefined?'':'/'+g.section);
}

// Rows are generated top-down. Resizing adds/removes rows at the bottom.
// A different script gets its own namespace. Hidden overrides can be recovered.
export function rowKey(element:GuidelinesElement,index:number) {
  return element.settings.script+'#'+index;
}
export function rowBox(guide:Guide) {
  const x=guide.left??guide.baseLine[0].x,y=guide.ascLine[0].y;
  return {x,y,width:(guide.right??guide.baseLine.at(-1)!.x)-x,height:guide.descLine[0].y-y};
}
export function center(box:{width:number;height:number;x?:number;y?:number}) {
  return {x:(box.x??0)+box.width/2,y:(box.y??0)+box.height/2};
}
export function rigid(pose:Pose,pivot:Point) {
  const radians=pose.angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const e=pose.x+pivot.x*(1-c)+pivot.y*s,f=pose.y+pivot.y*(1-c)-pivot.x*s;
  return {
    svg:`matrix(${c} ${s} ${-s} ${c} ${e} ${f})`,
    apply:(p:Point)=>({x:c*p.x-s*p.y+e,y:s*p.x+c*p.y+f}),
    inverse:(p:Point)=>({x:c*(p.x-e)+s*(p.y-f),y:-s*(p.x-e)+c*(p.y-f)}),
  };
}
export function guideTransform(element:GuidelinesElement,guide?:Guide,index=-1) {
  const a=element.mask?.enabled?element.mask.arrangement:undefined;
  const group=rigid(a?.group??rest,center({width:element.frame.width,height:element.frame.height}));
  const row=rigid(a?.rows[rowKey(element,guide?.sourceRow??index)]??rest,guide?center(rowBox({...guide,left:undefined,right:undefined})):rest);
  const section=rigid(guide?.section===undefined?rest:a?.rows[guideKey(element,guide,index)]??rest,guide?center(rowBox(guide)):rest);
  return {svg:[group.svg,row.svg,section.svg].join(' '),apply:(p:Point)=>group.apply(row.apply(section.apply(p))),inverse:(p:Point)=>section.inverse(row.inverse(group.inverse(p))),parentInverse:guide?.section===undefined?group.inverse:(p:Point)=>row.inverse(group.inverse(p))};

}
export function validateArrangement(value:unknown) {
  const a=value as Partial<Arrangement>|null;
  const valid=(p:Pose|undefined)=>p&&[p.x,p.y,p.angle].every(Number.isFinite);
  if(a?.cuts!==undefined&&(!a.cuts||typeof a.cuts!=='object'||Array.isArray(a.cuts)||!Object.entries(a.cuts).every(([key,v])=>/^.+#\d+$/.test(key)&&Array.isArray(v)&&v.length>0&&v.length<256&&v.every((f,i)=>Number.isFinite(f)&&f>0&&f<1&&(!i||v[i-1]<f)))))throw new Error('Invalid guideline sections.');
  if (!a||a.version!==1||typeof a.released!=='boolean'||!valid(a.group)||!a.rows||Array.isArray(a.rows)||typeof a.rows!=='object'||
      !Object.entries(a.rows).every(([key,p])=>/^.+#\d+(?:\/\d+)?$/.test(key)&&valid(p))) throw new Error('Invalid guideline arrangement.');
}
