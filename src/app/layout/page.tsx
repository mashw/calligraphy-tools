'use client';

import { useState } from 'react';
import LayoutInspector from '@/components/layout/LayoutInspector';
import LayoutStage from '@/components/layout/LayoutStage';
import LayersPanel from '@/components/layout/LayersPanel';
import { newElement, pageElement, pageSize, type ElementType, type Frame, type LayoutElement } from '@/lib/layout/types';

export default function LayoutPage() {
  const [elements, setElements] = useState<LayoutElement[]>(() => [pageElement()]);
  const [selectedId, setSelectedId] = useState('page');
  const selected = elements.find(element => element.id === selectedId) ?? elements[elements.length - 1];
  const page = elements.find(element => element.type === 'page')!;
  const update = (id: string, fn: (element: LayoutElement) => LayoutElement) => setElements(current => current.map(element => element.id === id ? fn(element) : element));
  const add = (type: Exclude<ElementType, 'page'>) => {
    const count = elements.filter(element => element.type === type).length + 1;
    const element = newElement(type, count, pageSize(page));
    setElements(current => [element, ...current]); setSelectedId(element.id);
  };
  const move = (id: string, direction: -1 | 1) => setElements(current => {
    const index = current.findIndex(element => element.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length || current[target].type === 'page') return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const duplicate = (id: string) => {
    const source = elements.find(element => element.id === id); if (!source || source.type === 'page') return;
    const copy = structuredClone(source); copy.id = `${source.type}-${crypto.randomUUID()}`; copy.name = `${source.name} copy`; copy.frame.x += 5; copy.frame.y += 5;
    setElements(current => { const index = current.findIndex(element => element.id === id); const next = [...current]; next.splice(index, 0, copy); return next; }); setSelectedId(copy.id);
  };
  const remove = (id: string) => { if (id === 'page') return; setElements(current => current.filter(element => element.id !== id)); if (selectedId === id) setSelectedId('page'); };
  const commit = (id: string, frame: Frame) => update(id, element => ({ ...element, frame }));

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-sm text-slate-900 sm:px-6">
    <header className="mx-auto mb-5 max-w-[1480px]"><h1 className="text-3xl font-semibold tracking-tight">Calligraphy Tools <span className="text-indigo-600">— Layout</span></h1><p className="mt-1 text-slate-600">Arrange calligraphy elements on a physical page.</p></header>
    <div className="mx-auto grid max-w-[1480px] grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
      <LayoutStage elements={elements} selectedId={selectedId} onSelect={setSelectedId} onCommit={commit} />
      <div className="min-h-0 xl:relative"><LayersPanel className="xl:absolute xl:inset-0 xl:h-full xl:overflow-hidden" elements={elements} selectedId={selectedId} onSelect={setSelectedId} onAdd={add} onToggleLock={id => update(id, element => element.type === 'page' ? element : ({ ...element, locked: !element.locked }))} onMove={move} onDuplicate={duplicate} onDelete={remove} /></div>
      <div className="xl:col-span-2"><LayoutInspector element={selected} page={page} onChange={next => update(selected.id, () => next)} /></div>
    </div>
  </main>;
}
