import type { Pt } from '@/lib/curve-helpers';
import type { PathAdapter, PathSample } from '@/lib/paths/types';

export type CircleDirection = 'clockwise' | 'counterclockwise';
export type CircleNormalMode = 'outward' | 'inward';

const TAU = Math.PI * 2;

export class CirclePathAdapter implements PathAdapter {
  readonly isClosed = true;

  constructor(
    private readonly radiusMM: number,
    private readonly center: Pt,
    private readonly startAngleDeg: number,
    private readonly direction: CircleDirection,
    private readonly normalMode: CircleNormalMode,
  ) {}

  totalLength(): number {
    return TAU * this.radiusMM;
  }

  wrapLength(s: number): number {
    const L = this.totalLength();
    if (L <= 0) return 0;
    return ((s % L) + L) % L;
  }

  pointAtLength(s: number): PathSample {
    const ss = this.wrapLength(s);
    const theta0 = (this.startAngleDeg * Math.PI) / 180;
    const dirSign = this.direction === 'counterclockwise' ? 1 : -1;
    const safeR = Math.max(this.radiusMM, 1e-6);
    const theta = theta0 + dirSign * (ss / safeR);

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const p: Pt = {
      x: this.center.x + safeR * cosT,
      y: this.center.y + safeR * sinT,
    };

    const t: Pt = {
      x: dirSign * -sinT,
      y: dirSign * cosT,
    };

    const outward: Pt = { x: cosT, y: sinT };
    const n: Pt = this.normalMode === 'outward' ? outward : { x: -outward.x, y: -outward.y };

    return { p, t, n };
  }
}
