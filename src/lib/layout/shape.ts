import type { Frame } from './types';

export const SHAPE_OPTIONS = [
  { kind: 'rectangle', label: 'Rectangle' }, { kind: 'square', label: 'Square' },
  { kind: 'roundedRectangle', label: 'Rounded rectangle' }, { kind: 'roundedSquare', label: 'Rounded square' },
  { kind: 'ellipse', label: 'Ellipse' }, { kind: 'circle', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' }, { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' }, { kind: 'octagon', label: 'Octagon' },
  { kind: 'diamond', label: 'Diamond' }, { kind: 'star', label: 'Star' },
] as const;
export type ShapeKind = typeof SHAPE_OPTIONS[number]['kind'];
export type ShapeAppearance = 'reserve' | 'fill' | 'border' | 'fillAndBorder';

export type ShapeSettings = {
  kind: ShapeKind;
  appearance: ShapeAppearance;
  fillColor: string;
  borderColor: string;
  borderWidthMM: number;
  cornerRadiusMM: number;
};

export const PAGE_BACKGROUND = '#ffffff';

export function createDefaultShapeSettings(): ShapeSettings {
  return { kind: 'rectangle', appearance: 'border', fillColor: '#ffffff', borderColor: '#334155', borderWidthMM: 0.5, cornerRadiusMM: 3 };
}

export function isConstrainedShape(settings: ShapeSettings) {
  return settings.kind === 'square' || settings.kind === 'roundedSquare' || settings.kind === 'circle';
}

function normalizedRadialPoints(count: number, width: number, height: number, innerRatio?: number) {
  const total = innerRatio == null ? count : count * 2;
  const raw = Array.from({ length: total }, (_, index) => {
    const radius = innerRatio != null && index % 2 ? innerRatio : 1;
    const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const xs = raw.map(point => point.x), ys = raw.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return raw.map(point => `${(point.x-minX)/(maxX-minX)*width},${(point.y-minY)/(maxY-minY)*height}`).join(' ');
}

export function shapePolygonPoints(kind: ShapeKind, width: number, height: number) {
  if (kind === 'diamond') return `0,${height/2} ${width/2},0 ${width},${height/2} ${width/2},${height}`;
  if (kind === 'star') return normalizedRadialPoints(5, width, height, 0.4);
  const sides = kind === 'triangle' ? 3 : kind === 'pentagon' ? 5 : kind === 'hexagon' ? 6 : kind === 'octagon' ? 8 : 0;
  return sides ? normalizedRadialPoints(sides, width, height) : '';
}

export function constrainFrameToSquare(frame: Frame): Frame {
  const size = Math.min(frame.width, frame.height);
  return { x: frame.x + (frame.width - size) / 2, y: frame.y + (frame.height - size) / 2, width: size, height: size };
}
