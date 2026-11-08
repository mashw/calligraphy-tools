'use client';

import { useId, useState } from 'react';
import { NumericInput, Slider } from './Controls';

export default function NumericSlider({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const format = (number: number) => Number(number.toFixed(6)).toString();
  return <div className="numeric-slider">
    <label id={id} htmlFor={`${id}-value`}>{label}{unit && <span className="numeric-unit">{unit}</span>}</label>
    <Slider aria-label={`${label} slider`} min={min} max={max} step={step} value={value} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    <NumericInput id={`${id}-value`} aria-labelledby={id} min={min} max={max} step="any" value={draft ?? format(value)}
      onFocus={() => setDraft(format(value))}
      onChange={event => {
        const text = event.currentTarget.value, number = event.currentTarget.valueAsNumber;
        setDraft(text);
        // Do not clamp intermediate keystrokes (e.g. typing 275 starts with 2).
        if (Number.isFinite(number) && number >= min && number <= max) onChange(number);
      }}
      onBlur={event => {
        const number = event.currentTarget.valueAsNumber;
        if (Number.isFinite(number)) {
          const next = Math.min(max, Math.max(min, number));
          if (next !== value) onChange(next);
        }
        setDraft(null);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { event.preventDefault(); setDraft(null); }
      }} />
  </div>;
}
