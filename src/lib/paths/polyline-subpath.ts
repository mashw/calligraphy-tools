export type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function walkBackward(pts: Pt[], segIndex: number, startPoint: Pt, targetLen: number): Pt[] {
  let remain = Math.max(0, targetLen);
  const out: Pt[] = [startPoint];
  let curr = startPoint;

  for (let i = segIndex; i >= 0 && remain > 0; i -= 1) {
    const a = pts[i];
    const b = i === segIndex ? curr : pts[i + 1];
    const len = dist(a, b);
    if (len <= 1e-6) continue;

    if (len >= remain) {
      const t = remain / len;
      const p = lerpPt(b, a, t);
      out.push(p);
      remain = 0;
      break;
    }

    out.push(a);
    curr = a;
    remain -= len;
  }

  return out;
}

function walkForward(pts: Pt[], segIndex: number, startPoint: Pt, targetLen: number): Pt[] {
  let remain = Math.max(0, targetLen);
  const out: Pt[] = [startPoint];
  let curr = startPoint;

  for (let i = segIndex; i < pts.length - 1 && remain > 0; i += 1) {
    const a = i === segIndex ? curr : pts[i];
    const b = pts[i + 1];
    const len = dist(a, b);
    if (len <= 1e-6) continue;

    if (len >= remain) {
      const t = remain / len;
      const p = lerpPt(a, b, t);
      out.push(p);
      remain = 0;
      break;
    }

    out.push(b);
    curr = b;
    remain -= len;
  }

  return out;
}

export function polylineSubpathD(pts: Pt[], segIndex: number, t: number, halfLenMM: number): string {
  if (pts.length < 2) return '';
  const safeSeg = Math.max(0, Math.min(pts.length - 2, segIndex));
  const safeT = Math.max(0, Math.min(1, t));

  const hit = lerpPt(pts[safeSeg], pts[safeSeg + 1], safeT);
  const backward = walkBackward(pts, safeSeg, hit, halfLenMM).reverse();
  const forward = walkForward(pts, safeSeg, hit, halfLenMM).slice(1);
  const pathPts = [...backward, ...forward];

  if (pathPts.length < 2) return '';
  return `M ${pathPts.map((p) => `${p.x},${p.y}`).join(' L ')}`;
}
