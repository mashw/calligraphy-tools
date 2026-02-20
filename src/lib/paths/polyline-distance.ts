export type Pt = { x: number; y: number };

export function distPointToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq <= 1e-9) return Math.hypot(apx, apy);

  const tRaw = (apx * abx + apy * aby) / abLenSq;
  const t = Math.max(0, Math.min(1, tRaw));
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  return Math.hypot(p.x - qx, p.y - qy);
}

export function distPointToPolyline(p: Pt, pts: Pt[]): number {
  if (!pts.length) return Number.POSITIVE_INFINITY;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);

  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distPointToSegment(p, pts[i], pts[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
