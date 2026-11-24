import { offset, sample, type Pt } from '../curve-helpers';

export const spiralRibbonWeave = {
  id: 'spiral-ribbon-weave',
  name: 'Four-scroll ribbon weave',
} as const;

type Cubic = readonly [number, number, number, number, number, number];
const centre = { x: 400, y: 496 };

// Author the upper halves against the photo, including the short inner curl,
// the bridge across the top, and the outer sweep back into the central weave.
const descendingHalf = [
  [258, 287, 248, 314, 238, 340],
  [218, 393, 249, 453, 297, 478],
  [328, 494, 373, 483, 400, 496],
] satisfies Cubic[];

const returningHalf = [
  [485.3, 240.3, 478.4, 254.8, 466.1, 263.4],
  [455.9, 270.5, 443.1, 272.8, 431.1, 269.6],
  [391.1, 258.9333, 365, 254, 333, 249],
  [313, 245.875, 308, 236, 286, 226],
  [238, 192, 177, 217, 159, 263],
  [139, 314, 173, 357, 221, 357],
  [253, 357, 280, 339, 293, 308],
  [308, 272, 307, 239, 350, 215],
  [380, 200, 414, 160, 458, 160],
  [506, 159, 548, 192, 551, 237],
  [554, 282, 502, 290, 492, 328],
  [482, 366, 500, 373, 482, 415],
  [468, 455, 436, 484, 400, 496],
] satisfies Cubic[];

function completeRoute(start: Pt, curves: Cubic[]) {
  const route = [start];
  for (const [x1, y1, x2, y2, x, y] of curves) {
    route.push(...sample(route.at(-1)!, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, 28).slice(1));
  }
  const reflected = route.slice(0, -1).reverse().map(({ x, y }) => ({ x: 2 * centre.x - x, y: 2 * centre.y - y }));
  // Correct the rotation and shear of the photographed page.
  return [...route, ...reflected].map(({ x, y }) => ({
    x: x - .185 * (y - centre.y),
    y: y + .175 * (x - centre.x),
  }));
}

export const spiralRibbonStrands = [
  { id: 'scroll-1', name: 'Descending scroll ribbon', points: completeRoute({ x: 244, y: 269 }, descendingHalf) },
  { id: 'scroll-2', name: 'Returning scroll ribbon', points: completeRoute({ x: 483.8, y: 225.3 }, returningHalf) },
];

// Visit order along the first ribbon in each pair. The rising central pass
// and the short bridges lie over the opposing runs in the reference.
export const spiralRibbonCrossings: Readonly<Record<string, string>> = {
  'scroll-1|scroll-2': 'aba',
  'scroll-2|scroll-2': 'ab',
};

export function spiralBorderRoutes(points: Pt[], outerSpacing: number, innerSpacing: number) {
  return [
    { side: 'outer', points: offset(points, -outerSpacing) },
    { side: 'inner', points: offset(points, innerSpacing) },
  ] as const;
}
