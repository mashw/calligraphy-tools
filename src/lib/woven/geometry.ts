export type Point = { x: number; y: number };
export type Preset = 'rosette' | 'figure-eight';
export type Crossing = { id: string; point: Point; a: number; b: number; cosine: number; sine: number };
export type Interval = [number, number];
export type Route = { points: Point[]; distances: number[]; length: number };

export function makeRoute(preset: Preset, width: number, height: number, loop: number, rotation: number, reverse: boolean, center = { x: 105, y: 148.5 }): Route {
  const count = 960;
  const raw = Array.from({ length: count }, (_, i) => {
    const t = i / count * Math.PI * 2;
    return preset === 'figure-eight'
      ? { x: Math.sin(t), y: Math.sin(2 * t) * .65 }
      : { x: Math.cos(t) + loop * Math.cos(7 * t), y: Math.sin(t) + loop * Math.sin(7 * t) };
  });
  const xs = raw.map(p => p.x), ys = raw.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const angle = rotation * Math.PI / 180;
  const points = raw.map(p => {
    const x = (p.x - (maxX + minX) / 2) / (maxX - minX) * width;
    const y = (p.y - (maxY + minY) / 2) / (maxY - minY) * height;
    return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) };
  });
  points.push({ ...points[0] });
  if (reverse) points.reverse();
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, distances, length: distances.at(-1)! };
}

export function findSelfCrossings(route: Route): Crossing[] {
  const { points: p, distances: d } = route;
  const hits: Crossing[] = [];
  const last = p.length - 2;
  for (let i = 0; i <= last; i++) {
    const a = p[i], b = p[i + 1], rx = b.x - a.x, ry = b.y - a.y;
    for (let j = i + 2; j <= last; j++) {
      if (i === 0 && j === last) continue;
      const c = p[j], e = p[j + 1];
      if (Math.max(a.x, b.x) < Math.min(c.x, e.x) || Math.min(a.x, b.x) > Math.max(c.x, e.x) || Math.max(a.y, b.y) < Math.min(c.y, e.y) || Math.min(a.y, b.y) > Math.max(c.y, e.y)) continue;
      const sx = e.x - c.x, sy = e.y - c.y, denom = rx * sy - ry * sx;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
      const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
      if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      const canonical = (s: number) => s < .00001 || route.length - s < .00001 ? 0 : s;
      const visits = [canonical(d[i] + t * (d[i + 1] - d[i])), canonical(d[j] + u * (d[j + 1] - d[j]))].sort((a, b) => a - b);
      const [at, bt] = visits;
      // The same crossing can be reported on either side of a sampled vertex.
      if (hits.some(h => Math.abs(h.a - at) < .05 && Math.abs(h.b - bt) < .05)) continue;
      const product = Math.hypot(rx, ry) * Math.hypot(sx, sy);
      hits.push({ id: `crossing-${hits.length}`, point: { x: a.x + t * rx, y: a.y + t * ry }, a: at, b: bt, cosine: Math.abs((rx * sx + ry * sy) / product), sine: Math.abs(denom / product) });
    }
  }
  return hits;
}

export function alternateWeave(crossings: Crossing[]): { choices: Record<string, 'a' | 'b'>; conflicts: number } {
  const visits = crossings.flatMap(c => [{ c, side: 'a' as const, s: c.a }, { c, side: 'b' as const, s: c.b }]).sort((a, b) => a.s - b.s);
  const choices: Record<string, 'a' | 'b'> = {};
  let conflicts = 0;
  visits.forEach((v, i) => {
    const wanted = i % 2 === 0 ? v.side : v.side === 'a' ? 'b' : 'a';
    if (choices[v.c.id] && choices[v.c.id] !== wanted) conflicts++;
    else choices[v.c.id] = wanted;
  });
  return { choices, conflicts };
}

export function wrap(s: number, length: number) { return ((s % length) + length) % length; }

export function atDistance(route: Route, s: number, points = route.points): Point {
  const target = Math.max(0, Math.min(route.length, s));
  let lo = 0, hi = route.distances.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (route.distances[mid] <= target) lo = mid; else hi = mid; }
  const t = (target - route.distances[lo]) / (route.distances[hi] - route.distances[lo] || 1);
  return { x: points[lo].x + (points[hi].x - points[lo].x) * t, y: points[lo].y + (points[hi].y - points[lo].y) * t };
}

export function visibleIntervals(length: number, cuts: { center: number; half: number }[]): Interval[] {
  const intervals: Interval[] = [];
  for (const cut of cuts) {
    if (cut.half * 2 >= length) return [];
    const start = wrap(cut.center - cut.half, length), end = start + cut.half * 2;
    if (end > length) intervals.push([start, length], [0, end - length]);
    else intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [];
  let cursor = 0;
  for (const [start, end] of intervals) { if (start > cursor) result.push([cursor, start]); cursor = Math.max(cursor, end); }
  if (cursor < length) result.push([cursor, length]);
  return result;
}

/** Slice every offset guide with the SAME route indices: never mask the over passage. */
export function sliceGuide(route: Route, points: Point[], [start, end]: Interval): Point[] {
  const result = [atDistance(route, start, points)];
  route.distances.forEach((s, i) => { if (s > start && s < end) result.push(points[i]); });
  result.push(atDistance(route, end, points));
  return result;
}

export function crossingCuts(crossings: Crossing[], choices: Record<string, 'a' | 'b'>, halfBand: number, clearance: number) {
  return crossings.map(c => ({ center: choices[c.id] === 'a' ? c.b : c.a, half: (halfBand * (1 + c.cosine) + clearance) / Math.max(.12, c.sine) }));
}

export function minimumRadius(route: Route): number {
  let radius = Infinity;
  const ring = route.points.slice(0, -1);
  ring.forEach((b, i) => {
    const a = ring[(i + ring.length - 1) % ring.length], c = ring[(i + 1) % ring.length];
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (area2 > 1e-8) radius = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y) * Math.hypot(a.x - c.x, a.y - c.y) / (2 * area2));
  });
  return radius;
}

