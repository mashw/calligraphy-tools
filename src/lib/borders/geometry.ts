import type { Point } from './types';

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
export const mix = (a: Point, b: Point, t: number): Point => add(scale(a, 1 - t), scale(b, t));
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const unit = (a: Point): Point => { const l = length(a) || 1; return scale(a, 1 / l); };
export const fmt = (p: Point): string => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
export const cubic = (a: Point, b: Point, c: Point, d: Point): string => `M ${fmt(a)} C ${fmt(b)} ${fmt(c)} ${fmt(d)}`;

export function smoothPath(points: Point[], closed = false): string {
  if (points.length < 2) return '';
  let d = `M ${fmt(points[0])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += ` C ${fmt(add(p1, scale({ x: p2.x - p0.x, y: p2.y - p0.y }, 1 / 6)))} ${fmt(add(p2, scale({ x: p1.x - p3.x, y: p1.y - p3.y }, 1 / 6)))} ${fmt(p2)}`;
  }
  return d + (closed ? ' Z' : '');
}

export function seeded(seed: number, index: number): number {
  const value = Math.sin((seed + 1) * 128.31 + index * 91.17) * 43758.5453;
  return value - Math.floor(value);
}

