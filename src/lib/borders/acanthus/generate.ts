import { add, scale, seeded } from '../geometry';
import { frameAt } from '../guide-path';
import type { BorderGeometry, GuidePath } from '../types';
import { buildLeaf } from './leaf';
import type { AcanthusOptions } from './types';

function resolvedSides(path: GuidePath, side: AcanthusOptions['side']): (-1 | 1)[] {
  if (side === 'both') return [-1, 1];
  if (side === 'left') return [1];
  if (side === 'right') return [-1];
  if (!path.closed || path.winding === 0) return side === 'inward' ? [1] : [-1];
  // SVG positive signed area is clockwise in its downward-positive coordinate space.
  const inward: -1 | 1 = path.winding > 0 ? 1 : -1;
  return [side === 'inward' ? inward : (inward === 1 ? -1 : 1)];
}

export function generateAcanthus(path: GuidePath, options: AcanthusOptions): BorderGeometry {
  const strokes: BorderGeometry['strokes'] = [], construction: BorderGeometry['construction'] = [];
  const basePitch = Math.max(options.leafSize * .58, options.pitch);
  const count = path.closed ? Math.max(3, Math.round(path.length / basePitch)) : Math.max(1, Math.floor(path.length / basePitch));
  const actualPitch = path.closed ? path.length / count : path.length / (count + .65);
  for (let i = 0; i < count; i++) {
    // Open paths receive breathing room and tapered terminal leaves rather than cut motifs.
    const s = path.closed ? i * actualPitch : actualPitch * (.55 + i);
    const frame = frameAt(path, s), terminal = path.closed ? 1 : Math.min(1, Math.min(s, path.length - s) / (actualPitch * .65));
    for (const [sideIndex, side] of resolvedSides(path, options.side).entries()) {
      const signedBend = frame.curvature * side;
      const compression = Math.max(.48, Math.min(1.22, 1 + signedBend * options.leafSize * .55));
      const tight = Math.abs(frame.curvature) * options.leafSize > .9;
      const random = (seeded(options.seed, i * 7 + sideIndex) - .5) * options.organic;
      const rhythmic = 1 + (i % 3 === 0 ? .07 : i % 3 === 1 ? -.035 : 0);
      const leafLength = options.leafSize * (.92 + random * .14) * rhythmic * (.72 + .28 * terminal);
      const leaf = buildLeaf(frame, { length: leafLength, width: leafLength * (.22 + options.fullness * .12), lobes: options.detail === 'low' ? 4 : 6, side, sweep: random * .24 + (i % 2 ? .06 : -.04), compression: tight ? Math.max(.52, compression * .82) : compression, detail: options.detail, shading: options.lineShading ? options.shadingDensity : false, motif: i * 2 + sideIndex });
      strokes.push(...leaf.strokes);
      construction.push({ kind: 'root', a: frame.point }, { kind: 'axis', a: frame.point, b: leaf.tip });
      if (tight) construction.push({ kind: 'tight', a: add(frame.point, scale(frame.normal, side * 4)) });
    }
  }
  return { strokes, construction };
}
