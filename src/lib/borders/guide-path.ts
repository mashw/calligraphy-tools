import type { GuidePath, PathFrame, Point } from './types';
import { unit } from './geometry';

const delta = (a: Point, b: Point): Point => ({ x: b.x - a.x, y: b.y - a.y });

/** Samples SVG's arc-length API, then derives stable centred-difference frames. */
export function guidePathFromElement(path: SVGPathElement, d: string, closed: boolean, reverse = false): GuidePath {
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length < 1) throw new Error('The selected path has no usable length.');
  // Fine enough for leaf placement, with extra density on short/tight paths.
  const count = Math.max(160, Math.min(1600, Math.ceil(length / 1.2)));
  const points: Point[] = Array.from({ length: count + 1 }, (_, i) => {
    const s = length * i / count;
    const p = path.getPointAtLength(reverse ? length - s : s);
    return { x: p.x, y: p.y };
  });
  const frames: PathFrame[] = points.map((point, i) => {
    const before = points[Math.max(0, i - 2)], after = points[Math.min(count, i + 2)];
    const tangent = unit(delta(before, after));
    const ta = unit(delta(points[Math.max(0, i - 2)], points[i]));
    const tb = unit(delta(points[i], points[Math.min(count, i + 2)]));
    const ds = Math.max(.001, length * (Math.min(count, i + 2) - Math.max(0, i - 2)) / count / 2);
    const curvature = (ta.x * tb.y - ta.y * tb.x) / ds;
    return { s: length * i / count, point, tangent, normal: { x: -tangent.y, y: tangent.x }, curvature };
  });
  const area = closed ? points.slice(0, -1).reduce((sum, p, i) => { const q = points[(i + 1) % count]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2 : 0;
  const threshold = .055;
  const corners = frames.filter((frame, i) => Math.abs(frame.curvature) > threshold && (i === 0 || Math.abs(frames[i - 1].curvature) <= threshold)).map(frame => frame.s);
  return { d, length, closed, winding: area === 0 ? 0 : area > 0 ? 1 : -1, frames, corners };
}

export function frameAt(path: GuidePath, s: number): PathFrame {
  const wrapped = path.closed ? ((s % path.length) + path.length) % path.length : Math.max(0, Math.min(path.length, s));
  const at = wrapped / path.length * (path.frames.length - 1), i = Math.min(path.frames.length - 2, Math.floor(at)), t = at - i;
  const a = path.frames[i], b = path.frames[i + 1];
  const tangent = unit({ x: a.tangent.x * (1 - t) + b.tangent.x * t, y: a.tangent.y * (1 - t) + b.tangent.y * t });
  return { s: wrapped, point: { x: a.point.x * (1 - t) + b.point.x * t, y: a.point.y * (1 - t) + b.point.y * t }, tangent, normal: { x: -tangent.y, y: tangent.x }, curvature: a.curvature * (1 - t) + b.curvature * t };
}

