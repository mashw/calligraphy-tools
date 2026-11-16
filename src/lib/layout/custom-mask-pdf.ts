import { activeCustomMask, CUSTOM_MASK_PADDING_MM, customMaskGeometry } from './custom-mask';
import { elementRotationCenter } from './element-transform';
import { rotatePoint } from './geometry';
import type { GuidelinesElement } from './types';

type Point = {x:number;y:number};
const n=(value:number)=>value.toFixed(5);
const number=(node:Element,name:string)=>Number(node.getAttribute(name)??0);
const path=(points:Point[],close=false)=>points.map((p,i)=>`${n(p.x)} ${n(p.y)} ${i?'l':'m'}`).join(' ')+(close?' h':'');
const nums=(value:string)=>value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number)??[];
const points=(value:string)=>{
  const values=nums(value), result:Point[]=[];
  for(let i=0;i+1<values.length;i+=2) result.push({x:values[i],y:values[i+1]});
  return result;
};

function circle(node:Element) {
  const x=number(node,'cx'),y=number(node,'cy'),r=number(node,'r'),k=r*.5522847498307936;
  return [
    `${n(x+r)} ${n(y)} m`,
    `${n(x+r)} ${n(y+k)} ${n(x+k)} ${n(y+r)} ${n(x)} ${n(y+r)} c`,
    `${n(x-k)} ${n(y+r)} ${n(x-r)} ${n(y+k)} ${n(x-r)} ${n(y)} c`,
    `${n(x-r)} ${n(y-k)} ${n(x-k)} ${n(y-r)} ${n(x)} ${n(y-r)} c`,
    `${n(x+k)} ${n(y-r)} ${n(x+r)} ${n(y-k)} ${n(x+r)} ${n(y)} c h`,
  ].join(' ');
}

// The straight-guideline renderer emits these local millimetre primitives.
function geometry(node:Element) {
  switch (node.localName) {
    case 'path': {
      const d=node.getAttribute('d')??'';
      if (/[ACHQSTV]/i.test(d)) throw new Error('Unsupported guideline PDF path.');
      return path(points(d),/[Zz]\s*$/.test(d));
    }
    case 'line':return path([{x:number(node,'x1'),y:number(node,'y1')},{x:number(node,'x2'),y:number(node,'y2')}]);
    case 'rect':return ['x','y','width','height'].map(key=>n(number(node,key))).join(' ')+' re';
    case 'polyline':case 'polygon':return path(points(node.getAttribute('points')??''),node.localName==='polygon');
    case 'circle':return circle(node);
    default:return '';
  }
}

function paint(value:string|null) {
  if(value==='none'||value==='transparent'||value===null) return null;
  if(/^#[0-9a-f]{3}$/i.test(value)) value='#'+[...value.slice(1)].map(ch=>ch+ch).join('');
  if(/^#[0-9a-f]{6}$/i.test(value)) return {rgb:[1,3,5].map(i=>n(parseInt(value.slice(i,i+2),16)/255)).join(' '),alpha:1};
  const channels=nums(value);
  if(channels.length<3) throw new Error('Unsupported guideline PDF colour.');
  return {rgb:channels.slice(0,3).map(v=>n(v/255)).join(' '),alpha:channels[3]??1};
}

type PdfStates = {
  opacity:(alpha:number)=>string;
  padding:(width:number,height:number,content:string)=>string;
};

export function customMaskPdfCommands(layer:Element,element:GuidelinesElement,pageHeightPt:number,states:PdfStates) {
  const mask=activeCustomMask(element);
  const guides=layer.querySelector('[data-custom-mask-guides]');
  if(!mask||!guides) return [];
  const padding=element.mask.internalPaddingMM??CUSTOM_MASK_PADDING_MM;
  const frame=element.frame,rotation=element.rotationDeg??0,center=elementRotationCenter(element);
  const origin=rotatePoint(frame,center,rotation),angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const pt=72/25.4;
  const boundary=path(customMaskGeometry(mask,frame).points,true);
  const commands=[
    `q ${n(pt)} 0 0 ${n(-pt)} 0 ${n(pageHeightPt)} cm`,
    `${n(c)} ${n(s)} ${n(-s)} ${n(c)} ${n(origin.x)} ${n(origin.y)} cm`,
    `1 g ${boundary} f*`,
    `q ${boundary} W* n`,
  ];
  if(padding>0) commands.push(states.padding(frame.width,frame.height,
    `1 g 0 0 ${n(frame.width)} ${n(frame.height)} re f 0 G 1 j ${n(2*padding)} w ${boundary} S`));

  const refs=new Map(Array.from(layer.querySelectorAll('[id]')).map(node=>[node.id,node]));
  const definition=(node:Element,attribute:string)=>refs.get(node.getAttribute(attribute)?.match(/^url\(#(.+)\)$/)?.[1]??'');
  const draw=(node:Element)=>{
    if(node.localName==='defs')return;
    const clip=definition(node,'clip-path');
    const rowMask=definition(node,'mask');
    commands.push('q');
    if(clip) commands.push(Array.from(clip.children).map(geometry).join(' ')+' W n');
    if(rowMask) commands.push(Array.from(rowMask.children).filter(child=>child.getAttribute('fill')==='white').map(geometry).join(' ')+' W n');
    const outline=geometry(node);
    if (outline) {
      const fill=paint(node.getAttribute('fill'));
      const stroke=paint(node.getAttribute('stroke'));
      const opacity=(key:string)=>Number(node.getAttribute(key)??1);
      if(fill)commands.push(states.opacity(fill.alpha*opacity('fill-opacity')),`${fill.rgb} rg ${outline} f`);
      if(stroke&&number(node,'stroke-width')>0){
        const dash=nums(node.getAttribute('stroke-dasharray')??'').map(n);
        commands.push(states.opacity(stroke.alpha*opacity('stroke-opacity')),
          `${stroke.rgb} RG ${n(number(node,'stroke-width'))} w [${dash.join(' ')}] 0 d ${outline} S`);
      }
    }
    for(const child of node.children)draw(child);
    commands.push('Q');
  };
  for(const child of guides.children)draw(child);
  commands.push('Q');
  const outline=layer.querySelector('[data-custom-mask-outline]');
  if(outline) draw(outline);
  commands.push('Q');
  return commands;
}
