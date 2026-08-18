import type { Frame, Margins, ResizeHandle } from './types';

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

  if (proportional) {
    const ratio = frame.width / frame.height;
    const corner = (usesW || usesE) && (usesN || usesS);
    const scale = corner
      ? Math.max(MIN_SIZE / frame.width, MIN_SIZE / frame.height, Math.abs(dx / frame.width) >= Math.abs(dy / frame.height) ? width / frame.width : height / frame.height)
      : usesW || usesE ? width / frame.width : height / frame.height;
    width = frame.width * scale;
    height = frame.height * scale;
    if (usesW) x = right - width;
    if (usesN) y = bottom - height;
    if (!corner && (usesN || usesS)) width = height * ratio;
  }
  return { x, y, width, height };
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
