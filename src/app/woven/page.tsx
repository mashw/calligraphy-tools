'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { INSULAR_MAJUSCULE_DEFAULTS } from '@/lib/guides/straight/blackletter';
import { DEFAULT_DESIGN, LIMITS, parseDesign, type Design } from '@/lib/woven/design';
import { buildWovenModel } from '@/lib/woven/model';
import { pointsD, scenePdf, sceneSvg } from '@/lib/woven/vector-export';

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700';
const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700';
type NumericKey = keyof typeof LIMITS;

function NumberControl({ label, value, range, step = 1, unit = '', onChange }: { label: string; value: number; range: readonly [number, number]; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="block space-y-2"><span className="flex items-center justify-between gap-3 text-sm text-slate-700">{label}<span className="flex items-center gap-1"><input aria-label={label} type="number" className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right tabular-nums" min={range[0]} max={range[1]} step={step} value={value} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(Math.max(range[0], Math.min(range[1], e.target.valueAsNumber))); }} />{unit}</span></span><input aria-label={`${label} slider`} className="w-full accent-teal-800" type="range" min={range[0]} max={range[1]} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details open={open} className="border-b border-slate-200 px-5 py-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{title}</summary><div className="mt-4 space-y-4">{children}</div></details>;
}

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WovenPage() {
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const model = useMemo(() => buildWovenModel(design), [design]);
  const scene = design.annotated ? model.annotated : model.clean;
  function update<K extends keyof Design>(key: K, value: Design[K]) { setDesign(d => ({ ...d, [key]: value, ...(['preset', 'loop', 'reverse'].includes(key) ? { overrides: {} } : {}) })); }
  function numeric(key: NumericKey, label: string, step = 1, unit = '') { return <NumberControl label={label} value={design[key]} range={LIMITS[key]} step={step} unit={unit} onChange={v => update(key, v)} />; }
  function flip(id: string) { setSelected(id); setDesign(d => ({ ...d, overrides: { ...d.overrides, [id]: model.choices[id] === 'a' ? 'b' : 'a' } })); }
  function pdf() { const bytes = scenePdf(scene); download(new Uint8Array(bytes).buffer, 'application/pdf', `woven-${design.annotated ? 'plan' : 'guides'}.pdf`); }
  const active = model.crossings.find(c => c.id === selected);

  return <main className="min-h-screen bg-[#f1f3f2] text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 lg:px-8">
      <div><div className="mb-1 flex items-center gap-3 text-xs uppercase tracking-[.18em] text-teal-800"><span>Calligraphy tools</span><span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] tracking-normal">Guideline studio</span></div><h1 className="text-2xl font-semibold tracking-tight">Woven Calligraphy</h1><p className="mt-1 text-sm text-slate-600">Build a flowing shape. Plan the crossings. Write it by hand.</p></div>
      <nav className="flex flex-wrap gap-2" aria-label="Related tools"><Link className={buttonClass} href="/path-guides">Path Guides</Link><Link className={buttonClass} href="/calligram">Calligram</Link><button className={buttonClass} onClick={() => fileRef.current?.click()}>Open design</button><button className={buttonClass} onClick={() => download(JSON.stringify(design, null, 2), 'application/json', 'woven-design.json')}>Save design</button></nav>
    </header>
    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" aria-label="Open Woven Calligraphy design" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 100000) throw new Error('Design file is too large.'); setDesign(parseDesign(JSON.parse(await file.text()))); setSelected(null); setStatus('Design opened.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not open design.'); } e.target.value = ''; }} />
    <div className="mx-auto grid max-w-[1700px] gap-5 p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-6">
      <aside className="self-start overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-[calc(100vh-155px)] lg:overflow-y-auto">
        <Section title="1. Shape" open>
          <label className="block text-sm">Preset<select className={`${fieldClass} mt-2`} value={design.preset} onChange={e => { update('preset', e.target.value as Design['preset']); setSelected(null); }}><option value="rosette">Six-loop rosette</option><option value="figure-eight">Figure-eight</option></select></label>
          <p className="text-xs leading-relaxed text-slate-500">One continuous closed route. The rosette is an original preset inspired by woven lettering.</p>
          {numeric('width', 'Width', 1, 'mm')}{numeric('height', 'Height', 1, 'mm')}
          {design.preset === 'rosette' && numeric('loop', 'Loop depth', .01)}
          {numeric('rotation', 'Rotation', 1, '°')}
          <p className="text-xs text-slate-500">Changing the preset, loop depth or direction resets crossing choices.</p>
        </Section>
        <Section title="2. Writing guides" open>
          <label className="block text-sm">Script<select className={`${fieldClass} mt-2`} value={design.script} onChange={e => { const script = e.target.value as Design['script']; setDesign(d => ({ ...d, script, xNib: script === 'InsularMajuscule' ? INSULAR_MAJUSCULE_DEFAULTS.xNib : script === 'TexturaQuadrata' ? 5 : script === 'Copperplate' ? 4 : 4.5, ascNib: script === 'Copperplate' ? 6 : 2, descNib: script === 'Copperplate' ? 6 : 2 })); }}><option value="TexturaQuadrata">Textura Quadrata</option><option value="Fraktur">Fraktur</option><option value="InsularMajuscule">Insular majuscule</option><option value="Copperplate">Copperplate</option></select></label>
          {numeric('nib', design.script === 'Copperplate' ? 'Guide unit' : 'Nib width', .05, 'mm')}
          {numeric('xNib', 'X-height', .5, 'units')}{numeric('ascNib', 'Ascender above waist', .5, 'units')}{numeric('descNib', 'Descender below base', .5, 'units')}
          <p className="text-xs text-slate-500">X-height: {(design.nib * design.xNib).toFixed(2)} mm.{design.script === 'Copperplate' ? ' Guide unit sets proportions, not pointed-pen tip width.' : ' One unit equals one nib width.'}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.fullGuides} onChange={e => update('fullGuides', e.target.checked)} />Show ascender and descender guides</label>
        </Section>
        <Section title="3. Route & crossings">
          {numeric('start', 'Start position', .5, '%')}{numeric('gap', 'Start/end gap', .5, 'mm')}{numeric('clearance', 'Crossing clearance', .1, 'mm')}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.reverse} onChange={e => update('reverse', e.target.checked)} />Reverse writing direction</label>
          <p className="text-xs leading-relaxed text-slate-500">Click a numbered crossing on the page to swap over/under. The start arrow follows the writing direction.</p>
          <div className="flex flex-wrap gap-2">{model.crossings.map((c, i) => <button key={c.id} aria-label={`Swap crossing ${i + 1}`} aria-pressed={selected === c.id} className={`${buttonClass} ${selected === c.id ? '!border-teal-700 !bg-teal-50' : ''}`} onClick={() => flip(c.id)}>{i + 1}</button>)}</div>
          <button className={buttonClass} onClick={() => update('overrides', {})}>Restore alternating weave</button>
        </Section>
        <Section title="4. Print & export" open>
          <label className="block text-sm">Sheet contents<select className={`${fieldClass} mt-2`} value={design.annotated ? 'plan' : 'clean'} onChange={e => update('annotated', e.target.value === 'plan')}><option value="plan">Annotated writing plan</option><option value="clean">Clean guidelines</option></select></label>
          <div className="grid grid-cols-2 gap-2"><button className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-medium text-white hover:bg-teal-900" onClick={pdf}>Download PDF</button><button className={buttonClass} onClick={() => download(sceneSvg(scene), 'image/svg+xml', 'woven-guides.svg')}>Download SVG</button></div>
          <p className="text-xs leading-relaxed text-slate-500">A4 portrait · vector lines. Print the PDF at actual size, with no fit-to-page scaling. Check the 50 mm ruler.</p>
        </Section>
        <div className="px-5 py-4 text-xs leading-relaxed text-slate-500">First version: shape and guideline planning. Text fitting and SVG import are planned for the next stage.</div>
      </aside>
      <section className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Writing sheet preview">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full border border-slate-200 bg-white px-3 py-2">{model.crossings.length} crossings</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">{Math.round(model.route.length)} mm route</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">{Math.round(model.usableLength)} mm visible route</span></div><div className="flex items-center gap-1"><button className={buttonClass} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - .25))}>−</button><button className={buttonClass} onClick={() => setZoom(1)}>Fit page</button><button className={buttonClass} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .25))}>+</button></div></div>
        <div className="h-[68vh] min-h-[440px] overflow-auto rounded-xl border border-slate-200 bg-[#e3e7e5] p-5 lg:h-[calc(100vh-245px)]" data-testid="preview-scroll">
          <svg role="img" aria-label={`${design.preset} calligraphy guideline preview`} viewBox="0 0 210 297" width={`${Math.round(210 * 2.1 * zoom)}`} height={`${Math.round(297 * 2.1 * zoom)}`} className="mx-auto block bg-white shadow-lg" style={zoom === 1 ? { width: 'auto', height: '100%', maxWidth: '100%' } : { minWidth: `${Math.round(210 * 2.1 * zoom)}px` }}>
            <title>Woven Calligraphy writing sheet</title>
            {scene.strokes.map((s, i) => <path key={i} d={pointsD(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />)}
            {scene.labels.map((l, i) => <text key={i} x={l.point.x} y={l.point.y} fontSize={l.size} fill={l.color} fontFamily="Arial, sans-serif">{l.text}</text>)}
            {design.annotated && model.crossings.map((c, i) => <g key={c.id} role="button" tabIndex={0} aria-label={`Swap crossing ${i + 1}`} onClick={() => flip(c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(c.id); } }} className="cursor-pointer"><title>Crossing {i + 1}: click to swap over/under</title><circle cx={c.point.x} cy={c.point.y} r={3} fill="transparent" stroke={selected === c.id ? '#0f766e' : 'transparent'} strokeWidth={.35} /></g>)}
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><p>{active ? `Crossing ${model.crossings.indexOf(active) + 1} selected · click again to swap.` : 'Open Route & crossings to adjust the weave and start position.'}</p><span>{Math.round(zoom * 100)}% preview · A4 portrait</span></div>
        <div role="status" aria-live="polite" className="mt-3 space-y-2">{status && <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm">{status}</p>}{model.warnings.map(w => <p key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{w}</p>)}</div>
      </section>
    </div>
  </main>;
}
