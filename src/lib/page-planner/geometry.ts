export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function archPaths(width: number, rise: number, bandHeight: number) {
  const half = width / 2;
  const path = (offset: number) => `M ${-half} ${offset} Q 0 ${-rise + offset} ${half} ${offset}`;
  return { top: path(-bandHeight / 2), middle: path(0), bottom: path(bandHeight / 2) };
}

export function pointerToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
}
