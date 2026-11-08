'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { TOOLS } from '@/lib/editor/tools';


export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), router = useRouter();
  const current = TOOLS.find(([path]) => path === pathname);
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <header className="app-bar">
      <Link className="app-brand" href="/" aria-label="Calligraphy Tools directory"><span aria-hidden="true" className="brand-mark">C<span>t</span></span><span>Calligraphy<span className="brand-subtitle">TOOLS</span></span></Link>
      <span className="app-divider" aria-hidden="true" />
      <label className="tool-switcher"><span className="sr-only">Choose a tool</span><select value={current?.[0] ?? ''} onChange={event => router.push(event.target.value)}><option value="">Tool directory</option>{TOOLS.map(([path, name]) => <option key={path} value={path}>{name}</option>)}</select></label>
      <span className="app-caption">A studio for thoughtful lettering</span>
      <Link className="all-tools" href="/">All tools ↗</Link>
    </header>
    {current && <div className="tool-heading"><h1>{current[1]}</h1><p>{current[2]}</p>{pathname === '/borders/dev' && <span className="experimental-badge">Experimental</span>}</div>}
    <div id="workspace-content" tabIndex={-1}>{children}</div>
  </div>;
}

