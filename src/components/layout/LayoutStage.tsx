'use client';

import React, { useRef, useState } from 'react';
import { bakeExportStrokes, cloneSvgForRasterExport, computeRasterPxPerMM, jpegDataUrlToPdf, printJpegDataUrlToScale, renderSvgCloneToJpegDataUrl } from '@/lib/export/raster-export';
import { occupiedRect, pageContentRect, resizeFrame, snapMove, type SnapState } from '@/lib/layout/geometry';
import { isProportional, pageSize, type Frame, type LayoutElement, type ResizeHandle } from '@/lib/layout/types';
import GuidelinesRenderer from '@/components/guidelines/GuidelinesRenderer';
import ShapeElementRenderer from '@/components/layout/ShapeElementRenderer';
import { PAGE_BACKGROUND } from '@/lib/layout/shape';
import CurvedTitleRenderer from '@/components/curved-title/CurvedTitleRenderer';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import CalligramRenderer from '@/components/calligram/CalligramRenderer';
import { buildCalligramModel } from '@/lib/calligram/model';
import { getNearestCompleteGuidelinesHeight } from '@/lib/guides/straight/model';
import type { GuidelinesTextFitPlan } from '@/lib/layout/guidelines-text-fit';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type Interaction =
  | { mode: 'none' }
  | { mode: 'pan'; pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number }; rect: DOMRect; vb: { w: number; h: number } }
  | { mode: 'move'; pointerId: number; elementId: string; startClient: { x: number; y: number }; original: Frame; visualOriginal: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; liveVisual: Frame; snap: SnapState }
  | { mode: 'resize'; pointerId: number; elementId: string; handle: ResizeHandle; startClient: { x: number; y: number }; original: Frame; visualOriginal: Frame; rect: DOMRect; vb: { w: number; h: number }; live: Frame; liveVisual: Frame; proportional: boolean };

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

function committedResizeFrame(interaction: Extract<Interaction, { mode: 'resize' }>): Frame {
  if (interaction.handle.length === 1) return wholeFrame(interaction.live);
  const aspect = interaction.original.width / interaction.original.height;
  const width = Math.max(4, Math.round(interaction.live.width));
  const height = Math.max(4, Math.round(width / aspect));
  const right = interaction.original.x + interaction.original.width;
  const bottom = interaction.original.y + interaction.original.height;
  return { x: Math.round(interaction.handle.includes('w') ? right-width : interaction.original.x), y: Math.round(interaction.handle.includes('n') ? bottom-height : interaction.original.y), width, height };
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

export default function LayoutStage({ elements, selectedId, textFitPlan, onSelect, onCommit }: { elements: LayoutElement[]; selectedId: string; textFitPlan: GuidelinesTextFitPlan | null; onSelect: (id: string) => void; onCommit: (id: string, frame: Frame) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction>({ mode: 'none' });
  const paintPending = useRef(false);
  const [livePaint, setLivePaint] = useState<{ id: string; frame: Frame; visual?: Frame } | null>(null);
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
  const begin = (e: React.PointerEvent<SVGElement>, element: LayoutElement, handle?: ResizeHandle) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); onSelect(element.id);
    if (element.locked || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const visualOriginal = visualFrame(element, element.frame);
    interactionRef.current = handle
      ? { mode: 'resize', pointerId: e.pointerId, elementId: element.id, handle, startClient: { x: e.clientX, y: e.clientY }, original: element.frame, visualOriginal, live: element.frame, liveVisual: visualOriginal, rect, vb: { w: vb.w, h: vb.h }, proportional: isProportional(element) }
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
      active.liveVisual=resizeFrame(active.visualOriginal,active.handle,dx,dy,active.proportional);
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
          const occupied = occupiedRect(element.type==='calligram'&&!(element.settings.transparentWhitespace??true)?visualFrame(element,frame):frame, element.paddingMM);
          return <g key={element.id} onPointerDown={e => begin(e, element)} style={{ cursor: element.locked ? 'pointer' : 'move' }}>
            {element.type !== 'shape' && !((element.type==='curved-title'||element.type==='calligram')&&(element.settings.transparentWhitespace??true)) && <rect x={occupied.x} y={occupied.y} width={occupied.width} height={occupied.height} fill={PAGE_BACKGROUND} />}
            <ElementVisual element={element} frame={frame} simplify={previewSimplify} selected={element.id === selectedId} textFitPlan={element.id===selectedId?textFitPlan:null} />
          </g>;
        })}
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
  </section>;
}

function ElementVisual({ element, frame, simplify, selected, textFitPlan }: { element: LayoutElement; frame: Frame; simplify: boolean; selected: boolean; textFitPlan: GuidelinesTextFitPlan | null }) {
  const common = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  if (element.type === 'shape') return <ShapeElementRenderer element={element} frame={frame} selected={selected} />;
  if (simplify) return <rect {...common} rx="1" fill="#eef2ff" stroke="#6366f1" strokeDasharray="3 2" strokeWidth=".5" />;
  if (element.type === 'guidelines') return <g transform={`translate(${frame.x} ${frame.y})`}><GuidelinesRenderer box={{ width: frame.width, height: frame.height }} settings={element.settings} idPrefix={`layout-${element.id}`} />{textFitPlan&&<g data-no-export="true" pointerEvents="none">{textFitPlan.placements.map((placement,index)=>{const x=placement.x1-frame.x,y1=placement.waistY-frame.y,y2=placement.baseY-frame.y,shift=placement.slantShiftMM,x2=x+placement.consumedMM;return <path key={index} d={`M ${x+shift},${y1} L ${x2+shift},${y1} L ${x2},${y2} L ${x},${y2} Z`} fill="rgba(148,163,184,.18)" stroke="rgba(100,116,139,.55)" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>})}</g>}</g>;
  if (element.type === 'calligram') return <g transform={`translate(${frame.x} ${frame.y})`}><CalligramRenderer box={{w:frame.width,h:frame.height}} settings={element.settings} idPrefix={`layout-${element.id}`} pageBackground={(element.settings.transparentWhitespace??true)?PAGE_BACKGROUND:undefined} paddingMM={element.paddingMM} selected={selected}/></g>;
  if (element.type === 'curved-title') return <g transform={`translate(${frame.x} ${frame.y})`}><CurvedTitleRenderer box={{w:frame.width,h:frame.height}} settings={element.settings} idPrefix={`layout-${element.id}`} pageBackground={(element.settings.transparentWhitespace??true)?PAGE_BACKGROUND:undefined} paddingMM={element.paddingMM} selected={selected} /></g>;
  return <rect {...common} rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth=".8" />;
}
