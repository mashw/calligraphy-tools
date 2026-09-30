'use client';

import { useState } from 'react';
import LayoutInspector from '@/components/layout/LayoutInspector';
import LayoutStage from '@/components/layout/LayoutStage';
import LayersPanel, { type DesignMessage } from '@/components/layout/LayersPanel';
import { defaultArtworkSize, newElement, pageElement, pageSize, type ElementType, type Frame, type LayoutElement } from '@/lib/layout/types';
import { buildGuidelinesLineLayoutPlan, buildGuidelinesTextFitPlan, buildGuidelinesVisibilityCacheKey, getCachedGuidelinesCollisionSpans, getCachedGuidelinesPlacementSpans, resolveTextFitColors, TEXT_FIT_COLORS, preferredTextFitColorIndex, type GuidelinesTextFitEntry } from '@/lib/layout/guidelines-text-fit';
import { sanitizeArtworkSvg } from '@/lib/layout/artwork';
import { pageContentRect } from '@/lib/layout/geometry';
import { parseLayoutDesign, serializeLayoutDesign } from '@/lib/layout/design-file';

export default function LayoutPage() {
  const [elements, setElements] = useState<LayoutElement[]>(() => [pageElement()]);
  const [selectedId, setSelectedId] = useState('page');
  const [artworkMessage,setArtworkMessage]=useState<string|null>(null);
  const [designMessage,setDesignMessage]=useState<DesignMessage|null>(null);
  const selected = elements.find(element => element.id === selectedId) ?? elements[elements.length - 1];
  const page = elements.find(element => element.type === 'page')!;
  const allGuidelines=elements.filter((item):item is Extract<LayoutElement,{type:'guidelines'}>=>item.type==='guidelines'),activeGuidelines=allGuidelines.filter(item=>item.textMode==='estimate'?!!item.fitText.trim():item.plannedLines.some(line=>!!line.text.trim())),colors=resolveTextFitColors(allGuidelines.map(item=>item.id).sort());
  const textFitPlans=activeGuidelines.reduce<Record<string,GuidelinesTextFitEntry>>((plans,item)=>{const index=elements.findIndex(element=>element.id===item.id),key=buildGuidelinesVisibilityCacheKey(item,page,elements.slice(0,index)),collisionSpans=getCachedGuidelinesCollisionSpans(key,item,page,elements),placementSpans=getCachedGuidelinesPlacementSpans(item,page);plans[item.id]=item.textMode==='estimate'?{mode:'estimate',plan:buildGuidelinesTextFitPlan(item,placementSpans),color:colors[item.id]}:{mode:'line-layout',plan:buildGuidelinesLineLayoutPlan(item,placementSpans,page,collisionSpans),color:colors[item.id]};return plans;},{});
  const selectedTextFitEntry=selected.type==='guidelines'?(textFitPlans[selected.id]??(selected.textMode==='estimate'?{mode:'estimate',plan:buildGuidelinesTextFitPlan(selected,[]),color:TEXT_FIT_COLORS[preferredTextFitColorIndex(selected.id)]}:{mode:'line-layout',plan:buildGuidelinesLineLayoutPlan(selected,[],page),color:TEXT_FIT_COLORS[preferredTextFitColorIndex(selected.id)]})):null;
  const markEdited=()=>setDesignMessage(null);
  const update = (id: string, fn: (element: LayoutElement) => LayoutElement) => { markEdited(); setElements(current => current.map(element => element.id === id ? fn(element) : element)); };
  const add = (type: Exclude<ElementType, 'page'|'artwork'>) => {
    markEdited();
    const count = elements.filter(element => element.type === type).length + 1;
    const element = newElement(type, count, pageSize(page));
    setElements(current => [element, ...current]); setSelectedId(element.id);
  };
  const addArtwork=async(files:FileList)=>{markEdited();const imported:Extract<LayoutElement,{type:'artwork'}>[]=[];const messages:string[]=[];const usable=pageContentRect(pageSize(page),page.settings.margins);for(const file of [...files]){try{const document=sanitizeArtworkSvg(await file.text()),ratio=document.viewBox.width/document.viewBox.height,{width,height}=defaultArtworkSize(ratio,usable,document.viewBox.width);imported.push({id:`artwork-${crypto.randomUUID()}`,type:'artwork',name:file.name.replace(/\.svg$/i,''),locked:false,paddingMM:0,rotationDeg:0,sourceFilename:file.name,document,intrinsicAspectRatio:ratio,settings:{lockProportions:true,opacity:100,occludeLowerLayers:true,occludeClosedShapes:true,occlusionArea:'visible-artwork',textFitExclusion:'bounds'},frame:{x:usable.x+(usable.width-width)/2,y:usable.y+(usable.height-height)/2,width,height}});if(document.warning)messages.push(`${file.name}: ${document.warning}`);}catch(error){messages.push(`${file.name}: ${error instanceof Error?error.message:'Could not import SVG.'}`);}}if(imported.length){setElements(current=>[...imported,...current]);setSelectedId(imported.at(-1)!.id);}setArtworkMessage(messages.join(' ')||null);};
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

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-sm text-slate-900 sm:px-6">
    <header className="mx-auto mb-5 max-w-[1480px]"><h1 className="text-3xl font-semibold tracking-tight">Calligraphy Tools <span className="text-indigo-600">— Layout</span></h1><p className="mt-1 text-slate-600">Arrange calligraphy elements on a physical page.</p></header>
    <div className="mx-auto grid max-w-[1480px] grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
      <LayoutStage elements={elements} selectedId={selectedId} textFitPlans={textFitPlans} onSelect={setSelectedId} onCommit={commit} onPlannedLinePlacementChange={(guidelinesId,lineId,customStartMM)=>update(guidelinesId,element=>element.type==='guidelines'?{...element,plannedLines:element.plannedLines.map(line=>line.id===lineId?{...line,alignment:'custom',customStartMM}:line)}:element)} />
      <div className="min-h-0 xl:relative"><LayersPanel className="xl:absolute xl:inset-0 xl:h-full xl:overflow-hidden" elements={elements} selectedId={selectedId} onSelect={setSelectedId} onAdd={add} onAddArtwork={addArtwork} artworkMessage={artworkMessage} onToggleLock={id => update(id, element => element.type === 'page' ? element : ({ ...element, locked: !element.locked }))} onMove={move} onDuplicate={duplicate} onDelete={remove} onSaveDesign={saveDesign} onOpenDesign={openDesign} designMessage={designMessage} /></div>
      <div className="xl:col-span-2"><LayoutInspector element={selected} page={page} textFitEntry={selectedTextFitEntry} onChange={next => update(selected.id, () => next)} /></div>
    </div>
  </main>;
}
