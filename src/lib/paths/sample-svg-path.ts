export type PathPoint = { x: number; y: number };

export function samplePathDToPolyline(d: string, stepMM: number): PathPoint[] {
  if (typeof document === 'undefined') return [];

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);

  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    return [];
  }

  if (!Number.isFinite(total) || total <= 0) return [];

  const safeStep = Math.max(0.25, stepMM);
  const count = Math.max(200, Math.ceil(total / safeStep) + 1);
  const points: PathPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const s = (i / (count - 1)) * total;
    const pt = path.getPointAtLength(s);
    points.push({ x: pt.x, y: pt.y });
  }

  return points;
}

/** Flatten a closed path with a bounded chord error in its native SVG units. */
export function sampleClosedPathBoundary(path: SVGPathElement, tolerance: number, limit: number): PathPoint[] {
  const length=path.getTotalLength();
  if (!Number.isFinite(length) || length<=0 || !(tolerance>0)) throw new Error('The SVG path has no measurable boundary.');
  const point=(distance:number)=>path.getPointAtLength(distance);
  const points:PathPoint[]=[point(0)];
  const subdivide=(start:number,end:number,a:PathPoint,b:PathPoint,depth:number)=>{
    const arc=end-start,chord=Math.hypot(b.x-a.x,b.y-a.y);
    const mid=(start+end)/2,m=point(mid);
    // Together the two foci and arc length bound the normal deviation of the curve.
    const bound=.5*Math.sqrt(Math.max(0,(arc-chord)*(arc+chord)));
    const midpointError=Math.hypot(m.x-(a.x+b.x)/2,m.y-(a.y+b.y)/2);
    if (bound<=tolerance && midpointError<=tolerance) {
      if (points.length>=limit) throw new Error('The SVG boundary is too complex. Simplify the path before importing.');
      points.push(b);
      return;
    }
    if (depth>=25) throw new Error('The SVG boundary could not be measured accurately.');
    subdivide(start,mid,a,m,depth+1);
    subdivide(mid,end,m,b,depth+1);
  };
  // Start with short intervals to limit the impact of browser arc-length rounding.
  for(let i=0;i<16;i++){
    const start=length*i/16,end=length*(i+1)/16;
    subdivide(start,end,points.at(-1)!,point(end),0);
  }
  points.pop(); // The explicit closing edge is reconstructed by the geometry engine.
  return points;
}
