import type { Point } from '../../types';
import type { CubicSegment } from './svg-path';

export type SourcePrimitive = { name:string; viewBox:readonly [number,number,number,number]; sourceD:string; segments:readonly CubicSegment[]; closed:boolean };
export type NormalPoint = Point & { u:number; v:number };
export type NormalizedPrimitive = SourcePrimitive & { start:Point; end:Point; chord:number; along:Point; normal:Point; normalizedSegments:readonly {p0:NormalPoint;c1:NormalPoint;c2:NormalPoint;p1:NormalPoint}[]; crest:NormalPoint };
export type TargetCurve = { p0:Point;c1:Point;c2:Point;p1:Point };
