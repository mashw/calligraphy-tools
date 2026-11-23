export const gothicCapWeave = {
  id: 'gothic-cap-weave',
  name: 'Gothic cap weave',
} as const;

const centerX = 352;
const lobeCenterY = 608;
const halfTurnY = 508;

function capRoute(radius: number, capY: number, capHalfWidth: number, cornerHalfWidth: number) {
  const tangent = radius * Math.SQRT1_2;
  const cornerY = lobeCenterY - cornerHalfWidth - 2 * tangent;
  const capLeft = { x: centerX - capHalfWidth, y: capY };
  const points = [
    capLeft,
    { x: centerX + capHalfWidth, y: capY },
    { x: centerX + cornerHalfWidth, y: cornerY },
    { x: centerX - tangent, y: lobeCenterY - tangent },
  ];
  // The 270° lobe joins both 45° diagonals tangentially.
  for (let degrees = -137; degrees >= -405; degrees -= 2) {
    const angle = degrees * Math.PI / 180;
    points.push({ x: centerX + radius * Math.cos(angle), y: lobeCenterY + radius * Math.sin(angle) });
  }
  points.push({ x: centerX - cornerHalfWidth, y: cornerY }, capLeft);

  // Keep normals stable at cap corners by sampling adjacent straight legs at similar distances.
  return points.slice(1).flatMap((end, index) => {
    const start = points[index];
    const segments = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 6);
    return Array.from({ length: segments }, (_, step) => ({
      x: start.x + (end.x - start.x) * step / segments,
      y: start.y + (end.y - start.y) * step / segments,
    }));
  }).concat(capLeft);
}

export const gothicCapStrands = [
  { name: 'Upper wide strap', points: capRoute(165, 123, 145, 198), nibScale: 1 },
  { name: 'Lower wide strap', points: capRoute(165, 123, 145, 198), nibScale: 1 },
  { name: 'Upper narrow strap', points: capRoute(114, 174, 132, 203), nibScale: 2 / 3 },
  { name: 'Lower narrow strap', points: capRoute(114, 174, 132, 203), nibScale: 2 / 3 },
].map(({ name, points, nibScale }, index) => ({
  id: `gothic-${index + 1}`,
  name,
  nibScale,
  points: index % 2 ? points.map(({ x, y }) => ({ x: 2 * centerX - x, y: 2 * halfTurnY - y })) : points,
}));

// Each pair is listed in visit order along its first strap, from its cap.
export const gothicCapCrossings: Readonly<Record<string, string>> = {
  'gothic-1|gothic-1': 'a',
  'gothic-1|gothic-2': 'bbabaa',
  'gothic-1|gothic-3': 'aaba',
  'gothic-1|gothic-4': 'bbabaa',
  'gothic-2|gothic-2': 'a',
  'gothic-2|gothic-3': 'bbabaa',
  'gothic-2|gothic-4': 'aaba',
  'gothic-3|gothic-3': 'a',
  'gothic-3|gothic-4': 'bbabaa',
  'gothic-4|gothic-4': 'a',
};
