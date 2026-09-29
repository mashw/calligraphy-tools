import type { LayoutElement } from './types';

export function clampCustomStartMM(value: number, maxCustomStartMM: number, fallback = 0) {
  const max = Number.isFinite(maxCustomStartMM) ? Math.max(0, maxCustomStartMM) : 0;
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!Number.isFinite(value)) return Math.max(0, Math.min(max, safeFallback));
  return Math.max(0, Math.min(max, value));
}

export function customStartFromDrag(start: number, svgDeltaX: number, maxCustomStartMM: number) {
  return clampCustomStartMM(start + svgDeltaX, maxCustomStartMM, start);
}

export function updatePlannedLinePlacement(
  elements: LayoutElement[],
  guidelinesId: string,
  lineId: string,
  customStartMM: number,
) {
  if (!Number.isFinite(customStartMM)) return elements;
  return elements.map(element => element.id === guidelinesId && element.type === 'guidelines'
    ? {
      ...element,
      plannedLines: element.plannedLines.map(line => line.id === lineId
        ? { ...line, alignment: 'custom' as const, customStartMM }
        : line),
    }
    : element);
}
