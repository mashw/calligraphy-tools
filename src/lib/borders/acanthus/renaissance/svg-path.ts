import type { Point } from '../../types';

export type CubicSegment = { p0: Point; c1: Point; c2: Point; p1: Point };
export type CanonicalPath = { segments: CubicSegment[]; closed: boolean };

const COMMAND = /^[a-zA-Z]$/;
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const cubicLine = (a: Point, b: Point): CubicSegment => ({ p0: a, c1: { x: a.x + (b.x-a.x)/3, y: a.y + (b.y-a.y)/3 }, c2: { x: a.x + 2*(b.x-a.x)/3, y: a.y + 2*(b.y-a.y)/3 }, p1: b });

/** Strict SVG path parser used by the source converter. It canonicalises the
 * Illustrator command vocabulary to absolute cubic Beziers. */
export function parseSvgPath(d: string): CanonicalPath {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i=0, command='', current={x:0,y:0}, start=current, lastCubic:Point|null=null, lastQuad:Point|null=null;
  const segments:CubicSegment[]=[]; let closed=false;
  const number=()=>{ const token=tokens[i++]; if(token===undefined || COMMAND.test(token)) throw new Error(`Expected path number at token ${i}`); return Number(token); };
  const point=(relative:boolean)=>{ const p={x:number(),y:number()}; return relative?add(current,p):p; };
  while(i<tokens.length){
    if(COMMAND.test(tokens[i])) command=tokens[i++];
    if(!command) throw new Error('SVG path must begin with a command.');
    const lower=command.toLowerCase(), relative=command===lower;
    if(lower==='z'){ if(current.x!==start.x || current.y!==start.y) segments.push(cubicLine(current,start)); current=start; closed=true; lastCubic=lastQuad=null; command=''; continue; }
    if(lower==='m'){ current=point(relative); start=current; command=relative?'l':'L'; lastCubic=lastQuad=null; continue; }
    if(lower==='l' || lower==='h' || lower==='v'){
      let next:Point; if(lower==='l') next=point(relative); else if(lower==='h'){ const x=number(); next={x:relative?current.x+x:x,y:current.y}; } else { const y=number(); next={x:current.x,y:relative?current.y+y:y}; }
      segments.push(cubicLine(current,next)); current=next; lastCubic=lastQuad=null; continue;
    }
    if(lower==='c'){
      const c1=point(relative), c2=point(relative), p1=point(relative); segments.push({p0:current,c1,c2,p1}); current=p1; lastCubic=c2; lastQuad=null; continue;
    }
    if(lower==='s'){
      const c1=lastCubic?{x:2*current.x-lastCubic.x,y:2*current.y-lastCubic.y}:current, c2=point(relative), p1=point(relative); segments.push({p0:current,c1,c2,p1}); current=p1; lastCubic=c2; lastQuad=null; continue;
    }
    if(lower==='q' || lower==='t'){
      const q:Point=lower==='q'?point(relative):(lastQuad?{x:2*current.x-lastQuad.x,y:2*current.y-lastQuad.y}:current), p1=point(relative);
      const c1={x:current.x+2*(q.x-current.x)/3,y:current.y+2*(q.y-current.y)/3}, c2={x:p1.x+2*(q.x-p1.x)/3,y:p1.y+2*(q.y-p1.y)/3};
      segments.push({p0:current,c1,c2,p1}); current=p1; lastQuad=q; lastCubic=null; continue;
    }
    throw new Error(`Unsupported SVG path command "${command}".`);
  }
  if(!segments.length) throw new Error('SVG path has no drawable geometry.');
  return {segments,closed};
}
