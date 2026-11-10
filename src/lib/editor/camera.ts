export type Bounds = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };

export function validBounds(bounds: Bounds): boolean {
  return Object.values(bounds).every(Number.isFinite) && bounds.w > 0 && bounds.h > 0;
}

/** Match the container aspect ratio so SVG units map identically on both axes. */
export function fitBounds(bounds: Bounds, size: Size, padding = 24): Bounds {
  const width = Math.max(1, size.width), height = Math.max(1, size.height);
  const safe = validBounds(bounds) ? bounds : { x: 0, y: 0, w: 1, h: 1 };
  const inset = Math.min(padding, width / 4, height / 4);
  const scale = Math.min((width - 2 * inset) / safe.w, (height - 2 * inset) / safe.h);
  const w = width / scale, h = height / scale;
  return { x: safe.x + (safe.w - w) / 2, y: safe.y + (safe.h - h) / 2, w, h };
}

export function zoomBounds(frame: Bounds, factor: number, anchor = { x: .5, y: .5 }): Bounds {
  const w = frame.w / factor, h = frame.h / factor;
  return { x: frame.x + (frame.w - w) * anchor.x, y: frame.y + (frame.h - h) * anchor.y, w, h };
}

/** Keep center and units per CSS pixel when a custom view is resized. */
export function resizeBounds(frame: Bounds, before: Size, after: Size): Bounds {
  if (before.width === after.width && before.height === after.height) return frame;
  const unitsPerPixel = frame.w / Math.max(1, before.width);
  const w = Math.max(1, after.width) * unitsPerPixel, h = Math.max(1, after.height) * unitsPerPixel;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
}

export function pointBounds(points: readonly { x: number; y: number }[], fallback: Bounds, margin = 0): Bounds {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    left = Math.min(left, point.x); top = Math.min(top, point.y);
    right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
  }
  return left === Infinity ? fallback : { x: left - margin, y: top - margin, w: Math.max(1, right - left) + margin * 2, h: Math.max(1, bottom - top) + margin * 2 };
}
