import type { Orientation, PaperId, PaperSize, PlannerElement, PlannerElementKind } from './types';

export const PAPERS: Record<PaperId, PaperSize> = {
  A3: { width: 297, height: 420, label: 'A3 · 297 × 420 mm' },
  A4: { width: 210, height: 297, label: 'A4 · 210 × 297 mm' },
  A5: { width: 148, height: 210, label: 'A5 · 148 × 210 mm' },
  Letter: { width: 215.9, height: 279.4, label: 'US Letter · 8.5 × 11 in' },
};

let serial = 0;
export function createElement(kind: PlannerElementKind, pageWidth = 210, pageHeight = 297): PlannerElement {
  serial += 1;
  const base = { id: `${kind}-${Date.now()}-${serial}`, x: pageWidth / 2, y: pageHeight / 2, scalePct: 100, rotDeg: 0, visible: true, locked: false, previewOnly: false, blocksLower: kind !== 'page-guidelines' };
  if (kind === 'page-guidelines') return { ...base, kind, name: 'Page guidelines', x: 12, y: 15, width: pageWidth - 24, height: pageHeight - 30, lineGap: 12, xHeight: 5, slant: true };
  if (kind === 'guideline-block') return { ...base, kind, name: 'Guideline block', width: 100, height: 55, lineGap: 12, xHeight: 5, slant: false };
  if (kind === 'shape') return { ...base, kind, name: 'Decoration space', shape: 'rectangle', width: 45, height: 45, filled: false };
  if (kind === 'curved-title') return { ...base, kind, name: 'Curved title', width: 120, rise: 18, bandHeight: 12 };
  return { ...base, kind, name: 'Main calligram circle', radius: 45, bandHeight: 12 };
}

export function paperDimensions(id: PaperId, orientation: Orientation) {
  const p = PAPERS[id];
  return orientation === 'portrait' ? { width: p.width, height: p.height } : { width: p.height, height: p.width };
}
