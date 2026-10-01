import type { PlannerElement } from '@/lib/page-planner/types';
import { archPaths } from '@/lib/page-planner/geometry';

const ink = '#718096';
function Guidelines({ element }: { element: Extract<PlannerElement, { kind: 'page-guidelines' | 'guideline-block' }> }) {
  const { width: w, height: h, lineGap: gap, xHeight } = element;
  const startX = element.kind === 'page-guidelines' ? 0 : -w / 2, startY = element.kind === 'page-guidelines' ? 0 : -h / 2;
  const rows = Array.from({ length: Math.max(1, Math.floor(h / gap)) }, (_, i) => startY + gap * (i + 0.7)).filter(y => y + xHeight <= startY + h);
  return <>{element.blocksLower && <rect x={startX} y={startY} width={w} height={h} fill="white" />}{rows.map((y, i) => <g key={i} stroke={ink} strokeWidth="0.22"><line x1={startX} y1={y} x2={startX + w} y2={y} /><line x1={startX} y1={y + xHeight} x2={startX + w} y2={y + xHeight} strokeDasharray="1.2 1.2" />{element.slant && Array.from({ length: Math.ceil(w / 15) }, (_, j) => <line key={j} x1={startX + j * 15} y1={y + xHeight} x2={startX + j * 15 + 2.2} y2={y} opacity=".55" />)}</g>)}</>;
}

export function PlannerElementRenderer({ element }: { element: PlannerElement }) {
  if (!element.visible) return null;
  const transform = `translate(${element.x} ${element.y}) rotate(${element.rotDeg}) scale(${element.scalePct / 100})`;
  let content;
  if (element.kind === 'page-guidelines' || element.kind === 'guideline-block') content = <Guidelines element={element} />;
  else if (element.kind === 'shape') content = element.shape === 'rectangle' ? <><rect x={-element.width / 2} y={-element.height / 2} width={element.width} height={element.height} fill={element.blocksLower || element.filled ? 'white' : 'none'} /><rect x={-element.width / 2} y={-element.height / 2} width={element.width} height={element.height} fill={element.filled ? '#edf2f7' : 'none'} stroke="#374151" strokeWidth="0.45" /></> : <><ellipse rx={element.width / 2} ry={element.height / 2} fill={element.blocksLower || element.filled ? 'white' : 'none'} /><ellipse rx={element.width / 2} ry={element.height / 2} fill={element.filled ? '#edf2f7' : 'none'} stroke="#374151" strokeWidth="0.45" /></>;
  else if (element.kind === 'curved-title') { const p = archPaths(element.width, element.rise, element.bandHeight); content = <>{element.blocksLower && <path d={`${p.top} L ${element.width / 2} ${element.bandHeight / 2} Q 0 ${-element.rise + element.bandHeight / 2} ${-element.width / 2} ${element.bandHeight / 2} Z`} fill="white" />}<g fill="none" stroke={ink} strokeWidth="0.35"><path d={p.top}/><path d={p.middle} strokeDasharray="2 1"/><path d={p.bottom}/></g></> }
  else if (element.kind === 'calligram-main-circle') content = <>{element.blocksLower && <circle r={element.radius} fill="none" stroke="white" strokeWidth={element.bandHeight} />}<g fill="none" stroke={ink} strokeWidth="0.35"><circle r={element.radius - element.bandHeight / 2}/><circle r={element.radius} strokeDasharray="2 1"/><circle r={element.radius + element.bandHeight / 2}/></g></>;
  return <g transform={transform} data-no-export={element.previewOnly ? 'true' : undefined} data-planner-id={element.id}>{content}</g>;
}
