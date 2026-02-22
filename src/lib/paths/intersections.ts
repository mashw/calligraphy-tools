export type Pt = { x: number; y: number };

export type Crossing = {
  id: string;
  aId: string;
  bId: string;
  x: number;
  y: number;
  aSeg: number;
  aT: number;
  aU: number;
  bSeg: number;
  bT: number;
  bU: number;
  overId: string;
};

type RawCrossing = Omit<Crossing, 'id' | 'overId' | 'aU' | 'bU'>;

const PARALLEL_EPS = 1e-8;

function cumulativeLengths(pts: Pt[]) {
  const cumLen = [0];
  const segLen: number[] = [];

  for (let i = 0; i < pts.length - 1; i += 1) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    segLen.push(len);
    cumLen.push(cumLen[i] + len);
  }

  return { cumLen, segLen, totalLen: cumLen[cumLen.length - 1] ?? 0 };
}

function segFractionToArcU(cumLen: number[], segLen: number[], totalLen: number, segIdx: number, tSeg: number) {
  if (totalLen <= 0) return 0;
  const lenAt = (cumLen[segIdx] ?? 0) + tSeg * (segLen[segIdx] ?? 0);
  return lenAt / totalLen;
}

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
  const lengthsById = new Map(
    straps.map((strap) => [strap.id, cumulativeLengths(strap.pts)]),
  );

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
    .map((c) => {
      const aLen = lengthsById.get(c.aId);
      const bLen = lengthsById.get(c.bId);
      const aU = aLen ? segFractionToArcU(aLen.cumLen, aLen.segLen, aLen.totalLen, c.aSeg, c.aT) : 0;
      const bU = bLen ? segFractionToArcU(bLen.cumLen, bLen.segLen, bLen.totalLen, c.bSeg, c.bT) : 0;

      return {
        ...c,
        aU,
        bU,
        id: crossingId(c.aId, c.bId, c.x, c.y),
        overId: c.aId,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function crossingSignature(c: { aId: string; bId: string; aU: number; bU: number }, precision = 3): string {
  const normalized = c.aId <= c.bId
    ? { id1: c.aId, id2: c.bId, u1: c.aU, u2: c.bU }
    : { id1: c.bId, id2: c.aId, u1: c.bU, u2: c.aU };

  const q1 = Number(normalized.u1.toFixed(precision));
  const q2 = Number(normalized.u2.toFixed(precision));
  return `${normalized.id1}|${normalized.id2}|${q1}|${q2}`;
}
