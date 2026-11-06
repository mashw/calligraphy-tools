'use client';

import { useState, type ReactNode } from 'react';

export default function EditorWorkspace({ preview, inspector, layers, children }: { preview: ReactNode; inspector: ReactNode; layers?: ReactNode; children?: ReactNode }) {
  const [showSettings, setShowSettings] = useState(true);
  return <main className={`editor-workspace ${layers ? 'has-layers' : ''} ${showSettings ? '' : 'inspector-hidden'}`}>
    <div className="workspace-switch"><span>Design workspace</span><button type="button" aria-expanded={showSettings} aria-controls="tool-inspector" onClick={() => setShowSettings(value => !value)}>{showSettings ? 'Hide settings' : 'Show settings'}</button></div>
    {layers && <aside className="editor-layers" aria-label="Layers and document">{layers}</aside>}
    <section className="editor-preview" aria-label="Interactive preview">{preview}</section>
    <aside id="tool-inspector" className="editor-inspector" aria-label="Tool settings" hidden={!showSettings}><div className="inspector-heading">Settings <span>Design & appearance</span></div>{inspector}</aside>
    {children}
  </main>;
}
