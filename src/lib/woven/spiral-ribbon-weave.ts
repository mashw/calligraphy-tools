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
  [477, 321, 447, 274, 416, 263],
  [388, 253, 362, 261, 334, 269],
  [303, 278, 278, 297, 252, 327],
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

const middleLobe = { x: 400, y: 370, radius: 116 };
const rightScroll = { x: 522, y: 251, radius: 58 };
const leftScroll = { x: 278, y: 251, radius: 58 };

// Retain the circular sections and join them with tangent- and
// curvature-matched transitions. The joins pass through the underpasses.
const circularRuns = [
  { circle: middleLobe, from: .7, to: 1.62 },
  { circle: rightScroll, from: 3.18, to: 6.18 },
  { circle: middleLobe, from: 7.31, to: 8.06 },
  { circle: leftScroll, from: 9.66, to: 12.65 },
  { circle: middleLobe, from: 13.42, to: 14.34 },
];

type Frame = { point: Pt; tangent: Pt; curvature: Pt };
const origin = { x: 0, y: 0 };

function transition(start: Frame, end: Frame, steps: number, length: number): Pt[] {
  const control = (frame: Frame, tangent: number, curvature: number) => ({
    x: frame.point.x + frame.tangent.x * tangent * length + frame.curvature.x * curvature * length * length,
    y: frame.point.y + frame.tangent.y * tangent * length + frame.curvature.y * curvature * length * length,
  });
  const points = [
    start.point, control(start, .2, 0), control(start, .4, .05),
    control(end, -.4, .05), control(end, -.2, 0), end.point,
  ];
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps, u = 1 - t;
    const weights = [u ** 5, 5 * u ** 4 * t, 10 * u ** 3 * t ** 2, 10 * u ** 2 * t ** 3, 5 * u * t ** 4, t ** 5];
    return points.reduce((point, control, i) => ({
      x: point.x + weights[i] * control.x, y: point.y + weights[i] * control.y,
    }), origin);
  });
}

function broadRoute() {
  const samplesPerSegment = 32;
  const trace = [centre];
  for (const [x1, y1, x2, y2, x, y] of upperRoute) {
    trace.push(...sample(trace.at(-1)!, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, samplesPerSegment).slice(1));
  }
  const reference = trace.map(point => straighten(tuckScrollEye(point)));
  const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const unit = (x: number, y: number) => ({ x: x / Math.hypot(x, y), y: y / Math.hypot(x, y) });
  const upper = [centre];
  let last: Frame = { point: centre, tangent: unit(1, -.31), curvature: origin };
  let lastIndex = 0;
  const join = (frame: Frame, index: number) => {
    let length = 0;
    for (let i = lastIndex + 1; i <= index; i++) length += Math.hypot(reference[i].x - reference[i - 1].x, reference[i].y - reference[i - 1].y);
    upper.push(...transition(last, frame, index - lastIndex, length));
  };
  for (const { circle, from, to } of circularRuns) {
    const first = Math.ceil(from * samplesPerSegment), final = Math.floor(to * samplesPerSegment);
    const angles = reference.slice(first, final + 1).map(p => Math.atan2(p.y - circle.y, p.x - circle.x));
    const angle = angles[0];
    const sweep = angles.slice(1).reduce((sum, next, i) => sum + angleDelta(angles[i], next), 0);
    const direction = Math.sign(sweep);
    const at = (theta: number): Frame => ({
      point: { x: circle.x + circle.radius * Math.cos(theta), y: circle.y + circle.radius * Math.sin(theta) },
      tangent: { x: -direction * Math.sin(theta), y: direction * Math.cos(theta) },
      curvature: { x: -Math.cos(theta) / circle.radius, y: -Math.sin(theta) / circle.radius },
    });
    join(at(angle), first);
    for (let i = first + 1; i <= final; i++) upper.push(at(angle + sweep * (i - first) / (final - first)).point);
    last = at(angle + sweep);
    lastIndex = final;
  }
  join({ point: centre, tangent: unit(1, .4), curvature: origin }, trace.length - 1);
  const lower = upper.slice(0, -1).reverse().map(({ x, y }) => ({ x: 2 * centre.x - x, y: 2 * centre.y - y }));
  return [...upper, ...lower];
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
