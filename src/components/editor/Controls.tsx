'use client';

import { Children, cloneElement, isValidElement, useId, useState, type ReactNode, type ReactElement, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';

export const INSET_CONTROL_BASE = 'editor-control';
export const INSET_CONTROL_MM = 'editor-control pr-10';
export const INSET_CONTROL_WIDE = 'editor-control pr-14';

export function Button({ className = '', type = 'button', ...props }: ComponentProps<'button'>) {
  return <button {...props} type={type} className={`ui-button ${className}`} />;
}
export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`ui-select ${className}`} />;
}
export function NumericInput({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} type="number" className={`ui-input ${className}`} />;
}
export function Toggle({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} type="checkbox" className={`ui-toggle ${className}`} />;
}
export function Slider({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} type="range" className={`ui-slider ${className}`} />;
}

export function ActionGroup({ label, columns, className = '', children }: { label: string; columns?: 2 | 3 | 6; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} data-columns={columns} className={`action-group ${className}`}>{children}</div>;
}

export function InspectorIntro({ children }: { children: ReactNode }) {
  return <details className="inspector-intro"><summary>About this tool</summary><p>{children}</p></details>;
}

export function InsetLabeledField({ label, disabled = false, className = '', rightAdornment, rightAdornmentInteractive = false, adornmentClassName = 'right-3', children }: { label: string; disabled?: boolean; className?: string; rightAdornment?: ReactNode; rightAdornmentInteractive?: boolean; adornmentClassName?: string; children: ReactNode }) {
  const id = useId();
  return <div className={`editor-field ${className}`} data-disabled={disabled || undefined}>
    <span id={id} className="editor-field-label">{label}</span>
    <div className="relative">{Children.map(children, child => isValidElement(child) && ((typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)) || child.type === NumericInput || child.type === Select) ? cloneElement(child as ReactElement<Record<string, unknown>>, { 'aria-labelledby': id }) : child)}
      {rightAdornment && <span className={`${rightAdornmentInteractive ? '' : 'pointer-events-none'} select-none absolute ${adornmentClassName} top-1/2 -translate-y-1/2 text-xs text-slate-500`}>{rightAdornment}</span>}
    </div>
  </div>;
}

/** Portalled help remains reachable by keyboard and never clips inside inspectors. */
export function InfoTip({ title = 'More information', children, className = '' }: { title?: string; children: ReactNode; className?: string; side?: 'top' | 'right' | 'left' | 'bottom' }) {
  const id = useId();
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  function show(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)), top: rect.bottom + 8, above: rect.bottom > window.innerHeight - 160 });
  }
  return <span className={`inline-flex ${className}`} onMouseLeave={() => setPosition(null)}>
    <button type="button" className="info-trigger" aria-label={title} aria-describedby={position ? id : undefined} aria-expanded={!!position} onMouseEnter={event => show(event.currentTarget)} onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)} onClick={event => position ? setPosition(null) : show(event.currentTarget)} onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}>i</button>
    {position && createPortal(<span id={id} role="tooltip" className="editor-tooltip" style={{ left: position.left, top: position.above ? undefined : position.top, bottom: position.above ? 16 : undefined }}>{children}</span>, document.body)}
  </span>;
}
