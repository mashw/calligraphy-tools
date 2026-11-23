'use client';

import { GuidelineEditing } from '@/components/layout/GuidelineEditing';
import EditorWorkspace from '@/components/editor/EditorWorkspace';

import WovenComposer from '@/components/woven/WovenComposer';
import { designFromComposition, editableComposition, openSheet } from '@/lib/interlace/document';
import type { Sheet } from '@/lib/interlace/model';
import { layoutWovenDesign, wovenSettings } from '@/lib/layout/woven';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LayoutInspector from '@/components/layout/LayoutInspector';
import LayoutStage from '@/components/layout/LayoutStage';
import LayersPanel, { type DesignMessage } from '@/components/layout/LayersPanel';
import { newElement, pageElement, pageSize, type ElementType, type Frame, type LayoutElement } from '@/lib/layout/types';
import { buildGuidelinesLineLayoutPlan, buildGuidelinesTextFitPlan, buildGuidelinesVisibilityCacheKey, getCachedGuidelinesCollisionSpans, getCachedGuidelinesPlacementSpans, resolveTextFitColors, TEXT_FIT_COLORS, preferredTextFitColorIndex, type GuidelinesTextFitEntry } from '@/lib/layout/guidelines-text-fit';
import { usesCustomMask } from '@/lib/layout/custom-mask';
import { importArtwork } from '@/lib/layout/import-artwork';
import { pageContentRect } from '@/lib/layout/geometry';
import { parseLayoutDesign, serializeLayoutDesign } from '@/lib/layout/design-file';

export default function LayoutPage() {
  const [elements, setElements] = useState<LayoutElement[]>(() => [pageElement()]);
  const [editingWeave,setEditingWeave] = useState<{id:string;sheet:Sheet}|null>(null);
  const [selectedId, setSelectedId] = useState('page');
  const [editingSnapshot,setEditingSnapshot]=useState<LayoutElement[]|null>(null);
  const [artworkMessage,setArtworkMessage]=useState<string|null>(null);
  const [designMessage,setDesignMessage]=useState<DesignMessage|null>(null);
  const selected = elements.find(element => element.id === selectedId) ?? elements[elements.length - 1];
  const page = elements.find(element => element.type === 'page')!;
  useEffect(()=>{
    const key = new URLSearchParams(location.search).get('composition');
    if (!key?.startsWith('woven-transfer-')) return;
    try {
      const raw=sessionStorage.getItem(key);
      if (!raw) return;
      const source=designFromComposition(openSheet(JSON.parse(raw)).sheet);
      const size=pageSize(pageElement());
      const element=newElement('woven',1,size);
      if (element.type !== 'woven') return;
      const scale=Math.min(1,(size.width-20)/source.width,(size.height-20)/source.height);
      const width=source.width*scale,height=source.height*scale;
      element.frame={x:(size.width-width)/2,y:(size.height-height)/2,width,height};
      element.settings=wovenSettings(source);
      setElements(current=>[element,...current]);setSelectedId(element.id);
      sessionStorage.removeItem(key);history.replaceState(null,'','/layout');
    } catch(error) {setArtworkMessage(error instanceof Error?error.message:'Could not open composition.');}
  },[]);
  const textFitPlans = useMemo(() => {
    const guidelines = elements.filter((item): item is Extract<LayoutElement, { type: 'guidelines' }> => item.type === 'guidelines');
    const colors = resolveTextFitColors(guidelines.map(item => item.id).sort());
    const plans: Record<string, GuidelinesTextFitEntry> = {};
    for (const item of guidelines) {
      const color = colors[item.id];
      if (item.textMode === 'estimate') {
        if (!item.fitText.trim()) continue;
        const spans = getCachedGuidelinesPlacementSpans(item, page);
        plans[item.id] = { mode: 'estimate', plan: buildGuidelinesTextFitPlan(item, spans), color };
      } else if (item.plannedLines.some(line => line.text.trim())) {
        const spans = getCachedGuidelinesPlacementSpans(item, page);
        const higher = elements.slice(0, elements.indexOf(item));
        const key = buildGuidelinesVisibilityCacheKey(item, page, higher);
        const collisions = getCachedGuidelinesCollisionSpans(key, item, page, elements);
        plans[item.id] = { mode: 'line-layout', plan: buildGuidelinesLineLayoutPlan(item, spans, page, collisions, elements), color };
      }
    }
    return plans;
  }, [elements, page]);
  const selectedTextFitEntry = useMemo(() => {
    if (selected.type !== 'guidelines') return null;
    if (textFitPlans[selected.id]) return textFitPlans[selected.id];
    const color = TEXT_FIT_COLORS[preferredTextFitColorIndex(selected.id)];
    if (selected.textMode === 'estimate') {
      return { mode: 'estimate' as const, plan: buildGuidelinesTextFitPlan(selected, []), color };
    }
    const spans = usesCustomMask(selected) ? getCachedGuidelinesPlacementSpans(selected, page) : [];
    return { mode: 'line-layout' as const, plan: buildGuidelinesLineLayoutPlan(selected, spans, page, [], elements), color };
  }, [selected, textFitPlans, page, elements]);
  const markEdited=()=>setDesignMessage(null);
  const update = useCallback((id: string, fn: (element: LayoutElement) => LayoutElement) => {
    setDesignMessage(null);
    setElements(current => current.map(element => element.id === id ? fn(element) : element));
  }, []);
  const placePlannedLine = useCallback((guidelinesId: string, lineId: string, customStartMM: number) => {
    update(guidelinesId, element => element.type === 'guidelines' ? {
      ...element,
      plannedLines: element.plannedLines.map(line => line.id === lineId ? { ...line, alignment: 'custom', customStartMM } : line),
    } : element);
  }, [update]);
  const add = (type: Exclude<ElementType, 'page'|'artwork'>) => {
    markEdited();
    const count = elements.filter(element => element.type === type).length + 1;
    const element = newElement(type, count, pageSize(page));
    setElements(current => [element, ...current]); setSelectedId(element.id);
  };
  const addArtwork=async(files:FileList)=>{markEdited();const imported:Extract<LayoutElement,{type:'artwork'|'woven'}>[]=[];const messages:string[]=[];const usable=pageContentRect(pageSize(page),page.settings.margins);for(const file of [...files]){try{const xml=await file.text();const {document,intrinsicAspectRatio:ratio,interlaceSource,size:{width,height}}=importArtwork(xml,usable);
      if(interlaceSource && new DOMParser().parseFromString(xml,'image/svg+xml').documentElement.getAttribute('data-woven-composition')==='1'){
        const element=newElement('woven',1,pageSize(page));
        if(element.type==='woven'){
          element.settings=wovenSettings(designFromComposition(interlaceSource.document));
          element.name=file.name.replace(/\.svg$/i,'');
          element.frame={x:usable.x+(usable.width-width)/2,y:usable.y+(usable.height-height)/2,width,height};
          imported.push(element);continue;
        }
      }
      imported.push({id:`artwork-${crypto.randomUUID()}`,type:'artwork',name:file.name.replace(/\.svg$/i,''),locked:false,paddingMM:0,rotationDeg:0,sourceFilename:file.name,document,interlaceSource,intrinsicAspectRatio:ratio,settings:{lockProportions:true,opacity:100,occludeLowerLayers:true,occludeClosedShapes:true,occlusionArea:'visible-artwork',textFitExclusion:'bounds'},frame:{x:usable.x+(usable.width-width)/2,y:usable.y+(usable.height-height)/2,width,height}});if(document.warning)messages.push(`${file.name}: ${document.warning}`);}catch(error){messages.push(`${file.name}: ${error instanceof Error?error.message:'Could not import SVG.'}`);}}if(imported.length){setElements(current=>[...imported,...current]);setSelectedId(imported.at(-1)!.id);}setArtworkMessage(messages.join(' ')||null);};
  const move = (id: string, direction: -1 | 1) => { markEdited(); setElements(current => {
    const index = current.findIndex(element => element.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length || current[target].type === 'page') return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  }); };
  const duplicate = (id: string) => {
    const source = elements.find(element => element.id === id); if (!source || source.type === 'page') return;
    markEdited();
    const copy = structuredClone(source); copy.id = `${source.type}-${crypto.randomUUID()}`; copy.name = `${source.name} copy`; copy.frame.x += 5; copy.frame.y += 5;
    setElements(current => { const index = current.findIndex(element => element.id === id); const next = [...current]; next.splice(index, 0, copy); return next; }); setSelectedId(copy.id);
  };
  const remove = (id: string) => { if (id === 'page') return; markEdited(); setElements(current => current.filter(element => element.id !== id)); if (selectedId === id) setSelectedId('page'); };
  const commit = (id: string, frame: Frame, rotationDeg?:number) => update(id, element => element.type === 'calligram'
    ? ({ ...element, rotationDeg:rotationDeg??element.rotationDeg??0, frame: { ...frame, height: frame.width }, settings: { ...element.settings, radiusMM: Math.max(5, element.settings.radiusMM + (frame.width - element.frame.width) / 2) } })
    : element.type==='page'?element:({ ...element, rotationDeg:rotationDeg??element.rotationDeg??0, frame }));

  const saveDesign=()=>{
    const blob=new Blob([serializeLayoutDesign(elements,selectedId)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    link.download=`calligraphy-layout-${new Date().toISOString().slice(0,10)}.calligraphy-layout.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    setDesignMessage({kind:'success',text:'Design saved to a file.'});
  };
  const openDesign=async(file:File)=>{
    try{
      const design=parseLayoutDesign(await file.text());
      setElements(design.elements);
      setSelectedId(design.selectedElementId);
      setArtworkMessage(null);
      setDesignMessage({kind:'success',text:`Opened ${file.name}.`});
    }catch(error){
      setDesignMessage({kind:'error',text:error instanceof Error?error.message:'Could not open this layout design.'});
    }
  };

  if (editingWeave) return <WovenComposer initial={editingWeave.sheet} onClose={()=>setEditingWeave(null)} onApply={sheet=>{
    const settings=wovenSettings(designFromComposition(sheet));
    update(editingWeave.id,e=>e.type==='woven'?{...e,settings}:e);
    setEditingWeave(null);
  }}/>;
  return <GuidelineEditing><EditorWorkspace preview={<>
<LayoutStage onArrangement={(id,arrangement)=>update(id,e=>e.type==='guidelines'?{...e,mask:{...e.mask,arrangement}}:e)} editingSnapshot={editingSnapshot} elements={elements} selectedId={selectedId} textFitPlans={textFitPlans} onSelect={setSelectedId} onCommit={commit} onPlannedLinePlacementChange={placePlannedLine} />
</>} inspector={<>
<div onFocusCapture={event=>{if(selected.type==='woven'&&(event.target as HTMLInputElement).type==='number')setEditingSnapshot(current=>current??elements);}} onBlurCapture={()=>setEditingSnapshot(null)} onPointerDownCapture={event=>{if(selected.type==='woven'&&(event.target as HTMLInputElement).type==='range')setEditingSnapshot(current=>current??elements);}} onPointerUpCapture={event=>{if((event.target as HTMLInputElement).type==='range')setEditingSnapshot(null);}} onPointerCancelCapture={()=>setEditingSnapshot(null)} onKeyDownCapture={event=>{if(selected.type==='woven'&&(event.target as HTMLInputElement).type==='range')setEditingSnapshot(current=>current??elements);}} onKeyUpCapture={event=>{if((event.target as HTMLInputElement).type==='range')setEditingSnapshot(null);}}>{selected.type==='woven' && <button className="rounded border px-3 py-2 text-sm" onClick={()=>{
    try {setEditingWeave({id:selected.id,sheet:editableComposition(layoutWovenDesign(selected))});}
    catch(error){setArtworkMessage(error instanceof Error?error.message:'Could not open composition.');}
  }}>Edit in Woven</button>}<LayoutInspector element={selected} page={page} textFitEntry={selectedTextFitEntry} onChange={next => update(selected.id, () => next)} /></div>
</>} layers={<>
<LayersPanel  elements={elements} selectedId={selectedId} onSelect={setSelectedId} onAdd={add} onAddArtwork={addArtwork} artworkMessage={artworkMessage} onToggleVisibility={id=>update(id,element=>({...element,visible:element.visible===false}))} onToggleLock={id => update(id, element => element.type === 'page' ? element : ({ ...element, locked: !element.locked }))} onMove={move} onDuplicate={duplicate} onDelete={remove} onSaveDesign={saveDesign} onOpenDesign={openDesign} designMessage={designMessage} />
</>}></EditorWorkspace></GuidelineEditing>;
}
