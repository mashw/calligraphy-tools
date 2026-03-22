export function crossingKey(c: {
  aId: string;
  bId: string;
  aSeg: number;
  bSeg: number;
}) {
  const id1 = c.aId < c.bId ? c.aId : c.bId;
  const id2 = c.aId < c.bId ? c.bId : c.aId;

  const s1 = c.aId === id1 ? c.aSeg : c.bSeg;
  const s2 = c.aId === id1 ? c.bSeg : c.aSeg;

  // bucket so small movement doesn't break identity
  const q1 = Math.round(s1 / 5) * 5;
  const q2 = Math.round(s2 / 5) * 5;

  return `${id1}|${id2}|${q1}|${q2}`;
}
