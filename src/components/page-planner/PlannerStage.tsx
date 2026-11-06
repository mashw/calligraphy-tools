'use client';
import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { PlannerElement } from '@/lib/page-planner/types';
import { pointerToSvg } from '@/lib/page-planner/geometry';
import { PlannerElementRenderer } from './renderers';

export default function PlannerStage({ width, height, elements, selectedId, onSelect, onMove, svgRef }: { width: number; height: number; elements: PlannerElement[]; selectedId: string | null; onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void; svgRef: RefObject<SVGSVGElement | null> }) {
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function down(e: ReactPointerEvent<SVGGElement>, el: PlannerElement) { e.stopPropagation(); onSelect(el.id); if (el.locked || !svgRef.current) return; const p = pointerToSvg(svgRef.current, e.clientX, e.clientY); drag.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y }; e.currentTarget.setPointerCapture(e.pointerId); }
  function move(e: ReactPointerEvent<SVGSVGElement>) { if (!drag.current || !svgRef.current) return; const p = pointerToSvg(svgRef.current, e.clientX, e.clientY); onMove(drag.current.id, p.x - drag.current.dx, p.y - drag.current.dy); }
  return <div className="flex min-h-[560px] items-center justify-center overflow-auto rounded-2xl bg-slate-200/70 p-6 shadow-inner"><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={`${width}mm`} height={`${height}mm`} onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null} onPointerDown={() => onSelect(null)} className="h-auto max-h-[72vh] max-w-full touch-none bg-white shadow-xl" aria-label="Page planner preview"><rect width={width} height={height} fill="white"/>{elements.map(el => <g key={el.id} onPointerDown={e => down(e, el)} className={el.locked ? 'cursor-default' : 'cursor-move'}><PlannerElementRenderer element={el}/>{el.visible && selectedId === el.id && <circle cx={el.x} cy={el.y} r="2.2" fill="#4f46e5" stroke="white" strokeWidth=".7" data-no-export="true"/>}</g>)}</svg></div>;
}
