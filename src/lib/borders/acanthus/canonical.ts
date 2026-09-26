import type { AcanthusOptions } from './types';
import { plate18BroadFan, type MotifCubic, type MotifPoint } from './templates/plate18-broad-fan';
import type { BorderGeometry, Point } from '../types';

const DISPLAY_LENGTH = 170;
const ORIGIN = { x: 260, y: 335 };

/** One uniform skeleton-local-to-display transform; authored coordinates remain untouched. */
export const canonicalPoint = (point: MotifPoint): Point => ({
  x: ORIGIN.x + point.v * DISPLAY_LENGTH,
  y: ORIGIN.y - point.u * DISPLAY_LENGTH,
});

const same = (a: MotifPoint, b: MotifPoint) => a.u === b.u && a.v === b.v;

export function canonicalCubicsPath(cubics: MotifCubic[], closed = false): string {
  let d = '';
  cubics.forEach((cubic, index) => {
    if (index === 0 || !same(cubics[index - 1].p1, cubic.p0)) {
      const start = canonicalPoint(cubic.p0);
      d += `M ${start.x} ${start.y} `;
    }
    const c1 = canonicalPoint(cubic.c1), c2 = canonicalPoint(cubic.c2), end = canonicalPoint(cubic.p1);
    d += `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y} `;
  });
  return d + (closed ? 'Z' : '');
}

export function generateCanonicalMotif(options: AcanthusOptions): BorderGeometry {
  const allowed = options.detail === 'low' ? new Set(['core']) : options.detail === 'medium' ? new Set(['core', 'structural']) : new Set(['core', 'structural', 'fine']);
  return {
    strokes: plate18BroadFan.strokes.filter(stroke => allowed.has(stroke.detail)).map((stroke, index) => ({
      d: canonicalCubicsPath(stroke.cubics, stroke.closed),
      role: stroke.role,
      surface: stroke.surface,
      motif: index,
      motifKind: 'main',
      layer: index,
    })),
    construction: [],
  };
}

export const canonicalSkeletonPath = canonicalCubicsPath(plate18BroadFan.skeleton);
export const canonicalAnchors = plate18BroadFan.anchors.map(anchor => ({ ...anchor, displayPoint: canonicalPoint(anchor.point) }));

