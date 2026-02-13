import { lengthPoly, pointAt, sample, type Pt, type PtCubic } from '@/lib/curve-helpers';
import type { PathAdapter, PathSample } from '@/lib/paths/types';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class BezierPathAdapter implements PathAdapter {
  readonly isClosed = false;

  private readonly polyline: Pt[];
  private readonly length: number;

  constructor(private readonly cubic: PtCubic, private readonly sampleSteps = 900) {
    this.polyline = sample(cubic.p0, cubic.p1, cubic.p2, cubic.p3, sampleSteps);
    this.length = lengthPoly(this.polyline);
  }

  totalLength(): number {
    return this.length;
  }

  wrapLength(s: number): number {
    return clamp(s, 0, this.length);
  }

  pointAtLength(s: number): PathSample {
    const ss = this.wrapLength(s);
    const { p, t, n } = pointAt(this.polyline, ss);
    return { p, t, n };
  }

  getPolyline(): Pt[] {
    return this.polyline;
  }
}
