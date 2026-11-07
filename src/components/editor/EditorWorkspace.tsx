'use client';

import { useState, type ReactNode } from 'react';

export default function EditorWorkspace({ preview, inspector, layers, children }: { preview: ReactNode; inspector: ReactNode; layers?: ReactNode; children?: ReactNode }) {
  const [showSettings, setShowSettings] = useState(true);
  return <div className="editor-workspace-container">
    <button type="button" className="workspace-panel-toggle" aria-label={showSettings ? 'Hide settings' : 'Show settings'} aria-expanded={showSettings} aria-controls="tool-inspector" onClick={() => setShowSettings(value => !value)}>Settings <span aria-hidden="true">{showSettings ? '−' : '+'}</span></button>
    <main className={`editor-workspace ${layers ? 'has-layers' : ''} ${showSettings ? '' : 'inspector-hidden'}`}>
    <section className="editor-preview" aria-label="Interactive preview">{preview}</section>
    <div className="editor-settings" hidden={!showSettings}>
      {layers && <aside className="editor-layers" aria-label="Layers and document">{layers}</aside>}
      <aside id="tool-inspector" className="editor-inspector" aria-label="Tool settings"><div className="inspector-heading">Settings</div>{inspector}</aside>
    </div>
    {children}
  </main></div>;
}
