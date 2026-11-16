'use client';
import { useId, useState, type ReactNode } from 'react';
import { useSettingsAccordion } from './SettingsAccordion';
export default function DisclosureSection({ title, defaultOpen = false, className = '', headerAction, children }: { title: string; defaultOpen?: boolean; className?: string; headerAction?: ReactNode; children: ReactNode }) {
  const accordion = useSettingsAccordion(), id = useId();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = accordion ? accordion.isOpen(title) : localOpen;
  return <section data-settings-section={title} className={`disclosure-section ${className}`}>
    <div className="disclosure-heading"><button type="button" aria-expanded={open} aria-controls={id} onClick={() => accordion ? accordion.toggle(title) : setLocalOpen(value => !value)}><span>{title}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button>{headerAction}</div>
    <div id={id} hidden={!open} className="disclosure-content">{children}</div>
  </section>;
}
