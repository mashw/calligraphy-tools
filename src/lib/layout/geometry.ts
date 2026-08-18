import type { Frame, Margins, ResizeHandle } from './types';

export function boundsOfPoints(points: ReadonlyArray<{ x: number; y: number }>): Frame {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const MIN_SIZE = 4;

export function resizeFrame(frame: Frame, handle: ResizeHandle, dx: number, dy: number, proportional: boolean): Frame {
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const usesW = handle.includes('w');
  const usesE = handle.includes('e');
  const usesN = handle.includes('n');
  const usesS = handle.includes('s');
  let x = usesW ? Math.min(frame.x + dx, right - MIN_SIZE) : frame.x;
  let y = usesN ? Math.min(frame.y + dy, bottom - MIN_SIZE) : frame.y;
  let width = usesW ? right - x : usesE ? Math.max(MIN_SIZE, frame.width + dx) : frame.width;
  let height = usesN ? bottom - y : usesS ? Math.max(MIN_SIZE, frame.height + dy) : frame.height;

  const corner = (usesW || usesE) && (usesN || usesS);
  if (corner) {
    const aspect = frame.width / frame.height;
    const rawWidth = usesW ? frame.width - dx : frame.width + dx;
    const rawHeight = usesN ? frame.height - dy : frame.height + dy;
    const widthChange = Math.abs(rawWidth - frame.width) / frame.width;
    const heightChange = Math.abs(rawHeight - frame.height) / frame.height;
    if (widthChange >= heightChange) {
      width = Math.max(MIN_SIZE, MIN_SIZE * aspect, rawWidth);
      height = width / aspect;
    } else {
      height = Math.max(MIN_SIZE, MIN_SIZE / aspect, rawHeight);
      width = height * aspect;
    }
    x = usesW ? right - width : frame.x;
    y = usesN ? bottom - height : frame.y;
  } else if (proportional) {
    if (usesW || usesE) {
      const size = Math.max(MIN_SIZE, usesW ? frame.width - dx : frame.width + dx);
      width = size;
      height = size;
      x = usesW ? right - size : frame.x;
      y = frame.y + (frame.height - size) / 2;
    } else {
      const size = Math.max(MIN_SIZE, usesN ? frame.height - dy : frame.height + dy);
      width = size;
      height = size;
      x = frame.x + (frame.width - size) / 2;
      y = usesN ? bottom - size : frame.y;
    }
  }
  return { x, y, width, height };
}

export function occupiedRect(frame: Frame, paddingMM: number): Frame {
  const padding = Math.max(0, paddingMM);
  return { x: frame.x - padding, y: frame.y - padding, width: frame.width + padding * 2, height: frame.height + padding * 2 };
}

type SnapAxis = 'start' | 'center' | 'end' | null;
export type SnapState = { x: SnapAxis; y: SnapAxis };

export function pageContentRect(page: { width: number; height: number }, margins: Margins): Frame {
  const left = Math.min(page.width, Math.max(0, margins.left));
  const top = Math.min(page.height, Math.max(0, margins.top));
  return {
    x: left,
    y: top,
    width: Math.max(0, page.width - left - Math.max(0, margins.right)),
    height: Math.max(0, page.height - top - Math.max(0, margins.bottom)),
  };
}

export type Alignment = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom';
export function alignContent(frame: Frame, internal: Margins, pageRect: Frame, alignment: Alignment): Frame {
  const contentWidth = Math.max(0, frame.width - internal.left - internal.right);
  const contentHeight = Math.max(0, frame.height - internal.top - internal.bottom);
  if (alignment === 'left') return { ...frame, x: pageRect.x - internal.left };
  if (alignment === 'right') return { ...frame, x: pageRect.x + pageRect.width - frame.width + internal.right };
  if (alignment === 'h-center') return { ...frame, x: pageRect.x + pageRect.width / 2 - contentWidth / 2 - internal.left };
  if (alignment === 'top') return { ...frame, y: pageRect.y - internal.top };
  if (alignment === 'bottom') return { ...frame, y: pageRect.y + pageRect.height - frame.height + internal.bottom };
  return { ...frame, y: pageRect.y + pageRect.height / 2 - contentHeight / 2 - internal.top };
}

export function halfPageContent(frame: Frame, internal: Margins, pageRect: Frame, axis: 'width' | 'height'): Frame {
  return sizeToPageContent(frame, internal, pageRect, axis, 0.5);
}

export function sizeToPageContent(frame: Frame, internal: Margins, pageRect: Frame, axis: 'width' | 'height', fraction: 0.5 | 1): Frame {
  return axis === 'width'
    ? { ...frame, width: pageRect.width * fraction + internal.left + internal.right }
    : { ...frame, height: pageRect.height * fraction + internal.top + internal.bottom };
}

function snapAxis(start: number, size: number, pageSize: number, tolerance: number, release: number, active: SnapAxis) {
  const positions = { start, center: start + size / 2, end: start + size };
  const targets = { start: 0, center: pageSize / 2, end: pageSize };
  if (active) {
    const delta = targets[active] - positions[active];
    if (Math.abs(delta) <= release) return { start: start + delta, active };
  }
  for (const key of ['start', 'center', 'end'] as const) {
    const delta = targets[key] - positions[key];
    if (Math.abs(delta) <= tolerance) return { start: start + delta, active: key };
  }
  return { start, active: null };
}

export function snapMove(frame: Frame, internal: Margins, target: Frame, tolerance: { x: number; y: number }, release: { x: number; y: number }, state: SnapState) {
  const content = {
    x: frame.x + internal.left,
    y: frame.y + internal.top,
    width: Math.max(0, frame.width - internal.left - internal.right),
    height: Math.max(0, frame.height - internal.top - internal.bottom),
  };
  const sx = snapAxis(content.x - target.x, content.width, target.width, tolerance.x, release.x, state.x);
  const sy = snapAxis(content.y - target.y, content.height, target.height, tolerance.y, release.y, state.y);
  return {
    frame: { ...frame, x: target.x + sx.start - internal.left, y: target.y + sy.start - internal.top },
    snap: { x: sx.active, y: sy.active } as SnapState,
  };
}
