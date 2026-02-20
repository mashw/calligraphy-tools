export type PathPoint = { x: number; y: number };

export function samplePathDToPolyline(d: string, stepMM: number): PathPoint[] {
  if (typeof document === 'undefined') return [];

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);

  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    return [];
  }

  if (!Number.isFinite(total) || total <= 0) return [];

  const safeStep = Math.max(0.25, stepMM);
  const count = Math.max(200, Math.ceil(total / safeStep) + 1);
  const points: PathPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const s = (i / (count - 1)) * total;
    const pt = path.getPointAtLength(s);
    points.push({ x: pt.x, y: pt.y });
  }

  return points;
}
