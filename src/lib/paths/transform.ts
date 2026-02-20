export type Pt = { x: number; y: number };

export function transformPolyline(
  points: Pt[],
  transform: { scalePct: number; rotDeg: number; offset: Pt },
): Pt[] {
  const scale = transform.scalePct / 100;
  const rot = (transform.rotDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  return points.map((p) => {
    const sx = p.x * scale;
    const sy = p.y * scale;

    return {
      x: sx * cos - sy * sin + transform.offset.x,
      y: sx * sin + sy * cos + transform.offset.y,
    };
  });
}
