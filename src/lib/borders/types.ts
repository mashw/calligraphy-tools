export type Point = { x: number; y: number };

export type PathFrame = {
  s: number;
  point: Point;
  tangent: Point;
  normal: Point;
  curvature: number;
};

export type GuidePath = {
  d: string;
  length: number;
  closed: boolean;
  winding: -1 | 0 | 1;
  frames: PathFrame[];
  corners: number[];
};

export type StrokeRole = 'outline' | 'midrib' | 'pipe' | 'vein' | 'fold' | 'eye' | 'shading';
export type SurfaceRole = 'face' | 'recess' | 'fold' | 'underside';

/** Vector-first output: these paths contain no presentation or DOM state. */
export type BorderStroke = {
  d: string;
  role: StrokeRole;
  surface?: SurfaceRole;
  motif: number;
  motifKind?: 'stem' | 'raffle' | 'main' | 'half' | 'secondary' | 'sweep' | 'swept' | 'turnover' | 'junction' | 'terminal';
  layer?: number;
};

export type ConstructionMark = {
  kind: 'root' | 'axis' | 'lobe' | 'tight';
  a: Point;
  b?: Point;
};

export type BorderGeometry = { strokes: BorderStroke[]; construction: ConstructionMark[] };
