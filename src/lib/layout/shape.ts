import type { Frame } from './types';

export type ShapeKind = 'rectangle' | 'square' | 'roundedRectangle' | 'ellipse' | 'circle';
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
  return settings.kind === 'square' || settings.kind === 'circle';
}

export function constrainFrameToSquare(frame: Frame): Frame {
  const size = Math.min(frame.width, frame.height);
  return { x: frame.x + (frame.width - size) / 2, y: frame.y + (frame.height - size) / 2, width: size, height: size };
}
