import { offset, sample, type Pt } from '../curve-helpers';
import { makeSlantRoute } from '../guides/slant-paths';
import { findSelfCrossings } from './geometry';

export const spiralRibbonWeave = {
  id: 'spiral-ribbon-weave',
  name: 'Four-scroll ribbon weave',
} as const;

export const scrollRibbonGroup = 'four-scroll-ribbon';

type Circle = Pt & { radius: number; direction: 1 | -1 };
const centre = { x: 400, y: 490 };
const middle: Circle = { x: 400, y: 372.5, radius: 116, direction: -1 };
const lower: Circle = { ...middle, y: 607.5, direction: 1 };
const right: Circle = { x: 520, y: 252.5, radius: 46, direction: 1 };
const left: Circle = { ...right, x: 280 };

function onCircle(circle: Circle, angle: number): Pt {
  return { x: circle.x + circle.radius * Math.cos(angle), y: circle.y + circle.radius * Math.sin(angle) };
}

// Each crossing is the pair of internal common tangents of adjacent circles.
// The contact radius is perpendicular to the straight run on both circles.
function tangentAngles(from: Circle, to: Circle) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const offset = Math.acos((from.radius + to.radius) / Math.hypot(dx, dy));
  const start = Math.atan2(dy, dx) - from.direction * offset;
  return { start, end: start + Math.PI };
}

function broadRoute(): Pt[] {
  const upper = [centre];
  const sequence = [lower, middle, right, middle, left, middle, lower];
  const tau = 2 * Math.PI;
  const sampleSpacing = 2;
  function lineTo(end: Pt) {
    const start = upper[upper.length - 1];
    const steps = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / sampleSpacing);
    for (let i = 1; i <= steps; i++) upper.push({
      x: start.x + (end.x - start.x) * i / steps, y: start.y + (end.y - start.y) * i / steps,
    });
  }
  for (let i = 1; i < sequence.length - 1; i++) {
    const circle = sequence[i];
    const entry = tangentAngles(sequence[i - 1], circle).end;
    const exit = tangentAngles(circle, sequence[i + 1]).start;
    const sweep = ((circle.direction * (exit - entry) % tau) + tau) % tau;
    lineTo(onCircle(circle, entry));
    const steps = Math.ceil(sweep * circle.radius / sampleSpacing);
    for (let j = 1; j <= steps; j++) {
      upper.push(onCircle(circle, entry + circle.direction * sweep * j / steps));
    }
  }
  lineTo(centre);
  const bottom = upper.slice(0, -1).reverse().map(p => ({ x: 2 * centre.x - p.x, y: 2 * centre.y - p.y }));
  return [...upper, ...bottom];
}

export const spiralRibbonStrands = [
  { id: 'scroll-1', name: 'Broad scroll strap', points: broadRoute() },
];

// Switch sides inside the central underpass. Each lap keeps the same
// samples as the broad path, so the two visits can be matched at crossings.
function scrollOffset(points: Pt[], spacing: number) {
  const rail = offset(points, spacing);
  const route = makeSlantRoute(rail);
  for (const crossing of findSelfCrossings(route)) {
    const first = route.distances.findIndex(distance => distance >= crossing.a);
    const last = route.distances.findIndex(distance => distance >= crossing.b);
    // An offset can fold back locally on a tight scroll. Replace just that
    // fold and preserve the sample count used to match the two straps.
    if (first < 9 || last >= rail.length - 9 || last - first > 35) continue;
    const start = first - 8, end = last + 8;
    const a = rail[start], b = rail[end];
    const handle = Math.hypot(b.x - a.x, b.y - a.y) / 3;
    const control = (from: Pt, toward: Pt) => {
      const dx = toward.x - from.x, dy = toward.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: from.x + dx * handle / length, y: from.y + dy * handle / length };
    };
    const bridge = sample(a, control(a, rail[start + 1]), control(b, rail[end - 1]), b, end - start);
    rail.splice(start, bridge.length, ...bridge);
  }
  return rail;
}

export function narrowScrollRoute(points: Pt[], spacing: number, switchPhase: number): Pt[] {
  const outside = scrollOffset(points, -spacing);
  const inside = scrollOffset(points, spacing);
  const count = points.length - 1;
  const halfTransition = 8;
  const switchIndex = Math.round(count * switchPhase);
  const path = Array.from({ length: 2 * count }, (_, index) => {
    const cycle = (index - switchIndex + halfTransition + 2 * count) % (2 * count);
    const fraction = Math.min(1, (cycle % count) / (2 * halfTransition));
    const easing = fraction ** 3 * (10 + fraction * (-15 + 6 * fraction));
    const weight = cycle < count ? easing : 1 - easing;
    const a = outside[index % count], b = inside[index % count];
    return { x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight };
  });
  return [...path, path[0]];
}

export function scrollPhase(id: string, t: number) {
  return id === 'scroll-2' ? (t * 2) % 1 : t % 1;
}

// Centre, upper right, upper left, lower right, lower left, in source order.
export const spiralRibbonCrossings: Readonly<Record<string, string>> = {
  'scroll-1|scroll-1': 'abbaa',
};
