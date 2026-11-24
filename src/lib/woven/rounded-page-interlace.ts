export const roundedPageWeave = { id: 'rounded-page-interlace', name: 'Rounded page interlace' } as const;

// Coordinates from the approved 780 × 1103 page drawing.
const pitch = 205.2;
const reach = 132;
const radius = 45;
const firstCrossing = 38.5;
const angle = Math.atan2(-pitch / 2, -reach) - Math.acos(radius / Math.hypot(reach, pitch / 2)) + 2 * Math.PI;
const slope = (reach + radius * Math.cos(angle)) / (pitch / 2 + radius * Math.sin(angle));
const bleed = 16;
export const roundedPageHeight = 1103 + 2 * bleed;

function strap(side: number) {
  const points = [{ x: -side * slope * (firstCrossing + bleed), y: -bleed }];
  for (let loop = 0; loop < 5; loop++) {
    const centreY = firstCrossing + (loop + .5) * pitch;
    for (let step = 0; step <= 96; step++) {
      const theta = angle * (1 - 2 * step / 96);
      points.push({ x: side * (reach + radius * Math.cos(theta)), y: centreY + radius * Math.sin(theta) });
    }
    side = -side;
  }
  const endY = 1103 + bleed;
  points.push({ x: side * slope * (endY - firstCrossing - 5 * pitch), y: endY });
  // Text and crossing positions interpolate between adjacent samples.
  return points.flatMap((p, i) => {
    if (!i) return [p];
    const prev = points[i - 1];
    const steps = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 3);
    return Array.from({length: steps}, (_, j) => ({
      x: prev.x + (p.x - prev.x) * (j + 1) / steps,
      y: prev.y + (p.y - prev.y) * (j + 1) / steps,
    }));
  });
}

export const roundedPageStrands = [
  { id: 'lapis', name: 'Lapis strap', points: strap(1) },
  { id: 'vermilion', name: 'Vermilion strap', points: strap(-1) },
];
