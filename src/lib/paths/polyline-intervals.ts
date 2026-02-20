import { distPointToPolyline, type Pt } from '@/lib/paths/polyline-distance';

export type ArcInterval = { s0: number; s1: number };

export function polylineArcLengths(pts: Pt[]): number[] {
  if (!pts.length) return [];
  const out = new Array<number>(pts.length);
  out[0] = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    out[i] = out[i - 1] + Math.hypot(dx, dy);
  }
  return out;
}

export function overlapIntervals(
  underPts: Pt[],
  underR: number,
  otherPts: Pt[],
  otherR: number,
  fudgeMM: number,
): ArcInterval[] {
  if (underPts.length < 2 || otherPts.length < 2) return [];

  const arc = polylineArcLengths(underPts);
  void underR; // interval detection is based on OVER-band coverage only
  const threshold = otherR + fudgeMM;

  const intervals: ArcInterval[] = [];

  // Helper: point at segment param
  const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // Helper: predicate at segment param
  const inside = (a: Pt, b: Pt, t: number) => distPointToPolyline(lerpPt(a, b, t), otherPts) <= threshold;

  // Helper: binary search boundary between t0 (outside) and t1 (inside) or vice versa
  const refineBoundary = (a: Pt, b: Pt, t0: number, t1: number, iters = 10) => {
    let lo = t0;
    let hi = t1;
    const loIn = inside(a, b, lo);
    // we want the transition point; keep invariant lo and hi are on opposite sides
    for (let i = 0; i < iters; i += 1) {
      const mid = (lo + hi) / 2;
      const midIn = inside(a, b, mid);
      if (midIn === loIn) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  for (let seg = 0; seg < underPts.length - 1; seg += 1) {
    const a = underPts[seg];
    const b = underPts[seg + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);

    // 5-sample scan to detect entry/exit inside this segment
    const ts = [0, 0.25, 0.5, 0.75, 1];
    const ins = ts.map((t) => inside(a, b, t));

    // If no samples are inside, skip
    if (!ins.some(Boolean)) continue;

    // Find first inside index and last inside index
    let first = ins.findIndex(Boolean);
    let last = ins.length - 1 - [...ins].reverse().findIndex(Boolean);

    // Refine entry boundary
    let tEnter = ts[first];
    if (first > 0) {
      // transition between ts[first-1] (outside) and ts[first] (inside)
      tEnter = refineBoundary(a, b, ts[first - 1], ts[first]);
    } else {
      tEnter = 0;
    }

    // Refine exit boundary
    let tExit = ts[last];
    if (last < ts.length - 1) {
      // transition between ts[last] (inside) and ts[last+1] (outside)
      tExit = refineBoundary(a, b, ts[last], ts[last + 1]);
    } else {
      tExit = 1;
    }

    const s0 = arc[seg] + segLen * tEnter;
    const s1 = arc[seg] + segLen * tExit;
    intervals.push({ s0, s1 });
  }

  return intervals;
}
export function mergeIntervals(intervals: ArcInterval[], gapTolMM = 2): ArcInterval[] {
  if (!intervals.length) return [];

  const sorted = [...intervals]
    .map((iv) => ({ s0: Math.min(iv.s0, iv.s1), s1: Math.max(iv.s0, iv.s1) }))
    .sort((a, b) => a.s0 - b.s0);

  const out: ArcInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const curr = sorted[i];
    const prev = out[out.length - 1];
    if (curr.s0 <= prev.s1 + gapTolMM) {
      prev.s1 = Math.max(prev.s1, curr.s1);
    } else {
      out.push({ ...curr });
    }
  }

  return out;
}
