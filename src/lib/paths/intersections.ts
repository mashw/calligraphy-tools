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

function polylineLengths(pts: Pt[]) {
  const segLens: number[] = [];
  const cumLens: number[] = [0];

  for (let i = 0; i < pts.length - 1; i += 1) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    cumLens.push(cumLens[i] + len);
  }

  return {
    segLens,
    cumLens,
    totalLen: cumLens[cumLens.length - 1] ?? 0,
  };
}

function arcLengthU(cumLens: number[], segLens: number[], segIdx: number, tSeg: number, totalLen: number) {
  if (totalLen <= 0) return 0;
  const segLen = segLens[segIdx] ?? 0;
  const lenAt = (cumLens[segIdx] ?? 0) + tSeg * segLen;
  return lenAt / totalLen;
}

export function crossingSignature(c: { aId: string; bId: string; aU: number; bU: number }, precision = 3): string {
  const normalize = (u: number) => Number(u.toFixed(precision));

  if (c.aId <= c.bId) {
    return `${c.aId}|${c.bId}|${normalize(c.aU)}|${normalize(c.bU)}`;
  }

  return `${c.bId}|${c.aId}|${normalize(c.bU)}|${normalize(c.aU)}`;
}

export function findCrossingsForStraps(straps: { id: string; pts: Pt[] }[], epsMM: number): Crossing[] {
  const raw: RawCrossing[] = [];
  const lengthsByStrapId = new Map(
    straps.map((strap) => [strap.id, polylineLengths(strap.pts)]),
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
      const aLengths = lengthsByStrapId.get(c.aId);
      const bLengths = lengthsByStrapId.get(c.bId);

      return {
        ...c,
        aU: aLengths ? arcLengthU(aLengths.cumLens, aLengths.segLens, c.aSeg, c.aT, aLengths.totalLen) : 0,
        bU: bLengths ? arcLengthU(bLengths.cumLens, bLengths.segLens, c.bSeg, c.bT, bLengths.totalLen) : 0,
        id: crossingId(c.aId, c.bId, c.x, c.y),
        overId: c.aId,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
