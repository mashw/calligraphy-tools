import { add, cubic, fmt, scale, unit } from '../geometry';
import type { BorderStroke, ConstructionMark, PathFrame, Point } from '../types';
import { shadeLeaf } from './shading';
import type { LeafParameters } from './types';

type Basis = { root: Point; axis: Point; across: Point; length: number; width: number };
type Raffle = { spring: Point; belly: Point; crown: Point; tip: Point; returnPoint: Point; eye: Point; vein: Point; side: -1 | 1; index: number };
type Profile = { spring: number; tip: number; eye: number; reach: number };

const PROFILES: Profile[] = [
  { spring: .035, tip: .155, eye: .255, reach: .83 },
  { spring: .185, tip: .305, eye: .405, reach: 1.08 },
  { spring: .345, tip: .465, eye: .565, reach: .94 },
  { spring: .505, tip: .625, eye: .715, reach: .72 },
  { spring: .665, tip: .765, eye: .825, reach: .46 },
];

const world = (b: Basis, along: number, across: number) => add(add(b.root, scale(b.axis, b.length * along)), scale(b.across, b.width * across));
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x * (1-t) + b.x*t, y: a.y*(1-t) + b.y*t });

/** Each side receives a related but non-mirrored set of swelling raffle masses. */
function raffle(b: Basis, profile: Profile, index: number, side: -1 | 1, asymmetry: number): Raffle {
  const designedBias = side === 1 ? [1.04,1.08,.94,1.03,.9][index] : [.9,.98,1.06,.88,1.04][index];
  const reach = profile.reach * designedBias * (1 + side*asymmetry*(index%2 ? -.34 : .42));
  const stagger = side === 1 ? [0,.012,-.006,.014,-.004][index] : [.018,-.008,.016,-.005,.012][index];
  const spring = profile.spring + stagger;
  return {
    spring: world(b,spring,side*(index===0?.16:.095)),
    belly: world(b,spring+.035,side*reach*.62),
    crown: world(b,profile.tip-.025,side*reach*1.05),
    tip: world(b,profile.tip+(side===1?.008:-.006),side*reach*1.13),
    returnPoint: world(b,profile.eye-.035,side*reach*.48),
    // Eyes cut almost to the midrib and are deliberately offset from their opposite number.
    eye: world(b,profile.eye+stagger*.35,side*(.075+index*.006)),
    vein: world(b,profile.tip-.008,side*reach*.72),side,index,
  };
}

function serrationPath(r: Raffle, detail: LeafParameters['detail']): string {
  const selected = detail === 'medium' ? r.index===1 || r.index===3 : detail === 'high' ? r.index!==4 : false;
  if (!selected) return ` C ${fmt(r.returnPoint)} ${fmt(r.eye)} ${fmt(r.eye)}`;
  const count = detail==='high' && r.index===1 ? 2 : 1;
  let d='';
  for(let j=0;j<count;j++) {
    const t=.38+j*.25, edge=lerp(r.tip,r.returnPoint,t);
    const smallTip=add(edge,scale(unit({x:r.tip.x-r.spring.x,y:r.tip.y-r.spring.y}),2.2-j*.5));
    const notch=lerp(edge,r.eye,.23);
    d += ` Q ${fmt(smallTip)} ${fmt(notch)}`;
  }
  return d+` Q ${fmt(r.returnPoint)} ${fmt(r.eye)}`;
}

function ascendingSide(start: Point, raffles: Raffle[], detail: LeafParameters['detail']): string {
  let d=`L ${fmt(start)}`;
  for(const r of raffles) d += ` C ${fmt(r.belly)} ${fmt(r.crown)} ${fmt(r.tip)}${serrationPath(r,detail)}`;
  return d;
}

function descendingSide(raffles: Raffle[], detail: LeafParameters['detail']): string {
  let d='';
  for(const r of [...raffles].reverse()) {
    d += ` C ${fmt(r.returnPoint)} ${fmt(r.crown)} ${fmt(r.tip)}`;
    const selected=detail==='high' ? r.index===0||r.index===2 : detail==='medium' ? r.index===2 : false;
    if(selected) {
      const edge=lerp(r.tip,r.belly,.48), notch=lerp(edge,r.eye,.2);
      d += ` Q ${fmt(add(edge,scale(unit({x:r.tip.x-r.spring.x,y:r.tip.y-r.spring.y}),1.8)))} ${fmt(notch)} Q ${fmt(r.belly)} ${fmt(r.spring)}`;
    } else d += ` C ${fmt(r.belly)} ${fmt(r.spring)} ${fmt(r.spring)}`;
  }
  return d;
}

export function buildLeaf(frame: PathFrame, parameters: LeafParameters): { strokes: BorderStroke[]; tip: Point; construction: ConstructionMark[] } {
  const {length,width,side,sweep,compression,detail,shading,motif,kind='main',asymmetry=0,turnover=false}=parameters;
  const axis=unit(add(scale(frame.tangent,kind==='terminal'?.88:.58),scale(frame.normal,side*(.82+sweep))));
  const across={x:-axis.y,y:axis.x}, root=add(frame.point,scale(frame.normal,side*width*.035));
  const b:Basis={root,axis,across,length,width:width*compression};
  const left=PROFILES.map((p,i)=>raffle(b,p,i,1,asymmetry+.055));
  const right=PROFILES.map((p,i)=>raffle(b,p,i,-1,asymmetry-.035));
  const baseL=world(b,-.015,.2),baseR=world(b,-.02,-.17),throat=world(b,.855,-.035);
  // The crown is a hooked culmination, not a sixth mirrored lobe pair.
  const apexShoulder=world(b,.88,.23), apex=world(b,1,.055+asymmetry*.12), hookedTip=world(b,.965,-.045);
  const outline=`M ${fmt(baseL)} ${ascendingSide(left[0].spring,left,detail)} C ${fmt(world(b,.83,.34))} ${fmt(apexShoulder)} ${fmt(apex)} C ${fmt(world(b,1.005,-.01))} ${fmt(hookedTip)} ${fmt(throat)}${descendingSide(right,detail)} C ${fmt(world(b,.05,-.23))} ${fmt(baseR)} ${fmt(baseL)} Z`;
  const meta={motif,motifKind:kind,layer:motif} as const;
  const strokes:BorderStroke[]=[{d:outline,role:'outline',surface:'face',...meta}];
  const midribEnd=world(b,.91,-.015+asymmetry*.04);
  strokes.push({d:cubic(world(b,-.01,0),world(b,.22,.035),world(b,.65,-.025),midribEnd),role:'midrib',surface:'face',...meta});
  // Lower pipes gather in a broad root fan before separating toward the eyes and crowns.
  for(const r of [...left,...right]) {
    const gather=world(b,.045+r.index*.012,r.side*(.02+r.index*.006));
    strokes.push({d:cubic(world(b,-.005,r.side*.045),gather,world(b,.12+r.index*.13,r.side*.11),r.vein),role:'pipe',surface:r.side*side>0?'face':'fold',...meta});
    const eyeDepth=Math.max(2,b.width*(.052+r.index*.003));
    const mouth=add(r.eye,scale(axis,-eyeDepth*.7)),inner=add(r.eye,scale(across,-r.side*eyeDepth*.55)),release=add(r.eye,scale(axis,eyeDepth*1.15));
    strokes.push({d:cubic(mouth,add(mouth,scale(across,-r.side*eyeDepth*.35)),inner,release),role:'eye',surface:'recess',...meta});
  }
  if(turnover) {
    const lower=left[1], tucked=right[3];
    strokes.push({d:cubic(lower.tip,world(b,.33,.82),world(b,.31,.34),world(b,.245,.17)),role:'outline',surface:'underside',...meta});
    strokes.push({d:cubic(world(b,.245,.17),world(b,.28,.12),world(b,.34,.2),lower.returnPoint),role:'vein',surface:'fold',...meta});
    strokes.push({d:cubic(tucked.tip,world(b,.68,-.56),world(b,.7,-.24),world(b,.68,-.11)),role:'outline',surface:'underside',...meta});
  }
  if(detail!=='low') for(const r of [...left,...right].filter(r=>detail==='high'||r.index===1||r.index===2)) strokes.push({d:cubic(world(b,.035,r.side*.02),world(b,.18+r.index*.08,r.side*.055),r.returnPoint,r.vein),role:'vein',surface:'face',...meta});
  if(shading) strokes.push(...shadeLeaf(root,axis,across,length,b.width,shading,motif).map(s=>({...s,motifKind:kind,layer:motif})));
  return {strokes,tip:apex,construction:[...left,...right].map(r=>({kind:'lobe',a:r.spring,b:r.tip}))};
}
