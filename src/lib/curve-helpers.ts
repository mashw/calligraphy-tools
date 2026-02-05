/* ======================================================================
 * Curved Title Planner — shared helpers (geometry, presets, parser)
 * ====================================================================== */

export type PaperId = 'A3' | 'A4' | 'A5' | 'DL' | 'C5' | 'C6';
export type ScriptId = 'TexturaQuadrata' | 'Fraktur';
export type CurvePresetId =
  | 'simpleArch'
  | 'highArch'
  | 'shallowArch'
  | 'compoundArch'
  | 'zanerian';
export type Orientation = 'portrait' | 'landscape';

export type Pt = { x: number; y: number };
export type Seg = [number, number, number, number, number, number, number, number];
export type PtCubic = { p0: Pt; p1: Pt; p2: Pt; p3: Pt; _extraSegs?: Seg[] };

type PaperDef = {
  w: number;
  h: number;
  label: string;
  defaultOrientation: Orientation;
};

export const PAPERS_MM: Record<PaperId, PaperDef> = {
  A3: {
    w: 297,
    h: 420,
    label: 'A3 (297 × 420 mm)',
    defaultOrientation: 'portrait',
  },
  A4: {
    w: 210,
    h: 297,
    label: 'A4 (210 × 297 mm)',
    defaultOrientation: 'portrait',
  },
  A5: {
    w: 148,
    h: 210,
    label: 'A5 (148 × 210 mm)',
    defaultOrientation: 'portrait',
  },
  DL: {
    w: 110,
    h: 220,
    label: 'DL Envelope (110 × 220 mm)',
    defaultOrientation: 'landscape',
  },
  C5: {
    w: 162,
    h: 229,
    label: 'C5 Envelope (162 × 229 mm)',
    defaultOrientation: 'landscape',
  },
  C6: {
    w: 114,
    h: 162,
    label: 'C6 Envelope (114 × 162 mm)',
    defaultOrientation: 'landscape',
  },
};

export const SCRIPT_DEFAULTS: Record<
  ScriptId,
  { asc: number; desc: number; xNibDefault: number; capHeight: number }
> = {
  TexturaQuadrata: { asc: 3, desc: 2, xNibDefault: 5, capHeight: 7.5 },
  Fraktur: { asc: 3, desc: 3, xNibDefault: 5, capHeight: 8 },
};

// Like pointAt(), but allows s < 0 and s > total by extrapolating
// using the first/last segment tangent + normal.
export function pointAtExtended(
  pts: Pt[],
  s: number,
): { p: Pt; n: Pt; t: Pt; idx: number } {
  if (pts.length === 0) {
    return { p: { x: 0, y: 0 }, n: { x: 0, y: -1 }, t: { x: 1, y: 0 }, idx: 0 };
  }
  if (pts.length === 1) {
    return { p: pts[0], n: { x: 0, y: -1 }, t: { x: 1, y: 0 }, idx: 0 };
  }

  const total = lengthPoly(pts);

  // Inside range: use the existing, accurate implementation.
  if (s >= 0 && s <= total) {
    return pointAt(pts, s);
  }

  // Extrapolate before start using first segment.
  if (s < 0) {
    const a = pts[0];
    const b = pts[1];
    const t = tangent(a, b);
    const n = { x: -t.y, y: t.x };
    return {
      p: { x: a.x + t.x * s, y: a.y + t.y * s }, // s is negative here
      n,
      t,
      idx: 0,
    };
  }

  // Extrapolate past end using last segment.
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const t = tangent(a, b);
  const n = { x: -t.y, y: t.x };
  const d = s - total;
  return {
    p: { x: b.x + t.x * d, y: b.y + t.y * d },
    n,
    t,
    idx: pts.length - 2,
  };
}


/* ---------------- Geometry utils ---------------- */

function dist(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function tangent(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function normal(a: Pt, b: Pt): Pt {
  const t = tangent(a, b);
  return { x: -t.y, y: t.x };
}

/** Sample a cubic Bézier into a polyline of `steps + 1` points. */
export function sample(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  const n = Math.max(1, steps | 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y;
    out.push({ x, y });
  }
  return out;
}

/** Total length of a polyline in mm. */
export function lengthPoly(pts: Pt[]): number {
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += dist(pts[i - 1], pts[i]);
  return sum;
}

/**
 * Get point and normal at arclength `s` (mm) along a polyline.
 * `s` is clamped to [0, total length].
 */
export function pointAt(
  pts: Pt[],
  s: number,
): { p: Pt; n: Pt; t: Pt; idx: number } {
  if (pts.length === 0) {
    return { p: { x: 0, y: 0 }, n: { x: 0, y: -1 }, t: { x: 1, y: 0 }, idx: 0 };
  }
  if (pts.length === 1) {
    return {
      p: pts[0],
      n: { x: 0, y: -1 },
      t: { x: 1, y: 0 },
      idx: 0,
    };
  }  

  const total = lengthPoly(pts);
  const target = Math.max(0, Math.min(total, s));

  let accum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    if (accum + seg >= target) {
      const r = seg > 0 ? (target - accum) / seg : 0;
      const p: Pt = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
      const tvec = tangent(a, b);
      const nvec = { x: -tvec.y, y: tvec.x };
      return { p, n: nvec, t: tvec, idx: i };
    }
    accum += seg;
  }

  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const tvec = tangent(prev, last);
  const nvec = { x: -tvec.y, y: tvec.x };
  return { p: last, n: nvec, t: tvec, idx: pts.length - 1 };
}

/** Offset a polyline by distance `d` along local normals. */
export function offset(pts: Pt[], d: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y - d }];

  return pts.map((p, i) => {
    let n: Pt;
    if (i === 0) n = normal(p, pts[1]);
    else if (i === pts.length - 1) n = normal(pts[i - 1], p);
    else n = normal(pts[i - 1], pts[i + 1]);
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
}

/** Build an SVG path `d` string from a polyline. */
export function pathD(pts: Pt[]): string {
  if (!pts.length) return '';
  return 'M' + pts.map(p => `${p.x},${p.y}`).join('L');
}

/* ---------------- SVG path parser (M, L, C, S) ---------------- */

function tokenize(d: string) {
  return d
    .replace(/,/g, ' ')
    .replace(/([a-zA-Z])/g, ' $1 ')
    .replace(/-/g, ' -')
    .trim()
    .split(/\s+/);
}

function toNum(t: string) {
  return parseFloat(t);
}

/** Parse path with M/L/C/S commands to an array of cubic segments. */
export function parseSvgPath(d: string): { segs: Seg[]; ok: boolean } {
  if (!d) return { segs: [], ok: false };
  const t = tokenize(d);
  const segs: Seg[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let lastC2x = 0;
  let lastC2y = 0;
  let prevWasC = false;

  while (i < t.length) {
    if (/^[A-Za-z]$/.test(t[i])) {
      cmd = t[i];
      i++;
      continue;
    }

    if (cmd === 'M' || cmd === 'm') {
      const nx = toNum(t[i++]);
      const ny = toNum(t[i++]);
      x = cmd === 'm' ? x + nx : nx;
      y = cmd === 'm' ? y + ny : ny;

      // subsequent coords treated as implicit L
      while (i + 1 < t.length && !/^[A-Za-z]$/.test(t[i])) {
        const lx = toNum(t[i++]);
        const ly = toNum(t[i++]);
        const X = cmd === 'm' ? x + lx : lx;
        const Y = cmd === 'm' ? y + ly : ly;
        segs.push([
          x,
          y,
          (2 * x + X) / 3,
          (2 * y + Y) / 3,
          (x + 2 * X) / 3,
          (y + 2 * Y) / 3,
          X,
          Y,
        ]);
        x = X;
        y = Y;
      }
      prevWasC = false;
      continue;
    }

    if (cmd === 'L' || cmd === 'l') {
      const lx = toNum(t[i++]);
      const ly = toNum(t[i++]);
      const X = cmd === 'l' ? x + lx : lx;
      const Y = cmd === 'l' ? y + ly : ly;
      segs.push([
        x,
        y,
        (2 * x + X) / 3,
        (2 * y + Y) / 3,
        (x + 2 * X) / 3,
        (y + 2 * Y) / 3,
        X,
        Y,
      ]);
      x = X;
      y = Y;
      prevWasC = false;
      continue;
    }

    if (cmd === 'C' || cmd === 'c') {
      const x1 = toNum(t[i++]);
      const y1 = toNum(t[i++]);
      const x2 = toNum(t[i++]);
      const y2 = toNum(t[i++]);
      const x3 = toNum(t[i++]);
      const y3 = toNum(t[i++]);

      const X1 = cmd === 'c' ? x + x1 : x1;
      const Y1 = cmd === 'c' ? y + y1 : y1;
      const X2 = cmd === 'c' ? x + x2 : x2;
      const Y2 = cmd === 'c' ? y + y2 : y2;
      const X3 = cmd === 'c' ? x + x3 : x3;
      const Y3 = cmd === 'c' ? y + y3 : y3;

      segs.push([x, y, X1, Y1, X2, Y2, X3, Y3]);
      x = X3;
      y = Y3;
      lastC2x = X2;
      lastC2y = Y2;
      prevWasC = true;
      continue;
    }

    if (cmd === 'S' || cmd === 's') {
      const x2 = toNum(t[i++]);
      const y2 = toNum(t[i++]);
      const x3 = toNum(t[i++]);
      const y3 = toNum(t[i++]);

      const X2 = cmd === 's' ? x + x2 : x2;
      const Y2 = cmd === 's' ? y + y2 : y2;
      const X3 = cmd === 's' ? x + x3 : x3;
      const Y3 = cmd === 's' ? y + y3 : y3;

      const X1 = prevWasC ? 2 * x - lastC2x : x;
      const Y1 = prevWasC ? 2 * y - lastC2y : y;

      segs.push([x, y, X1, Y1, X2, Y2, X3, Y3]);
      x = X3;
      y = Y3;
      lastC2x = X2;
      lastC2y = Y2;
      prevWasC = true;
      continue;
    }

    // Unknown token – skip
    i++;
  }

  return { segs, ok: segs.length > 0 };
}

/* ---------------- Zanerian Resolution path (raw SVG coords) ---------------- */

export const ZANER_SVG_PATH_D = `
M0.204,233.96
s393.2,176.12,704.48,28.67
C1015.835,115.24,1425.214,0.59,1936.894,0.5
c511.68,0.09,921.06,114.74,1232.21,262.13,
311.28,147.45,704.48,-28.67,704.48,-28.67
`;

/* ---------------- Curve presets + transforms ---------------- */

export function buildPreset(id: CurvePresetId, box: { w: number; h: number }): PtCubic {
  const m = Math.min(box.w, box.h) * 0.08;
  const cx = box.w / 2;
  const topY = box.h * 0.28;
  const baseY = topY + box.h * 0.07;
  const flatY = topY + box.h * 0.02;
  const L = m;
  const R = box.w - m;

  const C = (x: number, y: number): Pt => ({
    x: Math.max(0, Math.min(box.w, x)),
    y: Math.max(0, Math.min(box.h, y)),
  });

  // Original Zanerian Resolution behaviour (SVG-based, multi-segment)
  if (id === 'zanerian') {
    const parsed = parseSvgPath(ZANER_SVG_PATH_D);
    if (parsed.ok) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const s of parsed.segs) {
        for (let j = 0; j < s.length; j += 2) {
          const x = s[j];
          const y = s[j + 1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const scale = (box.w * 0.84) / w; // same horizontal proportion as before

      const offX = (box.w - w * scale) / 2 - minX * scale;
      const midY = box.h * 0.35;

      const segs: Seg[] = parsed.segs.map(s => {
        const map = (x: number, y: number): Pt => ({
          x: x * scale + offX,
          y: y * scale + (midY - (h * scale) * 0.12),
        });
        const p0 = map(s[0], s[1]);
        const p1 = map(s[2], s[3]);
        const p2 = map(s[4], s[5]);
        const p3 = map(s[6], s[7]);
        return [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y];
      });

      const s0 = segs[0];
      return {
        p0: { x: s0[0], y: s0[1] },
        p1: { x: s0[2], y: s0[3] },
        p2: { x: s0[4], y: s0[5] },
        p3: { x: s0[6], y: s0[7] },
        _extraSegs: segs,
      };
    }
    // If parsing somehow fails, fall through to simpleArch as a safe default.
  }

  // Other presets (same as before)
  switch (id) {
    case 'highArch':
      return {
        p0: C(L, baseY + 28),
        p1: C(cx - box.w * 0.22, topY - 16),
        p2: C(cx + box.w * 0.22, topY - 16),
        p3: C(R, baseY + 28),
      };
    case 'shallowArch':
      return {
        p0: C(L, baseY + 12),
        p1: C(cx - box.w * 0.18, flatY),
        p2: C(cx + box.w * 0.18, flatY),
        p3: C(R, baseY + 12),
      };
    case 'compoundArch':
      return {
        p0: C(L, baseY + 24),
        p1: C(cx - box.w * 0.26, topY - 2),
        p2: C(cx + box.w * 0.26, topY - 2),
        p3: C(R, baseY + 24),
      };
    case 'simpleArch':
    default:
      return {
        p0: C(L, baseY + 18),
        p1: C(cx - box.w * 0.2, topY),
        p2: C(cx + box.w * 0.2, topY),
        p3: C(R, baseY + 18),
      };
  }
}

export function transformCubic(
  cb: PtCubic,
  cx: number,
  cy: number,
  scale: number,
  deg: number,
): PtCubic {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const s = scale;

  const transformPoint = (p: Pt): Pt => {
    const x0 = p.x - cx;
    const y0 = p.y - cy;
    const xs = x0 * s;
    const ys = y0 * s;
    const xr = xs * cos - ys * sin;
    const yr = xs * sin + ys * cos;
    return { x: xr + cx, y: yr + cy };
  };

  const out: PtCubic = {
    p0: transformPoint(cb.p0),
    p1: transformPoint(cb.p1),
    p2: transformPoint(cb.p2),
    p3: transformPoint(cb.p3),
  };

  if (cb._extraSegs && cb._extraSegs.length) {
    out._extraSegs = cb._extraSegs.map(seg => {
      const p0 = transformPoint({ x: seg[0], y: seg[1] });
      const p1 = transformPoint({ x: seg[2], y: seg[3] });
      const p2 = transformPoint({ x: seg[4], y: seg[5] });
      const p3 = transformPoint({ x: seg[6], y: seg[7] });
      return [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y] as Seg;
    });
  }

  return out;
}
