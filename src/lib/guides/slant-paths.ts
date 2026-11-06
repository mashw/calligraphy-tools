/** Shared millimetre-space Copperplate geometry. Route positions stay unwrapped
 * so callers can clip a self-intersection by passage rather than page position. */
export type SlantStyle = "classic" | "flowing";
export type SlantPoint = { x: number; y: number };
export type LocatedPoint = SlantPoint & { s: number };
export type SlantRoute = {
  points: SlantPoint[];
  distances: number[];
  length: number;
  closed?: boolean;
};
export function resolveSlantStyle(
  value: unknown,
  fallback: SlantStyle = "classic",
): SlantStyle {
  return value === "classic" || value === "flowing" ? value : fallback;
}
export function makeSlantRoute(points: SlantPoint[]): SlantRoute {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  return {
    points,
    distances,
    length: distances.at(-1) ?? 0,
    closed:
      points.length > 2 &&
      Math.hypot(
        points[0].x - points.at(-1)!.x,
        points[0].y - points.at(-1)!.y,
      ) < 0.001,
  };
}
function sampleAt(route: SlantRoute, s: number): SlantPoint {
  if (!route.points.length) return { x: 0, y: 0 };
  if (route.length <= 1e-9) return route.points[0];
  const closed = route.closed ?? true;
  const target = closed
    ? ((s % route.length) + route.length) % route.length
    : s;
  let lo = 0,
    hi = route.distances.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route.distances[mid] <= target) lo = mid;
    else hi = mid;
  }
  const t =
    (target - route.distances[lo]) /
    (route.distances[hi] - route.distances[lo] || 1);
  return {
    x: route.points[lo].x + t * (route.points[hi].x - route.points[lo].x),
    y: route.points[lo].y + t * (route.points[hi].y - route.points[lo].y),
  };
}
export function routeFrame(route: SlantRoute, s: number) {
  const p = sampleAt(route, s);
  const a = sampleAt(route, s - 0.2),
    b = sampleAt(route, s + 0.2);
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {
    p,
    t: { x: (b.x - a.x) / l, y: (b.y - a.y) / l },
    n: { x: -(b.y - a.y) / l, y: (b.x - a.x) / l },
  };
}
/** Integrate a constant local slant through the offset strip. Curvature corrects
 * longitudinal speed; connecting only the two rail endpoints cuts across bends. */
export function curvedSlant(
  route: SlantRoute,
  anchor: number,
  top: number,
  bottom: number,
  angle: number,
): LocatedPoint[] {
  const cot = 1 / Math.tan((Math.max(1, Math.min(179, angle)) * Math.PI) / 180);
  function walk(target: number): LocatedPoint[] {
    const count = Math.max(1, Math.ceil(Math.abs(target) / 0.15));
    const du = target / count;
    let s = anchor;
    const out: LocatedPoint[] = [];
    for (let i = 0; i <= count; i++) {
      const u = i * du,
        f = routeFrame(route, s);
      out.push({ x: f.p.x + f.n.x * u, y: f.p.y + f.n.y * u, s });
      const before = routeFrame(route, s - 0.3).t,
        after = routeFrame(route, s + 0.3).t;
      const curvature =
        Math.atan2(
          before.x * after.y - before.y * after.x,
          before.x * after.x + before.y * after.y,
        ) / 0.6;
      const jacobian = 1 - curvature * (u + du / 2);
      // Offset cusps have no regular local coordinate system; do not bridge them.
      if (jacobian <= 0.1) break;
      s -= (du * cot) / jacobian;
    }
    return out;
  }
  return [...walk(top).reverse(), ...walk(bottom).slice(1)];
}

/** Classic connects offset endpoints, with angle and passage metadata preserved. */
export function classicSlant(
  route: SlantRoute,
  anchor: number,
  top: number,
  bottom: number,
  angle: number,
): LocatedPoint[] {
  const cot = 1 / Math.tan((Math.max(1, Math.min(179, angle)) * Math.PI) / 180);
  return [top, bottom].map((u) => {
    const s = anchor - u * cot,
      f = routeFrame(route, s);
    return { x: f.p.x + f.n.x * u, y: f.p.y + f.n.y * u, s };
  });
}
export function slantPath(
  route: SlantRoute,
  anchor: number,
  top: number,
  bottom: number,
  angle: number,
  style: SlantStyle,
): LocatedPoint[] {
  if (route.points.length < 2 || route.length <= 1e-9) return [];
  return style === "flowing"
    ? curvedSlant(route, anchor, top, bottom, angle)
    : classicSlant(route, anchor, top, bottom, angle);
}
/** Clip open-path extrapolation in intrinsic coordinates, retaining partial slants
 * at the ends instead of clamping their endpoints onto one upright. */
export function trimOpenSlant(
  points: LocatedPoint[],
  length: number,
): SlantPoint[][] {
  const result: SlantPoint[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      delta = b.s - a.s;
    let lo = 0,
      hi = 1;
    if (Math.abs(delta) < 1e-12) {
      if (a.s < 0 || a.s > length) continue;
    } else {
      const t0 = (0 - a.s) / delta,
        t1 = (length - a.s) / delta;
      lo = Math.max(0, Math.min(t0, t1));
      hi = Math.min(1, Math.max(t0, t1));
      if (lo > hi) continue;
    }
    const at = (t: number) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    const p = at(lo),
      q = at(hi),
      last = result.at(-1);
    if (last && Math.hypot(last.at(-1)!.x - p.x, last.at(-1)!.y - p.y) < 1e-8)
      last.push(q);
    else result.push([p, q]);
  }
  return result;
}
export function flowingSlants(
  baseline: SlantPoint[],
  top: number,
  bottom: number,
  step: number,
  anchor = 0,
  angle = 55,
): SlantPoint[][] {
  if (![top, bottom, step, anchor, angle].every(Number.isFinite) || step <= 0)
    return [];
  step = Math.max(0.5, step);
  const route = makeSlantRoute(baseline);
  if (route.length <= 1e-9 || !Number.isFinite(route.length)) return [];
  const out: SlantPoint[][] = [];
  if (route.closed) {
    const count = Math.max(1, Math.round(route.length / step));
    for (let i = 0; i < count; i++)
      out.push(
        curvedSlant(
          route,
          anchor + (i * route.length) / count,
          top,
          bottom,
          angle,
        ),
      );
  } else {
    const pad =
      Math.max(Math.abs(top), Math.abs(bottom)) /
        Math.tan((Math.max(1, angle) * Math.PI) / 180) +
      step * 2;
    for (
      let k = Math.floor((-pad - anchor) / step);
      k <= Math.ceil((route.length + pad - anchor) / step);
      k++
    )
      out.push(
        ...trimOpenSlant(
          curvedSlant(route, anchor + k * step, top, bottom, angle),
          route.length,
        ),
      );
  }
  return out.filter((p) => p.length > 1);
}

/** Clip chord geometry to its curved writing band, matching SVG's nonzero fill
 * rule. Woven uses this in addition to passage cuts, so a Classic chord cannot
 * escape the strap on a bend. Every retained piece remains straight. */
export function clipSlantToBand(
  points: SlantPoint[],
  polygon: SlantPoint[],
): SlantPoint[][] {
  if (polygon.length < 3) return [];
  const inside = (p: SlantPoint) => {
    let winding = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
      if (a.y <= p.y && b.y > p.y && cross > 0) winding++;
      else if (a.y > p.y && b.y <= p.y && cross < 0) winding--;
    }
    return winding !== 0;
  };
  const out: SlantPoint[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ts = [0, 1];
    for (let j = 0; j < polygon.length; j++) {
      const c = polygon[j],
        d = polygon[(j + 1) % polygon.length],
        ex = d.x - c.x,
        ey = d.y - c.y,
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-10) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den,
        u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    const at = (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy });
    for (let j = 1; j < ts.length; j++)
      if (ts[j] - ts[j - 1] > 1e-9 && inside(at((ts[j] + ts[j - 1]) / 2))) {
        const p = at(ts[j - 1]),
          q = at(ts[j]),
          last = out.at(-1);
        if (
          last &&
          Math.hypot(last.at(-1)!.x - p.x, last.at(-1)!.y - p.y) < 1e-8
        )
          last.push(q);
        else out.push([p, q]);
      }
  }
  return out;
}
