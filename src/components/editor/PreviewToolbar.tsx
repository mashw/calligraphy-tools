'use client';

import { useState, type ReactNode } from 'react';
import type { EditorCamera } from './useEditorCamera';
import CompactHelp from './CompactHelp';

export default function PreviewToolbar({
  camera, children, pageLabel = 'Fit page', showFitContent = true, showTop = false, help, contrast, onContrastChange,
}: {
  camera: EditorCamera;
  contrast?: boolean;
  onContrastChange?: (value:boolean)=>void;
  children?: ReactNode;
  pageLabel?: string;
  showFitContent?: boolean;
  showTop?: boolean;
  help?: ReactNode;
}) {
  const [localContrast,setLocalContrast] = useState(false);
  const enabled = contrast ?? localContrast;
  return <div className="preview-toolbar" data-preview-contrast={contrast === undefined && enabled ? 'high' : undefined}>
    <div className="camera-controls" role="group" aria-label="Preview navigation">
      <button type="button" aria-pressed={camera.mode === 'page'} onClick={() => camera.fit('page')}>{pageLabel}</button>
      {showFitContent && <button type="button" aria-pressed={camera.mode === 'content'} onClick={() => camera.fit('content')}>Fit content</button>}
      <div className="camera-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onClick={() => camera.zoomBy(1 / 1.2)}>-</button>
        <output aria-label="Preview zoom">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" onClick={() => camera.zoomBy(1.2)}>+</button>
      </div>
      {showTop && <button type="button" onClick={camera.top}>Top</button>}
      <button type="button" aria-pressed={enabled} onClick={()=> (onContrastChange ?? setLocalContrast)(!enabled)}>High contrast</button>
      <CompactHelp label="Preview navigation help" below>
        <p>Alt-drag or middle-drag to pan. Ctrl / ? + mouse wheel zooms around the pointer.</p>
        {help}
      </CompactHelp>
    </div>
    {children && <div className="document-actions" role="group" aria-label="Document and export actions">{children}</div>}
  </div>;
}
