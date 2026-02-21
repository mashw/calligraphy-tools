export type Pt = { x: number; y: number };
export type Poly = Pt[];

/**
 * Phase 1 stubs only.
 * Real geometry will be implemented manually later.
 */

export function polylineStrokeOutline(
  _poly: Pt[],
  _strokeWidthMM: number
): Poly[] {
  void _poly;
  void _strokeWidthMM;
  return [];
}

export function unionPolys(_polys: Poly[]): Poly[] {
  void _polys;
  return [];
}

export function evenOddClipPathD(
  _pageW: number,
  _pageH: number,
  _holes: Poly[]
): string {
  void _pageW;
  void _pageH;
  void _holes;
  return '';
}
