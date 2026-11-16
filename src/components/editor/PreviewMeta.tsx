import type { ReactNode } from 'react';
import CompactHelp from './CompactHelp';

export default function PreviewMeta({ children, help }: { children: ReactNode; help?: ReactNode }) {
  return <div className="preview-meta" aria-label="Preview information">
    <div className="preview-meta-values">{children}</div>
    {help && <CompactHelp label="Preview and output instructions">{help}</CompactHelp>}
  </div>;
}
