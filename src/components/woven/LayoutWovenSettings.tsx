'use client';
import { fitWovenPreset } from '@/lib/interlace/document';
import { selectWovenPreset, wovenCompositionOptions } from '@/lib/woven/design';
import { useMemo, useState } from 'react';
import { Select } from '@/components/editor/Controls';
import NumericSlider from '@/components/editor/NumericSlider';
import DisclosureSection from '@/components/layout/DisclosureSection';
import { DEFAULT_TEXT_PLAN, textFit } from '@/lib/interlace/text-fit';
import { initialSheet, strand, topology } from '@/lib/interlace/model';
import WovenSettings from './WovenSettings';
import { layoutWovenDesign, wovenSettings } from '@/lib/layout/woven';
import { buildWovenRouteModel } from '@/lib/woven/model';
import type { WovenElement } from '@/lib/layout/types';

export default function LayoutWovenSettings({element,onChange}:{element:WovenElement;onChange:(element:WovenElement)=>void}) {
  const [scale,setScale]=useState(100);
  const design=useMemo(()=>layoutWovenDesign(element),[element]);
  const model=useMemo(()=>buildWovenRouteModel(design),[design]);
  const [strapId,setStrapId] = useState('');
  const sheet = useMemo(() => {
    if (model.composition) return model.composition.sheet;
    const sheet = initialSheet();
    sheet.paper = design.paper;
    sheet.orientation = design.orientation;
    sheet.strands = [strand('woven','Main strap',{kind:design.preset === 'figure-eight' ? 'figure-eight' : 'rosette'},design)];
    return sheet;
  },[design,model]);
  const graph = useMemo(() => model.composition?.graph ?? topology(sheet),[model,sheet]);
  const straps = sheet.strands.filter(strap => strap.visible);
  const selected = straps.find(strap => strap.id === strapId) ?? straps[0];
  const plan = selected?.textPlan ?? DEFAULT_TEXT_PLAN;
  const text = design.strapTexts?.[selected?.id] ?? plan.text;
  const countHidden=design.hiddenTextStraps?.includes(selected?.id) ?? plan.countHidden ?? false;
  const fit = useMemo(() => selected && textFit(sheet,{...selected,textPlan:{...plan,text,countHidden}},graph,model.composition?undefined:model),[model,sheet,selected,plan,text,countHidden,graph]);
  function changeText(text:string,hidden=countHidden) {
    if (!selected) return;
    const composition = design.composition;
    if (composition) {
      const strands = composition.strands.map(s => s.id === selected.id ? {...s,textPlan:{...(s.textPlan??DEFAULT_TEXT_PLAN),text,countHidden:hidden}} : s);
      onChange({...element,settings:{...element.settings,composition:{...composition,strands}}});
    } else {
      onChange({...element,settings:{...element.settings,hiddenTextStraps:[...(design.hiddenTextStraps??[]).filter(id=>id!==selected.id),...(hidden?[selected.id]:[])],strapTexts:{...design.strapTexts,[selected.id]:text}}});
    }
  }
  return <>
    <DisclosureSection title="Shape & Geometry" defaultOpen>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">Preset<Select className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Preset" value={design.preset} onChange={event=>{
          const next = fitWovenPreset(selectWovenPreset(design,event.target.value as typeof design.preset));
          const frame = element.frame;
          setScale(100);
          onChange({...element,settings:wovenSettings(next),frame:{x:frame.x+(frame.width-next.width)/2,y:frame.y+(frame.height-next.height)/2,width:next.width,height:next.height}});
        }}>{design.preset === 'custom-composition' && <option value="custom-composition">Custom composition</option>}<option value="rosette">Six-loop rosette</option><option value="figure-eight">Figure-eight</option>{wovenCompositionOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <NumericSlider label="Proportional scale" unit="%" min={Math.max(1,4/Math.min(element.frame.width,element.frame.height)*scale)} max={Math.min(1000,2000/Math.max(element.frame.width,element.frame.height)*scale)} value={scale} step={1} onChange={next=>{const factor=next/scale,width=element.frame.width*factor,height=element.frame.height*factor;setScale(next);onChange({...element,frame:{x:element.frame.x+(element.frame.width-width)/2,y:element.frame.y+(element.frame.height-height)/2,width,height}});}}/>
        {design.preset==='rosette'&&<NumericSlider label="Loop depth" min={.22} max={.42} value={design.loop} step={.01} onChange={loop=>onChange({...element,settings:{...element.settings,loop,overrides:{}}})}/>}
        <p className="text-xs text-slate-500">Position, dimensions and rotation use the Layout controls above. Corner handles preserve the current proportions.</p>
      </div>
    </DisclosureSection>
    <WovenSettings design={design} model={model} onChange={next=>onChange({...element,settings:wovenSettings(next)})}/>
    {selected && fit && <DisclosureSection title="Text fit"><div className="space-y-2">
      {straps.length>1 && <label className="block text-sm">Writing strap<Select value={selected.id} onChange={event=>setStrapId(event.target.value)}>{straps.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>}
      <label className="block text-sm">Strap text<textarea className="block w-full rounded border p-2" value={text} onChange={event=>changeText(event.target.value)}/></label>
      <label className="block text-sm"><input type="checkbox" checked={!!countHidden} onChange={event=>changeText(text,event.target.checked)}/> Count hidden lettering</label>
      <p className="text-xs text-slate-600">Allow space for letters beneath each crossing before the text reappears.</p>
      <p className="text-xs">{fit.needed.toFixed(1)} of {fit.available.toFixed(1)} mm</p>
      {!fit.fits && <p className="text-xs text-rose-600">Text extends beyond the available strap.</p>}
    </div></DisclosureSection>}
  </>;
}
