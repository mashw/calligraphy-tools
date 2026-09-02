import { add, cubic, fmt, scale, smoothPath, unit } from '../geometry';
import type { BorderStroke, PathFrame, Point } from '../types';
import { shadeLeaf } from './shading';
import type { LeafParameters } from './types';

/** Builds one leaf from its midrib, alternating eyes and projected lobe tips. */
export function buildLeaf(frame: PathFrame, parameters: LeafParameters): { strokes: BorderStroke[]; tip: Point } {
  const { length, width, lobes, side, sweep, compression, detail, shading, motif } = parameters;
  const axis = unit(add(scale(frame.tangent, .72), scale(frame.normal, side * (.7 + sweep))));
  const across = { x: -axis.y, y: axis.x }, root = add(frame.point, scale(frame.normal, side * width * .1));
  const adjustedWidth = width * compression;
  const tip = add(root, scale(axis, length));
  const left: Point[] = [root], right: Point[] = [root];
  for (let i = 0; i < lobes; i++) {
    const t = .1 + i / lobes * .76;
    const envelope = Math.sin(Math.PI * Math.pow(t, .76)) * (1 - .2 * t);
    const lowerWeight = 1.12 - .35 * t;
    const centre = add(root, scale(axis, length * t));
    const eyeT = Math.max(.04, t - .052);
    const eyeCentre = add(root, scale(axis, length * eyeT));
    const stagger = i % 2 ? .9 : 1.08;
    left.push(add(eyeCentre, scale(across, adjustedWidth * envelope * .25)));
    left.push(add(add(centre, scale(axis, length * .035)), scale(across, adjustedWidth * envelope * lowerWeight * stagger)));
    right.push(add(eyeCentre, scale(across, -adjustedWidth * envelope * .25)));
    right.push(add(add(centre, scale(axis, -length * .012)), scale(across, -adjustedWidth * envelope * lowerWeight * (2 - stagger))));
  }
  left.push(tip); right.push(tip);
  const contour = [...left, ...right.reverse().slice(1)];
  const strokes: BorderStroke[] = [{ d: smoothPath(contour, true), role: 'outline', surface: 'face', motif }];
  const midribEnd = add(root, scale(axis, length * .92));
  strokes.push({ d: cubic(root, add(root, scale(axis, length * .3)), add(midribEnd, scale(across, side * adjustedWidth * .08)), midribEnd), role: 'midrib', surface: 'face', motif });
  const veinEvery = detail === 'low' ? 2 : 1;
  for (let i = 0; i < lobes; i += veinEvery) {
    const t = .13 + i / lobes * .72, centre = add(root, scale(axis, length * t)), envelope = Math.sin(Math.PI * t);
    for (const branch of [-1, 1] as const) {
      const end = add(add(centre, scale(axis, length * .055)), scale(across, branch * adjustedWidth * envelope * .68));
      strokes.push({ d: cubic(add(root, scale(axis, length * .035)), add(root, scale(axis, length * t * .62)), add(end, scale(across, -branch * adjustedWidth * .12)), end), role: 'pipe', surface: branch === side ? 'face' : 'fold', motif });
    }
    const eye = add(add(root, scale(axis, length * Math.max(.06, t - .055))), scale(across, adjustedWidth * (i % 2 ? -.18 : .18)));
    const r = Math.max(.6, adjustedWidth * .07);
    strokes.push({ d: `M ${fmt(add(eye, scale(across, -r)))} Q ${fmt(add(eye, scale(axis, r * 1.5)))} ${fmt(add(eye, scale(across, r)))}`, role: 'eye', surface: 'recess', motif });
  }
  if (detail === 'high' && length > 25) {
    for (let i = 1; i < contour.length - 1; i += 2) {
      const p = contour[i], toward = unit({ x: tip.x - p.x, y: tip.y - p.y });
      strokes.push({ d: `M ${fmt(p)} l ${(toward.x * Math.min(2.2, length * .035)).toFixed(2)} ${(toward.y * Math.min(2.2, length * .035)).toFixed(2)}`, role: 'vein', surface: 'underside', motif });
    }
  }
  if (shading) strokes.push(...shadeLeaf(root, axis, across, length, adjustedWidth, shading, motif));
  return { strokes, tip };
}

