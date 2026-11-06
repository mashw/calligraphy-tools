'use client';

import type { ReactNode } from 'react';
import type { EditorCamera } from './useEditorCamera';

export default function PreviewToolbar({ camera, children, pageLabel = 'Fit page' }: { camera: EditorCamera; children?: ReactNode; pageLabel?: string }) {
  return <div className="preview-toolbar">
    <div className="camera-controls" role="group" aria-label="Preview navigation">
      <button type="button" aria-pressed={camera.mode === 'page'} onClick={() => camera.fit('page')}>{pageLabel}</button>
      <button type="button" aria-pressed={camera.mode === 'content'} onClick={() => camera.fit('content')}>Fit content</button>
      <button type="button" aria-label="Zoom out" onClick={() => camera.zoomBy(1 / 1.2)}>−</button>
      <output aria-label="Preview zoom">{Math.round(camera.zoom * 100)}%</output>
      <button type="button" aria-label="Zoom in" onClick={() => camera.zoomBy(1.2)}>+</button>
      <button type="button" onClick={() => camera.fit('page')}>Reset view</button>
    </div>
    {children && <div className="document-actions" role="group" aria-label="Document and export actions">{children}</div>}
    <p className="camera-hint">Alt-drag / middle-drag to pan · Ctrl / ⌘ + wheel to zoom</p>
  </div>;
}
