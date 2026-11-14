import { openSheet } from './document';
import { renderSheet, type Sheet } from './model';
import { sceneSvg } from '../woven/vector-export';

export const INTERLACE_SOURCE_FORMAT='calligraphy-tools/interlace-source';
export type InterlaceSource={format:typeof INTERLACE_SOURCE_FORMAT;version:1;document:Sheet};
export function validateInterlaceSource(value:unknown):InterlaceSource {
  if(new TextEncoder().encode(JSON.stringify(value)).length>1_000_000)throw Error('Interlace source exceeds the 1 MB limit.');
  const v=value as Partial<InterlaceSource>|null;
  if(!v||v.format!==INTERLACE_SOURCE_FORMAT||v.version!==1||v.document?.format!=='calligraphy-tools/interlace')throw Error('Unsupported embedded Interlace source.');
  return {format:INTERLACE_SOURCE_FORMAT,version:1,document:openSheet(v.document).sheet};
}
export function exportForLayout(sheet:Sheet) {
  const source=validateInterlaceSource({format:INTERLACE_SOURCE_FORMAT,version:1,document:sheet});
  const scene=renderSheet(source.document,undefined,{ruler:false});
  if(!scene.strokes.length)throw Error('No visible writing guides to export.');
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const s of scene.strokes)for(const p of s.points){left=Math.min(left,p.x-s.width/2);top=Math.min(top,p.y-s.width/2);right=Math.max(right,p.x+s.width/2);bottom=Math.max(bottom,p.y+s.width/2);}
  const xml=sceneSvg({...scene,page:{w:right-left,h:bottom-top},strokes:scene.strokes.map(s=>({...s,points:s.points.map(p=>({x:p.x-left,y:p.y-top}))}))});
  const data=JSON.stringify(source).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const result=xml.replace('</svg>',`<metadata id="${INTERLACE_SOURCE_FORMAT}">${data}</metadata></svg>`);
  if(new TextEncoder().encode(result).length>2_000_000||scene.strokes.length>2000)throw Error('This design exceeds Layout’s 2 MB / 2000 vector element import limit. Reduce the guide density.');
  return result;
}
export function readInterlaceSource(xml:string) {
  const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
  const nodes=[...doc.querySelectorAll('metadata')].filter(n=>n.id===INTERLACE_SOURCE_FORMAT);
  if(!nodes.length)return undefined;
  if(nodes.length!==1||nodes[0].children.length)throw Error('Invalid embedded Interlace metadata.');
  const source=validateInterlaceSource(JSON.parse(nodes[0].textContent??''));
  const mm=(name:string)=>{const raw=doc.documentElement.getAttribute(name)??'';if(!/^(?:\d+\.?\d*|\.\d+)mm$/.test(raw))throw Error('Interlace artwork must declare millimetre dimensions.');const n=parseFloat(raw);if(!(n>0&&n<=10000))throw Error('Invalid Interlace dimensions.');return n;};
  const width=mm('width'),height=mm('height'),box=doc.documentElement.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(!box||box.length!==4||box.some(n=>!Number.isFinite(n))||Math.abs(box[2]/box[3]-width/height)>1e-6)throw Error('Interlace artwork aspect ratio is inconsistent.');
  return {source,width,height};
}
