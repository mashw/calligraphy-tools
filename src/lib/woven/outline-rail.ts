import { offset, type Pt } from '../curve-helpers';

// Keep one edge sample per route sample so crossing intervals and edge
// positions use the same parameter. A sharp corner offsets to the
// intersection of its adjacent lines, including on the inside of the fold.
export function outlineRail(points: Pt[], distance: number): Pt[] {
  const edge = offset(points, distance);
  const last = points.length - 1;
  if (last < 3) return edge;
  const closed = Math.hypot(points[0].x - points[last].x, points[0].y - points[last].y) < 1e-6;
  const anchors = [0];
  for (let i = closed ? 0 : 1; i < last; i++) {
    const p = points[i], before = points[i ? i - 1 : last - 1], after = points[i + 1];
    const a = Math.hypot(p.x - before.x, p.y - before.y), b = Math.hypot(after.x - p.x, after.y - p.y);
    if (!a || !b) continue;
    const ax = (p.x - before.x) / a, ay = (p.y - before.y) / a;
    const bx = (after.x - p.x) / b, by = (after.y - p.y) / b;
    const dot = ax * bx + ay * by;
    if (dot > 1 - 1e-10) continue;
    if (i) anchors.push(i);
    if (dot < .95 && dot > -.9) {
      edge[i] = { x: p.x - distance * (ay + by) / (1 + dot), y: p.y + distance * (ax + bx) / (1 + dot) };
    }
  }
  if (closed) edge[last] = edge[0];
  anchors.push(last);
  for (let j = 1; j < anchors.length; j++) {
    const a = anchors[j - 1], b = anchors[j];
    const length = Math.hypot(points[b].x - points[a].x, points[b].y - points[a].y);
    if (!length) continue;
    for (let i = a + 1; i < b; i++) {
      const t = Math.hypot(points[i].x - points[a].x, points[i].y - points[a].y) / length;
      edge[i] = { x: edge[a].x + t * (edge[b].x - edge[a].x), y: edge[a].y + t * (edge[b].y - edge[a].y) };
    }
  }
  return edge;
}
