import type { Pt } from '@/lib/curve-helpers';

export type PathSample = { p: Pt; t: Pt; n: Pt };

export interface PathAdapter {
  readonly isClosed: boolean;
  totalLength(): number;
  pointAtLength(s: number): PathSample;
  wrapLength(s: number): number;
}
