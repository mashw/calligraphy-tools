'use client';

import React, { useEffect, useRef, useState } from 'react';
import { bakeExportStrokes, cloneSvgForRasterExport, computeRasterPxPerMM, jpegDataUrlToPdf, printJpegDataUrlToScale, renderSvgCloneToJpegDataUrl } from '@/lib/export/raster-export';
import { occupiedRect, pageContentRect, resizeFrame, snapMove, type SnapState } from '@/lib/layout/geometry';
import { pageSize, resizeAspectMode, type Frame, type LayoutElement, type ResizeAspectMode, type ResizeHandle } from '@/lib/layout/types';
import GuidelinesRenderer from '@/components/guidelines/GuidelinesRenderer';
import ShapeElementRenderer from '@/components/layout/ShapeElementRenderer';
import { PAGE_BACKGROUND } from '@/lib/layout/shape';
import CurvedTitleRenderer from '@/components/curved-title/CurvedTitleRenderer';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import CalligramRenderer from '@/components/calligram/CalligramRenderer';
import { buildCalligramModel } from '@/lib/calligram/model';
import { getNearestCompleteGuidelinesHeight } from '@/lib/guides/straight/model';
import type { GuidelinesTextFitEntry } from '@/lib/layout/guidelines-text-fit';
import { buildPlotterExport, CRICUT_MATS, DEFAULT_PLOTTER_EXPORT_OPTIONS, getCricutSafeRect, type CricutMatId, type PlotterExportOptions } from '@/lib/layout/plotter-export';
import ArtworkRenderer from './ArtworkRenderer';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type Interaction =
  | { mode: 'none' }
  | { mode: 'pan'; pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number }; rect: DOMRect; vb: { w: number; h: number } }
  | { mode: 'move'; pointerId: number; elementId: string; startClient: { x: number; y: number }; original: Frame; visualOriginal: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; liveVisual: Frame; snap: SnapState }
  | { mode: 'resize'; pointerId: number; elementId: string; handle: ResizeHandle; startClient: { x: number; y: number }; original: Frame; visualOriginal: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; liveVisual: Frame; aspectMode: ResizeAspectMode; aspectRatio: number };

const handles: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' }, { id: 'n', x: .5, y: 0, cursor: 'ns-resize' }, { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: .5, cursor: 'ew-resize' }, { id: 'e', x: 1, y: .5, cursor: 'ew-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' }, { id: 's', x: .5, y: 1, cursor: 'ns-resize' }, { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
];
const control = 'shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm transition hover:bg-slate-50 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const wholeFrame = (frame: Frame): Frame => ({ x: Math.round(frame.x), y: Math.round(frame.y), width: Math.max(4, Math.round(frame.width)), height: Math.max(4, Math.round(frame.height)) });

function visualFrame(element: LayoutElement, frame: Frame): Frame {
  if (element.type !== 'curved-title' && element.type !== 'calligram') return frame;
  const bounds = element.type === 'curved-title'
    ? buildCurvedTitleModel({ w: frame.width, h: frame.height }, element.settings).visualBounds
    : buildCalligramModel({ w: frame.width, h: frame.height }, element.settings).visualBounds;
  return { x: frame.x + bounds.x, y: frame.y + bounds.y, width: bounds.width, height: bounds.height };
}

function baseFrameFromVisualResize(base: Frame, visual: Frame, target: Frame): Frame {
  const scaleX = target.width / Math.max(.001, visual.width), scaleY = target.height / Math.max(.001, visual.height);
  return {
    x: target.x - (visual.x - base.x) * scaleX,
    y: target.y - (visual.y - base.y) * scaleY,
    width: Math.max(4, base.width * scaleX), height: Math.max(4, base.height * scaleY),
  };
}

function committedResizeFrame(
  interaction: Extract<Interaction, { mode: 'resize' }>,
): Frame {
  const corner = interaction.handle.length === 2;

  const preserveAspect =
    interaction.aspectMode === 'all'
    || (interaction.aspectMode === 'corners' && corner);

  if (!preserveAspect) {
    return wholeFrame(interaction.live);
  }

  const aspect = Math.max(0.001, interaction.aspectRatio);
  const right = interaction.original.x + interaction.original.width;
  const bottom = interaction.original.y + interaction.original.height;

  const usesW = interaction.handle.includes('w');
  const usesE = interaction.handle.includes('e');
  const usesN = interaction.handle.includes('n');
  const usesS = interaction.handle.includes('s');

  let width: number;
  let height: number;
  let x: number;
  let y: number;

  if (!corner && (usesW || usesE)) {
    width = Math.max(4, Math.round(interaction.live.width));
    height = Math.max(4, Math.round(width / aspect));

    x = Math.round(usesW ? right - width : interaction.original.x);
    y = Math.round(
      interaction.original.y
      + (interaction.original.height - height) / 2,
    );

    return { x, y, width, height };
  }

  if (!corner && (usesN || usesS)) {
    height = Math.max(4, Math.round(interaction.live.height));
    width = Math.max(4, Math.round(height * aspect));

    x = Math.round(
      interaction.original.x
      + (interaction.original.width - width) / 2,
    );

    y = Math.round(
      usesN ? bottom - height : interaction.original.y,
    );

    return { x, y, width, height };
  }

  width = Math.max(4, Math.round(interaction.live.width));
  height = Math.max(4, Math.round(width / aspect));

  x = Math.round(usesW ? right - width : interaction.original.x);
  y = Math.round(usesN ? bottom - height : interaction.original.y);

  return { x, y, width, height };
}

function constrainGuidelinesResize(frame: Frame, original: Frame, handle: ResizeHandle, settings: Extract<LayoutElement, { type: 'guidelines' }>['settings'], threshold = Infinity): Frame {
  if (!handle.includes('n') && !handle.includes('s')) return frame;
  const height = getNearestCompleteGuidelinesHeight(settings, frame.height);
  if (Math.abs(height - frame.height) > threshold) return frame;
  const bottom = original.y + original.height;
  const right = original.x + original.width;
  if (handle.length === 1) return { ...frame, y: handle.includes('n') ? bottom - height : original.y, height };
  const width = height * original.width / original.height;
  return {
    x: handle.includes('w') ? right - width : original.x,
    y: handle.includes('n') ? bottom - height : original.y,
    width,
    height,
  };
}

function stripNoExport(svg: SVGSVGElement) { svg.querySelectorAll('[data-no-export="true"], #stage-bg').forEach(node => node.remove()); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

export default function LayoutStage({ elements, selectedId, textFitPlans, onSelect, onCommit,onPlannedLinePlacementChange }: { elements: LayoutElement[]; selectedId: string; textFitPlans: Record<string,GuidelinesTextFitEntry>; onSelect: (id: string) => void; onCommit: (id: string, frame: Frame) => void;onPlannedLinePlacementChange:(guidelinesId:string,lineId:string,customStartMM:number)=>void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction>({ mode: 'none' });
  const paintPending = useRef(false);
  const [livePaint, setLivePaint] = useState<{ id: string; frame: Frame; visual?: Frame } | null>(null);
  const [interactionActive, setInteractionActive] = useState(false);
  const [view, setView] = useState<ViewMode>('autofit');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [simplify, setSimplify] = useState(false);
  const [cricutMat, setCricutMat] = useState<CricutMatId>('12x12');
  const [showCricutSafeArea, setShowCricutSafeArea] = useState(false);
  const [cricutMessage, setCricutMessage] = useState<string | null>(null);
  const [cricutModalOpen, setCricutModalOpen] = useState(false);
  const [cricutOptions, setCricutOptions] = useState<PlotterExportOptions>({ ...DEFAULT_PLOTTER_EXPORT_OPTIONS });
  useEffect(() => {
    if (!cricutModalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCricutModalOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cricutModalOpen]);
  const previewSimplify = simplify || interactionActive;
  const selected = elements.find(element => element.id === selectedId);
  const pageElement = elements.find(element => element.type === 'page');
  if (!pageElement) throw new Error('Layout requires a Page element.');
  const page = pageSize(pageElement);
  const cricutSafeRect = getCricutSafeRect(page, cricutMat);
  const pageRect = pageContentRect(page, pageElement.settings.margins);
  const vb = (() => {
    const margin = view === 'fullpage' ? 5 : 18;
    const baseW = page.width + margin * 2;
    const baseH = page.height + margin * 2;
    return { x: -margin + pan.x + (baseW - baseW / zoom) / 2, y: -margin + pan.y + (baseH - baseH / zoom) / 2, w: baseW / zoom, h: baseH / zoom };
  })();
  const begin = (e: React.PointerEvent<SVGElement>, element: LayoutElement, handle?: ResizeHandle) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); onSelect(element.id);
    if (element.locked || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const visualOriginal = visualFrame(element, element.frame);
    interactionRef.current = handle
      ? { mode: 'resize', pointerId: e.pointerId, elementId: element.id, handle, startClient: { x: e.clientX, y: e.clientY }, original: element.frame, visualOriginal, live: element.frame, liveVisual: visualOriginal, rect, vb: { w: vb.w, h: vb.h }, aspectMode: resizeAspectMode(element), aspectRatio: visualOriginal.width / Math.max(0.001, visualOriginal.height) }
      : { mode: 'move', pointerId: e.pointerId, elementId: element.id, startClient: { x: e.clientX, y: e.clientY }, original: element.frame, visualOriginal, live: element.frame, liveVisual: visualOriginal, rect, vb: { w: vb.w, h: vb.h }, snap: { x: null, y: null } };
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
      const element=elements.find(item=>item.id===active.elementId);
      const internal=element?.type==='guidelines'?element.settings.margins:{top:0,right:0,bottom:0,left:0};
      const unsnappedVisual = { ...active.visualOriginal, x: active.visualOriginal.x + dx, y: active.visualOriginal.y + dy };
      const snapped = snapMove(unsnappedVisual, internal, pageRect, { x: 6 / active.rect.width * active.vb.w, y: 6 / active.rect.height * active.vb.h }, { x: 10 / active.rect.width * active.vb.w, y: 10 / active.rect.height * active.vb.h }, active.snap);
      active.liveVisual=snapped.frame; active.live={...active.original,x:active.original.x+snapped.frame.x-active.visualOriginal.x,y:active.original.y+snapped.frame.y-active.visualOriginal.y}; active.snap=snapped.snap;
    } else {
      active.liveVisual=resizeFrame(
        active.visualOriginal,
        active.handle,
        dx,
        dy,
        active.aspectMode,
        active.aspectRatio,
      );
      active.live=baseFrameFromVisualResize(active.original,active.visualOriginal,active.liveVisual);
      const element = elements.find(item => item.id === active.elementId);
      if (element?.type === 'guidelines' && !element.allowPartialGuidelines) {
        active.live = constrainGuidelinesResize(active.live, active.original, active.handle, element.settings, 6 / active.rect.height * active.vb.h);
        active.liveVisual = active.live;
      }
    }
if (!paintPending.current) { paintPending.current=true; requestAnimationFrame(()=>{paintPending.current=false;setLivePaint({id:active.elementId,frame:active.live,visual:active.liveVisual});}); }
  };
  const finish = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = interactionRef.current; if (active.mode === 'none' || active.pointerId !== e.pointerId) return;
    if (active.mode === 'move') onCommit(active.elementId, wholeFrame(active.live));
    if (active.mode === 'resize') {
      const element = elements.find(item => item.id === active.elementId);
      const frame = element?.type === 'guidelines' && !element.allowPartialGuidelines && (active.handle.includes('n') || active.handle.includes('s'))
        ? constrainGuidelinesResize(active.live, active.original, active.handle, element.settings)
        : ['curved-title','calligram'].includes(element?.type ?? '') ? wholeFrame(active.live) : committedResizeFrame(active);
      onCommit(active.elementId, frame);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    interactionRef.current = { mode: 'none' }; setLivePaint(null); setInteractionActive(false);
  };
  const reset = (next: ViewMode = 'autofit') => { setView(next); setZoom(1); setPan({ x: 0, y: 0 }); };
  const exportClone = () => { if (!svgRef.current) return null; const clone = svgRef.current.cloneNode(true) as SVGSVGElement; clone.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`); clone.setAttribute('width', `${page.width}mm`); clone.setAttribute('height', `${page.height}mm`); bakeExportStrokes(svgRef.current, clone, page.width); stripNoExport(clone); return clone; };
  const exportSvg = () => { const clone = exportClone(); if (!clone) return; download(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }), 'layout.svg'); };
  const raster = async () => { if (!svgRef.current) return null; const { wPx, hPx } = computeRasterPxPerMM(page.width, page.height); const clone = cloneSvgForRasterExport(svgRef.current, page.width, page.height, wPx, hPx, bakeExportStrokes, stripNoExport); return { data: await renderSvgCloneToJpegDataUrl(clone, wPx, hPx), wPx, hPx }; };
  const exportPdf = async () => { const result = await raster(); if (result) download(jpegDataUrlToPdf(result.data, page.width, page.height, result.wPx, result.hPx), 'layout.pdf'); };
  const print = async () => { const result = await raster(); if (result) printJpegDataUrlToScale(result.data, page.width, page.height); };
  const exportCricut = () => {
    const result = buildPlotterExport(elements, textFitPlans, cricutMat, cricutOptions);
    if (result.safety.reasons.length > 0) {
      setCricutMessage(result.safety.reasons.join(' '));
      return;
    }
    download(new Blob([result.svg], { type: 'image/svg+xml' }), 'layout-cricut-draw.svg');
    setCricutMessage(result.warnings.length > 0 ? result.warnings.join(' ') : null);
  };

  return <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="mr-1 font-semibold text-slate-800">Preview</h2>
      <select value={view} onChange={e => reset(e.target.value as ViewMode)} className="rounded-lg border border-slate-300 bg-white p-1.5 text-sm"><option value="autofit">Auto-fit</option><option value="fullpage">Full page</option><option value="custom">Custom</option></select>
      <button aria-pressed={simplify} onClick={() => setSimplify(value => !value)} className={`${control} ${simplify ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : ''}`}>Simplify</button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button aria-label="Zoom out" onClick={() => { setView('custom'); setZoom(value => Math.max(.35, value * .9)); }} className={control}>−</button><button aria-label="Zoom in" onClick={() => { setView('custom'); setZoom(value => Math.min(6, value * 1.1)); }} className={control}>+</button><button onClick={() => reset()} className={control}>Reset view</button>
        <button onClick={exportSvg} className={`${control} ml-1`}>SVG</button><button onClick={exportPdf} className={control}>PDF</button><button onClick={() => { setCricutMessage(null); setCricutModalOpen(true); }} className={control}>Cricut Draw</button><label className="flex shrink-0 items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={showCricutSafeArea} onChange={event => setShowCricutSafeArea(event.target.checked)} />Show Cricut safe area</label><button onClick={print} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">Print</button>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-300">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block h-[52vh] min-h-[420px] w-full touch-none select-none" style={{ background: '#cbd5e1' }} onPointerDown={onStageDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
        <rect id="stage-bg" x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#cbd5e1" pointerEvents="none" />
        <rect x="0" y="0" width={page.width} height={page.height} fill={PAGE_BACKGROUND} stroke="#94a3b8" strokeWidth=".3" onPointerDown={e => { e.stopPropagation(); onSelect('page'); }} style={{ cursor: 'default' }} />
        {[...elements].reverse().filter(element => element.type !== 'page').map(element => {
          const frame = livePaint?.id === element.id ? livePaint.frame : element.frame;
          const occupied = occupiedRect(element.type==='calligram'&&!(element.settings.transparentWhitespace??true)?visualFrame(element,frame):frame, element.paddingMM);
          return <g key={element.id} onPointerDown={e => begin(e, element)} style={{ cursor: element.locked ? 'pointer' : 'move' }}>
            {element.type !== 'shape' && element.type !== 'artwork' && !((element.type==='curved-title'||element.type==='calligram')&&(element.settings.transparentWhitespace??true)) && <rect x={occupied.x} y={occupied.y} width={occupied.width} height={occupied.height} fill={PAGE_BACKGROUND} />}
            <ElementVisual element={element} frame={frame} simplify={previewSimplify} selected={element.id === selectedId} textFitEntry={textFitPlans[element.id]??null} onPlannedLinePlacementChange={onPlannedLinePlacementChange} />
          </g>;
        })}
        {showCricutSafeArea && <g data-no-export="true" pointerEvents="none">
          <rect x="0" y="0" width={page.width} height={Math.min(cricutSafeRect.y, page.height)} fill="#f59e0b" fillOpacity=".12" />
          <rect x="0" y={cricutSafeRect.y} width={Math.min(cricutSafeRect.x, page.width)} height={Math.max(0, page.height - cricutSafeRect.y)} fill="#f59e0b" fillOpacity=".12" />
          <rect x={cricutSafeRect.x + cricutSafeRect.width} y={cricutSafeRect.y} width={Math.max(0, page.width - cricutSafeRect.x - cricutSafeRect.width)} height={Math.max(0, page.height - cricutSafeRect.y)} fill="#ef4444" fillOpacity=".1" />
          <rect x={cricutSafeRect.x} y={cricutSafeRect.y + cricutSafeRect.height} width={cricutSafeRect.width} height={Math.max(0, page.height - cricutSafeRect.y - cricutSafeRect.height)} fill="#ef4444" fillOpacity=".1" />
          <rect x={cricutSafeRect.x} y={cricutSafeRect.y} width={cricutSafeRect.width} height={cricutSafeRect.height} fill="none" stroke="#d97706" strokeWidth="1" strokeDasharray="5 4" strokeOpacity=".8" vectorEffect="non-scaling-stroke" />
        </g>}
        <g data-no-export="true" pointerEvents="none">
          {selectedId==='page'&&<rect x={pageRect.x} y={pageRect.y} width={pageRect.width} height={pageRect.height} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4 3" strokeOpacity=".7" vectorEffect="non-scaling-stroke" />}
          {pageElement.settings.centerLines.vertical&&<line x1={pageRect.x+pageRect.width/2} x2={pageRect.x+pageRect.width/2} y1={pageRect.y} y2={pageRect.y+pageRect.height} stroke="#818cf8" strokeWidth="1" strokeDasharray="5 4" strokeOpacity=".65" vectorEffect="non-scaling-stroke" />}
          {pageElement.settings.centerLines.horizontal&&<line x1={pageRect.x} x2={pageRect.x+pageRect.width} y1={pageRect.y+pageRect.height/2} y2={pageRect.y+pageRect.height/2} stroke="#818cf8" strokeWidth="1" strokeDasharray="5 4" strokeOpacity=".65" vectorEffect="non-scaling-stroke" />}
        </g>
        {selected && selected.type !== 'page' && (() => { const baseFrame = livePaint?.id === selected.id ? livePaint.frame : selected.frame; const frame = livePaint?.id===selected.id&&livePaint.visual?livePaint.visual:visualFrame(selected,baseFrame); const occupied = occupiedRect(baseFrame, selected.paddingMM); return <g data-no-export="true">
          {selected.type !== 'shape' && selected.type !== 'curved-title' && selected.type !== 'calligram' && selected.paddingMM > 0 && <rect x={occupied.x} y={occupied.y} width={occupied.width} height={occupied.height} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="4 3" strokeOpacity=".55" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="#4f46e5" strokeWidth="1.25" strokeOpacity=".8" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {!selected.locked && handles.map(handle => { const x = frame.x + frame.width * handle.x; const y = frame.y + frame.height * handle.y; return <g key={handle.id} style={{ cursor: handle.cursor }} onPointerDown={e => begin(e, selected, handle.id)}><circle cx={x} cy={y} r="7" fill="transparent" vectorEffect="non-scaling-stroke" /><rect x={x - 1.8} y={y - 1.8} width="3.6" height="3.6" rx=".5" fill="white" stroke="#4f46e5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></g>; })}
        </g>; })()}
      </svg>
    </div>
    {cricutModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCricutModalOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cricut-modal-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4"><h3 id="cricut-modal-title" className="text-lg font-semibold text-slate-900">Cricut Draw</h3><button type="button" aria-label="Close Cricut Draw dialog" onClick={() => setCricutModalOpen(false)} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100">×</button></div>
        <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">Mat
          <select value={cricutMat} onChange={event => { setCricutMat(event.target.value as CricutMatId); setCricutMessage(null); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-normal">
            {Object.entries(CRICUT_MATS).map(([id, mat]) => <option key={id} value={id}>{mat.label}</option>)}
          </select>
        </label>
        <fieldset className="mt-5"><legend className="font-semibold text-slate-800">Drawing guides</legend>
          <div className="mt-2 grid gap-x-5 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
            {([
              ['baselineIndicators', 'Baseline indicators'],
              ['textStartEndMarkers', 'Text start / end markers'],
              ['slantGuides', 'Primary slant guides'],
              ['secondarySlantGuides', 'Secondary slant guides'],
              ['midpointReferences', 'Copperplate midpoint references'],
              ['constructionGrid', 'Construction grid / ticks'],
              ['constructionGuides', 'Semantic construction guides'],
              ['nibAngleMarker', 'Nib-angle marker'],
              ['shapeOutlines', 'Shape outlines'],
            ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={cricutOptions[key]} onChange={event => setCricutOptions(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
          </div>
        </fieldset>
        <p className="mt-5 text-xs text-slate-600">These options affect Cricut Draw only. SVG, PDF, Print and the Layout preview are unchanged.</p>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Place paper flush with the top-left corner of the Cricut mat grid.<br />Upload without resizing and set the imported layer to Draw / Pen.</p>
        {cricutMessage && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{cricutMessage}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCricutModalOpen(false)} className={control}>Cancel</button><button type="button" onClick={exportCricut} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">Export Cricut SVG</button></div>
      </div>
    </div>}
  </section>;
}

function LineLayoutOverlay({guidelinesId,entry,frame,onCommit}:{guidelinesId:string;entry:Extract<GuidelinesTextFitEntry,{mode:'line-layout'}>;frame:Frame;onCommit:(guidelinesId:string,lineId:string,start:number)=>void}){
  const [drag,setDrag]=useState<{lineId:string;pointerId:number;clientX:number;start:number;max:number;live:number}|null>(null);
  return <g data-no-export="true">{entry.plan.lines.filter(line=>line.rowIndex!==null&&line.text).map(line=>{const live=drag?.lineId===line.lineId?drag.live:line.startFromLeftMM,dx=live-line.startFromLeftMM,y1=line.waistY-frame.y,y2=line.baseY-frame.y,start=line.baselineStartX-frame.x+dx,end=line.baselineEndX-frame.x+dx,shift=line.slantShiftMM;return <g key={line.lineId} onPointerMove={event=>{if(!drag||drag.pointerId!==event.pointerId)return;const svg=event.currentTarget.ownerSVGElement!,rect=svg.getBoundingClientRect(),mm=(event.clientX-drag.clientX)/rect.width*svg.viewBox.baseVal.width,next=Math.max(0,Math.min(drag.max,drag.start+mm));setDrag({...drag,live:next});}} onPointerUp={event=>{if(!drag||drag.pointerId!==event.pointerId)return;event.currentTarget.releasePointerCapture(event.pointerId);onCommit(guidelinesId,line.lineId,drag.live);setDrag(null);}}>{line.glyphs.map((glyph,index)=>{const x1=glyph.startX-frame.x+dx,x2=glyph.endX-frame.x+dx,d=`M ${x1+shift},${y1} L ${x2+shift},${y1} L ${x2},${y2} L ${x1},${y2} Z`;return <g key={index}><path d={d} fill={glyph.collision?'rgba(239,68,68,.22)':entry.color.fill} stroke={glyph.collision?'#dc2626':entry.color.stroke} strokeWidth=".3" vectorEffect="non-scaling-stroke"/><text x={(x1+x2)/2+shift/2} y={(y1+y2)/2} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(1.8,(y2-y1)*.65)} fill="#334155">{glyph.kind==='space'?'':glyph.ch}</text></g>})}{[start,end].map((x,index)=><g key={index} style={{cursor:'ew-resize'}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();event.currentTarget.parentElement?.setPointerCapture(event.pointerId);setDrag({lineId:line.lineId,pointerId:event.pointerId,clientX:event.clientX,start:line.startFromLeftMM,max:line.maxCustomStartMM,live:line.startFromLeftMM});}}><line x1={x+shift} x2={x} y1={y1} y2={y2} stroke={entry.color.stroke} strokeWidth="2" vectorEffect="non-scaling-stroke"/><line x1={x-4} x2={x+4} y1={y1} y2={y2} stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke"/></g>)}</g>;})}</g>;
}

function ElementVisual({ element, frame, simplify, selected, textFitEntry,onPlannedLinePlacementChange }: { element: LayoutElement; frame: Frame; simplify: boolean; selected: boolean; textFitEntry: GuidelinesTextFitEntry | null;onPlannedLinePlacementChange:(guidelinesId:string,lineId:string,customStartMM:number)=>void }) {
  const common = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  if (element.type === 'shape') return <ShapeElementRenderer element={element} frame={frame} selected={selected} />;
  if (simplify) return <rect {...common} rx="1" fill="#eef2ff" stroke="#6366f1" strokeDasharray="3 2" strokeWidth=".5" />;
  if(element.type==='artwork')return <ArtworkRenderer element={element} frame={frame}/>;
  if (element.type === 'guidelines') {
    if(textFitEntry?.mode==='line-layout')return <g transform={`translate(${frame.x} ${frame.y})`}><GuidelinesRenderer box={{width:frame.width,height:frame.height}} settings={element.settings} idPrefix={`layout-${element.id}`}/><LineLayoutOverlay guidelinesId={element.id} entry={textFitEntry} frame={frame} onCommit={onPlannedLinePlacementChange}/></g>;
    const placements = textFitEntry?.mode==='estimate'?textFitEntry.plan.placements:[];
    const placementGeometry = placements.map(placement => {
      const x=placement.x1-frame.x,y1=placement.waistY-frame.y,y2=placement.baseY-frame.y,shift=placement.slantShiftMM,x2=x+placement.consumedMM;
      return { span:`M ${x+shift},${y1} L ${x2+shift},${y1} L ${x2},${y2} L ${x},${y2} Z`, end:`M ${x2+shift},${y1} L ${x2},${y2}` };
    });
    const overflowEnd = textFitEntry?.mode==='estimate' && !textFitEntry.plan.fits ? placementGeometry.at(-1)?.end : undefined;
    return <g transform={`translate(${frame.x} ${frame.y})`}>
      <GuidelinesRenderer box={{ width: frame.width, height: frame.height }} settings={element.settings} idPrefix={`layout-${element.id}`} />
      {textFitEntry&&<g data-no-export="true" pointerEvents="none">
        {placementGeometry.map((geometry,index)=><path key={index} d={geometry.span} fill={textFitEntry.color.fill} stroke={textFitEntry.color.stroke} strokeWidth=".35" vectorEffect="non-scaling-stroke"/>)}
        {overflowEnd&&<path d={overflowEnd} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
      </g>}
    </g>;
  }
  if (element.type === 'calligram') return <g transform={`translate(${frame.x} ${frame.y})`}><CalligramRenderer box={{w:frame.width,h:frame.height}} settings={element.settings} idPrefix={`layout-${element.id}`} pageBackground={(element.settings.transparentWhitespace??true)?PAGE_BACKGROUND:undefined} paddingMM={element.paddingMM} selected={selected}/></g>;
  if (element.type === 'curved-title') return <g transform={`translate(${frame.x} ${frame.y})`}><CurvedTitleRenderer box={{w:frame.width,h:frame.height}} settings={element.settings} idPrefix={`layout-${element.id}`} pageBackground={(element.settings.transparentWhitespace??true)?PAGE_BACKGROUND:undefined} paddingMM={element.paddingMM} selected={selected} /></g>;
  return <rect {...common} rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth=".8" />;
}
