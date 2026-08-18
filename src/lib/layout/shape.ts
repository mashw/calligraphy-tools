import type { Frame } from './types';

export type ShapeKind = 'rectangle' | 'square' | 'roundedRectangle' | 'ellipse' | 'circle';
export type ShapeAppearance = 'reserve' | 'fill' | 'border' | 'fillAndBorder';

export type ShapeSettings = {
  kind: ShapeKind;
  paddingMM: number;
  appearance: ShapeAppearance;
  fillColor: string;
  borderColor: string;
  borderWidthMM: number;
  cornerRadiusMM: number;
};

export const PAGE_BACKGROUND = '#ffffff';

export function createDefaultShapeSettings(): ShapeSettings {
  return { kind: 'rectangle', paddingMM: 0, appearance: 'border', fillColor: '#ffffff', borderColor: '#334155', borderWidthMM: 0.5, cornerRadiusMM: 3 };
}

export function isConstrainedShape(settings: ShapeSettings) {
  return settings.kind === 'square' || settings.kind === 'circle';
}

export function constrainFrameToSquare(frame: Frame): Frame {
  const size = Math.min(frame.width, frame.height);
  return { x: frame.x + (frame.width - size) / 2, y: frame.y + (frame.height - size) / 2, width: size, height: size };
}

export function shapeVisibleBox(frame: Pick<Frame, 'width' | 'height'>, requestedPadding: number) {
  const maxPadding = Math.max(0, (Math.min(frame.width, frame.height) - 0.1) / 2);
  const padding = Math.min(Math.max(0, requestedPadding), maxPadding);
  return { x: padding, y: padding, width: Math.max(0.1, frame.width - padding * 2), height: Math.max(0.1, frame.height - padding * 2), padding };
}

export function clampShapePadding(frame: Pick<Frame, 'width' | 'height'>, requestedPadding: number) {
  return shapeVisibleBox(frame, requestedPadding).padding;
}
