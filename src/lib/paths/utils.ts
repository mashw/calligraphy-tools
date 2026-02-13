import type { Pt } from '@/lib/curve-helpers';
import type { PathAdapter } from '@/lib/paths/types';

export function samplePathPolyline(adapter: PathAdapter, stepMM = 1): Pt[] {
  const L = adapter.totalLength();
  if (L <= 0) return [];
  const steps = Math.max(32, Math.ceil(L / Math.max(stepMM, 0.1)));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const s = (L * i) / steps;
    pts.push(adapter.pointAtLength(s).p);
  }
  return pts;
}
