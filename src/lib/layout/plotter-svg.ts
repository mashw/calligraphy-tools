export type ExportLayering = 'combined'|'elements';
export type PlotterSvgLayer = { elementId:string; name:string; pathData:string };

const escapeAttribute=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function safeLayerId(name:string,elementId:string){
  const base=name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'layer';
  const stable=elementId.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'element';
  let hash=2166136261;for(let index=0;index<elementId.length;index++){hash^=elementId.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return `layout-${base}-${stable}-${(hash>>>0).toString(36)}`;
}

export function serializePlotterSvg({width,height,strokeWidth,anchorPath,layers,layering,format}:{width:number;height:number;strokeWidth:number;anchorPath:string;layers:PlotterSvgLayer[];layering:ExportLayering;format:(value:number)=>string}){
  const paint=`fill="none" stroke="#000000" stroke-width="${format(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"`;
  const registration=anchorPath?`<g id="cricut-registration" data-name="Cricut registration"><path d="${anchorPath}" ${paint}/></g>`:'';
  const drawing=layering==='combined'
    ? `<path d="${[anchorPath,...layers.map(layer=>layer.pathData)].filter(Boolean).join(' ')}" ${paint}/>`
    : `${registration}${layers.filter(layer=>layer.pathData).map(layer=>`<g id="${escapeAttribute(safeLayerId(layer.name,layer.elementId))}" data-name="${escapeAttribute(layer.name)}"><path d="${layer.pathData}" ${paint}/></g>`).join('')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}mm" height="${format(height)}mm" viewBox="0 0 ${format(width)} ${format(height)}">${drawing}</svg>`;
}
