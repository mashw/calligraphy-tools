export type ArtworkViewBox = { x: number; y: number; width: number; height: number };
export type ArtworkNode = { tag: 'g'|'path'|'rect'|'circle'|'ellipse'|'polygon'|'polyline'|'line'; attrs: Record<string,string>; children: ArtworkNode[] };
export type ArtworkDocument = { viewBox: ArtworkViewBox; nodes: ArtworkNode[]; warning: string | null };

const MAX_FILE_BYTES=2_000_000,MAX_NODES=2_000;
const TAGS=new Set(['g','path','rect','circle','ellipse','polygon','polyline','line']);
const ATTRS=new Set(['d','points','transform','fill','stroke','stroke-width','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2']);
const GEOMETRY=new Set(['path','rect','circle','ellipse','polygon','polyline','line']);
const safePaint=(value:string)=>!/(?:url\s*\(|javascript:|data:|https?:|\/\/)/i.test(value);
const harmlessAttribute=(attribute:Attr)=>attribute.localName==='id'||attribute.name.startsWith('data-')||attribute.name.startsWith('aria-')||attribute.name.startsWith('xmlns')||['inkscape','sodipodi','adobe','ai','i'].includes(attribute.prefix??'')||['role','version','baseProfile','space','enable-background'].includes(attribute.localName);
const harmlessElement=(tag:string)=>['metadata','title','desc','namedview'].includes(tag);
const rootStyleHasMaterialRemoval=(style:string)=>style.split(';').some(declaration=>{const separator=declaration.indexOf(':');if(separator<0)return false;const property=declaration.slice(0,separator).trim();return !!property&&property!=='enable-background';});

export function pathHasOnlyClosedSubpaths(d:string){let active=false,closed=false;for(let i=0;i<d.length;i++){const c=d[i];if(!'MmZzLlHhVvCcSsQqTtAa'.includes(c))continue;if(c==='M'||c==='m'){if(active&&!closed)return false;active=true;closed=false;}else if(c==='Z'||c==='z'){if(active)closed=true;}else if(active&&closed){closed=false;}}return active&&closed;}

export function sanitizeArtworkSvg(source:string):ArtworkDocument{
  if(new Blob([source]).size>MAX_FILE_BYTES)throw new Error('SVG file is larger than the 2 MB limit.');
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
  if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('This file is not a valid SVG.');
  const raw=parsed.documentElement.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(!raw||raw.length!==4||raw.some(value=>!Number.isFinite(value))||raw[2]<=0||raw[3]<=0)throw new Error('SVG must have a valid viewBox.');
  let count=0,removed=[...parsed.documentElement.attributes].some(attribute=>!['viewBox','width','height'].includes(attribute.name)&&!harmlessAttribute(attribute)&&(attribute.localName!=='style'||rootStyleHasMaterialRemoval(attribute.value))),geometry=0;
  const visit=(element:Element):ArtworkNode|null=>{
    const tag=element.localName;
    if(!TAGS.has(tag)){if(!harmlessElement(tag))removed=true;return null;}
    if(++count>MAX_NODES)throw new Error(`SVG exceeds the ${MAX_NODES} element limit.`);
    const attrs:Record<string,string>={};
    for(const attribute of [...element.attributes]){
      const name=attribute.localName;
      if(name==='style'){for(const declaration of attribute.value.split(';')){const separator=declaration.indexOf(':');if(separator<0)continue;const property=declaration.slice(0,separator).trim(),value=declaration.slice(separator+1).trim();if(ATTRS.has(property)&&safePaint(value))attrs[property]=value;else if(property!=='enable-background'&&property)removed=true;}continue;}
      if(!ATTRS.has(name)||name.startsWith('on')||!safePaint(attribute.value)){if(!harmlessAttribute(attribute))removed=true;continue;}
      attrs[name]=attribute.value;
    }
    const children=[...element.children].map(visit).filter((node):node is ArtworkNode=>!!node);
    if(GEOMETRY.has(tag))geometry++;
    return {tag:tag as ArtworkNode['tag'],attrs,children};
  };
  const nodes=[...parsed.documentElement.children].map(visit).filter((node):node is ArtworkNode=>!!node);
  if(!geometry)throw new Error('SVG contains no supported vector geometry.');
  return{viewBox:{x:raw[0],y:raw[1],width:raw[2],height:raw[3]},nodes,warning:removed?'Some unsupported SVG features were removed.':null};
}
