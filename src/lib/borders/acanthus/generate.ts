import { add, scale, seeded } from '../geometry';
import { frameAt } from '../guide-path';
import type { BorderGeometry, BorderStroke, GuidePath, PathFrame } from '../types';
import { buildLeaf } from './leaf';
import type { AcanthusOptions, LeafParameters } from './types';

type Kind = NonNullable<LeafParameters['kind']>;
const GRAMMAR: { kind: Kind; scale: number; advance: number; sweep: number }[] = [
  { kind: 'half', scale: .62, advance: -.08, sweep: -.1 },
  { kind: 'main', scale: 1.08, advance: -.12, sweep: .08 },
  { kind: 'secondary', scale: .72, advance: .08, sweep: -.04 },
  { kind: 'swept', scale: .94, advance: -.16, sweep: .24 },
  { kind: 'secondary', scale: .68, advance: .12, sweep: .02 },
];

function resolvedSides(path: GuidePath, side: AcanthusOptions['side']): (-1 | 1)[] {
  if (side === 'both') return [-1, 1];
  if (side === 'left') return [1];
  if (side === 'right') return [-1];
  if (!path.closed || path.winding === 0) return side === 'inward' ? [1] : [-1];
  const inward: -1 | 1 = path.winding > 0 ? 1 : -1;
  return [side === 'inward' ? inward : (inward === 1 ? -1 : 1)];
}

function stemStrokes(path: GuidePath): BorderStroke[] {
  return [{ d: path.d, role: 'midrib', surface: 'face', motif: -1, motifKind: 'stem', layer: -2 }];
}

export function generateAcanthus(path: GuidePath, options: AcanthusOptions): BorderGeometry {
  const strokes = stemStrokes(path), construction: BorderGeometry['construction'] = [];
  const basePitch = Math.max(options.leafSize * .72, options.pitch), count = path.closed ? Math.max(4, Math.round(path.length/basePitch)) : Math.max(3, Math.floor(path.length/basePitch));
  const pitch = path.closed ? path.length/count : path.length/(count+.8), available = resolvedSides(path, options.side);
  for (let i=0; i<count; i++) {
    const grammar = GRAMMAR[i % GRAMMAR.length], end = !path.closed && (i===0 || i===count-1);
    const kind: Kind = end ? 'terminal' : grammar.kind;
    // Both-sided runs alternate primary growth; occasional small counter-leaves bind the rhythm.
    const primarySide = available.length === 2 ? available[i % 2] : available[0];
    const motifs: { side: -1|1; scale: number; kind: Kind; offset: number }[] = [{ side: primarySide, scale: grammar.scale, kind, offset: grammar.advance }];
    if (available.length===2 && !end && (i%3===1)) motifs.push({ side: primarySide===1?-1:1, scale: .54, kind: 'secondary', offset: .16 });
    for (const [j,motif] of motifs.entries()) {
      const s = path.closed ? i*pitch+motif.offset*pitch : pitch*(.65+i+motif.offset), frame=frameAt(path,s);
      const bend=frame.curvature*motif.side, tight=Math.abs(frame.curvature)*options.leafSize>.9;
      const variation=(seeded(options.seed,i*11+j)-.5)*options.organic;
      const length=options.leafSize*motif.scale*(1+variation*.12), compression=Math.max(.55,Math.min(1.18,1+bend*options.leafSize*.45));
      const built=buildLeaf(frame,{ length, width:length*(.39+options.fullness*.17), lobes:6, side:motif.side, sweep:grammar.sweep+variation*.16, compression:tight?compression*.84:compression, detail:options.detail, shading:options.lineShading?options.shadingDensity:false, motif:i*3+j, kind:motif.kind, asymmetry:variation*.55+(i%2?.07:-.05), turnover:motif.kind==='swept'||(motif.kind==='main'&&i%4===1) });
      const collarEnd=add(add(frame.point,scale(frame.tangent,length*.13)),scale(frame.normal,motif.side*length*.08));
      strokes.push({d:`M ${frame.point.x.toFixed(2)} ${frame.point.y.toFixed(2)} Q ${(frame.point.x+frame.tangent.x*length*.06).toFixed(2)} ${(frame.point.y+frame.tangent.y*length*.06).toFixed(2)} ${collarEnd.x.toFixed(2)} ${collarEnd.y.toFixed(2)}`,role:'pipe',surface:'fold',motif:i*3+j,motifKind:motif.kind,layer:i*3+j-1},...built.strokes);
      construction.push({kind:'root',a:frame.point},{kind:'axis',a:frame.point,b:built.tip},...built.construction);
      if(tight) construction.push({kind:'tight',a:add(frame.point,scale(frame.normal,motif.side*4))});
    }
  }
  return {strokes,construction};
}

export function generateSingleLeaf(options: AcanthusOptions): BorderGeometry {
  const frame: PathFrame={s:0,point:{x:300,y:350},tangent:{x:0,y:-1},normal:{x:1,y:0},curvature:0};
  const built=buildLeaf(frame,{length:150,width:68,lobes:6,side:1,sweep:-.82,compression:1,detail:options.detail,shading:options.lineShading?options.shadingDensity:false,motif:0,kind:'main',asymmetry:.1*options.organic,turnover:true});
  return {strokes:built.strokes,construction:[{kind:'root',a:frame.point},{kind:'axis',a:frame.point,b:built.tip},...built.construction]};
}
