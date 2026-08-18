'use client';

import type { ElementType, LayoutElement } from '@/lib/layout/types';

type Props = {
  elements: LayoutElement[]; selectedId: string; onSelect: (id: string) => void;
  onAdd: (type: Exclude<ElementType, 'page'>) => void; onToggleLock: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void;
};

const icons: Record<ElementType, string> = { page: '▱', guidelines: '☰', calligram: '◯', 'curved-title': '⌒', shape: '◇' };
const button = 'h-7 w-7 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30';

export default function LayersPanel({ elements, selectedId, onSelect, onAdd, onToggleLock, onMove, onDuplicate, onDelete }: Props) {
  const additions: [Exclude<ElementType, 'page'>, string][] = [['guidelines', 'Guidelines'], ['calligram', 'Calligram'], ['curved-title', 'Curved title'], ['shape', 'Shape']];
  return <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <h2 className="font-semibold text-slate-800">Elements</h2>
    <div className="mt-3 flex flex-wrap gap-2">{additions.map(([type, label]) => <button key={type} onClick={() => onAdd(type)} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">+ {label}</button>)}</div>
    <div className="mt-3 space-y-1">{elements.map((element, index) => {
      const page = element.type === 'page';
      return <div key={element.id} role="button" tabIndex={0} onClick={() => onSelect(element.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(element.id); }} className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${selectedId === element.id ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}>
        <span aria-hidden className="w-5 text-center text-slate-500">{icons[element.type]}</span><span className="min-w-0 flex-1 truncate font-medium">{element.name}</span>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button title={element.locked ? 'Unlock' : 'Lock'} aria-label={element.locked ? 'Unlock' : 'Lock'} disabled={page} onClick={() => onToggleLock(element.id)} className={button}>{element.locked ? '🔒' : '♢'}</button>
          <button title="Move up" aria-label="Move up" disabled={page || index === 0} onClick={() => onMove(element.id, -1)} className={button}>↑</button>
          <button title="Move down" aria-label="Move down" disabled={page || elements[index + 1]?.type === 'page'} onClick={() => onMove(element.id, 1)} className={button}>↓</button>
          <button title="Duplicate" aria-label="Duplicate" disabled={page} onClick={() => onDuplicate(element.id)} className={button}>⧉</button>
          <button title="Delete" aria-label="Delete" disabled={page} onClick={() => onDelete(element.id)} className={button}>×</button>
        </div>
      </div>;
    })}</div>
  </section>;
}
