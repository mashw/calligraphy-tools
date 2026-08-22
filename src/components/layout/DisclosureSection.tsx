'use client';

import { useState, type ReactNode } from 'react';
import { useSettingsAccordion } from './SettingsAccordion';

function ChevronIcon({ direction }: { direction: 'up' | 'down' | 'left' | 'right' }) {
  const rotation = direction === 'up' ? 'rotate-180' : direction === 'right' ? '-rotate-90' : direction === 'left' ? 'rotate-90' : '';
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform ${rotation}`}><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function DisclosureSection({ title, defaultOpen = false, className = '', headerAction, children }: { title: string; defaultOpen?: boolean; className?: string; headerAction?: ReactNode; children: ReactNode }) {
  const accordion = useSettingsAccordion();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = accordion ? accordion.isOpen(title) : localOpen;
  const horizontal = !!accordion && accordion.mode !== 'compact';
  const horizontalRail = horizontal && !open;
  const width = accordion?.panelWidth(title);
  const toggle = () => accordion ? accordion.toggle(title) : setLocalOpen(value => !value);
  const direction = horizontal ? accordion!.disclosureDirection(title) : open ? 'up' : 'down';
  return <section data-settings-section={title} className={`rounded-lg border border-slate-200 bg-white transition-[width] ${horizontal ? 'shrink-0 self-stretch' : `w-full ${className}`}`} style={width === null || width === undefined ? undefined : { width, minWidth: width, flex: `0 0 ${width}px` }}>
    <div className={`flex items-center ${horizontalRail ? 'h-full min-h-44 flex-col' : ''}`}><button type="button" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} onClick={toggle} className={`group flex min-h-10 min-w-0 flex-1 rounded-lg font-semibold transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${horizontalRail ? 'w-full flex-col items-center justify-between gap-3 px-2 py-3' : 'items-center justify-between gap-3 px-3 py-2 text-left'}`}>
      <span className={horizontalRail ? '[writing-mode:vertical-rl] rotate-180' : ''}>{title}</span><span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 group-hover:text-indigo-600"><ChevronIcon direction={direction} /></span>
    </button>{headerAction && !horizontalRail && <div className="shrink-0 pr-2">{headerAction}</div>}</div>
    {open && <div className="border-t border-slate-100 p-3">{children}</div>}
  </section>;
}
