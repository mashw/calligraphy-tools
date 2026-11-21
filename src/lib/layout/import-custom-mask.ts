import { sampleClosedPathBoundary } from '../paths/sample-svg-path';
import { sanitizeArtworkSvg, type ArtworkNode } from './artwork';
import { CUSTOM_MASK_POINT_LIMIT, validateCustomMask, validateMaskPath, type CustomMask } from './custom-mask';

const NS = 'http://www.w3.org/2000/svg';
const numeric = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?(?:px)?$/i;

function shapePath(node: ArtworkNode) {
  const value = (key: string, fallback?: number) => {
    const raw = node.attrs[key]?.trim();
    if (raw === undefined && fallback !== undefined) return fallback;
    if (!raw || !numeric.test(raw) || !Number.isFinite(Number.parseFloat(raw))) {
      throw new Error('Use finite SVG user units for shape coordinates.');
    }
    return Number.parseFloat(raw);
  };
  const ellipse = (x:number,y:number,rx:number,ry:number) => {
    if (rx<=0 || ry<=0) throw new Error('The SVG ellipse must have positive radii.');
    return `M ${x-rx} ${y} A ${rx} ${ry} 0 1 0 ${x+rx} ${y} A ${rx} ${ry} 0 1 0 ${x-rx} ${y} Z`;
  };
  switch (node.tag) {
    case 'path': return node.attrs.d ?? '';
    case 'polygon': {
      const points = node.attrs.points?.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
      if (points.length<6 || points.length%2 || (node.attrs.points??'').replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?|[\s,]/gi,''))
        throw new Error('The SVG polygon has invalid points.');
      return `M ${points.join(' ')} Z`;
    }
    case 'circle': return ellipse(value('cx',0),value('cy',0),value('r'),value('r'));
    case 'ellipse': return ellipse(value('cx',0),value('cy',0),value('rx'),value('ry'));
    case 'rect': {
      const x=value('x',0),y=value('y',0),w=value('width'),h=value('height');
      const rx=Math.min(w/2,value('rx',value('ry',0))),ry=Math.min(h/2,value('ry',value('rx',0)));
      if (w<=0 || h<=0 || rx<0 || ry<0) throw new Error('The SVG rectangle has invalid dimensions.');
      if (!rx || !ry) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
      const right=x+w,bottom=y+h,arc=`A ${rx} ${ry} 0 0 1`;
      return `M ${x+rx} ${y} H ${right-rx} ${arc} ${right} ${y+ry} V ${bottom-ry} ${arc} ${right-rx} ${bottom} H ${x+rx} ${arc} ${x} ${bottom-ry} V ${y+ry} ${arc} ${x+rx} ${y} Z`;
    }
    default: throw new Error('Use a closed path, polygon, circle, ellipse or rectangle.');
  }
}

export function importCustomMask(source: string, filename: string): CustomMask {
  const {nodes,warning,rootTransform} = sanitizeArtworkSvg(source,{forSilhouette:true});
  if (warning) throw new Error('Simplify the SVG to one closed shape. Remove clipping, masks, stylesheets and unsupported objects.');
  // A group can carry transforms, but the silhouette must be one geometry element.
  const transforms = [rootTransform ?? ''];
  let contents = nodes;
  while (contents.length === 1 && contents[0].tag === 'g') {
    transforms.push(contents[0].attrs.transform ?? '');
    contents = contents[0].children;
  }
  if (contents.length !== 1 || contents[0].children.length) throw new Error('Use one closed silhouette. Multiple shapes and holes are unsupported.');
  const node = contents[0], path = shapePath(node);
  validateMaskPath(path);
  transforms.push(node.attrs.transform ?? '');
  const group = document.createElementNS(NS,'g');
  let matrix = new DOMMatrix();
  for (const transform of transforms.filter(t=>t.trim())) {
    group.setAttribute('transform',transform);
    const list=group.transform.baseVal;
    // SVG silently drops trailing invalid syntax. Verify that every function parsed.
    const functions=transform.match(/(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)/g) ?? [];
    if (!list.numberOfItems || list.numberOfItems!==functions.length
      || transform.replace(/(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)|[\s,]/g,'')) {
      throw new Error('The SVG shape has an unsupported transform.');
    }
    const local=list.consolidate()!.matrix;
    matrix=matrix.multiply(new DOMMatrix([local.a,local.b,local.c,local.d,local.e,local.f]));
  }
  const scale=Math.hypot(matrix.a,matrix.b,matrix.c,matrix.d);
  if (!scale || !Number.isFinite(scale)) throw new Error('The SVG shape has an invalid transform.');
  const pathElement=document.createElementNS(NS,'path');
  pathElement.setAttribute('d',path);
  const viewport=document.createElementNS(NS,'svg');
  viewport.style.cssText='position:fixed;width:0;height:0;visibility:hidden;pointer-events:none';
  viewport.append(pathElement);
  document.body.append(viewport);
  try {
    return measureMask(pathElement,path,filename,matrix,scale);
  } finally {
    viewport.remove();
  }
}

function measureMask(pathElement:SVGPathElement,path:string,filename:string,matrix:DOMMatrix,scale:number):CustomMask {
  const measure=pathElement.getBBox();
  if (measure.width<=0 || measure.height<=0) throw new Error('The SVG shape has no measurable interior.');
  // Estimate size in transformed units, then refine using the actual sampled bounds.
  const apply=(p:{x:number;y:number})=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});
  const bounds=(points:{x:number;y:number}[])=>{
    const x=points.map(p=>p.x),y=points.map(p=>p.y),left=Math.min(...x),top=Math.min(...y);
    return {left,top,width:Math.max(...x)-left,height:Math.max(...y)-top};
  };
  const firstTolerance=Math.max(measure.width,measure.height)*.00005;
  let sourceTolerance=firstTolerance;
  let points=sampleClosedPathBoundary(pathElement,sourceTolerance,CUSTOM_MASK_POINT_LIMIT).map(apply);
  let box=bounds(points);
  const refined=Math.max(box.width,box.height)*.00005/scale;
  if (refined<sourceTolerance*.75) {
    sourceTolerance=refined;
    points=sampleClosedPathBoundary(pathElement,sourceTolerance,CUSTOM_MASK_POINT_LIMIT).map(apply);
    box=bounds(points);
  }
  const {left,top,width,height}=box;
  if (width<=0 || height<=0) throw new Error('The SVG shape has no measurable interior.');
  const boundary=points.map(p=>({x:(p.x-left)/width,y:(p.y-top)/height}));
  // A simple contour has nonzero signed area. Reject degenerate outlines.
  const area=boundary.reduce((sum,p,i)=>{
    const q=boundary[(i+1)%boundary.length];
    return sum+p.x*q.y-q.x*p.y;
  },0);
  if (Math.abs(area)<1e-5) throw new Error('The SVG shape has no measurable interior.');
  const mask:CustomMask={filename,path,aspectRatio:width/height,boundary,
    matrix:[matrix.a/width,matrix.b/height,matrix.c/width,matrix.d/height,(matrix.e-left)/width,(matrix.f-top)/height],
    tolerance:sourceTolerance*scale/Math.max(width,height)};
  validateCustomMask(mask);
  return mask;
}
