import { add, cubic, scale } from '../geometry';
import type { BorderStroke, Point } from '../types';
import type { ShadingDensity } from './types';

export function shadeLeaf(root: Point, axis: Point, across: Point, length: number, width: number, density: ShadingDensity, motif: number): BorderStroke[] {
  const factor = density === 'light' ? .55 : density === 'rich' ? 1.35 : .9;
  // Physical scaling is intentional: very small leaves receive no black thicket.
  const count = Math.max(0, Math.floor((length - 12) / 7 * factor));
  const strokes: BorderStroke[] = [];
  for (let i = 0; i < count; i++) {
    const t = .22 + (i + .5) / Math.max(1, count) * .58;
    const side = i % 2 ? -1 : 1;
    const centre = add(root, scale(axis, length * t));
    const start = add(centre, scale(across, side * width * (.08 + .04 * t)));
    const end = add(add(centre, scale(axis, length * .12)), scale(across, side * width * (.34 * (1 - t))));
    strokes.push({ d: cubic(start, add(start, scale(axis, length * .045)), add(end, scale(axis, -length * .045)), end), role: 'shading', surface: t < .35 ? 'recess' : 'face', motif });
  }
  return strokes;
}

