'use client';

import { useState, type ReactNode } from 'react';

export default function DisclosureSection({ title, defaultOpen = false, className = '', children }: { title: string; defaultOpen?: boolean; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
      <span>{title}</span><span aria-hidden className="text-slate-500">{open ? '▾' : '›'}</span>
    </button>
    {open && <div className="border-t border-slate-100 p-3">{children}</div>}
  </section>;
}
