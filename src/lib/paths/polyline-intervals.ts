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
  const threshold = underR + otherR + fudgeMM;
  const overlapV = underPts.map((p) => distPointToPolyline(p, otherPts) <= threshold);

  const intervals: ArcInterval[] = [];
  let runStart = -1;

  for (let seg = 0; seg < underPts.length - 1; seg += 1) {
    const overlapped = overlapV[seg] || overlapV[seg + 1];
    if (overlapped && runStart < 0) runStart = seg;

    if (!overlapped && runStart >= 0) {
      intervals.push({ s0: arc[runStart], s1: arc[seg] });
      runStart = -1;
    }
  }

  if (runStart >= 0) {
    intervals.push({ s0: arc[runStart], s1: arc[arc.length - 1] });
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
