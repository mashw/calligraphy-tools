'use client';
import {createContext,useContext,useRef,useState} from 'react';
import {calculateStraightGuidelines} from '@/lib/guides/straight/model';
import {automatic,center,editableGuides,guideKey,guideTransform,rest,rowBox,rowKey,type Arrangement,type Pose} from '@/lib/layout/guideline-arrangement';
import type { GuidelinesElement } from '@/lib/layout/types';
import {activeCustomMask,clipCustomMaskPolyline,CUSTOM_MASK_PADDING_MM} from '@/lib/layout/custom-mask';
import {normalizeDegrees} from '@/lib/layout/geometry';

type Selection={id:string;row:number}|null;
const Context=createContext<{selection:Selection;select:(s:Selection)=>void}>({selection:null,select:()=>{}});
export function GuidelineEditing({children}:{children:React.ReactNode}) {
  const [selection,select]=useState<Selection>(null);
  return <Context.Provider value={{selection,select}}>{children}</Context.Provider>;
}
export const useGuidelineEditing=()=>useContext(Context);
function withPose(a:Arrangement,key:string|null,p:Pose):Arrangement {
  if(key===null)return {...a,group:p};
  const rows={...a.rows};
  if(p.x||p.y||p.angle)rows[key]=p;else delete rows[key];
  return {...a,rows};
}
const btn='rounded border px-2 py-1 text-xs hover:bg-slate-50';
export function ArrangementControls({element,save}:{element:GuidelinesElement;save:(a:Arrangement|undefined)=>void}) {
  const {selection,select}=useGuidelineEditing();
  const active=selection?.id===element.id;
  const a=element.mask.arrangement??automatic;
  const {guideSets}=calculateStraightGuidelines(element.frame,element.settings);
  const visible=editableGuides(element,guideSets).filter(g=>g.ascLine[0].y<element.frame.height-element.settings.margins.bottom);
  const index=Math.min(selection?.row??0,visible.length-1);
  const g=visible[index];
  const key=a.released&&g?guideKey(element,g,index):null;
  const pose=key?a.rows[key]??rest:a.group;
  const stale=Object.keys(a.rows).filter(k=>!visible.some((g,i)=>guideKey(element,g,i)===k||rowKey(element,g.sourceRow??i)===k)).length;
  const mask=activeCustomMask(element),t=guideTransform(element,g,index);
  const sections=a.released&&g&&g.section===undefined&&mask?clipCustomMaskPolyline(mask,element.frame,element.mask.internalPaddingMM??CUSTOM_MASK_PADDING_MM,g.baseLine.map(t.apply)).map(part=>part.map(t.inverse)):[];
  function separate() {
    const x=g.baseLine[0].x,width=g.baseLine.at(-1)!.x-x;
    const cuts=sections.slice(1).map((part,i)=>((sections[i].at(-1)!.x+part[0].x)/2-x)/width);
    save({...a,cuts:{...a.cuts,[rowKey(element,g.sourceRow??index)]:cuts}});
  }
  return <fieldset disabled={element.locked} className="space-y-2">
    <button className={btn} aria-pressed={active} onClick={()=>select(active?null:{id:element.id,row:0})}>{active?'Finish editing guidelines':'Edit guidelines within mask'}</button>
    {!!stale&&<p className="text-xs">{stale} row adjustment(s) retained for a different script or frame height.</p>}
    {active&&<><div className="flex flex-wrap items-center gap-2 text-xs"><strong>{a.released?'Released':'Grouped'}</strong>
      <button className={btn} onClick={()=>save({...a,released:!a.released})}>{a.released?'Regroup guidelines':'Release guidelines'}</button>
      {a.released&&<select aria-label="Writing row" value={index} onChange={e=>select({id:element.id,row:Number(e.target.value)})}>{visible.map((g,i)=><option key={i} value={i}>Row {(g.sourceRow??i)+1}{g.section!==undefined?' · section '+(g.section+1):''}</option>)}</select>}</div>
      {sections.length>1&&sections.length<=256&&<button className={btn} onClick={separate}>Separate visible sections</button>}
      <fieldset disabled={a.released&&!g} className="grid grid-cols-3 gap-1">{(['x','y','angle'] as const).map(field=><label key={field} className="text-xs">{field==='angle'?'Rotation (°)':field.toUpperCase()+' (mm)'}<input className="w-full rounded border p-1" type="number" step=".1" value={Number(pose[field].toFixed(2))} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))save(withPose(a,key,{...pose,[field]:e.target.valueAsNumber}));}}/></label>)}</fieldset>
      <div className="flex flex-wrap gap-1">
        <button className={btn} onClick={()=>save(withPose(a,key,{...pose,angle:0}))}>Reset rotation</button>
        <button className={btn} onClick={()=>save(withPose(a,key,rest))}>{a.released?'Reset selected row':'Reset group position and rotation'}</button>
        {a.released&&<button className={btn} onClick={()=>save({...a,rows:{},cuts:undefined})}>Reset all individual adjustments</button>}
        <button className={btn} onClick={()=>save(undefined)}>Restore automatic arrangement</button></div></>}
  </fieldset>;
}
type Gesture={pointer:number;matrix:DOMMatrix;start:DOMPoint;pivot:{x:number;y:number};pose:Pose;key:string|null;rotate:boolean;original:Arrangement};
export function GuidelineHandles({element,preview,commit}:{element:GuidelinesElement;preview:(a:Arrangement|null)=>void;commit:(a:Arrangement)=>void}) {
  const {selection,select}=useGuidelineEditing();
  const root=useRef<SVGGElement>(null),gesture=useRef<Gesture|null>(null);
  const a=element.mask.arrangement??automatic,{frame}=element;
  const {guideSets}=calculateStraightGuidelines(frame,element.settings);
  const rows=editableGuides(element,guideSets).filter(g=>g.ascLine[0].y<frame.height-element.settings.margins.bottom);
  const index=Math.min(selection?.row??0,rows.length-1);
  const box=a.released&&rows[index]?rowBox(rows[index]):{x:0,y:0,width:frame.width,height:frame.height};

  function start(e:React.PointerEvent,i:number,rotate:boolean) {
    if((a.released&&!rows[i])||e.altKey||e.button!==0||gesture.current||!root.current)return;
    const screen=root.current.getScreenCTM();if(!screen)return;
    e.stopPropagation();e.preventDefault();
    let matrix=screen.inverse();
    const key=a.released?guideKey(element,rows[i],i):null;
    const pose=key?a.rows[key]??rest:a.group;
    if(key){
      const inverse=guideTransform(element,rows[i],i).parentInverse;
      const origin=inverse(rest),ex=inverse({x:1,y:0}),ey=inverse({x:0,y:1});
      matrix=new DOMMatrix([ex.x-origin.x,ex.y-origin.y,ey.x-origin.x,ey.y-origin.y,origin.x,origin.y]).multiply(matrix);
    }
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix);
    const pivot=center(key?rowBox(rows[i]):{width:frame.width,height:frame.height});
    gesture.current={pointer:e.pointerId,matrix,start:p,pivot:{x:pivot.x+pose.x,y:pivot.y+pose.y},pose,key,rotate,original:a};
    select({id:element.id,row:i});
    root.current.setPointerCapture(e.pointerId);
  }
  function update(e:React.PointerEvent,finish:boolean) {
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(g.matrix);
    const angle=(q:DOMPoint)=>Math.atan2(q.y-g.pivot.y,q.x-g.pivot.x)*180/Math.PI;
    const pose=g.rotate?{...g.pose,angle:normalizeDegrees(g.pose.angle+angle(p)-angle(g.start))}:{...g.pose,x:g.pose.x+p.x-g.start.x,y:g.pose.y+p.y-g.start.y};
    const next=withPose(g.original,g.key,pose);
    if(finish){gesture.current=null;preview(null);commit(next);}else preview(next);
  }
  const transform=guideTransform(element,a.released?rows[index]:undefined,a.released?index:-1);
  const cx=box.x+box.width/2,cy=box.y;
  return <g ref={root} data-no-export="true" data-camera-interactive="true" transform={`translate(${frame.x} ${frame.y})`} onPointerMove={e=>update(e,false)} onPointerUp={e=>update(e,true)} onPointerCancel={()=>{gesture.current=null;preview(null);}}>
    <g clipPath={`url(#layout-${element.id}-shape-mask)`}>{rows.map((g,i)=><rect key={i} {...rowBox(g)} transform={guideTransform(element,g,i).svg} fill="transparent" style={{cursor:'move'}} data-edit-row={i} onPointerDown={e=>start(e,i,false)}/>)}</g>
    <g transform={transform.svg} pointerEvents="none" fill="none" stroke="#4f46e5" strokeWidth=".45"><rect {...box} strokeDasharray="2 2"/><line x1={cx} x2={cx} y1={cy} y2={cy-4}/>
      <circle aria-label="Rotate guidelines" cx={cx} cy={cy-4} r="2.4" fill="white" pointerEvents="all" style={{cursor:'grab'}} onPointerDown={e=>start(e,index,true)}/></g>
  </g>;
}
