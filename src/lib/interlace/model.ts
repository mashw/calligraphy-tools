import { clipPolylineToRect } from '../layout/plotter-export';
import { offset } from "../curve-helpers";
import { clipSlantToBand, makeSlantRoute } from '../guides/slant-paths';
import { transformPolyline } from '../paths/transform';
import { segmentIntersection } from '../paths/intersections';
import { DEFAULT_DESIGN, pageSize, type Design } from '../woven/design';
import { makeRoute, minimumRadius, sliceGuide, visibleIntervals, type Interval, type Point, type Route } from '../woven/geometry';
import { writingStrokes } from '../woven/model';
import type { Scene } from '../woven/vector-export';

export type Source = { kind: 'rosette' | 'figure-eight' } |
  { kind: 'path'; d: string; points: Point[]; width: number; height: number; closed: boolean };
export type Strand = {
  id: string; name: string; source: Source; design: Design; scale: number; mirror: boolean;
  baselineSource?: boolean; locked: boolean; visible: boolean; color: string; group: string; invert: boolean;
};
export type Passage = { id: string; t: number };
export type Choice = { a: Passage; b: Passage; over: 'a' | 'b'; handedness?: number; reach?: number };
export type Hit = Choice & { point: Point; sine: number; cosine: number };
export type Sheet = Pick<Design,'paper'|'orientation'> & {
  format: 'calligraphy-tools/interlace'; version: 1; strands: Strand[]; overrides: Choice[];
  joins: { from: string; to: string }[]; snap: boolean;
};
export function strand(id: string, name: string, source: Source, design = DEFAULT_DESIGN): Strand {
  return { id, name, source, design: {...design}, scale: 100, mirror: false, locked: false,
    visible: true, color: '#526b93', group: '', invert: false };
}
export function initialSheet(): Sheet {
  return { format: 'calligraphy-tools/interlace', version: 1, paper:'A4', orientation:'portrait',
    strands:[strand('rosette', 'Six-loop rosette', {kind:'rosette'})], overrides:[], joins:[], snap:false };
}
export function strandRoute(s: Strand, sheet: Sheet) {
  const d = s.design, page = pageSize(sheet);
  const source = s.source;
  const points = source.kind === 'path'
    ? source.points.map(p=>({x:p.x * d.width / source.width, y:p.y * d.height / source.height}))
    : makeRoute(source.kind,d.width,d.height,d.loop,0,false,{x:0,y:0}).points;
  return makeSlantRoute(transformPolyline(points, {scalePct:s.scale, rotDeg:d.rotation, flipX:s.mirror,
    offset:{x:d.centerX ?? page.w/2, y:d.centerY ?? page.h/2}}));
}
type Entry = { s: Strand; route: ReturnType<typeof strandRoute> };
function detect(entries: Entry[]) {
  const hits: Hit[] = [];
  // Sweep bounds in page space, retaining segment indices in canonical source order.
  const segments=entries.flatMap((entry,layer)=>entry.route.points.slice(1).map((q,k)=>{
    const p=entry.route.points[k];
    return {entry,layer,k,p,q,left:Math.min(p.x,q.x),right:Math.max(p.x,q.x),top:Math.min(p.y,q.y),bottom:Math.max(p.y,q.y)};
  })).sort((a,b)=>a.left-b.left);
  type Segment=typeof segments[number];
  let active:Segment[]=[];
  function passage(s:Segment,at:number) {
    const count=s.entry.route.points.length-1, fraction=(s.k+at)/count;
    return {id:s.entry.s.id,t:s.entry.route.closed && fraction>1-1e-8?0:fraction};
  }
  const seen=new Set<string>();
  for(const segment of segments) {
    active=active.filter(s=>s.right+1e-8>=segment.left);
    for(const other of active) {
      if(other.bottom<segment.top || segment.bottom<other.top)continue;
      const same=other.entry===segment.entry;
      const gap=Math.abs(other.k-segment.k);
      if(same && (gap<=1 || (segment.entry.route.closed && gap===segment.entry.route.points.length-2)))continue;
      const hit=segmentIntersection(other.p,other.q,segment.p,segment.q);
      if(!hit)continue;
      const first=passage(other,hit.t), second=passage(segment,hit.u);
      if((!other.entry.route.closed && (first.t<1e-7 || first.t>1-1e-7)) ||
         (!segment.entry.route.closed && (second.t<1e-7 || second.t>1-1e-7)))continue;
      const [a,b]=[first,second].sort((x,y)=>x.id.localeCompare(y.id)||x.t-y.t);
      const key=JSON.stringify([a.id,a.t.toFixed(6),b.id,b.t.toFixed(6)]);
      if(seen.has(key))continue;
      seen.add(key);
      const dx=other.q.x-other.p.x,dy=other.q.y-other.p.y,ex=segment.q.x-segment.p.x,ey=segment.q.y-segment.p.y;
      const product=Math.hypot(dx,dy)*Math.hypot(ex,ey);
      const upper=other.layer>segment.layer?other:segment;
      const handedness=Math.sign((dx*ey-dy*ex)*(a===first?1:-1));
      hits.push({a,b,handedness,point:{x:hit.x,y:hit.y},sine:Math.abs(dx*ey-dy*ex)/product,
        cosine:Math.abs(dx*ex+dy*ey)/product,over:same || upper.entry.s.id===a.id?'a':'b'});
    }
    active.push(segment);
  }
  hits.sort((a,b)=>a.a.id.localeCompare(b.a.id)||a.b.id.localeCompare(b.b.id)||a.a.t-b.a.t||a.b.t-b.b.t);
  return hits;
}
// Each edge constrains two successive visits to have opposite over/under states.
function alternate(hits:Hit[], entries:Entry[]) {
  const edges=hits.map(()=>[] as {other:number; flip:boolean}[]);
  for(const {s,route} of entries) {
    const visits=hits.flatMap((h,index)=>(['a','b'] as const).filter(side=>h[side].id===s.id)
      .map(side=>({index,side,t:h[side].t}))).sort((a,b)=>a.t-b.t);
    for(let i=1;i<visits.length+(route.closed && visits.length?1:0);i++) {
      const a=visits[i-1], b=visits[i%visits.length], flip=a.side===b.side;
      edges[a.index].push({other:b.index,flip}); edges[b.index].push({other:a.index,flip});
    }
  }
  const assigned=new Map<number,boolean>(); let conflict=false;
  hits.forEach((hit,seed)=>{
    if(assigned.has(seed)) return;
    assigned.set(seed,hit.over==='a'); const queue=[seed];
    for(let i=0;i<queue.length;i++) for(const edge of edges[queue[i]]) {
      const want=assigned.get(queue[i])!==edge.flip;
      if(assigned.has(edge.other)) { if(assigned.get(edge.other)!==want) conflict=true; }
      else { assigned.set(edge.other,want); queue.push(edge.other); }
    }
  });
  hits.forEach((h,i)=>{h.over=assigned.get(i)?'a':'b';});
  return conflict;
}
export function sameCrossing(a:Choice,b:Choice,tolerance=1e-7) {
  return a.a.id===b.a.id && a.b.id===b.b.id && Math.abs(a.a.t-b.a.t)<tolerance && Math.abs(a.b.t-b.b.t)<tolerance;
}
/** Keep the search radius within half the distance to a competing passage pair. */
export function rememberCrossing(hit:Hit, hits:Hit[]):Choice {
  let reach=.025;
  for(const other of hits) {
    if(other===hit || other.a.id!==hit.a.id || other.b.id!==hit.b.id) continue;
    reach=Math.min(reach,Math.max(Math.abs(other.a.t-hit.a.t),Math.abs(other.b.t-hit.b.t))/2);
  }
  return {a:hit.a,b:hit.b,over:hit.over,handedness:hit.handedness,reach:Math.max(1e-7,reach)};
}
export function resolveChoices(hits:Hit[],choices:Choice[]) {
  const matches=choices.map(c=>hits.filter(h=>sameCrossing(h,c,c.reach??.025) &&
    (c.handedness===undefined || c.handedness===h.handedness)));
  const kept:Choice[]=[];
  matches.forEach((list,i)=>{
    if(list.length!==1 || matches.some((other,j)=>j!==i && other.includes(list[0]))) return;
    const hit=list[0]; hit.over=choices[i].over; kept.push(rememberCrossing(hit,hits));
  });
  return kept;
}
export function topology(sheet:Sheet) {
  const entries=sheet.strands.filter(s=>s.visible).map(s=>({s,route:strandRoute(s,sheet)}));
  const hits=detect(entries), conflict=alternate(hits,entries);
  const kept=resolveChoices(hits,sheet.overrides);
  return {entries,hits,conflict,kept};
}
function distance(route:Route,t:number) {
  const index=t*(route.points.length-1), lo=Math.min(route.points.length-2,Math.floor(index));
  return route.distances[lo]+(index-lo)*(route.distances[lo+1]-route.distances[lo]);
}
function metrics(s:Strand) {
  const d=s.design;
  const unit=d.script==='Copperplate'?1:d.nib;
  return {x:d.xNib*unit,asc:d.ascNib*unit,desc:d.descNib*unit,
    band:unit*((s.baselineSource?d.xNib:d.xNib/2)+(d.fullGuides?Math.max(d.ascNib,d.descNib):0))};
}
function directed(e:Entry) {
  return e.s.design.reverse ? [...e.route.points].reverse() : e.route.points;
}
export function canJoin(a:Entry,b:Entry) {
  if(a===b || a.s.invert!==b.s.invert || !!a.s.baselineSource!==!!b.s.baselineSource || a.route.closed || b.route.closed) return false;
  const da=a.s.design, db=b.s.design;
  const keys: (keyof Design)[]=['script','nib','xNib','ascNib','descNib','fullGuides','slants','slantStyle','slantAngle','slantSpacing','secondSlant','secondAngle','gridMode','gridWidth','penAngle','construction','gridHorizontal','gridVertical','gridContrast','gridThickness','slantContrast'];
  if(keys.some(k=>JSON.stringify(da[k])!==JSON.stringify(db[k]))) return false;
  const p=directed(a),q=directed(b),end=p.at(-1)!,prev=p.at(-2)!,start=q[0],next=q[1];
  if(Math.hypot(end.x-start.x,end.y-start.y)>.3) return false;
  const dx=end.x-prev.x,dy=end.y-prev.y,ex=next.x-start.x,ey=next.y-start.y;
  return dx*ex+dy*ey>.985*Math.hypot(dx,dy)*Math.hypot(ex,ey);
}
// Partition by visits in source order so clipping an underpass never cuts the
// other visit of a self-crossing. Closed passages can straddle the source seam.
function passageIntervals(entry: Entry, passage: Passage, hits: Hit[]): Interval[] {
  const route = entry.route;
  const visits = hits.flatMap(h=>[h.a,h.b]).filter(p=>p.id===passage.id)
    .map(p=>distance(route,p.t)).sort((a,b)=>a-b);
  const at = distance(route,passage.t), i = visits.indexOf(at), len = route.length;
  const left = i ? (at+visits[i-1])/2 : route.closed ? (at+visits[visits.length-1]-len)/2 : 0;
  const right = i+1<visits.length ? (at+visits[i+1])/2 : route.closed ? (at+visits[0]+len)/2 : len;
  const parts: Interval[] = [];
  if(left<0)parts.push([left+len,len]);
  parts.push([Math.max(left,0),Math.min(right,len)]);
  if(right>len)parts.push([0,right-len]);
  return parts;
}

function bandFootprint(entry: Entry, passage: Passage, hits: Hit[], clearance: number) {
  const {s,route}=entry, {x,asc,desc}=metrics(s);
  const sign=s.design.reverse?-1:1;
  const baseline=s.baselineSource?route.points:offset(route.points,sign*x/2);
  const top=-x-(s.design.fullGuides?(s.invert?desc:asc):0)-clearance;
  const bottom=(s.design.fullGuides?(s.invert?asc:desc):0)+clearance;
  const intervals=passageIntervals(entry,passage,hits);
  const rail=(amount:number)=>{const edge=offset(baseline,amount*sign);return intervals.flatMap(i=>sliceGuide(route,edge,i));};
  return [...rail(top),...rail(bottom).reverse()];
}

export function renderSheet(sheet:Sheet, graph=topology(sheet), { ruler = true } = {}) {
  const {entries,hits}=graph, page=pageSize(sheet), scene:Scene={page,strokes:[],labels:[]};
  const byId=new Map(entries.map(e=>[e.s.id,e]));
  const next=new Map<string,string>(), previous=new Set<string>();
  for(const join of sheet.joins) {
    const a=byId.get(join.from),b=byId.get(join.to);
    if(a && b && canJoin(a,b) && !next.has(join.from) && !previous.has(join.to)) {
      next.set(join.from,join.to); previous.add(join.to);
    }
  }
  const rendered=new Set<string>();
  for(const root of [...entries.filter(e=>!previous.has(e.s.id)),...entries]) {
    if(rendered.has(root.s.id)) continue;
    let current:Entry|undefined=root;
    const masks:{interval:Interval; polygon:Point[]}[]=[];
    const points:Point[]=[],cuts:{center:number;half:number}[]=[]; let length=0;
    while(current && !rendered.has(current.s.id)) {
      const {s,route}=current, reverse=s.design.reverse;
      rendered.add(s.id);
      const path=directed(current);
      if(points.length) {
        const end=points.at(-1)!, start=path[0]; length+=Math.hypot(start.x-end.x,start.y-end.y);
        points.push(...(Math.hypot(start.x-end.x,start.y-end.y)<1e-8?path.slice(1):path));
      } else points.push(...path);
      for(const h of hits) {
        const under=h.over==='a'?h.b:h.a;
        if(under.id!==s.id) continue;
        const over=h[h.over];
        const polygon=bandFootprint(byId.get(over.id)!,over,hits,s.design.clearance);
        for(const [start,end] of passageIntervals(current,under,hits))
          masks.push({interval:reverse?[length+route.length-end,length+route.length-start]:[length+start,length+end],polygon});
      }
      if(route.closed && s.design.gap>0) cuts.push({center:length+route.length*s.design.start/100,half:s.design.gap/2});
      length+=route.length; current=byId.get(next.get(s.id)??'');
    }
    const route=makeSlantRoute(points);
    const clipped=route.closed?cuts:cuts.map(c=>{
      const a=Math.max(0,c.center-c.half),b=Math.min(route.length,c.center+c.half);
      return {center:(a+b)/2,half:(b-a)/2};
    });
    const m=metrics(root.s);
    for(const [start,end] of visibleIntervals(route.length,clipped)) {
      const boundaries=[...new Set([start,end,...masks.flatMap(mask=>mask.interval).filter(v=>v>start && v<end)])].sort((a,b)=>a-b);
      for(let i=1;i<boundaries.length;i++) {
        const from=boundaries[i-1],to=boundaries[i],mid=(from+to)/2;
        let strokes=writingStrokes(root.s.design,route,[[from,to]],m.x,m.asc,m.desc,root.s.invert,root.s.baselineSource?0:m.x/2);
        for(const mask of masks.filter(m=>mid>=m.interval[0] && mid<=m.interval[1])) {
          strokes=strokes.flatMap(stroke=>clipSlantToBand(stroke.points,mask.polygon,false).map(points=>({...stroke,points})));
        }
        scene.strokes.push(...strokes);
      }
    }
  }
  if (ruler) {
  const y=page.h-12;
  scene.strokes.push({points:[{x:12,y},{x:62,y}],width:.18,color:'#52677c'});
  for(let i=0;i<=5;i++) scene.strokes.push({points:[{x:12+i*10,y:y-1},{x:12+i*10,y:y+1}],width:.18,color:'#52677c'});
  }
  const frame={x:0,y:0,width:page.w,height:page.h};
  scene.strokes=scene.strokes.flatMap(stroke=>{
    if(stroke.points.every(p=>p.x>=0 && p.x<=page.w && p.y>=0 && p.y<=page.h))return [stroke];
    return clipPolylineToRect({points:stroke.points,source:'interlace'},frame).map(piece=>({...stroke,points:piece.points}));
  });
  return scene;
}
export function warnings(sheet:Sheet,g:ReturnType<typeof topology>) {
  const out:string[]=[];
  const page=pageSize(sheet);
  if(g.entries.some(({route,s})=>{
    const pad=metrics(s).band;
    return route.points.some(p=>p.x-pad<0||p.y-pad<0||p.x+pad>page.w||p.y+pad>page.h);
  }))out.push('Guides may extend beyond the paper. Export clips them to the page edge.');
  if(g.conflict) out.push('Some visits cannot alternate consistently.');
  if(g.hits.some(h=>h.sine<.25)) out.push('Shallow crossing: inspect the underpass gap.');
  if(g.entries.some(e=>e.route.closed && minimumRadius(e.route)<1.5*metrics(e.s).band)) out.push('Tight bend for the selected writing size.');
  for(const j of sheet.joins) {
    const a=g.entries.find(e=>e.s.id===j.from),b=g.entries.find(e=>e.s.id===j.to);
    if(a && b && !canJoin(a,b)) out.push('A join is inactive. Align the endpoints and writing settings.');
  }
  return out;
}
