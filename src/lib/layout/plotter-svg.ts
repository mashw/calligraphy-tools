export type ExportLayering = 'combined'|'elements';
export type PlotterSvgLayer = { elementId:string; name:string; pathData:string };
export type PlotterSvgViewport = { x:number; y:number; width:number; height:number };

export function drawableGeometryBounds(lines:{points:{x:number;y:number}[]}[]):PlotterSvgViewport|null{
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,found=false;
  for(const line of lines){
    for(const point of line.points){
      if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
      found=true;
      if(point.x<minX)minX=point.x;
      if(point.y<minY)minY=point.y;
      if(point.x>maxX)maxX=point.x;
      if(point.y>maxY)maxY=point.y;
    }
  }
  if(!found)return null;
  return{x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}

const escapeAttribute=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const MM_PER_INCH=25.4;
const formatPhysicalInches=(millimetres:number)=>{
  const value=millimetres/MM_PER_INCH;
  return value.toFixed(10).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
};
export function safeLayerId(name:string,elementId:string){
  const base=name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'layer';
  const stable=elementId.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'element';
  let hash=2166136261;for(let index=0;index<elementId.length;index++){hash^=elementId.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return `layout-${base}-${stable}-${(hash>>>0).toString(36)}`;
}

export function serializePlotterSvg({viewport,strokeWidth,anchorPath,layers,layering,format}:{viewport:PlotterSvgViewport;strokeWidth:number;anchorPath:string;layers:PlotterSvgLayer[];layering:ExportLayering;format:(value:number)=>string}){
  const paint=`fill="none" stroke="#000000" stroke-width="${format(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"`;
  const registration=anchorPath?`<g id="cricut-registration" data-name="Cricut registration"><path d="${anchorPath}" ${paint}/></g>`:'';
  const drawing=layering==='combined'
    ? `<path d="${[anchorPath,...layers.map(layer=>layer.pathData)].filter(Boolean).join(' ')}" ${paint}/>`
    : `${registration}${layers.filter(layer=>layer.pathData).map(layer=>`<g id="${escapeAttribute(safeLayerId(layer.name,layer.elementId))}" data-name="${escapeAttribute(layer.name)}"><path d="${layer.pathData}" ${paint}/></g>`).join('')}`;
  // Cricut Design Space has been observed to misinterpret root SVG mm dimensions.
  // Keep viewBox/path coordinates in Layout millimetres, but express the physical
  // root dimensions in inches for reliable Design Space import sizing.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatPhysicalInches(viewport.width)}in" height="${formatPhysicalInches(viewport.height)}in" viewBox="${format(viewport.x)} ${format(viewport.y)} ${format(viewport.width)} ${format(viewport.height)}">${drawing}</svg>`;
}
