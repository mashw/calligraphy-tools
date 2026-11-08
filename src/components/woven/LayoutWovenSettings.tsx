'use client';
import { useMemo, useState } from 'react';
import { Select } from '@/components/editor/Controls';
import NumericSlider from '@/components/editor/NumericSlider';
import DisclosureSection from '@/components/layout/DisclosureSection';
import WovenSettings from './WovenSettings';
import { layoutWovenDesign, wovenSettings } from '@/lib/layout/woven';
import { buildWovenRouteModel } from '@/lib/woven/model';
import type { WovenElement } from '@/lib/layout/types';

export default function LayoutWovenSettings({element,onChange}:{element:WovenElement;onChange:(element:WovenElement)=>void}) {
  const [scale,setScale]=useState(100);
  const design=useMemo(()=>layoutWovenDesign(element),[element]);
  const model=useMemo(()=>buildWovenRouteModel(design),[design]);
  return <>
    <DisclosureSection title="Shape & Geometry" defaultOpen>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">Preset<Select className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Preset" value={design.preset} onChange={event=>onChange({...element,settings:{...element.settings,preset:event.target.value as 'rosette'|'figure-eight',overrides:{}}})}><option value="rosette">Six-loop rosette</option><option value="figure-eight">Figure-eight</option></Select></label>
        <NumericSlider label="Proportional scale" unit="%" min={Math.max(1,4/Math.min(element.frame.width,element.frame.height)*scale)} max={Math.min(1000,2000/Math.max(element.frame.width,element.frame.height)*scale)} value={scale} step={1} onChange={next=>{const factor=next/scale,width=element.frame.width*factor,height=element.frame.height*factor;setScale(next);onChange({...element,frame:{x:element.frame.x+(element.frame.width-width)/2,y:element.frame.y+(element.frame.height-height)/2,width,height}});}}/>
        {design.preset==='rosette'&&<NumericSlider label="Loop depth" min={.22} max={.42} value={design.loop} step={.01} onChange={loop=>onChange({...element,settings:{...element.settings,loop,overrides:{}}})}/>}
        <p className="text-xs text-slate-500">Position, dimensions and rotation use the Layout controls above. Corner handles preserve the current proportions.</p>
      </div>
    </DisclosureSection>
    <WovenSettings design={design} model={model} onChange={next=>onChange({...element,settings:wovenSettings(next)})}/>
  </>;
}
