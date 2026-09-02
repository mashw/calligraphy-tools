'use client';

import type { AcanthusOptions, AcanthusSide, DetailLevel, ShadingDensity } from '@/lib/borders/acanthus/types';
import type { ImportedGuide } from '@/lib/borders/path-import';

type Props = {
  options: AcanthusOptions; setOptions: (next: AcanthusOptions) => void;
  presets: ImportedGuide[]; selected: number; onSelect: (index: number) => void;
  reverse: boolean; onReverse: (value: boolean) => void; construction: boolean; onConstruction: (value: boolean) => void;
  onUpload: (file: File) => void; message: string | null;
};

export default function BorderDevControls({ options, setOptions, presets, selected, onSelect, reverse, onReverse, construction, onConstruction, onUpload, message }: Props) {
  const set = <K extends keyof AcanthusOptions>(key: K, value: AcanthusOptions[K]) => setOptions({ ...options, [key]: value });
  return <aside className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <section><label className="mb-1 block font-semibold" htmlFor="guide">Growth spine</label><select id="guide" className="w-full rounded border p-2" value={selected} onChange={e => onSelect(Number(e.target.value))}>{presets.map((p, i) => <option key={`${p.name}-${i}`} value={i}>{p.name}</option>)}</select>
      <label className="mt-3 block rounded border border-dashed p-3 text-center font-medium hover:bg-slate-50">Upload vector SVG<input className="sr-only" type="file" accept="image/svg+xml,.svg" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = ''; }} /></label>{message && <p className="mt-2 text-xs text-amber-700">{message}</p>}</section>
    <section className="space-y-3 border-t pt-4">
      <Range label="Leaf size" value={options.leafSize} min={14} max={52} unit=" mm" onChange={v => set('leafSize', v)} />
      <Range label="Pitch" value={options.pitch} min={10} max={45} unit=" mm" onChange={v => set('pitch', v)} />
      <Range label="Fullness" value={options.fullness} min={0} max={1} step={.05} onChange={v => set('fullness', v)} />
      <Range label="Regular ↔ organic" value={options.organic} min={0} max={1} step={.05} onChange={v => set('organic', v)} />
      <Select label="Side" value={options.side} values={['left','right','both','inward','outward']} onChange={v => set('side', v as AcanthusSide)} />
      <Select label="Detail" value={options.detail} values={['low','medium','high']} onChange={v => set('detail', v as DetailLevel)} />
    </section>
    <section className="space-y-3 border-t pt-4">
      <Check label="Line shading" checked={options.lineShading} onChange={v => set('lineShading', v)} />
      {options.lineShading && <Select label="Shading density" value={options.shadingDensity} values={['light','medium','rich']} onChange={v => set('shadingDensity', v as ShadingDensity)} />}
      <div className="flex gap-2"><button className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white" onClick={() => set('seed', options.seed + 1)}>Regenerate</button><span className="self-center text-xs text-slate-500">Seed {options.seed}</span></div>
      <Check label="Reverse path direction" checked={reverse} onChange={onReverse} />
      <Check label="Show construction" checked={construction} onChange={onConstruction} />
    </section>
  </aside>;
}

function Range({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void }) { return <label className="block"><span className="flex justify-between text-xs font-medium"><span>{label}</span><span>{value}{unit}</span></span><input className="w-full accent-emerald-700" type="range" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} /></label>; }
function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) { return <label className="flex items-center justify-between gap-3 text-xs font-medium"><span>{label}</span><select className="rounded border px-2 py-1 capitalize" value={value} onChange={e => onChange(e.target.value)}>{values.map(v => <option key={v}>{v}</option>)}</select></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>; }

