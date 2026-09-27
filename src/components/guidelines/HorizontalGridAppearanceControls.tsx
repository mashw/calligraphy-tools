import { resolveHorizontalGridAppearance, type HorizontalGridAppearance } from '@/lib/guides/guide-template';

const input='w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';
export default function HorizontalGridAppearanceControls({value,onChange}:{value?:HorizontalGridAppearance;onChange:(value:HorizontalGridAppearance)=>void}){
  const resolved=resolveHorizontalGridAppearance(value),patch=(next:Partial<HorizontalGridAppearance>)=>onChange({...resolved,...next});
  return <div className="space-y-3"><label className="block space-y-1 text-xs font-medium text-slate-600">Horizontal grid lines<select className={input} value={resolved.style} onChange={event=>patch({style:event.target.value as HorizontalGridAppearance['style']})}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></label>{resolved.style==='dashed'&&<div className="grid grid-cols-2 gap-3">{([['dashMM','Dash'],['gapMM','Gap']] as const).map(([key,label])=><label key={key} className="space-y-1 text-xs font-medium text-slate-600">{label}<div className="relative"><input className={input} type="number" min=".1" step=".5" value={resolved[key]} onChange={event=>patch({[key]:Math.max(.1,Number(event.target.value)||.1)})}/><span className="pointer-events-none absolute right-2 top-1.5 text-slate-400">mm</span></div></label>)}</div>}</div>;
}
