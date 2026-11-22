import { customMaskPdfCommands } from './custom-mask-pdf';
import { usesCustomMask } from './custom-mask';
import type { LayoutElement } from './types';
import { layoutWovenModel, layoutWovenTags } from './woven';
import { elementRotationCenter } from './element-transform';
import { rotatePoint } from './geometry';
import { computeRasterPxPerMM } from '@/lib/export/raster-export';
import { pdfTagCommands } from '@/lib/guides/sheet-labels';

const encoder=new TextEncoder();
const bytes=(s:string)=>encoder.encode(s);
const n=(v:number)=>v.toFixed(5);
const pt=(v:number)=>v*72/25.4;
const rgb=(color:string)=>[1,3,5].map(i=>n(parseInt(color.slice(i,i+2),16)/255)).join(' ');
async function deflate(input:Uint8Array) {
  const stream=new Blob([new Uint8Array(input)]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function rasterLayer(svg:SVGSVGElement,width:number,height:number) {
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  try {
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d')!;context.drawImage(image,0,0,width,height);
    const rgba=context.getImageData(0,0,width,height).data;
    const colors=new Uint8Array(width*height*3),alpha=new Uint8Array(width*height);
    for(let p=0;p<alpha.length;p++){colors.set(rgba.subarray(p*4,p*4+3),p*3);alpha[p]=rgba[p*4+3];}
    return {colors:await deflate(colors),alpha:await deflate(alpha)};
  } finally {URL.revokeObjectURL(url);}
}

/** Preserve the original layer order while emitting supported layers as native vectors. */
export async function layeredLayoutPdf(svg:SVGSVGElement,elements:LayoutElement[],page:{width:number;height:number}):Promise<Blob> {
  const objects:Uint8Array[]=[bytes('<< /Type /Catalog /Pages 2 0 R >>'),bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),bytes(''),bytes(''),bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')];
  const add=(body:Uint8Array)=>{objects.push(body);return objects.length;};
  const stream=(dictionary:string,data:Uint8Array)=>{const before=bytes(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),after=bytes('\nendstream'),out=new Uint8Array(before.length+data.length+after.length);out.set(before);out.set(data,before.length);out.set(after,before.length+data.length);return out;};
  const width=pt(page.width),height=pt(page.height),commands=[`q 0 0 ${n(width)} ${n(height)} re W n 1 J 1 j`],images:string[]=[];
  const graphicsStates=new Map<string,{name:string;id:number}>();
  const state=(key:string,dictionary:string)=>{
    let entry=graphicsStates.get(key);
    if(!entry){
      entry={name:`GS${graphicsStates.size}`,id:add(bytes(`<< /Type /ExtGState ${dictionary} >>`))};
      graphicsStates.set(key,entry);
    }
    return `/${entry.name} gs`;
  };
  const states={
    opacity:(alpha:number)=>state(`opacity-${n(alpha)}`,`/ca ${n(alpha)} /CA ${n(alpha)}`),
    padding:(w:number,h:number,content:string)=>{
      const form=add(stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${n(w)} ${n(h)}] /Group << /S /Transparency /CS /DeviceGray /I true >> /Resources << >>`,bytes(content)));
      return state(`mask-${form}`,`/SMask << /S /Luminosity /G ${form} 0 R >>`);
    },
  };
  const {wPx,hPx}=computeRasterPxPerMM(page.width,page.height);
  for(const element of [...elements].reverse()) {
    if(element.type==='page'||element.visible===false)continue;
    if(element.type==='woven') {
      const model=layoutWovenModel(element),scene=element.settings.annotated?model.annotated:model.clean;
      const center=elementRotationCenter(element),angle=element.rotationDeg??0;
      const locate=(p:{x:number;y:number})=>rotatePoint({x:p.x+element.frame.x,y:p.y+element.frame.y},center,angle);
      commands.push('% Woven vector layer');
      for(const stroke of scene.strokes){commands.push(`${rgb(stroke.color)} RG ${n(pt(stroke.width))} w`);stroke.points.forEach((p,i)=>{const q=locate(p);commands.push(`${n(pt(q.x))} ${n(height-pt(q.y))} ${i?'l':'m'}`);});commands.push('S');}
      for(const label of scene.labels){const p=locate(label.point),r=-angle*Math.PI/180,text=label.text.replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');commands.push(`BT /F1 ${n(pt(label.size))} Tf ${rgb(label.color)} rg ${n(Math.cos(r))} ${n(Math.sin(r))} ${n(-Math.sin(r))} ${n(Math.cos(r))} ${n(pt(p.x))} ${n(height-pt(p.y))} Tm (${text}) Tj ET`);}
      for (const tag of layoutWovenTags(scene, element.frame, angle, page)) commands.push(pdfTagCommands(tag, p => p, page.height));
      continue;
    }
    if(element.type==='guidelines'&&(usesCustomMask(element)||element.mask?.enabled&&element.mask.arrangement)){
      const layer=Array.from(svg.querySelectorAll('[data-layout-id]')).find(node=>node.getAttribute('data-layout-id')===element.id);
      if(layer) {
        commands.push('% Custom SVG mask vector layer',customMaskPdfCommands(layer,element,height,states).join('\n'));
        const text = layer.querySelector('[data-guide-label="header"]');
        if (text) {
          const angle = element.rotationDeg ?? 0, centre = elementRotationCenter(element);
          const content = text.textContent ?? '';
          const size = Number(text.getAttribute('font-size'));
          const x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y'));
          const available = Number(text.getAttribute('textLength')) || Infinity;
          const labelSize = Math.min(size, available / Math.max(1, content.length * .61));
          commands.push(pdfTagCommands({
            text: content, size: labelSize, point: { x, y }, align: 'start',
          }, p => rotatePoint(p, centre, angle), page.height, angle));
        }
      }
      continue;
    }
    const layer=svg.cloneNode(true) as SVGSVGElement;
    layer.style.removeProperty('background');
    Array.from(layer.children).forEach(child=>{if(child.tagName==='rect')child.remove();});
    layer.querySelectorAll('[data-layout-id]').forEach(node=>{if(node.getAttribute('data-layout-id')!==element.id)node.remove();});
    const raster=await rasterLayer(layer,wPx,hPx);
    const mask=add(stream(`/Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,raster.alpha));
    const image=add(stream(`/Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${mask} 0 R`,raster.colors));
    const name=`Im${images.length}`;images.push(`/${name} ${image} 0 R`);commands.push(`q ${n(width)} 0 0 ${n(height)} 0 0 cm /${name} Do Q`);
  }
  commands.push('Q');
  const extGState=Array.from(graphicsStates.values(),entry=>`/${entry.name} ${entry.id} 0 R`).join(' ');
  objects[2]=bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 5 0 R >> /XObject << ${images.join(' ')} >> /ExtGState << ${extGState} >> >> /Contents 4 0 R >>`);
  objects[3]=stream('',bytes(commands.join('\n')));
  const chunks:Uint8Array[]=[bytes('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
  objects.forEach((body,i)=>{offsets.push(length);const prefix=bytes(`${i+1} 0 obj\n`),suffix=bytes('\nendobj\n');chunks.push(prefix,body,suffix);length+=prefix.length+body.length+suffix.length;});
  const xref=length;chunks.push(bytes(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob(chunks.map(chunk=>new Uint8Array(chunk)),{type:'application/pdf'});
}
