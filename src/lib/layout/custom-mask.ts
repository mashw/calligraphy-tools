import type { ShapePoint as Point } from './shape';
import type { Frame, GuidelinesElement } from './types';

export type CustomMask = {
  filename: string;
  path: string;
  // Maps the original (curved) path into the normalized silhouette.
  matrix: [number, number, number, number, number, number];
  aspectRatio: number;
  boundary: Point[];
  // Maximum flattening error as a fraction of the silhouette's longest side.
  tolerance: number;
};

export const CUSTOM_MASK_PADDING_MM = 2;
export const CUSTOM_MASK_POINT_LIMIT = 8192;
type Interval = [number, number];
const EPS = 1e-8;
const delta = (a: Point,b: Point):Point => ({x:b.x-a.x,y:b.y-a.y});
const dot = (a: Point,b: Point) => a.x*b.x+a.y*b.y;
const cross = (a: Point,b: Point) => a.x*b.y-a.y*b.x;
const at = (a: Point,d: Point,t: number):Point => ({x:a.x+d.x*t,y:a.y+d.y*t});

/** Validate one explicitly closed subpath, including SVG's compact arc flags. */
export function validateMaskPath(path: string) {
  if (path.length > 200_000) throw new Error('The SVG path is too complex.');
  const counts: Record<string, number> = {M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  const number = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/iy;
  let index = 0, command = '', groups = 0;
  const skip = () => { while (/[\s,]/.test(path[index] ?? '')) index++; };
  const invalid = () => new Error('Use one valid, explicitly closed SVG path. Compound paths and holes are unsupported.');
  skip();
  if (!/[Mm]/.test(path[index] ?? '')) throw invalid();
  while (index < path.length) {
    const token = path[index].toUpperCase();
    if (token === 'Z') {
      index++;
      skip();
      if (groups < 2 || index !== path.length) throw invalid();
      return;
    }
    if (Object.hasOwn(counts, token)) {
      if (token === 'M' && groups) throw invalid();
      command = token;
      index++;
      skip();
    }
    const count = counts[command];
    for (let part = 0; part < count; part++) {
      if (command === 'A' && (part === 3 || part === 4)) {
        if (path[index] !== '0' && path[index] !== '1') throw invalid();
        index++;
      } else {
        number.lastIndex = index;
        const value = number.exec(path)?.[0];
        if (!value || !Number.isFinite(Number(value))) throw invalid();
        index = number.lastIndex;
      }
      skip();
    }
    if (command === 'M') command = 'L';
    groups++;
  }
  throw invalid();
}

export function validateCustomMask(value: unknown): asserts value is CustomMask {
  const mask = value as Partial<CustomMask> | undefined;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!mask || typeof mask.filename !== 'string' || typeof mask.path !== 'string'
    || !Array.isArray(mask.matrix) || mask.matrix.length !== 6 || !mask.matrix.every(finite)
    || !finite(mask.aspectRatio) || mask.aspectRatio <= 0
    || !finite(mask.tolerance) || mask.tolerance < 0 || mask.tolerance > .002
    || !Array.isArray(mask.boundary) || mask.boundary.length < 3 || mask.boundary.length > CUSTOM_MASK_POINT_LIMIT
    || !mask.boundary.every(p => p && finite(p.x) && finite(p.y) && p.x >= -.001 && p.x <= 1.001 && p.y >= -.001 && p.y <= 1.001)) {
    throw new Error('Saved guidelines contain invalid custom SVG mask geometry.');
  }
  validateMaskPath(mask.path);
  const [a,b,c,d] = mask.matrix;
  if (!Number.isFinite(a*d-b*c) || a*d-b*c === 0) throw new Error('The SVG mask has an invalid transform.');
}

export function activeCustomMask(element: GuidelinesElement) {
  return element.mask?.enabled && element.mask.kind === 'customSvg' ? element.mask.customSvg : undefined;
}

export function usesCustomMask(element: GuidelinesElement) {
  return element.mask?.enabled && element.mask.kind === 'customSvg';
}

export function customMaskSize(mask: CustomMask, bounds: Pick<Frame,'width'|'height'>) {
  const width=Math.min(bounds.width,bounds.height*mask.aspectRatio);
  return {width,height:width/mask.aspectRatio};
}

export function customMaskFrame(mask: CustomMask, frame: Pick<Frame,'width'|'height'>): Frame {
  const {width,height}=customMaskSize(mask,frame);
  return {x:(frame.width-width)/2,y:(frame.height-height)/2,width,height};
}

export function customMaskTransform(mask: CustomMask, frame: Frame) {
  const [a,b,c,d,e,f] = mask.matrix;
  return `matrix(${a*frame.width} ${b*frame.height} ${c*frame.width} ${d*frame.height} ${e*frame.width+frame.x} ${f*frame.height+frame.y})`;
}

const geometryCache = new WeakMap<CustomMask, {width:number;height:number;edges:Edge[];points:Point[];error:number}>();
type Edge = { a: Point; b: Point; direction: Point; length: number; minX:number; maxX:number; minY:number; maxY:number };

export function customMaskGeometry(mask: CustomMask, box: Pick<Frame,'width'|'height'>) {
  const cached = geometryCache.get(mask);
  if (cached?.width === box.width && cached.height === box.height) return cached;
  const frame = customMaskFrame(mask,box);
  const points = mask.boundary.map(p => ({x:frame.x+p.x*frame.width,y:frame.y+p.y*frame.height}));
  const edges=polygonEdges(points);
  const geometry = {width:box.width,height:box.height,edges,points,error:mask.tolerance*Math.max(frame.width,frame.height)};
  geometryCache.set(mask,geometry);
  return geometry;
}

function polygonEdges(points:Point[]) {
  return points.flatMap((a,i):Edge[] => {
    const b = points[(i+1)%points.length], direction = delta(a,b), length = Math.hypot(direction.x,direction.y);
    return length > EPS ? [{a,b,direction,length,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)}] : [];
  });
}

function inside(point: Point, edges: Edge[]) {
  let filled = false;
  for (const {a,b} of edges) {
    if ((a.y>point.y)!==(b.y>point.y) && point.x < a.x+(point.y-a.y)*(b.x-a.x)/(b.y-a.y)) filled = !filled;
  }
  return filled;
}

export function customMaskContains(mask: CustomMask, box: Pick<Frame,'width'|'height'>, point: Point) {
  return inside(point,customMaskGeometry(mask,box).edges);
}

function subtractIntervals(spans: Interval[], excluded: Interval[]) {
  const blocks = excluded.sort((a,b)=>a[0]-b[0]);
  return spans.flatMap(([start,end])=>{
    let cursor = start;
    const result: Interval[] = [];
    for (const [left,right] of blocks) {
      if (right <= cursor || left >= end) continue;
      if (left > cursor+EPS) result.push([cursor,left]);
      cursor = Math.max(cursor,right);
      if (cursor >= end) break;
    }
    if (cursor < end-EPS) result.push([cursor,end]);
    return result;
  });
}

function range(value: number, speed: number, min: number, max: number): Interval {
  if (Math.abs(speed) < EPS) return value >= min && value <= max ? [-Infinity,Infinity] : [Infinity,-Infinity];
  const a = (min-value)/speed, b = (max-value)/speed;
  return [Math.min(a,b),Math.max(a,b)];
}

/** The stroke around a boundary edge is a rectangle with circular end caps. */
function capsuleIntervals(a: Point, direction: Point, edge: Edge, radius: number): Interval[] {
  const offset = delta(edge.a,a);
  const unit = {x:edge.direction.x/edge.length,y:edge.direction.y/edge.length};
  const along = range(dot(unit,offset),dot(unit,direction),0,edge.length);
  const across = range(cross(unit,offset),cross(unit,direction),-radius,radius);
  const intervals:Interval[] = [[Math.max(along[0],across[0]),Math.min(along[1],across[1])]];
  const length = Math.hypot(direction.x,direction.y);
  for (const end of [edge.a,edge.b]) {
    const vector = delta(a,end), perpendicular = cross(direction,vector)/length;
    if (Math.abs(perpendicular) >= radius) continue;
    const center = dot(direction,vector)/(length*length);
    const half = Math.sqrt(radius*radius-perpendicular*perpendicular)/length;
    intervals.push([center-half,center+half]);
  }
  return intervals.filter(([left,right])=>left<right);
}

function segmentIntervals(a: Point,b: Point,edges: Edge[],radius: number) {
  const direction = delta(a,b), length = Math.hypot(direction.x,direction.y);
  if (length < EPS) return [];
  const candidates = edges.filter(edge=>edge.maxX>=Math.min(a.x,b.x)-radius && edge.minX<=Math.max(a.x,b.x)+radius
    && edge.maxY>=Math.min(a.y,b.y)-radius && edge.minY<=Math.max(a.y,b.y)+radius);
  const cuts = [0,1];
  const blocked:Interval[] = [];
  for (const edge of candidates) {
    const determinant = cross(direction,edge.direction), offset = delta(a,edge.a);
    if (Math.abs(determinant) > EPS) {
      const t = cross(offset,edge.direction)/determinant, u = cross(offset,direction)/determinant;
      if (t>0 && t<1 && u>=-EPS && u<=1+EPS) cuts.push(t);
    }
    if (radius > 0) blocked.push(...capsuleIntervals(a,direction,edge,radius));
  }
  cuts.sort((x,y)=>x-y);
  const filled:Interval[] = [];
  for (let i=1;i<cuts.length;i++) {
    const left=cuts[i-1], right=cuts[i];
    if (right-left>EPS && inside(at(a,direction,(left+right)/2),edges)) filled.push([left,right]);
  }
  return subtractIntervals(filled,blocked);
}

export function clipCustomMaskPolyline(mask: CustomMask,box: Pick<Frame,'width'|'height'>,padding: number,points: Point[]) {
  const {edges,error} = customMaskGeometry(mask,box);
  const parts: Point[][] = [];
  let current: Point[] | undefined;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], direction=delta(a,b);
    if (Math.hypot(direction.x,direction.y)<EPS) continue;
    const intervals=segmentIntervals(a,b,edges,padding+error+.002);
    for (const [left,right] of intervals) {
      const first=at(a,direction,left);
      const last=at(a,direction,right);
      if (!current || left>EPS) {
        current=[first];
        parts.push(current);
      }
      current.push(last);
      if (right<1-EPS) current=undefined;
    }
    if (!intervals.length) current=undefined;
  }
  return parts;
}

/**
 * In sheared coordinates, the full writing band is vertical. A baseline x is
 * available only if its entire vertical passes through the padded interior.
 */
export function customMaskWritingSpans(mask: CustomMask,box: Pick<Frame,'width'|'height'>,padding: number,
  row: {x1:number;x2:number;top:number;bottom:number;baseline:number;slope:number}, extraEdges: [Point,Point][] = [], pageContains?: (p:Point)=>boolean) {
  return polygonWritingSpans(customMaskGeometry(mask,box),padding,row,extraEdges,pageContains);
}
export function polygonWritingSpans(boundary:{points:Point[];error:number},padding:number,
  row:{x1:number;x2:number;top:number;bottom:number;baseline:number;slope:number},extraEdges:[Point,Point][],pageContains?: (p:Point)=>boolean) {
  const edges=polygonEdges(boundary.points),radius=padding+boundary.error,{x1,x2,baseline,slope}=row;
  const inset=Math.min(.000001,(row.bottom-row.top)/2);
  const top=row.top+inset,bottom=row.bottom-inset;
  if (x2<=x1 || top>bottom) return [];
  const offset=(y:number)=>(baseline-y)*slope, xAtBaseline=(p:Point)=>p.x-offset(p.y);
  const a={x:x1+offset(top),y:top}, b={x:x2+offset(top),y:top};
  const filled:Interval[]=segmentIntervals(a,b,edges,radius).map(([left,right])=>[x1+(x2-x1)*left,x1+(x2-x1)*right]);
  const exclude:Interval[]=[];
  const restrict=(p:Point,q:Point,clearance:number)=>{
    const line=delta(p,q), bounds=range(p.y,line.y,top-clearance,bottom+clearance);
    const start=Math.max(0,bounds[0]), end=Math.min(1,bounds[1]);
    if (start>end) return;
    const left=xAtBaseline(at(p,line,start)),right=xAtBaseline(at(p,line,end));
    const pad=clearance*Math.hypot(1,slope);
    exclude.push([Math.min(left,right)-pad,Math.max(left,right)+pad]);
  };
  for (const edge of edges) restrict(edge.a,edge.b,radius);
  for (const [p,q] of extraEdges) restrict(p,q,0);
  return subtractIntervals(filled,exclude).filter(([left,right])=>{
    if (!pageContains) return true;
    const mid=(left+right)/2;
    return pageContains({x:mid+offset(top),y:top}) && pageContains({x:mid+offset(bottom),y:bottom});
  });
}
