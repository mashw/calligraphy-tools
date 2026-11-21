'use client';

import { InfoTip, NumericInput, Select, Switch } from '@/components/editor/Controls';
import DisclosureSection from '@/components/layout/DisclosureSection';
import {
  DEFAULT_CONSTRUCTION_GUIDES,
  resolveConstructionGuideSettings,
  type ConstructionGuideAppearance,
  type ConstructionGuideSettings,
} from '@/lib/guides/guide-template';
import type { ScriptId } from '@/lib/scripts';

export default function ConstructionGuideControls({ scripts, value, onChange }: {
  scripts: (ScriptId | false)[];
  value?: ConstructionGuideSettings;
  onChange: (value: ConstructionGuideSettings) => void;
}) {
  const fraktur = scripts.includes('Fraktur');
  const textura = scripts.includes('TexturaQuadrata');
  const insular = scripts.includes('InsularMajuscule');
  const legacyInsular = insular && !!(value?.upper || value?.lower);
  if (!fraktur && !textura && !legacyInsular) return null;

  const current = { ...DEFAULT_CONSTRUCTION_GUIDES, ...value };
  const script = fraktur ? 'Fraktur' : textura ? 'TexturaQuadrata' : 'InsularMajuscule';
  const settings = resolveConstructionGuideSettings(script, current);
  const shared = fraktur && (textura || insular);
  const rows = [
    { key: 'upper', appearanceKey: 'upperAppearance', label: shared ? 'Upper mark' : fraktur ? 'Downstroke start guide' : 'Upper quadrant start guide' },
    { key: 'lower', appearanceKey: 'lowerAppearance', label: shared ? 'Lower mark' : fraktur ? 'Spur guide' : 'Lower quadrant start guide' },
  ] as const;
  const usesDots = rows.some(({ key, appearanceKey }) => settings[key] && settings[appearanceKey] === 'dots');

  const title = fraktur || textura ? 'Construction guides' : 'Existing construction guides';
  return <DisclosureSection key={title} title={title}>
    <div className="space-y-3">
      {scripts.filter(Boolean).length > 1 && <p className="text-xs text-slate-600">
        These settings apply across enabled bands that use construction marks.
        {shared && ' The upper and lower marks are the downstroke start and spur in Fraktur, and the quadrant starts in the other script.'}
      </p>}
      {rows.map(({ key, appearanceKey, label }) => <div key={key} className="space-y-1.5">
        <Switch label={label} checked={settings[key]} onChange={checked => onChange({ ...current, [key]: checked })} />
        {settings[key] && <label className="block space-y-1 text-xs font-medium text-slate-600">
          {label} appearance
          <Select className="w-full" value={shared && !current[appearanceKey] && !current.appearance ? 'script-default' : settings[appearanceKey]}
            onChange={event => {
              const appearance = event.target.value;
              onChange({ ...current, [appearanceKey]: appearance === 'script-default' ? undefined : appearance as ConstructionGuideAppearance });
            }}>
            {shared && !current.appearance && <option value="script-default">Script default</option>}
            <option value="nib-edge">Nib-edge mark</option>
            <option value="dots">Dots</option>
            <option value="x">X</option>
            <option value="dashed">Dashed line</option>
          </Select>
        </label>}
      </div>)}
      {usesDots && <div className="flex items-center gap-2 text-xs text-slate-600">
        <label>Dot every <NumericInput min={1} max={12} step={1} className="w-16" value={settings.dotEvery}
          onChange={event => onChange({ ...current, dotEvery: Math.max(1, Math.min(12, Math.round(Number(event.target.value) || 3))) })} /> uprights</label>
        <InfoTip title="Construction dot spacing">Starts at the first upright.</InfoTip>
      </div>}
      {(settings.upper || settings.lower) && <label className="block space-y-1 text-xs font-medium text-slate-600">
        Construction guide colour
        <input type="color" className="h-9 w-full rounded border border-slate-300" value={settings.color}
          onChange={event => onChange({ ...current, color: event.target.value })} />
      </label>}
    </div>
  </DisclosureSection>;
}
