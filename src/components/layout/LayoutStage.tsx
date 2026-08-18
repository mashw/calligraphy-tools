'use client';

import React, { useRef, useState } from 'react';
import { cloneSvgForRasterExport, computeRasterPxPerMM, jpegDataUrlToPdf, printJpegDataUrlToScale, renderSvgCloneToJpegDataUrl } from '@/lib/export/raster-export';
import { occupiedRect, pageContentRect, resizeFrame, snapMove, type SnapState } from '@/lib/layout/geometry';
import { isProportional, pageSize, type Frame, type LayoutElement, type ResizeHandle } from '@/lib/layout/types';
import GuidelinesRenderer from '@/components/guidelines/GuidelinesRenderer';
import ShapeElementRenderer from '@/components/layout/ShapeElementRenderer';
import { PAGE_BACKGROUND } from '@/lib/layout/shape';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type Interaction =
  | { mode: 'none' }
  | { mode: 'pan'; pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number }; rect: DOMRect; vb: { w: number; h: number } }
  | { mode: 'move'; pointerId: number; elementId: string; startClient: { x: number; y: number }; original: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; snap: SnapState }
  | { mode: 'resize'; pointerId: number; elementId: string; handle: ResizeHandle; startClient: { x: number; y: number }; original: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; proportional: boolean };

const handles: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' }, { id: 'n', x: .5, y: 0, cursor: 'ns-resize' }, { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: .5, cursor: 'ew-resize' }, { id: 'e', x: 1, y: .5, cursor: 'ew-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' }, { id: 's', x: .5, y: 1, cursor: 'ns-resize' }, { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
];
const control = 'shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm transition hover:bg-slate-50 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

function stripNoExport(svg: SVGSVGElement) { svg.querySelectorAll('[data-no-export="true"], #stage-bg').forEach(node => node.remove()); }
function bakeStrokes(_: SVGSVGElement, clone: SVGSVGElement) { clone.querySelectorAll('[vector-effect]').forEach(node => node.removeAttribute('vector-effect')); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

export default function LayoutStage({ elements, selectedId, onSelect, onCommit }: { elements: LayoutElement[]; selectedId: string; onSelect: (id: string) => void; onCommit: (id: string, frame: Frame) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction>({ mode: 'none' });
  const paintPending = useRef(false);
  const liveFrameRef = useRef<{ id: string; frame: Frame } | null>(null);
  const [livePaint, setLivePaint] = useState<{ id: string; frame: Frame } | null>(null);
  const [interactionActive, setInteractionActive] = useState(false);
  const [view, setView] = useState<ViewMode>('autofit');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [simplify, setSimplify] = useState(false);
  const previewSimplify = simplify || interactionActive;
  const selected = elements.find(element => element.id === selectedId);
  const pageElement = elements.find(element => element.type === 'page');
  if (!pageElement) throw new Error('Layout requires a Page element.');
  const page = pageSize(pageElement);
  const pageRect = pageContentRect(page, pageElement.settings.margins);
  const vb = (() => {
    const margin = view === 'fullpage' ? 5 : 18;
    const baseW = page.width + margin * 2;
    const baseH = page.height + margin * 2;
    return { x: -margin + pan.x + (baseW - baseW / zoom) / 2, y: -margin + pan.y + (baseH - baseH / zoom) / 2, w: baseW / zoom, h: baseH / zoom };
  })();
  const requestPaint = () => { if (!paintPending.current) { paintPending.current = true; requestAnimationFrame(() => { paintPending.current = false; setLivePaint(liveFrameRef.current); }); } };
  const begin = (e: React.PointerEvent<SVGElement>, element: LayoutElement, handle?: ResizeHandle) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); onSelect(element.id);
    if (element.locked || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    interactionRef.current = handle
      ? { mode: 'resize', pointerId: e.pointerId, elementId: element.id, handle, startClient: { x: e.clientX, y: e.clientY }, original: element.frame, live: element.frame, rect, vb: { w: vb.w, h: vb.h }, proportional: isProportional(element) }
      : { mode: 'move', pointerId: e.pointerId, elementId: element.id, startClient: { x: e.clientX, y: e.clientY }, original: element.frame, live: element.frame, rect, vb: { w: vb.w, h: vb.h }, snap: { x: null, y: null } };
    svgRef.current.setPointerCapture(e.pointerId); setInteractionActive(true);
  };
  const onStageDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return; e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    interactionRef.current = { mode: 'pan', pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY }, startPan: pan, rect, vb: { w: vb.w, h: vb.h } };
    e.currentTarget.setPointerCapture(e.pointerId); setInteractionActive(true);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = interactionRef.current; if (active.mode === 'none' || active.pointerId !== e.pointerId) return;
    const dx = (e.clientX - active.startClient.x) / active.rect.width * active.vb.w;
    const dy = (e.clientY - active.startClient.y) / active.rect.height * active.vb.h;
    if (active.mode === 'pan') { setView('custom'); setPan({ x: active.startPan.x - dx, y: active.startPan.y - dy }); return; }
    if (active.mode === 'move') {
      const unsnapped = { ...active.original, x: active.original.x + dx, y: active.original.y + dy };
      const element=elements.find(item=>item.id===active.elementId);
      const internal=element?.type==='guidelines'?element.settings.margins:{top:0,right:0,bottom:0,left:0};
      const snapped = snapMove(unsnapped, internal, pageRect, { x: 6 / active.rect.width * active.vb.w, y: 6 / active.rect.height * active.vb.h }, { x: 10 / active.rect.width * active.vb.w, y: 10 / active.rect.height * active.vb.h }, active.snap);
      active.live = snapped.frame; active.snap = snapped.snap;
    } else active.live = resizeFrame(active.original, active.handle, dx, dy, active.proportional);
    liveFrameRef.current = { id: active.elementId, frame: active.live }; requestPaint();
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = interactionRef.current; if (active.mode === 'none' || active.pointerId !== e.pointerId) return;
    if (active.mode === 'move' || active.mode === 'resize') onCommit(active.elementId, active.live);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    interactionRef.current = { mode: 'none' }; liveFrameRef.current = null; setLivePaint(null); setInteractionActive(false);
  };
  const reset = (next: ViewMode = 'autofit') => { setView(next); setZoom(1); setPan({ x: 0, y: 0 }); };
  const exportClone = () => { if (!svgRef.current) return null; const clone = svgRef.current.cloneNode(true) as SVGSVGElement; clone.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`); clone.setAttribute('width', `${page.width}mm`); clone.setAttribute('height', `${page.height}mm`); stripNoExport(clone); return clone; };
  const exportSvg = () => { const clone = exportClone(); if (!clone) return; download(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }), 'layout.svg'); };
  const raster = async () => { if (!svgRef.current) return null; const { wPx, hPx } = computeRasterPxPerMM(page.width, page.height); const clone = cloneSvgForRasterExport(svgRef.current, page.width, page.height, wPx, hPx, bakeStrokes, stripNoExport); return { data: await renderSvgCloneToJpegDataUrl(clone, wPx, hPx), wPx, hPx }; };
  const exportPdf = async () => { const result = await raster(); if (result) download(jpegDataUrlToPdf(result.data, page.width, page.height, result.wPx, result.hPx), 'layout.pdf'); };
  const print = async () => { const result = await raster(); if (result) printJpegDataUrlToScale(result.data, page.width, page.height); };

  return <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="mr-1 font-semibold text-slate-800">Preview</h2>
      <select value={view} onChange={e => reset(e.target.value as ViewMode)} className="rounded-lg border border-slate-300 bg-white p-1.5 text-sm"><option value="autofit">Auto-fit</option><option value="fullpage">Full page</option><option value="custom">Custom</option></select>
      <button aria-pressed={simplify} onClick={() => setSimplify(value => !value)} className={`${control} ${simplify ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : ''}`}>Simplify</button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button aria-label="Zoom out" onClick={() => { setView('custom'); setZoom(value => Math.max(.35, value * .9)); }} className={control}>−</button><button aria-label="Zoom in" onClick={() => { setView('custom'); setZoom(value => Math.min(6, value * 1.1)); }} className={control}>+</button><button onClick={() => reset()} className={control}>Reset view</button>
        <button onClick={exportSvg} className={`${control} ml-1`}>SVG</button><button onClick={exportPdf} className={control}>PDF</button><button onClick={print} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">Print</button>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-300">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block h-[52vh] min-h-[420px] w-full touch-none select-none" style={{ background: '#cbd5e1' }} onPointerDown={onStageDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
        <rect id="stage-bg" x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#cbd5e1" pointerEvents="none" />
        <rect x="0" y="0" width={page.width} height={page.height} fill={PAGE_BACKGROUND} stroke="#94a3b8" strokeWidth=".3" onPointerDown={e => { e.stopPropagation(); onSelect('page'); }} style={{ cursor: 'default' }} />
        {[...elements].reverse().filter(element => element.type !== 'page').map(element => {
          const frame = livePaint?.id === element.id ? livePaint.frame : element.frame;
          const occupied = occupiedRect(frame, element.paddingMM);
          return <g key={element.id} onPointerDown={e => begin(e, element)} style={{ cursor: element.locked ? 'pointer' : 'move' }}>
            {element.type !== 'shape' && <rect x={occupied.x} y={occupied.y} width={occupied.width} height={occupied.height} fill={PAGE_BACKGROUND} />}
            <ElementVisual element={element} frame={frame} simplify={previewSimplify} selected={element.id === selectedId} />
          </g>;
        })}
        <g data-no-export="true" pointerEvents="none">
          {selectedId==='page'&&<rect x={pageRect.x} y={pageRect.y} width={pageRect.width} height={pageRect.height} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4 3" strokeOpacity=".7" vectorEffect="non-scaling-stroke" />}
          {pageElement.settings.centerLines.vertical&&<line x1={pageRect.x+pageRect.width/2} x2={pageRect.x+pageRect.width/2} y1={pageRect.y} y2={pageRect.y+pageRect.height} stroke="#818cf8" strokeWidth="1" strokeDasharray="5 4" strokeOpacity=".65" vectorEffect="non-scaling-stroke" />}
          {pageElement.settings.centerLines.horizontal&&<line x1={pageRect.x} x2={pageRect.x+pageRect.width} y1={pageRect.y+pageRect.height/2} y2={pageRect.y+pageRect.height/2} stroke="#818cf8" strokeWidth="1" strokeDasharray="5 4" strokeOpacity=".65" vectorEffect="non-scaling-stroke" />}
        </g>
        {selected && selected.type !== 'page' && (() => { const frame = livePaint?.id === selected.id ? livePaint.frame : selected.frame; const occupied = occupiedRect(frame, selected.paddingMM); return <g data-no-export="true">
          {selected.type !== 'shape' && selected.paddingMM > 0 && <rect x={occupied.x} y={occupied.y} width={occupied.width} height={occupied.height} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4 3" strokeOpacity=".55" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="#4f46e5" strokeWidth="1.25" strokeOpacity=".8" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {!selected.locked && handles.map(handle => { const x = frame.x + frame.width * handle.x; const y = frame.y + frame.height * handle.y; return <g key={handle.id} style={{ cursor: handle.cursor }} onPointerDown={e => begin(e, selected, handle.id)}><circle cx={x} cy={y} r="7" fill="transparent" vectorEffect="non-scaling-stroke" /><rect x={x - 1.8} y={y - 1.8} width="3.6" height="3.6" rx=".5" fill="white" stroke="#4f46e5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></g>; })}
        </g>; })()}
      </svg>
    </div>
  </section>;
}

function ElementVisual({ element, frame, simplify, selected }: { element: LayoutElement; frame: Frame; simplify: boolean; selected: boolean }) {
  const common = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  if (element.type === 'shape') return <ShapeElementRenderer element={element} frame={frame} selected={selected} />;
  if (simplify) return <rect {...common} rx="1" fill="#eef2ff" stroke="#6366f1" strokeDasharray="3 2" strokeWidth=".5" />;
  if (element.type === 'guidelines') return <g transform={`translate(${frame.x} ${frame.y})`}><GuidelinesRenderer box={{ width: frame.width, height: frame.height }} settings={element.settings} idPrefix={`layout-${element.id}`} /></g>;
  if (element.type === 'calligram') return <ellipse cx={frame.x + frame.width/2} cy={frame.y + frame.height/2} rx={frame.width/2} ry={frame.height/2} fill="none" stroke="#a855f7" strokeWidth="1.2" />;
  if (element.type === 'curved-title') return <path d={`M ${frame.x} ${frame.y + frame.height*.75} Q ${frame.x + frame.width/2} ${frame.y} ${frame.x + frame.width} ${frame.y + frame.height*.75}`} fill="none" stroke="#0f766e" strokeWidth="1.2" />;
  return <rect {...common} rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth=".8" />;
}
