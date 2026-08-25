'use client';

import { resolveConstructionGuideSettings, type BlackletterScript, type ConstructionGuideAppearance, type ConstructionGuideSettings } from '@/lib/guides/guide-template';
import type { ScriptId } from '@/lib/scripts';

export default function ConstructionGuideControls({ script, value, onChange, compact = false }: { script: ScriptId; value?: ConstructionGuideSettings; onChange: (value: ConstructionGuideSettings) => void; compact?: boolean }) {
  if (script === 'Copperplate') return null;
  const settings = resolveConstructionGuideSettings(script as BlackletterScript, value);
  const fraktur = script === 'Fraktur';
  const rows = fraktur ? [
    ['upper', 'Downstroke start guide', 'Align the right edge of the nib with this guide to establish the start of the main downstroke.'],
    ['lower', 'Spur guide', 'Marks the height where the main downstroke branches left to form the spur.'],
  ] as const : [
    ['upper', 'Upper quadrant start guide', 'Align the left edge of the nib with this guide to establish the start of the upper quadrant.'],
    ['lower', 'Lower quadrant start guide', 'Align the left edge of the nib with this guide to establish the start of the lower quadrant.'],
  ] as const;
  return <div className={compact ? 'space-y-2' : 'space-y-3'}>
    {rows.map(([key, label, tip]) => <label key={key} className="flex items-center justify-between gap-3 text-sm text-slate-700"><span className="flex items-center gap-1.5">{label}<span title={tip} aria-label={tip} className="cursor-help text-xs text-slate-400">ⓘ</span></span><input type="checkbox" checked={settings[key]} onChange={event => onChange({ ...settings, [key]: event.target.checked })} className="accent-indigo-600" /></label>)}
    <label className="block space-y-1 text-xs font-medium text-slate-600">Appearance<select className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700" value={settings.appearance} onChange={event => onChange({ ...settings, appearance: event.target.value as ConstructionGuideAppearance })}><option value="dashed">Dashed line</option><option value="dots">Dots</option></select></label>
    {settings.appearance === 'dots' && <label className="block space-y-1 text-xs font-medium text-slate-600">Dot every <span className="flex items-center gap-2"><input type="number" min={1} max={12} step={1} className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm" value={settings.dotEvery} onChange={event => onChange({ ...settings, dotEvery: Math.max(1, Math.min(12, Math.round(Number(event.target.value) || 3))) })} /> uprights</span><span className="block font-normal text-slate-500">Starting from the first upright.</span></label>}
    <label className="block space-y-1 text-xs font-medium text-slate-600">Construction guide colour<input type="color" className="h-9 w-full rounded border border-slate-300" value={settings.color} onChange={event => onChange({ ...settings, color: event.target.value })} /></label>
  </div>;
}
