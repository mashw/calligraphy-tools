export type Pt = { x: number; y: number };

export type Crossing = {
  id: string;
  aId: string;
  bId: string;
  x: number;
  y: number;
  aSeg: number;
  aT: number;
  bSeg: number;
  bT: number;
  overId: string;
};

type RawCrossing = Omit<Crossing, 'id' | 'overId'>;

const PARALLEL_EPS = 1e-8;

export function segmentIntersection(a0: Pt, a1: Pt, b0: Pt, b1: Pt): { x: number; y: number; t: number; u: number } | null {
  const r = { x: a1.x - a0.x, y: a1.y - a0.y };
  const s = { x: b1.x - b0.x, y: b1.y - b0.y };
  const denom = r.x * s.y - r.y * s.x;

  if (Math.abs(denom) < PARALLEL_EPS) return null;

  const qp = { x: b0.x - a0.x, y: b0.y - a0.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: a0.x + t * r.x,
    y: a0.y + t * r.y,
    t,
    u,
  };
}

function crossingId(aId: string, bId: string, x: number, y: number) {
  const [id1, id2] = aId < bId ? [aId, bId] : [bId, aId];
  return `${id1}|${id2}|${Math.round(x * 10)}|${Math.round(y * 10)}`;
}

export function findCrossingsForStraps(straps: { id: string; pts: Pt[] }[], epsMM: number): Crossing[] {
  const raw: RawCrossing[] = [];

  for (let i = 0; i < straps.length; i += 1) {
    const a = straps[i];
    for (let j = i + 1; j < straps.length; j += 1) {
      const b = straps[j];
      if (a.pts.length < 2 || b.pts.length < 2) continue;

      for (let ai = 0; ai < a.pts.length - 1; ai += 1) {
        const a0 = a.pts[ai];
        const a1 = a.pts[ai + 1];
        for (let bi = 0; bi < b.pts.length - 1; bi += 1) {
          const b0 = b.pts[bi];
          const b1 = b.pts[bi + 1];
          const hit = segmentIntersection(a0, a1, b0, b1);
          if (!hit) continue;

          raw.push({
            aId: a.id,
            bId: b.id,
            x: hit.x,
            y: hit.y,
            aSeg: ai,
            aT: hit.t,
            bSeg: bi,
            bT: hit.u,
          });
        }
      }
    }
  }

  const keep: RawCrossing[] = [];
  const epsSq = epsMM * epsMM;

  raw.forEach((crossing) => {
    const inCluster = keep.some((k) => {
      const dx = k.x - crossing.x;
      const dy = k.y - crossing.y;
      return dx * dx + dy * dy <= epsSq;
    });

    if (!inCluster) keep.push(crossing);
  });

  return keep
    .map((c) => ({
      ...c,
      id: crossingId(c.aId, c.bId, c.x, c.y),
      overId: c.aId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const centroid = (pts: Pt[]) => {
  if (!pts.length) return { x: 0, y: 0 };
  const sum = pts.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
};

export const slotOrderForPair = (crossingsForPair: Crossing[], aPts: Pt[], bPts: Pt[]) => {
  const ca = centroid(aPts);
  const cb = centroid(bPts);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy);
  const u = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const v = { x: -u.y, y: u.x };
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };

  return crossingsForPair
    .map((crossing) => {
      const rx = crossing.x - mid.x;
      const ry = crossing.y - mid.y;
      return {
        crossing,
        t: rx * u.x + ry * u.y,
        s: rx * v.x + ry * v.y,
      };
    })
    .sort((left, right) => (
      right.t - left.t
      || left.s - right.s
      || left.crossing.id.localeCompare(right.crossing.id)
    ))
    .map((entry) => entry.crossing.id);
};
