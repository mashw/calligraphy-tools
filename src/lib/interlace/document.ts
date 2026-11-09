import { samplePathDToPolyline } from '../paths/sample-svg-path';
import { PAPERS_MM } from '../curve-helpers';
import { parseDesign, DEFAULT_DESIGN, pageSize, type Design } from '../woven/design';
import { findSelfCrossings, makeRoute, type Point } from '../woven/geometry';
import { initialSheet, strand, strandRoute, topology, type Source, type Strand, type Sheet } from './model';

function record(v:unknown): Record<string,unknown> {
  if(!v || typeof v!=='object' || Array.isArray(v)) throw Error('Expected a design object.');
  return v as Record<string,unknown>;
}
function num(v:unknown,min:number,max:number) {
  if(typeof v!=='number' || !Number.isFinite(v) || v<min || v>max) throw Error('Invalid measurement in design.');
  return v;
}
function point(v:unknown) { const p=record(v); return {x:num(p.x,-1e6,1e6),y:num(p.y,-1e6,1e6)}; }
function string(v:unknown) { if(typeof v!=='string') throw Error('Invalid name or identifier.'); return v; }
function bool(v:unknown) { if(typeof v!=='boolean') throw Error('Invalid strand option.'); return v; }
function array(v:unknown,max:number) { if(!Array.isArray(v) || v.length>max) throw Error('Invalid collection size.'); return v as unknown[]; }
export function pathSource(d:string, points:Point[]) {
  if(points.length<2 || points.length>6000 || points.some(p=>!Number.isFinite(p.x+p.y))) throw Error('Path is empty or too complex.');
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=Math.min(...xs),top=Math.min(...ys), width=Math.max(...xs)-left,height=Math.max(...ys)-top;
  if(Math.max(width,height)<.0001) throw Error('Path has no measurable length.');
  const center={x:left+width/2,y:top+height/2};
  const source:Extract<Source,{kind:'path'}>={kind:'path',d,width:width||1,height:height||1,
    points:points.map(p=>({x:p.x-center.x,y:p.y-center.y})),closed:Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<.001};
  return {source,center};
}
function samples(d:string) {
  if(!d || (d.match(/[Mm]/g)??[]).length!==1) throw Error('Use a separate path element for each continuous subpath.');
  const probe=document.createElementNS('http://www.w3.org/2000/svg','path');
  probe.setAttribute('d',d);
  return samplePathDToPolyline(d,Math.max(.6,probe.getTotalLength()/3000));
}
export function fromPath(name:string,d:string,points=samples(d)) {
  const {source}=pathSource(d,points);
  return strand(crypto.randomUUID(),name,source,{...DEFAULT_DESIGN,width:source.width,height:source.height,gap:0});
}
const NS='http://www.w3.org/2000/svg';
export function importSvg(xml:string,sheet:Sheet):Strand[] {
  const doc=new DOMParser().parseFromString(xml,'image/svg+xml'), root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror')) throw Error('Invalid SVG document.');
  const paths=[...root.querySelectorAll('path')].filter(p=>!p.closest('defs,clipPath,mask,symbol'));
  if(!paths.length || paths.length>100 || root.querySelector('use, image, rect:not(defs rect), circle, ellipse, line, polygon, polyline, text, style, [style*="transform"]')) throw Error('Convert artwork to SVG paths before importing.');
  // Only geometry attributes enter the measuring SVG. Never insert uploaded markup.
  const viewport=document.createElementNS(NS,'svg');
  const view=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  function mm(attr:string,fallback:number) {
    const raw=root.getAttribute(attr); if(!raw || raw.endsWith('%')) return fallback*25.4/96;
    const m=/^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|pt|px)?\s*$/.exec(raw);
    if(!m) throw Error('Unsupported SVG page units.');
    const units:Record<string,number>={mm:1,cm:10,in:25.4,pt:25.4/72,px:25.4/96};
    return Number(m[1])*units[m[2]||'px'];
  }
  viewport.setAttribute('width',String(mm('width',view?.[2]??300)));
  viewport.setAttribute('height',String(mm('height',view?.[3]??150)));
  if(view) viewport.setAttribute('viewBox',view.join(' '));
  else viewport.setAttribute('viewBox','0 0 '+Number(viewport.getAttribute('width'))*96/25.4+' '+Number(viewport.getAttribute('height'))*96/25.4);
  viewport.setAttribute('preserveAspectRatio',root.getAttribute('preserveAspectRatio')??'xMidYMid meet');
  viewport.style.cssText='position:absolute;visibility:hidden;pointer-events:none';
  document.body.append(viewport);
  try {
    const page=pageSize(sheet);
    const parts=paths.map((path,i)=>{
      const d=path.getAttribute('d')??'', ancestry:Element[]=[];
      for(let p:Element|null=path;p;p=p.parentElement) { ancestry.unshift(p); if(p===root) break; }
      if(ancestry.slice(1,-1).some(p=>p.localName!=='g')) throw Error('Unsupported SVG container. Convert to plain paths.');
      const g=document.createElementNS(NS,'g');
      g.setAttribute('transform',ancestry.map(p=>p.getAttribute('transform')??'').join(' ')); viewport.append(g);
      const matrix=g.getCTM(); if(!matrix) throw Error('Cannot measure this SVG.');
      const pts=samples(d).map(p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
      const {center}=pathSource(d,pts);
      return {s:fromPath(path.id||'Imported path '+(i+1),d,pts),center};
    });
    const x=parts.reduce((sum,p)=>sum+p.center.x,0)/parts.length, y=parts.reduce((sum,p)=>sum+p.center.y,0)/parts.length;
    return parts.map(({s,center})=>({...s,design:{...s.design,centerX:page.w/2+center.x-x,centerY:page.h/2+center.y-y}}));
  } finally {viewport.remove();}
}
function header(obj:Record<string,unknown>): Pick<Sheet,'paper'|'orientation'> {
  if(typeof obj.paper!=='string'||!Object.hasOwn(PAPERS_MM,obj.paper)||!['portrait','landscape'].includes(String(obj.orientation))) throw Error('Invalid page settings.');
  return {paper:obj.paper as Sheet['paper'],orientation:obj.orientation as Sheet['orientation']};
}
function readStrand(value:unknown):Strand {
  const s=record(value),src=record(s.source),raw=record(s.design);
  const parsed=parseDesign({...raw,width:100,height:100,ascNib:2,descNib:2,xNib:5});
  const design={...parsed,width:num(raw.width,.00001,10000),height:num(raw.height,.00001,10000),
    xNib:num(raw.xNib,.1,100),ascNib:num(raw.ascNib,0,100),descNib:num(raw.descNib,0,100)};
  let source:Source;
  if(src.kind==='rosette'||src.kind==='figure-eight') source={kind:src.kind};
  else if(src.kind==='path') {
    const points=array(src.points,6000).map(point); if(points.length<2) throw Error('Empty strand.');
    source={kind:'path',d:string(src.d),points,width:num(src.width,.00001,10000),height:num(src.height,.00001,10000),closed:bool(src.closed)};
  } else throw Error('Unsupported strand source.');
  if(!/^#[a-f0-9]{6}$/i.test(String(s.color))) throw Error('Invalid strand colour.');
  return {...strand(string(s.id),string(s.name),source,design),color:string(s.color),group:string(s.group),
    visible:bool(s.visible),mirror:bool(s.mirror),locked:bool(s.locked),invert:bool(s.invert),scale:num(s.scale,.01,1000)};
}
export function openSheet(value:unknown):{sheet:Sheet; notice:string} {
  const obj=record(value),sheet=initialSheet();
  if(obj.version!==1) throw Error('Unsupported document version.');
  if(obj.format==='calligraphy-tools/interlace') {
    Object.assign(sheet,header(obj)); sheet.strands=array(obj.strands,100).map(readStrand);
    const ids=new Set(sheet.strands.map(s=>s.id)); if(ids.size!==sheet.strands.length) throw Error('Duplicate strand ID.');
    const id=(v:unknown)=>{const s=string(v);if(!ids.has(s))throw Error('Missing strand reference.');return s;};
    const passage=(v:unknown)=>{const p=record(v);return {id:id(p.id),t:num(p.t,0,1)};};
    sheet.overrides=array(obj.overrides,10000).map(v=>{const c=record(v);if(c.over!=='a' && c.over!=='b')throw Error('Invalid crossing.');return {a:passage(c.a),b:passage(c.b),over:c.over};});
    sheet.joins=array(obj.joins,100).map(v=>{const j=record(v);return {from:id(j.from),to:id(j.to)};});
    sheet.snap=bool(obj.snap); return {sheet,notice:'Composition opened.'};
  }
  if(obj.format==='calligraphy-tools/path-guides-preset') {
    const state=record(obj.state);Object.assign(sheet,header(state));
    sheet.strands=array(state.straps,100).map(v=>{
      const p=record(v),d=string(p.d),pts=samplePathDToPolyline(d,1.25);
      const {center}=pathSource(d,pts),s=fromPath(string(p.name),d,pts),offset=point(p.offset);
      const centroid=pts.reduce((a,b)=>({x:a.x+b.x/pts.length,y:a.y+b.y/pts.length}),{x:0,y:0});
      const scale=num(p.scalePct,.01,1000),rotation=num(p.rotDeg,-180,180),angle=rotation*Math.PI/180;
      const dx=(center.x-centroid.x)*(p.flip?-1:1)*scale/100,dy=(center.y-centroid.y)*scale/100;
      const copper=p.script==='Copperplate',x=Number(copper?p.xHeightMMText??6:p.xNibText??5);
      const ratio=p.copperplateRatioPreset==='custom'?[p.copperplateDescUnitsText,p.copperplateXUnitsText,p.copperplateAscUnitsText].map(Number):
        String(p.copperplateRatioPreset??'3:2:3').split(':').map(Number);
      return readStrand({...s,id:p.id,color:p.color??s.color,scale,mirror:!!p.flip,invert:!!p.invertGuides,
        design:{...s.design,script:p.script,slantStyle:p.slantStyle??'classic',construction:p.constructionGuides??s.design.construction,
          centerX:centroid.x+offset.x+dx*Math.cos(angle)-dy*Math.sin(angle),centerY:centroid.y+offset.y+dx*Math.sin(angle)+dy*Math.cos(angle),
          rotation,penAngle:p.nibAngleDeg,nib:copper?1:Number(p.nibMMText),xNib:x,ascNib:copper?x*ratio[2]/ratio[1]:Number(p.ascNibText??3),
          descNib:copper?x*ratio[0]/ratio[1]:Number(p.descNibText??2)}});
    });
    for(const v of array(state.groups??[],100)){const g=record(v);for(const s of sheet.strands) if(array(g.strapIds,100).includes(s.id)) s.group=string(g.name);}
    return {sheet,notice:'Imported paths and writing dimensions. Review crossings and joins. Legacy camera, snap, contrast and grid display choices were omitted.'};
  }
  const d=parseDesign(obj); Object.assign(sheet,header(d)); const s=strand('woven',d.preset,{kind:d.preset},{...d,overrides:{}});
  sheet.strands=[s];
  const old=makeRoute(d.preset,d.width,d.height,d.loop,d.rotation,d.reverse);
  const canonical=strandRoute(s,sheet), hits=topology(sheet).hits;
  for(const c of findSelfCrossings(old)){
    const choice=d.overrides[c.id];if(!choice) continue;
    const at=d.reverse?old.length-c[choice]:c[choice];
    const hit=hits.find(h=>Math.hypot(h.point.x-(c.point.x-105+(d.centerX??pageSize(sheet).w/2)),h.point.y-(c.point.y-148.5+(d.centerY??pageSize(sheet).h/2)))<.02);
    if(hit) {
      const pos=(t:number)=>canonical.distances[Math.round(t*(canonical.points.length-1))];
      const delta=(t:number)=>Math.min(Math.abs(pos(t)-at),Math.abs(canonical.length-Math.abs(pos(t)-at)));
      sheet.overrides.push({a:hit.a,b:hit.b,over:delta(hit.a.t)<delta(hit.b.t)?'a':'b'});
    }
  }
  return {sheet,notice:'Imported Woven geometry, guides and crossing choices. Sheet annotations are omitted.'};
}
