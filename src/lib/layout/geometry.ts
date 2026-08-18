import type { Frame, ResizeHandle } from './types';

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

export function snapMove(frame: Frame, page: { width: number; height: number }, tolerance: { x: number; y: number }, release: { x: number; y: number }, state: SnapState) {
  const sx = snapAxis(frame.x, frame.width, page.width, tolerance.x, release.x, state.x);
  const sy = snapAxis(frame.y, frame.height, page.height, tolerance.y, release.y, state.y);
  return { frame: { ...frame, x: sx.start, y: sy.start }, snap: { x: sx.active, y: sy.active } as SnapState };
}
