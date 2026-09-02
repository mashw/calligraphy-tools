'use client';

import { useState } from 'react';
import BorderDevControls from '@/components/borders/BorderDevControls';
import BorderDevStage from '@/components/borders/BorderDevStage';
import type { AcanthusOptions } from '@/lib/borders/acanthus/types';
import { importGuidePaths, type ImportedGuide } from '@/lib/borders/path-import';

const BUILT_INS: ImportedGuide[] = [
  { name: 'Acanthus component study', d: 'M 60 215 H 540', closed: false },
  { name: 'Single leaf study', d: 'M 300 350 V 200', closed: false },
  { name: 'Short run study (4–5 motifs)', d: 'M 235 230 H 365', closed: false },
  { name: 'Straight open line', d: 'M 85 215 L 515 215', closed: false },
  { name: 'Shallow S curve', d: 'M 75 250 C 185 130 275 310 370 205 S 495 155 530 205', closed: false },
  { name: 'Strong S curve', d: 'M 80 320 C 225 55 315 375 505 105', closed: false },
  { name: 'Circle', d: 'M 430 215 A 130 130 0 1 1 170 215 A 130 130 0 1 1 430 215 Z', closed: true },
  { name: 'Rounded rectangle', d: 'M 145 90 H 455 Q 505 90 505 140 V 290 Q 505 340 455 340 H 145 Q 95 340 95 290 V 140 Q 95 90 145 90 Z', closed: true },
  { name: 'Hard rectangular frame', d: 'M 100 85 H 500 V 345 H 100 Z', closed: true },
  { name: '90-degree open bend', d: 'M 95 315 H 355 V 95', closed: false },
];
const DEFAULTS: AcanthusOptions = { leafSize: 34, pitch: 24, fullness: .58, side: 'both', detail: 'medium', organic: .25, seed: 3, lineShading: false, shadingDensity: 'medium' };

export default function BorderDevPage() {
  const [paths, setPaths] = useState(BUILT_INS), [selected, setSelected] = useState(0), [options, setOptions] = useState(DEFAULTS), [reverse, setReverse] = useState(false), [construction, setConstruction] = useState(false), [message, setMessage] = useState<string | null>(null);
  const selectGuide = (index: number) => { setSelected(index); if (index === 2) setOptions(current => ({ ...current, leafSize: 46, pitch: 30 })); };
  const upload = async (file: File) => { try { const imported = importGuidePaths(await file.text()).map(p => ({ ...p, name: `${file.name}: ${p.name}` })); setPaths([...BUILT_INS, ...imported]); setSelected(BUILT_INS.length); setMessage(imported.length > 1 ? `${imported.length} usable paths found. Choose one in Growth spine.` : 'SVG path loaded. Transforms and filled silhouette centreline extraction are not supported.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read SVG.'); } };
  return <main className="min-h-screen bg-slate-100 px-4 py-7 text-slate-900 sm:px-6">
    <header className="mx-auto mb-5 max-w-[1500px]"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">Development geometry laboratory</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Procedural acanthus path study</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">An experimental vector-first study of growth spine → roots → midribs → eyes → lobes → engraved detail. This is not the finished Border Creation Tool.</p></header>
    <div className="mx-auto grid max-w-[1500px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><BorderDevControls options={options} setOptions={setOptions} presets={paths} selected={selected} onSelect={selectGuide} reverse={reverse} onReverse={setReverse} construction={construction} onConstruction={setConstruction} onUpload={upload} message={message} /><BorderDevStage d={paths[selected].d} closed={paths[selected].closed} reverse={reverse} options={options} showConstruction={construction} singleLeaf={paths[selected].name === 'Single leaf study'} componentStudy={paths[selected].name === 'Acanthus component study'} /></div>
  </main>;
}
