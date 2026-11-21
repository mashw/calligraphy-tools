import { lengthPoly, offset, pointAt, type Pt } from '@/lib/curve-helpers';
import type { GuideSet } from './guide-template';
import type { ScriptId } from '@/lib/scripts';

const names: Record<ScriptId, string> = {
  Copperplate: 'Copperplate',
  Fraktur: 'Fraktur',
  TexturaQuadrata: 'Textura Quadrata',
  InsularMajuscule: 'Insular Majuscule',
};
const decimal = (n: number) => String(Math.round(n * 100) / 100);

export function guideLabel(script: ScriptId, xHeight: number, nib: number, angle?: number) {
  const height = script === 'Copperplate' ? `${decimal(xHeight)} mm` : `${decimal(xHeight / nib)} nibs`;
  const size = `${height} x-height`;
  return script === 'Copperplate'
    ? `${names[script]} · ${size}${angle === undefined ? '' : ` · ${decimal(angle)}° slant`}`
    : `${names[script]} · ${decimal(nib)} mm nib · ${size}${angle === undefined ? '' : ` · ${decimal(angle)}° pen`}`;
}

export type SheetTag = {
  text: string;
  size: number;
  path?: Pt[];
  point: Pt;
  angle?: number;
  align?: 'start';
  colour?: string;
};

export type TagBand = { name: string; text: string; guides: GuideSet };
const size = 2.65;
const estimate = (text: string) => text.length * size * .61;

// Flow along the middle of an edge. A tangent tag is more legible on short paths.
export function pathTag(text: string, points: Pt[], fraction = .5): SheetTag | null {
  const length = lengthPoly(points);
  if (points.length < 2 || length < .01) return null;
  const centre = length * fraction;
  const span = Math.min(estimate(text) * 1.25, centre * 2, (length - centre) * 2);
  const { p } = pointAt(points, centre);
  const a = pointAt(points, Math.max(0, centre - 1)).p;
  const b = pointAt(points, Math.min(length, centre + 1)).p;
  const flip = b.x < a.x || (Math.abs(b.x - a.x) < .01 && b.y < a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const tag: SheetTag = { text, size, point: p, angle: flip ? angle + 180 : angle };
  if (span >= estimate(text)) {
    const path = Array.from({ length: 49 }, (_, index) =>
      pointAt(points, centre + (index / 48 - .5) * span).p);
    const start = path[0], end = path.at(-1)!;
    if (Math.hypot(end.x - start.x, end.y - start.y) >= span * .65) {
      tag.path = end.x < start.x ? path.reverse() : path;
    }
  }
  return tag;
}

export function circleTags(bands: TagBand[], centre: Pt, maxRadius = Infinity): SheetTag[] {
  const edges = bands.map(band => {
    const radii = [...band.guides.ascLine, ...band.guides.descLine].map(p => Math.hypot(p.x - centre.x, p.y - centre.y));
    return { ...band, inner: Math.min(...radii), outer: Math.max(...radii) };
  });
  return edges.flatMap(({ name, text, inner, outer }) => {
    const next = Math.min(maxRadius, ...edges.filter(edge => edge.inner > outer).map(edge => edge.inner));
    const outside = next - outer >= 4;
    const radius = Math.max(1, outside ? outer + 4 : inner - 1.5);
    // Alternate arcs when several bands are enabled so adjacent labels have room.
    const middle = name === 'Inner' ? -Math.PI * .85 : name === 'Outer' ? -Math.PI * .15 : -Math.PI / 2;
    const label = `${name} · ${text}`;
    const sweep = Math.min(Math.PI * .9, Math.max(1, estimate(label) * 1.4 / radius));
    const points = Array.from({ length: 65 }, (_, n) => {
      const angle = middle + (n / 64 - .5) * sweep;
      return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
    });
    const tag = pathTag(label, points);
    return tag ? [tag] : [];
  });
}

export function curveTags(bands: TagBand[]): SheetTag[] {
  return bands.flatMap(({ name, text, guides }, index) => {
    const lower = name === 'Bottom';
    const edge = lower ? guides.descLine : guides.ascLine;
    // On stacked bands stagger the labels away from the middle writing area.
    const fraction = bands.length === 1 ? .5 : lower ? .58 : index === 0 ? .24 : .68;
    const tag = pathTag(bands.length === 1 ? text : `${name} · ${text}`, offset(edge, lower ? 6 : -3), fraction);
    return tag ? [tag] : [];
  });
}

export function routeTag(text: string, points: Pt[], clearance: number, fraction = .5) {
  if (points.length < 2) return null;
  const left = offset(points, -clearance), right = offset(points, clearance);
  const a = pointAt(left, lengthPoly(left) * fraction).p;
  const b = pointAt(right, lengthPoly(right) * fraction).p;
  return pathTag(text, a.y <= b.y ? left : right, fraction);
}

export const sheetLabelColour = '#334155';
export const sheetLabelFont = 'Helvetica, Arial, sans-serif';

export function guideTagColour(value?: string) {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : sheetLabelColour;
}

export function pdfTagCommands(tag: SheetTag, locate: (p: Pt) => Pt, pageHeightMM: number, rotation = 0) {
  const pt = 72 / 25.4, n = (value: number) => value.toFixed(4);
  const colour = guideTagColour(tag.colour);
  const rgb = [1, 3, 5].map(index => n(parseInt(colour.slice(index, index + 2), 16) / 255)).join(' ');
  const text = tag.text.replace(/·/g, '-').replace(/°/g, ' deg').replace(/[^ -~]/g, '?');
  const width = (char: string) => (/[ ilI.,:!'|]/.test(char) ? .278 : /[MW@]/.test(char) ? .88 : /[A-Z]/.test(char) ? .667 : .556) * tag.size;
  const total = Array.from(text).reduce((sum, char) => sum + width(char), 0);
  const pathLength = tag.path ? lengthPoly(tag.path) : 0;
  const path = pathLength >= total ? tag.path : undefined;
  let cursor = tag.align === 'start' ? 0 : -total / 2;
  const radians = (angle: number) => angle * Math.PI / 180;
  return Array.from(text, char => {
    const centre = cursor + width(char) / 2;
    cursor += width(char);
    if (char === ' ') return '';
    const distance = pathLength / 2 + centre;
    const frame = path ? pointAt(path, distance) : undefined;
    const turn = frame ? Math.atan2(frame.t.y, frame.t.x) : radians(tag.angle ?? 0);
    const start = frame ? {
      x: frame.p.x - Math.cos(turn) * width(char) / 2,
      y: frame.p.y - Math.sin(turn) * width(char) / 2,
    } : {
      x: tag.point.x + Math.cos(turn) * (centre - width(char) / 2),
      y: tag.point.y + Math.sin(turn) * (centre - width(char) / 2),
    };
    const point = locate(start), angle = -turn - radians(rotation);
    const c = n(Math.cos(angle)), s = n(Math.sin(angle)), inverse = n(-Math.sin(angle));
    return `BT /F1 ${n(tag.size * pt)} Tf ${rgb} rg ${c} ${s} ${inverse} ${c} ${n(point.x * pt)} ${n((pageHeightMM - point.y) * pt)} Tm (${char.replace(/([\\()])/g, '\\$1')}) Tj ET`;
  }).filter(Boolean).join('\n');
}


/** Reserve printed stroke extents before looking for a nearby clear label rectangle. */
export function placeSheetTags(tags: SheetTag[], strokes: {points: Pt[]; width: number}[], page: {w:number; h:number}): SheetTag[] {
  if (!tags.length) return [];
  const cell = 2, cols = Math.ceil(page.w/cell), rows = Math.ceil(page.h/cell);
  const occupied = new Uint8Array(cols*rows);
  function reserve(left:number, top:number, right:number, bottom:number) {
    for (let y=Math.max(0,Math.floor(top/cell)); y<=Math.min(rows-1,Math.floor(bottom/cell)); y++)
      occupied.fill(1,y*cols+Math.max(0,Math.min(cols,Math.floor(left/cell))),y*cols+Math.max(0,Math.min(cols,Math.floor(right/cell)+1)));
  }
  for (const stroke of strokes) {
    const pad = stroke.width/2 + .5;
    for (let j=1;j<stroke.points.length;j++) {
      const a=stroke.points[j-1], b=stroke.points[j];
      const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/cell));
      for(let k=0;k<=steps;k++){
        const x=a.x+(b.x-a.x)*k/steps, y=a.y+(b.y-a.y)*k/steps;
        reserve(x-pad-cell/2,y-pad-cell/2,x+pad+cell/2,y+pad+cell/2);
      }
    }
  }
  const placed: SheetTag[] = [];
  for (const tag of tags) {
    const width = Math.ceil((tag.text.length*tag.size*.76+2)/cell);
    const height = Math.ceil((tag.size*1.6+2)/cell);
    let best: Pt | undefined, nearest=Infinity;
    for(let y=1;y+height<=Math.floor(page.h/cell)-1;y++){
      let run=0;
      for(let x=1;x<Math.floor(page.w/cell)-1;x++){
        let clear=true;
        for(let row=y;row<y+height;row++) if(occupied[row*cols+x]) {clear=false;break;}
        run=clear?run+1:0;
        if(run<width) continue;
        const point={x:(x+1-width/2)*cell,y:(y+height/2)*cell+tag.size*.32};
        const distance=Math.hypot(point.x-tag.point.x,point.y-tag.point.y);
        if(distance<nearest){nearest=distance;best=point;}
      }
    }
    if(best){
      const middle=best.y-tag.size*.32;
      reserve(best.x-width*cell/2,middle-height*cell/2,best.x+width*cell/2,middle+height*cell/2);
      placed.push({...tag,point:best,path:undefined,angle:0});
    }
  }
  return placed;
}
