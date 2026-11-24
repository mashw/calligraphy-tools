import { offset, sample, type Pt } from '../curve-helpers';
import { makeSlantRoute } from '../guides/slant-paths';
import { findSelfCrossings } from './geometry';

export const spiralRibbonWeave = {
  id: 'spiral-ribbon-weave',
  name: 'Four-scroll ribbon weave',
} as const;

export const scrollRibbonGroup = 'four-scroll-ribbon';

type Cubic = readonly [number, number, number, number, number, number];
const centre = { x: 400, y: 490 };

// Centre of the broad lettering in the colour reference, starting on the
// rising pass. Follow the right wall, the upper-right curl, the bridge left
// across the top, then the upper-left curl back to the falling pass.
const upperRoute: Cubic[] = [
  [438, 477, 471, 451, 487, 408],
  [502, 367, 503, 341, 480, 312],
  [458, 284, 434, 269, 426, 240],
  [419, 216, 437, 197, 462, 190],
  [504, 177, 547, 199, 554, 231],
  [563, 268, 543, 298, 514, 308],
  [475, 321, 447, 292, 416, 275],
  [387, 259, 361, 257, 334, 266],
  [303, 276, 278, 297, 252, 327],
  [236, 345, 212, 337, 197, 319],
  [168, 284, 182, 240, 216, 221],
  [249, 202, 292, 212, 309, 244],
  [326, 275, 312, 302, 287, 334],
  [261, 368, 259, 406, 285, 438],
  [313, 473, 360, 476, 400, 490],
];

const upperEyes = [{ x: 250, y: 277 }, { x: 488, y: 246 }];
const eyes = [...upperEyes, ...upperEyes.map(({ x, y }) => ({ x: 2 * centre.x - x, y: 2 * centre.y - y }))];

function tuckScrollEye(point: Pt): Pt {
  const eye = eyes.find(eye => Math.hypot(point.x - eye.x, point.y - eye.y) < 92);
  if (!eye) return point;
  const dx = point.x - eye.x, dy = point.y - eye.y;
  const radius = Math.hypot(dx, dy);
  const fraction = Math.min(1, (92 - radius) / 43);
  const fade = fraction * fraction * (3 - 2 * fraction);
  const scale = radius > 0 ? 1 - 16 * fade / Math.max(radius, 28) : 1;
  return { x: eye.x + dx * scale, y: eye.y + dy * scale };
}

function straighten({ x, y }: Pt): Pt {
  return { x: x - .11 * (y - centre.y), y: y + .12 * (x - centre.x) };
}

function broadRoute() {
  const upper = [centre];
  for (const [x1, y1, x2, y2, x, y] of upperRoute) {
    upper.push(...sample(upper.at(-1)!, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, 32).slice(1));
  }
  const lower = upper.slice(0, -1).reverse().map(({ x, y }) => ({ x: 2 * centre.x - x, y: 2 * centre.y - y }));
  return [...upper, ...lower].map(point => straighten(tuckScrollEye(point)));
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
    if (first < 9 || last >= rail.length - 9 || last - first > 25) continue;
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
  const halfTransition = 6;
  const switchIndex = Math.round(count * switchPhase);
  const path = Array.from({ length: 2 * count }, (_, index) => {
    const cycle = (index - switchIndex + halfTransition + 2 * count) % (2 * count);
    const fraction = Math.min(1, (cycle % count) / (2 * halfTransition));
    const easing = fraction * fraction * (3 - 2 * fraction);
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
