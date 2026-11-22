export const gothicCapWeave = {
  id: 'gothic-cap-weave',
  name: 'Gothic cap weave',
} as const;

const centerX = 352;
const lobeCenterY = 608;
const halfTurnY = 508;

function capRoute(radius: number, capY: number, capHalfWidth: number, cornerHalfWidth: number, bendRadius: number) {
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
  points.push({ x: centerX - cornerHalfWidth, y: cornerY });

  // Give each cap bend a circular centreline so the inner writing rails
  // have room to turn. The long diagonals and lobe remain tangent.
  const rounded = points.flatMap((vertex, index) => {
    if (index > 2 && index < points.length - 1) return [vertex];
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    const incoming = Math.atan2(vertex.y - before.y, vertex.x - before.x);
    const outgoing = Math.atan2(after.y - vertex.y, after.x - vertex.x);
    const turn = Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
    const trim = bendRadius * Math.tan(Math.abs(turn) / 2);
    const startX = vertex.x - trim * Math.cos(incoming);
    const startY = vertex.y - trim * Math.sin(incoming);
    const signedRadius = Math.sign(turn) * bendRadius;
    const steps = Math.ceil(Math.abs(turn) / (Math.PI / 90));
    return Array.from({ length: steps + 1 }, (_, step) => {
      const angle = incoming + turn * step / steps;
      return {
        x: startX + signedRadius * (Math.sin(angle) - Math.sin(incoming)),
        y: startY + signedRadius * (Math.cos(incoming) - Math.cos(angle)),
      };
    });
  });
  rounded.push(rounded[0]);
  return rounded.slice(1).flatMap((end, index) => {
    const start = rounded[index];
    const segments = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 6);
    return Array.from({ length: segments }, (_, step) => ({
      x: start.x + (end.x - start.x) * step / segments,
      y: start.y + (end.y - start.y) * step / segments,
    }));
  }).concat(rounded[0]);
}

export const gothicCapStrands = [
  { name: 'Upper wide strap', points: capRoute(165, 123, 145, 198, 38), nibScale: 1 },
  { name: 'Lower wide strap', points: capRoute(165, 123, 145, 198, 38), nibScale: 1 },
  { name: 'Upper narrow strap', points: capRoute(114, 174, 132, 203, 26), nibScale: 2 / 3 },
  { name: 'Lower narrow strap', points: capRoute(114, 174, 132, 203, 26), nibScale: 2 / 3 },
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
