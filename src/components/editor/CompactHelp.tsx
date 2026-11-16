import type { ReactNode } from 'react';

/** Native disclosure keeps instructions available to touch and keyboard users. */
export default function CompactHelp({ label, children, below = false }: { label: string; children: ReactNode; below?: boolean }) {
  return <details className={`compact-help ${below ? 'help-below' : ''}`}>
    <summary aria-label={label} title={label}><span aria-hidden="true">i</span></summary>
    <div className="compact-help-content">{children}</div>
  </details>;
}
