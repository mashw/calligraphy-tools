import { createPolylineSampler, offset } from '../curve-helpers';
import { buildCopperplateContext } from '../copperplate/context';
import { measureRun } from '../measure/measure-run';
import { SCRIPT_PROFILES } from '../scripts';
import { computeCurvedTitleLayout } from '../curved-title/model';
import { clipSlantToBand, makeSlantRoute } from '../guides/slant-paths';
import { sliceGuide, visibleIntervals, type Interval, type Point } from '../woven/geometry';
import { pageSize, type Design } from '../woven/design';
import { metrics, topology, writingRoutes, type Sheet, type Strand } from './model';
export type TextPlan={countHidden?:boolean;text:string;connected:boolean;align:'start'|'center'|'end';startMM:number;reverse:boolean;startGapMM:number;endGapMM:number;spacing:number;preview:boolean;capStyle:'simple'|'flourished';calibration:boolean;lowerMM:number;doubleMM:number};
export const DEFAULT_TEXT_PLAN:TextPlan={text:'',connected:false,align:'start',startMM:0,reverse:false,startGapMM:0,endGapMM:0,spacing:1,preview:false,capStyle:'simple',calibration:false,lowerMM:0,doubleMM:0};
export function wovenStrandTextPlan(design: Design, strand: Strand): TextPlan {
  const original = design.composition?.strands.find(item => item.id === strand.id);
  const plan = original?.textPlan ?? strand.textPlan ?? DEFAULT_TEXT_PLAN;
  const text = design.strapTexts?.[strand.id];
  return text === undefined ? plan : { ...plan, text, countHidden: design.hiddenTextStraps?.includes(strand.id) };
}

export function readTextPlan(value:unknown):TextPlan {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Text & Fit settings.');
  const v=value as Record<string,unknown>,out={...DEFAULT_TEXT_PLAN};
  if(typeof v.text!=='string'||v.text.length>10000||!['start','center','end'].includes(String(v.align))||!['simple','flourished'].includes(String(v.capStyle)))throw Error('Invalid Text & Fit text or alignment.');
  if (v.countHidden !== undefined) out.countHidden= v.countHidden === true;
  out.text=v.text;out.align=v.align as TextPlan['align'];out.capStyle=v.capStyle as TextPlan['capStyle'];
  for(const key of ['connected','reverse','preview','calibration'] as const){if(typeof v[key]!=='boolean')throw Error('Invalid Text & Fit option.');out[key]=v[key];}
  for(const key of ['startMM','startGapMM','endGapMM','spacing','lowerMM','doubleMM'] as const){const n=v[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>10000||(key==='spacing'&&(n<.1||n>3)))throw Error('Invalid Text & Fit measurement.');out[key]=n;}
  return out;
}
type Span={start:number;end:number;points:Point[]};
const lerp=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function merge(spans:Span[]){const out:Span[]=[];for(const s of spans){const last=out.at(-1);if(last&&Math.abs(last.end-s.start)<1e-6){last.end=s.end;last.points.push(...s.points.slice(1));}else out.push({...s,points:[...s.points]});}return out;}
/** Uses the renderer's joined passages and crossing polygons. Segment parameters
 * keep separate visits to a self-crossing distinct. Baseline distances are mm. */
export function writingSpace(sheet:Sheet,selected:Strand,graph=topology(sheet), includeHidden=false) {
  const options=selected.textPlan??DEFAULT_TEXT_PLAN;
  const chain=writingRoutes(options.connected?sheet:{...sheet,joins:[]},graph).find(r=>r.ids.includes(selected.id));
  if(!chain)return {total:0,spans:[] as Span[],closed:false};
  const {route,root,regions}=chain,m=metrics(root);
  const reference=offset(route.points,root.baselineSource?0:m.x/2);
  const base=root.invert?offset(reference,-m.x):reference,baseline=makeSlantRoute(base);
  const rails=[reference,offset(reference,-m.x),offset(reference,-m.x/2)];
  if(root.design.fullGuides)rails.push(offset(reference,-m.x-(root.invert?m.desc:m.asc)),offset(reference,root.invert?m.asc:m.desc));
  const page=pageSize(sheet),paper=[{x:0,y:0},{x:page.w,y:0},{x:page.w,y:page.h},{x:0,y:page.h}],spans:Span[]=[];
  for(const {interval:[from,to],polygons} of regions)for(let i=1;i<base.length;i++){
    const a=route.distances[i-1],b=route.distances[i];if(b<=from||a>=to||b-a<1e-10)continue;
    let allowed:[number,number][]=[[Math.max(0,(from-a)/(b-a)),Math.min(1,(to-a)/(b-a))]];
    for(const rail of rails)for(const [polygon,inside] of [[paper,true],...(includeHidden?[]:polygons).map(p=>[p,false])] as [Point[],boolean][]){
      const p=rail[i-1],q=rail[i],dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;if(den<1e-14)continue;
      const project=(r:Point)=>Math.max(0,Math.min(1,((r.x-p.x)*dx+(r.y-p.y)*dy)/den));
      allowed=allowed.flatMap(([lo,hi])=>clipSlantToBand([lerp(p,q,lo),lerp(p,q,hi)],polygon,inside).map(part=>[project(part[0]),project(part.at(-1)!)] as [number,number]));
    }
    const start=baseline.distances[i-1],size=baseline.distances[i]-start;
    for(const [lo,hi] of allowed)if(hi-lo>1e-8)spans.push({start:start+lo*size,end:start+hi*size,points:[lerp(base[i-1],base[i],lo),lerp(base[i-1],base[i],hi)]});
  }
  let ordered=merge(spans);const total=baseline.length;
  if(options.reverse)ordered=ordered.reverse().map(s=>({start:total-s.end,end:total-s.start,points:[...s.points].reverse()}));
  const start=route.closed?options.startMM%Math.max(total,1e-9):Math.min(total,options.startMM);
  if(route.closed){
    const before:Span[]=[],after:Span[]=[];
    for(const s of ordered){const r=makeSlantRoute(s.points);
      if(s.end<=start)before.push({...s,start:s.start+total-start,end:s.end+total-start});
      else if(s.start>=start)after.push({...s,start:s.start-start,end:s.end-start});
      else{after.push({start:0,end:s.end-start,points:sliceGuide(r,r.points,[start-s.start,r.length])});before.push({start:total+s.start-start,end:total,points:sliceGuide(r,r.points,[0,start-s.start])});}
    }
    ordered=merge([...after,...before]);
  }
  const min=(route.closed?0:start)+options.startGapMM,max=total-options.endGapMM;
  ordered=ordered.flatMap(s=>{const a=Math.max(min,s.start),b=Math.min(max,s.end);if(b<=a)return [];const r=makeSlantRoute(s.points);return [{start:a,end:b,points:sliceGuide(r,r.points,[a-s.start,b-s.start])}];});
  if(route.closed&&options.startGapMM===0&&options.endGapMM===0&&ordered.length>1&&ordered[0].start<1e-7&&Math.abs(ordered.at(-1)!.end-total)<1e-7){
    const first=ordered.shift()!,last=ordered.pop()!;ordered.push({start:last.start,end:total+first.end,points:[...last.points,...first.points.slice(1)]});
  }
  return {total,spans:ordered,closed:!!route.closed};
}
// Text edits leave the writing surface unchanged. Bound the cache per graph so
// scrubbing start/gap controls cannot retain all previous clipped polylines.
const writingSpaces = new WeakMap<ReturnType<typeof topology>, WeakMap<Sheet['joins'], Map<string, ReturnType<typeof writingSpace>>>>();

function cachedWritingSpace(sheet: Sheet, selected: Strand, graph: ReturnType<typeof topology>, includeHidden = false) {
  let graphSpaces = writingSpaces.get(graph);
  if (!graphSpaces) {
    graphSpaces = new WeakMap();
    writingSpaces.set(graph, graphSpaces);
  }
  let spaces = graphSpaces.get(sheet.joins);
  if (!spaces) {
    spaces = new Map();
    graphSpaces.set(sheet.joins, spaces);
  }
  const { connected, reverse, startMM, startGapMM, endGapMM } = selected.textPlan ?? DEFAULT_TEXT_PLAN;
  const key = JSON.stringify([selected.id, sheet.paper, sheet.orientation, connected, reverse, startMM, startGapMM, endGapMM, includeHidden]);
  const cached = spaces.get(key);
  if (cached) return cached;
  const space = writingSpace(sheet, selected, graph, includeHidden);
  if (spaces.size >= 32) spaces.delete(spaces.keys().next().value!);
  spaces.set(key, space);
  return space;
}

type RouteModel = ReturnType<typeof import('../woven/model').buildWovenRouteModel>;

/** Single-strap presets draw their guides directly from these centreline intervals. */
function presetWritingSpace(model:RouteModel, gap:number, includeHidden=false) {
  const {route,start,x}=model;
  const baseline=offset(route.points,x/2);
  const distances=makeSlantRoute(baseline).distances;
  const distanceAt=(s:number)=>{
    let i=1;
    while(i<route.distances.length-1 && route.distances[i]<s) i++;
    const t=(s-route.distances[i-1])/(route.distances[i]-route.distances[i-1] || 1);
    return distances[i-1]+t*(distances[i]-distances[i-1]);
  };
  const origin=(start+gap/2)%route.length, zero=distanceAt(origin),total=distances.at(-1)!;
  const intervals=includeHidden ? visibleIntervals(route.length,[{center:start,half:gap/2}]) : model.intervals;
  const spans:Span[]=[];
  for(const [lo,hi] of [[origin,route.length],[0,origin]] as Interval[]) {
    for(const [a,b] of intervals) {
      const from=Math.max(lo,a),to=Math.min(hi,b);
      if(to<=from) continue;
      const shift=lo===origin?-zero:total-zero;
      spans.push({start:distanceAt(from)+shift,end:distanceAt(to)+shift,points:sliceGuide(route,baseline,[from,to])});
    }
  }
  return {total,closed:true,spans:merge(spans)};
}

export function textFit(sheet: Sheet, selected: Strand, graph?: ReturnType<typeof topology>, preset?: RouteModel) {
  return fitOnWritingSpace(selected, includeHidden => preset
    ? presetWritingSpace(preset, selected.design.gap, includeHidden)
    : cachedWritingSpace(sheet, selected, graph ??= topology(sheet), includeHidden));
}

/** The S-curve preset is authored as two weaving straps. Keep each strap's
 * clipping and start with the selected strap, then use the other for overflow.
 */
export function wovenCompositionTextFit(design: Design, sheet: Sheet, selected: Strand, graph: ReturnType<typeof topology>) {
  if (design.preset !== 'fraktur-scurve-weave-2') return textFit(sheet, selected, graph);

  const remaining = sheet.strands.filter(strand => strand.visible && strand.id !== selected.id);
  return fitOnWritingSpace(selected, includeHidden => {
    let total = 0;
    const spans: Span[] = [];
    for (const member of [selected, ...remaining]) {
      const textPlan = { ...(selected.textPlan ?? DEFAULT_TEXT_PLAN), connected: false };
      const space = cachedWritingSpace(sheet, { ...member, textPlan }, graph, includeHidden);
      for (const span of space.spans) {
        spans.push({ start: total + span.start, end: total + span.end, points: span.points });
      }
      total += space.total;
    }
    return { total, spans, closed: false };
  });
}

function fitOnWritingSpace(
  selected: Strand,
  resolveSpace: (includeHidden: boolean) => ReturnType<typeof writingSpace>,
) {
  const options = selected.textPlan ?? DEFAULT_TEXT_PLAN, d = selected.design, m = metrics(selected);
  const space = resolveSpace(!!options.countHidden);
  const visible = options.countHidden ? resolveSpace(false).spans : undefined;
  const ctx=d.script==='Copperplate'?buildCopperplateContext({xHeightMM:m.x,capStyle:options.capStyle,calibration:{enabled:options.calibration,calWordLowerMM:options.lowerMM||undefined,calWordDoubleMM:options.doubleMM||undefined}}).ctx:{xHeightMM:m.x,nibMM:d.nib*Math.cos(d.penAngle*Math.PI/180),scale:1,spaceMult:1,capStyle:options.capStyle};
  ctx.spaceMult*=options.spacing;let cursor=0;
  const samplers = new WeakMap<Span, ReturnType<typeof createPolylineSampler>>();
  function sampler(span: Span) {
    let sample = samplers.get(span);
    if (!sample) {
      sample = createPolylineSampler(span.points);
      samplers.set(span, sample);
    }
    return sample;
  }
  function measure(text:string,span:Span) {
    return computeCurvedTitleLayout(measureRun(text,SCRIPT_PROFILES[d.script],ctx),span.points,span.end-span.start,m.x,ctx.nibMM,m.x+m.asc,d.script,options.align,sampler(span));
  }
  function fragment(text:string,span:Span,result:ReturnType<typeof measure>) {
    const available=span.end-span.start;
    const sample = sampler(span);
    const ranges = visible ? visible.flatMap(part => (space.closed ? [-space.total,0,space.total] : [0]).map(shift => ({
      from:Math.max(0,part.start+shift-span.start),to:Math.min(available,part.end+shift-span.start)
    })).filter(range=>range.to>range.from)) : [{from:0,to:available}];
    const placements=result.placements.filter(p=>!visible || ranges.some(r=>p.sMid-p.w/2>=r.from-1e-7 && p.sMid+p.w/2<=r.to+1e-7)).map(p=>{const at=sample(Math.min(available,p.sMid));return {...p,point:at.p,tangent:at.t,collision:p.sMid+p.w/2>available+1e-7};});
    const start=options.align==='center'?Math.max(0,(available-result.needed)/2):options.align==='end'?Math.max(0,available-result.needed):0;
    const stop = Math.min(available,start+result.needed);
    const route=makeSlantRoute(span.points);
    const direction=(selected.invert ? 1 : -1)*(options.reverse ? -1 : 1);
    const spanPolygons=ranges.flatMap(range=>{
      const from=Math.max(start,range.from),to=Math.min(stop,range.to);
      if(to<=from) return [];
      const base=sliceGuide(route,span.points,[from,to]);
      return [[...base,...offset(base,direction*m.x).reverse()]];
    });
    return {spanPolygons,text,needed:result.needed,available,remaining:available-result.needed,fits:result.needed<=available+1e-7,placements,start:sample(start).p,end:sample(Math.min(available,start+result.needed)).p};
  }
  const lines:ReturnType<typeof fragment>[]=[];
  for (const paragraph of options.text.split(/\r?\n/).filter(Boolean)) {
    const chars=Array.from(paragraph);
    let first=0;
    while (first<chars.length && cursor<space.spans.length) {
      const span=space.spans[cursor++];
      const available=span.end-span.start;
      const remaining=chars.length-first;
      const prefix=(count:number)=>chars.slice(first,first+count).join('');
      let count=0, upper=1;
      while (measure(prefix(upper),span).needed<=available+1e-7) {
        count=upper;
        if (count===remaining) break;
        upper=Math.min(remaining,upper*2);
      }
      while (upper-count>1) {
        const mid=Math.floor((count+upper)/2);
        if (measure(prefix(mid),span).needed<=available+1e-7) count=mid;
        else upper=mid;
      }
      if (!count) continue;
      const text=prefix(count);
      lines.push(fragment(text,span,measure(text,span)));
      first+=count;
    }
    if (first<chars.length) {
      const point=space.spans.at(-1)?.points.at(-1)??{x:0,y:0};
      const exhausted={start:0,end:0,points:[point,point]};
      const tail=chars.slice(first).join('');
      lines.push(fragment(tail,exhausted,measure(tail,exhausted)));
    }
  }
  const needed=lines.reduce((n,l)=>n+l.needed,0),available=space.spans.reduce((n,s)=>n+s.end-s.start,0);
  return {...space,lines,needed,available,remaining:available-needed,percent:available?needed/available*100:needed?Infinity:0,fits:lines.every(l=>l.fits)};
}
