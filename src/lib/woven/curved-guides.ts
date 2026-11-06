import { type Point, type Interval } from "./geometry";

import type { LocatedPoint } from "../guides/slant-paths";
export { curvedSlant, routeFrame } from "../guides/slant-paths";
export type { LocatedPoint } from "../guides/slant-paths";
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
