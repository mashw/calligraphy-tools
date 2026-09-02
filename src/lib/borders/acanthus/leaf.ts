import { add, cubic, fmt, scale, unit } from '../geometry';
import type { BorderStroke, ConstructionMark, PathFrame, Point } from '../types';
import { shadeLeaf } from './shading';
import type { LeafParameters } from './types';

type Basis = { root: Point; axis: Point; across: Point; length: number; width: number };
type Raffle = { spring: Point; shoulder: Point; crown: Point; tip: Point; returnShoulder: Point; eye: Point; vein: Point; side: -1 | 1; index: number };
const world = (b: Basis, along: number, across: number) => add(add(b.root, scale(b.axis, b.length * along)), scale(b.across, b.width * across));

/** Major raffles are broad masses with their own spring, crown, tip and recessed eye. */
function raffle(b: Basis, index: number, side: -1 | 1, asymmetry: number): Raffle {
  const t = .08 + index * .145;
  const projection = [1, .96, .84, .68, .49, .31][index] ?? .25;
  const bias = 1 + side * asymmetry * (index % 2 ? -.32 : .46);
  const reach = projection * bias;
  return {
    spring: world(b, t, side * (.07 + index * .006)),
    shoulder: world(b, t + .025, side * reach * .62),
    crown: world(b, t + .07, side * reach * 1.03),
    tip: world(b, t + .125, side * reach * 1.12),
    returnShoulder: world(b, t + .13, side * reach * .62),
    eye: world(b, t + .16, side * (.16 + projection * .08)),
    vein: world(b, t + .075, side * reach * .78), side, index,
  };
}

function sidePath(start: Point, groups: Raffle[], detail: LeafParameters['detail']): string {
  let d = `L ${fmt(start)}`;
  for (const r of groups) {
    d += ` L ${fmt(r.spring)} C ${fmt(r.shoulder)} ${fmt(r.crown)} ${fmt(r.tip)}`;
    // Secondary edge divisions are small interruptions of the returning edge, never the lobe skeleton.
    if (detail === 'low') d += ` C ${fmt(r.returnShoulder)} ${fmt(r.eye)} ${fmt(r.eye)}`;
    else {
      const serrations = detail === 'high' && r.index < 4 ? 2 : 1;
      for (let j = 0; j < serrations; j++) {
        const a = (j + 1) / (serrations + 1), edge = { x: r.tip.x * (1-a) + r.eye.x*a, y: r.tip.y*(1-a)+r.eye.y*a };
        const notch = add(edge, scale(unit({ x: r.spring.x-r.tip.x, y: r.spring.y-r.tip.y }), Math.min(3.2, 1.2 + r.index * .25)));
        d += ` Q ${fmt(edge)} ${fmt(notch)}`;
      }
      d += ` Q ${fmt(r.returnShoulder)} ${fmt(r.eye)}`;
    }
  }
  return d;
}

export function buildLeaf(frame: PathFrame, parameters: LeafParameters): { strokes: BorderStroke[]; tip: Point; construction: ConstructionMark[] } {
  const { length, width, lobes, side, sweep, compression, detail, shading, motif, kind = 'main', asymmetry = 0, turnover = false } = parameters;
  const axis = unit(add(scale(frame.tangent, kind === 'terminal' ? .88 : .58), scale(frame.normal, side * (.82 + sweep))));
  const across = { x: -axis.y, y: axis.x }, root = add(frame.point, scale(frame.normal, side * width * .05));
  const b: Basis = { root, axis, across, length, width: width * compression };
  const count = Math.max(5, Math.min(6, lobes));
  const left = Array.from({ length: count }, (_, i) => raffle(b, i, 1, asymmetry));
  const right = Array.from({ length: count }, (_, i) => raffle(b, i, -1, asymmetry));
  const tip = world(b, .98, asymmetry * .09), neckL = world(b, .86, .13), neckR = world(b, .86, -.12);
  let outline = `M ${fmt(root)} ${sidePath(root, left, detail)} C ${fmt(world(b,.84,.28))} ${fmt(neckL)} ${fmt(tip)} C ${fmt(neckR)} ${fmt(world(b,.84,-.27))} ${fmt(right.at(-1)!.eye)}`;
  for (const r of [...right].reverse()) {
    outline += ` C ${fmt(r.returnShoulder)} ${fmt(r.crown)} ${fmt(r.tip)}`;
    if (detail === 'low') outline += ` C ${fmt(r.shoulder)} ${fmt(r.spring)} ${fmt(r.spring)}`;
    else {
      const edge = { x: r.tip.x*.58+r.spring.x*.42, y: r.tip.y*.58+r.spring.y*.42 };
      const notch = add(edge,scale(unit({x:r.eye.x-r.tip.x,y:r.eye.y-r.tip.y}),detail==='high'?2.8:1.6));
      outline += ` Q ${fmt(edge)} ${fmt(notch)} Q ${fmt(r.shoulder)} ${fmt(r.spring)}`;
    }
  }
  outline += ` Q ${fmt(world(b,.035,-.08))} ${fmt(root)} Z`;
  const meta = { motif, motifKind: kind, layer: motif } as const;
  const strokes: BorderStroke[] = [{ d: outline, role: 'outline', surface: 'face', ...meta }];
  const midribEnd = world(b, .93, asymmetry * .05);
  strokes.push({ d: cubic(root, world(b,.25,0), world(b,.7,asymmetry*.04), midribEnd), role: 'midrib', surface: 'face', ...meta });
  for (const r of [...left, ...right]) {
    strokes.push({ d: cubic(world(b,.045,0), world(b,.3 + r.index*.035,0), world(b,.08+r.index*.145,r.side*.18), r.vein), role: 'pipe', surface: r.side * side > 0 ? 'face' : 'fold', ...meta });
    const eyeR = Math.max(1.2, b.width * .045);
    strokes.push({ d: `M ${fmt(add(r.eye,scale(axis,-eyeR)))} Q ${fmt(add(r.eye,scale(across,r.side*eyeR)))} ${fmt(add(r.eye,scale(axis,eyeR*.85)))}`, role: 'eye', surface: 'recess', ...meta });
  }
  if (turnover) {
    const r = (asymmetry >= 0 ? left : right)[1];
    const curl = world(b,.28,r.side*.67), returnPoint = world(b,.22,r.side*.25);
    strokes.push({ d: cubic(r.tip, curl, world(b,.34,r.side*.35), returnPoint), role: 'outline', surface: 'underside', ...meta });
    strokes.push({ d: cubic(returnPoint, world(b,.27,r.side*.16), world(b,.2,r.side*.1), r.spring), role: 'vein', surface: 'fold', ...meta });
  }
  if (detail === 'high') for (const r of [...left, ...right].filter(r => r.index < 5)) strokes.push({ d: cubic(r.spring, world(b,.1+r.index*.145,r.side*.18), r.returnShoulder, r.vein), role: 'vein', surface: 'face', ...meta });
  if (shading) strokes.push(...shadeLeaf(root, axis, across, length, b.width, shading, motif).map(s => ({ ...s, motifKind: kind, layer: motif })));
  return { strokes, tip, construction: [...left, ...right].map(r => ({ kind: 'lobe', a: r.spring, b: r.tip })) };
}
