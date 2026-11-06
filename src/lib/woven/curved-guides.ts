import {
  atDistance,
  wrap,
  type Route,
  type Point,
  type Interval,
} from "./geometry";

export type LocatedPoint = Point & { s: number };
/** Clip in passage coordinates, never in page coordinates: overpasses survive. */
export function clipPassage(
  points: LocatedPoint[],
  intervals: Interval[],
  length: number,
): Point[][] {
  const pieces: Point[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const lo = Math.min(a.s, b.s),
      hi = Math.max(a.s, b.s);
    for (
      let turn = Math.floor(lo / length);
      turn <= Math.floor(hi / length);
      turn++
    ) {
      for (const [start, end] of intervals) {
        const left = Math.max(lo, start + turn * length),
          right = Math.min(hi, end + turn * length);
        if (left > right || (left === right && hi !== lo)) continue;
        if (
          hi === lo &&
          (lo < start + turn * length || lo > end + turn * length)
        )
          continue;
        const interpolate = (s: number): Point => {
          const t = hi === lo ? 0 : (s - a.s) / (b.s - a.s);
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        };
        const p = interpolate(b.s >= a.s ? left : right),
          q =
            hi === lo
              ? { x: b.x, y: b.y }
              : interpolate(b.s >= a.s ? right : left);
        const previous = pieces.at(-1);
        if (
          previous &&
          Math.hypot(previous.at(-1)!.x - p.x, previous.at(-1)!.y - p.y) < 1e-8
        )
          previous.push(q);
        else pieces.push([p, q]);
      }
    }
  }
  return pieces;
}
export function routeFrame(route: Route, s: number) {
  const p = atDistance(route, wrap(s, route.length));
  const a = atDistance(route, wrap(s - 0.2, route.length)),
    b = atDistance(route, wrap(s + 0.2, route.length));
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {
    p,
    t: { x: (b.x - a.x) / l, y: (b.y - a.y) / l },
    n: { x: -(b.y - a.y) / l, y: (b.x - a.x) / l },
  };
}
/** Integrate a constant local slant through the offset strip. Curvature corrects
 * longitudinal speed; connecting only the two rail endpoints cuts across bends. */
export function curvedSlant(
  route: Route,
  anchor: number,
  top: number,
  bottom: number,
  angle: number,
): LocatedPoint[] {
  const cot = 1 / Math.tan((Math.max(1, Math.min(179, angle)) * Math.PI) / 180);
  function walk(target: number): LocatedPoint[] {
    const count = Math.max(1, Math.ceil(Math.abs(target) / 0.15));
    const du = target / count;
    let s = anchor;
    const out: LocatedPoint[] = [];
    for (let i = 0; i <= count; i++) {
      const u = i * du,
        f = routeFrame(route, s);
      out.push({ x: f.p.x + f.n.x * u, y: f.p.y + f.n.y * u, s });
      const before = routeFrame(route, s - 0.3).t,
        after = routeFrame(route, s + 0.3).t;
      const curvature =
        Math.atan2(
          before.x * after.y - before.y * after.x,
          before.x * after.x + before.y * after.y,
        ) / 0.6;
      const jacobian = 1 - curvature * (u + du / 2);
      // Offset cusps have no regular local coordinate system; do not bridge them.
      if (jacobian <= 0.1) break;
      s -= (du * cot) / jacobian;
    }
    return out;
  }
  return [...walk(top).reverse(), ...walk(bottom).slice(1)];
}
