'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import EditorWorkspace from '@/components/editor/EditorWorkspace';
import PreviewToolbar from '@/components/editor/PreviewToolbar';
import { useEditorCamera } from '@/components/editor/useEditorCamera';
import { Button, NumericInput, Select } from '@/components/editor/Controls';
import DisclosureSection from '@/components/layout/DisclosureSection';
import WovenSettings from '@/components/woven/WovenSettings';
import { WovenScene } from '@/components/woven/WovenRenderer';
import { PAPERS_MM } from '@/lib/curve-helpers';
import { pointBounds } from '@/lib/editor/camera';
import { SHAPE_OPTIONS, shapePathD, type ShapeKind } from '@/lib/paths/presets';
import { pageSize, type Design } from '@/lib/woven/design';
import { pointsD, scenePdf, sceneSvg } from '@/lib/woven/vector-export';
import { canJoin, initialSheet, renderSheet, rememberCrossing, sameCrossing, strand, strandRoute, topology, warnings,
  type Choice, type Sheet, type Strand } from '@/lib/interlace/model';
import { fromPath, importSvg, openSheet } from '@/lib/interlace/document';

import { CRICUT_MATS, type CricutMatId } from '@/lib/layout/plotter-export';
import { buildInterlacePlotterExport, DEFAULT_INTERLACE_PLOTTER_OPTIONS } from '@/lib/interlace/plotter-export';

import { compositionPresets } from '@/lib/paths/composition-presets';

type Mode = 'Move'|'Crossings'|'Joins';
const row='flex flex-wrap items-center gap-2';
function download(data:BlobPart,type:string,name:string) {
  const url=URL.createObjectURL(new Blob([data],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function measure(label:string,value:number,change:(v:number)=>void,min:number,max:number,step=1) {
  return <label className="grid grid-cols-2 items-center gap-2">{label}<NumericInput type="number" aria-label={label}
    value={Number(value.toFixed(3))} min={min} max={max} step={step} onChange={e=>{
      const v=e.target.valueAsNumber;if(Number.isFinite(v)&&v>=min&&v<=max) change(v);
    }}/></label>;
}
export default function InterlaceStudio() {
  const [sheet,setSheet]=useState(initialSheet),[active,setActive]=useState('rosette');
  const [mode,setMode]=useState<Mode>('Move'),[simplify,setSimplify]=useState(false),[busy,setBusy]=useState(false);
  const [source,setSource]=useState('rosette'),[notice,setNotice]=useState(''),[picked,setPicked]=useState<Choice|null>(null);
  const [plotOpen,setPlotOpen]=useState(false);
  const [mat,setMat]=useState<CricutMatId>('12x12');
  const [plotOptions,setPlotOptions]=useState(DEFAULT_INTERLACE_PLOTTER_OPTIONS);
  const plot=useMemo(()=>plotOpen?buildInterlacePlotterExport(sheet,mat,plotOptions):null,[sheet,mat,plotOptions,plotOpen]);
  const [contrast,setContrast]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const [onlySelected,setOnlySelected]=useState(false);
  const svg=useRef<SVGSVGElement>(null),file=useRef<HTMLInputElement>(null);
  const drag=useRef<{sheet:Sheet;id:string;inverse:DOMMatrix;x:number;y:number;pointer:number}|null>(null);
  const current=sheet.strands.find(s=>s.id===active);
  const closed=current && (current.source.kind!=='path' || current.source.closed);
  const page=pageSize(sheet),frame={x:0,y:0,w:page.w,h:page.h};
  const entries=useMemo(()=>sheet.strands.filter(s=>s.visible).map(s=>({s,route:strandRoute(s,sheet)})),[sheet]);
  const graph=useMemo(()=>busy?null:topology(sheet),[sheet,busy]);
  const full=useMemo(()=>graph && !simplify?renderSheet(sheet,graph):null,[sheet,graph,simplify]);
  const camera=useEditorCamera(svg,frame,pointBounds(entries.flatMap(e=>e.route.points),frame,10));
  const warn=graph?warnings(sheet,graph):[];
  function commit(next:Sheet) {
    if(next.overrides.length) {
      const g=topology(next),hidden=new Set(next.strands.filter(s=>!s.visible).map(s=>s.id));
      const dormant=next.overrides.filter(c=>hidden.has(c.a.id)||hidden.has(c.b.id));
      const overrides=[...g.kept,...dormant];
      if(overrides.length<next.overrides.length) setNotice('A crossing changed identity. Its manual choice was cleared.');
      next={...next,overrides};
    }
    setSheet(next);
  }
  function patch(values:Partial<Strand>) {
    if(current) commit({...sheet,strands:sheet.strands.map(s=>s.id===active?{...s,...values}:s)});
  }
  function design(values:Partial<Design>) {if(current)patch({design:{...current.design,...values}});}
  function add(items:Strand[]) {
    if(sheet.strands.length+items.length>100) throw Error('A composition supports up to 100 strands.');
    commit({...sheet,strands:[...sheet.strands,...items]});setActive(items[0].id);setMode('Move');
  }
  function addSource() {
    try {
      const item=source==='rosette'||source==='figure-eight'?strand(crypto.randomUUID(),source==='rosette'?'Six-loop rosette':'Figure-eight',{kind:source}):
        fromPath(SHAPE_OPTIONS.find(s=>s.kind===source)!.label,shapePathD(source as ShapeKind));
      add([item]);
    } catch(e){setNotice(String(e));}
  }
  async function open(f:File) {
    try {
      const text=await f.text();
      if(text.trimStart().startsWith('<')) {add(importSvg(text,sheet));setNotice('SVG paths added.');}
      else {
        const raw=JSON.parse(text),result=openSheet(raw); setSheet(result.sheet);
        setActive(result.sheet.strands.find(s=>s.id===raw.editor?.active)?.id??result.sheet.strands[0]?.id??'');
        setContrast(raw.editor?.contrast===true);setSimplify(raw.editor?.simplify===true);setPicked(null);setMode('Move');camera.restore(raw.editor?.camera);setNotice(result.notice);
      }
    } catch(e) {setNotice(e instanceof Error?e.message:'Could not read file.');}
  }
  function flip(c:Choice) {
    const hit=graph?.hits.find(h=>sameCrossing(c,h));
    if(!hit || !graph)return;
    const choice:Choice={...rememberCrossing(hit,graph.hits),over:c.over==='a'?'b':'a'};
    setPicked(choice);commit({...sheet,overrides:[...sheet.overrides.filter(o=>!sameCrossing(o,c)),choice]});
  }
  function output(kind:'SVG'|'PDF'|'Cricut Draw'|'Print') {
    if(kind==='Cricut Draw'){setPlotOpen(true);return;}
    const scene=renderSheet(sheet);
    if(kind==='PDF'){download(new Uint8Array(scenePdf(scene)).buffer,'application/pdf','interlace.pdf');return;}
    const xml=sceneSvg(scene).replace('Woven Calligraphy writing guides','Interlace Studio');
    if(kind!=='Print'){download(xml,'image/svg+xml',kind==='SVG'?'interlace.svg':'interlace-draw.svg');return;}
    const frame=document.createElement('iframe');frame.title='Print Interlace Studio';frame.style.cssText='position:fixed;width:0;height:0;border:0';
    document.body.append(frame);const doc=frame.contentDocument,win=frame.contentWindow;
    if(!doc||!win){frame.remove();setNotice('Print preview unavailable.');return;}
    doc.open();doc.write('<style>@page{size:'+page.w+'mm '+page.h+'mm;margin:0}body{margin:0}svg{display:block}</style>'+xml);doc.close();
    win.onafterprint=()=>frame.remove();win.focus();win.print();
  }
  function point(e:PointerEvent, inverse:DOMMatrix){return new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);}
  function start(e:PointerEvent<SVGPathElement>,s:Strand) {
    if(mode!=='Move'||e.altKey||e.button!==0)return;
    setActive(s.id);if(s.locked)return;
    const matrix=svg.current?.getScreenCTM();if(!matrix)return;
    const inverse=matrix.inverse(),p=point(e,inverse);camera.freeze();
    drag.current={sheet,id:s.id,inverse,x:p.x,y:p.y,pointer:e.pointerId};svg.current?.setPointerCapture(e.pointerId);setBusy(true);
  }
  function move(e:PointerEvent<SVGSVGElement>) {
    const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
    const p=point(e,d.inverse),member=d.sheet.strands.find(s=>s.id===d.id)!;
    const snap=(v:number)=>d.sheet.snap?Math.round(v*2)/2:v;
    setSheet({...d.sheet,strands:d.sheet.strands.map(s=>{
      if(s.locked || (s.id!==member.id && (!member.group || member.group!==s.group))) return s;
      return {...s,design:{...s.design,centerX:snap((s.design.centerX??page.w/2)+p.x-d.x),centerY:snap((s.design.centerY??page.h/2)+p.y-d.y)}};
    })});
  }
  function finish(e:PointerEvent<SVGSVGElement>) {
    const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
    drag.current=null;setBusy(false);if(e.type==='pointercancel')setSheet(d.sheet);else commit(sheet);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const joins=mode!=='Joins'?[]:entries.flatMap(a=>entries.filter(b=>canJoin(a,b)).map(b=>({from:a.s,to:b.s,point:(a.s.design.reverse?a.route.points[0]:a.route.points.at(-1))!})));
  function toggleJoin(from:string,to:string) {
    const active=sheet.joins.some(j=>j.from===from&&j.to===to);
    const others=sheet.joins.filter(j=>j.from!==from&&j.to!==to);
    commit({...sheet,joins:active?others:[...others,{from,to}]});
  }
  function reorder(id:string,delta:number) {
    const items=[...sheet.strands],index=items.findIndex(s=>s.id===id),dest=index+delta;
    if(index<0||dest<0||dest>=items.length)return;
    [items[index],items[dest]]=[items[dest],items[index]];commit({...sheet,strands:items});
  }
  return <EditorWorkspace preview={<section className="preview-panel">
    {plotOpen && plot && <section role="dialog" aria-label="Cricut Draw export" className="rounded border bg-white p-3 space-y-2">
      <label>Mat <Select aria-label="Cricut mat" value={mat} onChange={e=>setMat(e.target.value as CricutMatId)}>
        {Object.entries(CRICUT_MATS).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}
      </Select></label>
      <p className="text-xs">Place the paper at the mat origin. Set the imported paths to Draw and attach them together in Design Space.</p>
      {([
        ['slants','Slant guides'],['secondarySlants','Secondary slants'],['grid','Construction grid'],
        ['construction','Construction guides'],['ruler','Include 50 mm calibration ruler'],
      ] as const).map(([key,label])=><label key={key} className="mr-3 inline-flex gap-1">
        <input type="checkbox" checked={plotOptions[key]} onChange={e=>setPlotOptions({...plotOptions,[key]:e.target.checked})}/>{label}
      </label>)}
      <p className="text-xs">Safe drawing area {plot.safety.safeRect.width} × {plot.safety.safeRect.height} mm, starting at {plot.safety.safeRect.x} mm from the top and left.</p>
      {[...plot.safety.reasons,...plot.warnings].map((message,i)=><p role="alert" key={i}>{message}</p>)}
      <Button disabled={plot.safety.reasons.length>0 || plot.polylineCount<=1} onClick={()=>{
        download(plot.svg,'image/svg+xml','interlace-draw.svg');setNotice('Cricut SVG exported.');setPlotOpen(false);
      }}>Export Cricut SVG</Button>
      <Button onClick={()=>setPlotOpen(false)}>Close export</Button>
    </section>}
    <PreviewToolbar camera={camera}><Button aria-pressed={simplify} onClick={()=>setSimplify(!simplify)}>Simplify</Button>
      {(['SVG','PDF','Cricut Draw','Print'] as const).map(kind=><Button key={kind} onClick={()=>output(kind)}>{kind}</Button>)}
    </PreviewToolbar>
    <div className={row}>{(['Move','Crossings','Joins'] as const).map(v=><Button key={v} aria-pressed={mode===v} onClick={()=>setMode(v)}>{v}</Button>)}</div>
    <svg ref={svg} className="editor-svg bg-slate-200" viewBox={camera.str} aria-label="Interlace writing sheet"
      onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{if(drag.current){setSheet(drag.current.sheet);drag.current=null;setBusy(false);}}}>
      <defs><clipPath id="interlace-paper"><rect width={page.w} height={page.h}/></clipPath></defs>
      <rect width={page.w} height={page.h} fill="white"/>
      <g clipPath="url(#interlace-paper)">{full && <g style={contrast?{filter:"contrast(220%)"}:undefined}><WovenScene scene={full}/></g>}
        {full && mode==='Move' && entries.filter(e=>e.s.id===active).map(({s,route})=><path key={s.id}
          d={pointsD(route.points)} fill="none" stroke={s.color} strokeWidth={.28} strokeDasharray="1 2" pointerEvents="none"/>)}
        {entries.map(({s,route})=><path key={s.id} data-camera-interactive="" aria-label={s.name} d={pointsD(route.points)} fill="none"
          stroke={s.color} strokeWidth={full?7:1} strokeOpacity={full?0:1} pointerEvents={mode==='Move'?'stroke':'none'}
          style={{cursor:s.locked?'default':'move'}} onPointerDown={e=>start(e,s)}/>)}
        {mode==='Crossings' && graph?.hits.map((h,i)=>(!onlySelected||h.a.id===active||h.b.id===active)&&<g key={i} data-camera-interactive="" data-crossing-kind={h.a.id===h.b.id?'self':'between'} onClick={()=>flip(h)}>
          <circle cx={h.point.x} cy={h.point.y} r={2.8} fill={picked&&sameCrossing(picked,h,.025)?'#4f46e5':'white'} stroke="#334155" strokeWidth={.35}/>
          <text x={h.point.x} y={h.point.y+.8} textAnchor="middle" fontSize={2.2} fill={picked&&sameCrossing(picked,h,.025)?'white':'black'}>{i+1}</text></g>)}
        {mode==='Joins' && joins.map(j=><circle key={j.from.id+j.to.id} cx={j.point.x} cy={j.point.y} r={2.4}
          fill={sheet.joins.some(link=>link.from===j.from.id&&link.to===j.to.id)?'#16836b':'white'} stroke="#16836b" strokeWidth={.5}
          onClick={()=>toggleJoin(j.from.id,j.to.id)}/>)}
      </g>
    </svg></section>} layers={<div className="space-y-2">
      <DisclosureSection title="Composition" defaultOpen><div className={row}>
        <Select aria-label="Paper" value={sheet.paper} onChange={e=>commit({...sheet,paper:e.target.value as Sheet['paper']})}>{Object.keys(PAPERS_MM).map(p=><option key={p}>{p}</option>)}</Select>
        <Select aria-label="Orientation" value={sheet.orientation} onChange={e=>commit({...sheet,orientation:e.target.value as Sheet['orientation']})}><option>portrait</option><option>landscape</option></Select>
        <Button onClick={()=>download(JSON.stringify({...sheet,editor:{active,simplify,contrast,camera:camera.snapshot}},null,2),'application/json','interlace.json')}>Save</Button>
        <Button onClick={()=>file.current?.click()}>Open design</Button><input hidden type="file" ref={file} accept=".json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void open(f);}}/>
        <Select aria-label="Composition preset" value="" onChange={e=>{
          const preset=compositionPresets.find(p=>p.id===e.target.value);
          if(!preset || (sheet.strands.length && !window.confirm('Replace the current composition with '+preset.name+'?')))return;
          try {
            const result=openSheet({version:1,format:'calligraphy-tools/path-guides-preset',state:preset.state});
            setSheet(result.sheet);setActive(preset.state.activeId);setPicked(null);setMode('Move');camera.restore(undefined);setNotice(result.notice);
          }catch(error){setNotice(String(error));}
        }}><option value="">Composition presets…</option>{compositionPresets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</Select>
      </div></DisclosureSection>
      <DisclosureSection title="Add strand" defaultOpen><div className={row}>
        <Select aria-label="Strand source" value={source} onChange={e=>setSource(e.target.value)}><option value="rosette">Six-loop rosette</option><option value="figure-eight">Figure-eight</option>
          {SHAPE_OPTIONS.map(v=><option key={v.kind} value={v.kind}>{v.label}</option>)}</Select><Button onClick={addSource}>Add strand</Button>
        <Button onClick={()=>upload.current?.click()}>Import SVG</Button>
        <input hidden type="file" aria-label="Import SVG files" ref={upload} accept=".svg" multiple onChange={async e=>{
          const files=Array.from(e.target.files??[]);e.target.value='';
          try {const imported=(await Promise.all(files.map(async f=>importSvg(await f.text(),sheet)))).flat();
            if(imported.length){add(imported);setNotice('SVG paths added.');}
          }catch(error){setNotice(String(error));}
        }}/>
      </div></DisclosureSection>
      <DisclosureSection title="Strands" defaultOpen><div className="space-y-1">
        {[...sheet.strands].reverse().map((s,index)=><div key={s.id}
          className={'flex items-center gap-1 rounded px-1 text-sm '+(active===s.id?'bg-indigo-50':'')}>
          <input type="checkbox" title="Visibility" aria-label={'Show '+s.name} checked={s.visible}
            onChange={()=>commit({...sheet,strands:sheet.strands.map(v=>v.id===s.id?{...v,visible:!v.visible}:v)})}/>
          <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" aria-pressed={active===s.id} onClick={()=>setActive(s.id)}>
            <span className="h-3 w-1 shrink-0 rounded" style={{background:s.color}}/><span className="truncate">{s.name}</span>
          </button>
          <button title={s.locked?'Unlock':'Lock'} aria-label={'Toggle lock '+s.name} aria-pressed={s.locked}
            onClick={()=>commit({...sheet,strands:sheet.strands.map(v=>v.id===s.id?{...v,locked:!v.locked}:v)})}>{s.locked?'🔒':'🔓'}</button>
          <button className="px-1 disabled:opacity-30" title="Raise" aria-label={'Raise '+s.name} disabled={s.locked||index===0} onClick={()=>reorder(s.id,1)}>↑</button>
          <button className="px-1 disabled:opacity-30" title="Lower" aria-label={'Lower '+s.name} disabled={s.locked||index===sheet.strands.length-1} onClick={()=>reorder(s.id,-1)}>↓</button>
        </div>)}
        {current && <div className={row}>
          <Button onClick={()=>add([{...current,id:crypto.randomUUID(),name:current.name+' copy',locked:false,group:'',design:{...current.design,centerX:(current.design.centerX??page.w/2)+5}}])}>Duplicate</Button>
          <Button disabled={current.locked} onClick={()=>{const rest=sheet.strands.filter(s=>s.id!==active);commit({...sheet,strands:rest,joins:sheet.joins.filter(j=>j.from!==active&&j.to!==active),overrides:sheet.overrides.filter(o=>o.a.id!==active&&o.b.id!==active)});setActive(rest.at(-1)?.id??'');}}>Delete</Button>
          </div>}
      </div></DisclosureSection>
    </div>} inspector={<>
      <DisclosureSection title="Preview appearance"><label><input type="checkbox" checked={contrast} onChange={e=>setContrast(e.target.checked)}/> High contrast</label></DisclosureSection>
      <details><summary>Notices {warn.length? '('+warn.length+')':''}</summary>{warn.map((w,i)=><p key={i}>{w}</p>)}</details>
      <div role="status" className="text-xs max-h-12 overflow-auto">{notice}</div>
      {current && <fieldset disabled={current.locked} className="min-w-0">
        <DisclosureSection title="Strand properties"><div className="space-y-2 text-sm">
          <label>Name <input value={current.name} onChange={e=>patch({name:e.target.value})}/></label>
          <label>Group <input value={current.group} placeholder="Group name" onChange={e=>patch({group:e.target.value})}/></label>
          <label>Editing colour <input type="color" value={current.color} onChange={e=>patch({color:e.target.value})}/></label>
        </div></DisclosureSection>
        <DisclosureSection title="Position & transform" defaultOpen><div className="space-y-2 text-sm">
          <div onPointerDown={()=>setBusy(true)} onPointerUp={()=>setBusy(false)} onPointerCancel={()=>setBusy(false)} onBlur={()=>setBusy(false)}>
          {measure('X (mm)',current.design.centerX??page.w/2,v=>design({centerX:v}),-10000,10000,.5)}
          {measure('Y (mm)',current.design.centerY??page.h/2,v=>design({centerY:v}),-10000,10000,.5)}
          {measure('Width (mm)',current.design.width,v=>design({width:v}),.01,10000,.5)}
          {measure('Height (mm)',current.design.height,v=>design({height:v}),.01,10000,.5)}
          {measure('Scale (%)',current.scale,v=>patch({scale:v}),.01,1000)}
          <input type="range" aria-label="Rotate strand" min={-180} max={180} step={1} value={current.design.rotation} onChange={e=>design({rotation:Number(e.target.value)})}/>{measure('Rotation (°)',current.design.rotation,v=>design({rotation:v}),-180,180)}
          {current.source.kind==='rosette' && measure('Loop depth',current.design.loop,v=>design({loop:v}),.22,.42,.01)}</div>
          <div className={row}><Button onClick={()=>design({centerX:page.w/2})}>Centre X</Button><Button onClick={()=>design({centerY:page.h/2})}>Centre Y</Button>
            <Button aria-pressed={current.mirror} onClick={()=>patch({mirror:!current.mirror})}>Mirror</Button>
            <Button aria-pressed={current.invert} onClick={()=>patch({invert:!current.invert})}>Invert guides</Button>
            <Button aria-pressed={sheet.snap} onClick={()=>commit({...sheet,snap:!sheet.snap})}>Snap 0.5 mm</Button></div>
        </div></DisclosureSection>
        <WovenSettings design={current.design} onChange={d=>patch({design:d})}/>
        <DisclosureSection title="Writing direction & crossings"><div className="space-y-2 text-sm">
          <Button aria-pressed={current.design.reverse} onClick={()=>design({reverse:!current.design.reverse})}>Reverse direction</Button>
          {closed && measure('Start (%)',current.design.start,v=>design({start:v}),0,100,.5)}
          {closed && measure('Start gap (mm)',current.design.gap,v=>design({gap:v}),0,40,.5)}
          <Button aria-pressed={current.design.clearance===0} onClick={()=>design({clearance:0})}>Tight / Flush</Button><input aria-label="Extra clearance" type="range" min={0} max={4} step={.1} value={current.design.clearance} onChange={e=>design({clearance:Number(e.target.value)})}/>{measure('Clearance (mm)',current.design.clearance,v=>design({clearance:v}),0,4,.1)}
        </div></DisclosureSection>
      </fieldset>}
      {mode==='Crossings' && graph && <DisclosureSection title="Crossing order" defaultOpen>
        <label><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/> Selected strand only</label><div className={row}>{graph.hits.map((h,i)=>(!onlySelected||h.a.id===active||h.b.id===active)&&<Button key={i} aria-pressed={!!picked&&sameCrossing(picked,h,.025)} onClick={()=>setPicked(h)}>{i+1}</Button>)}</div>
        {graph.hits.filter(h=>picked && sameCrossing(h,picked,.025)).map((h,i)=><Button key={i} onClick={()=>flip(h)}>Flip · {sheet.strands.find(s=>s.id===h[h.over].id)?.name} over ({h.over.toUpperCase()})</Button>)}
        <Button onClick={()=>commit({...sheet,overrides:[]})}>Restore alternating weave</Button></DisclosureSection>}
      {mode==='Joins' && <DisclosureSection title="Endpoint joins" defaultOpen><p className="text-xs">Align the end of one open strand with the start of another using the same writing settings.</p>
        {joins.map(j=><Button key={j.from.id+j.to.id} aria-pressed={sheet.joins.some(k=>k.from===j.from.id&&k.to===j.to.id)} onClick={()=>toggleJoin(j.from.id,j.to.id)}>{j.from.name} → {j.to.name}</Button>)}
        {sheet.joins.filter(j=>!joins.some(k=>k.from.id===j.from&&k.to.id===j.to)).map(j=><Button key={j.from+j.to} onClick={()=>toggleJoin(j.from,j.to)}>Remove inactive join</Button>)}
      </DisclosureSection>}
    </>}/>;
}
