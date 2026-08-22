import { createElement, type ReactNode } from 'react';
import type { ArtworkElement } from '@/lib/layout/types';
import { pathHasOnlyClosedSubpaths, type ArtworkNode } from '@/lib/layout/artwork';
import { PAGE_BACKGROUND } from '@/lib/layout/shape';

const names:Record<string,string>={'stroke-width':'strokeWidth','fill-rule':'fillRule','clip-rule':'clipRule','fill-opacity':'fillOpacity','stroke-opacity':'strokeOpacity','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin','stroke-miterlimit':'strokeMiterlimit'};
type Paint={fill:string;stroke:string;strokeWidth:string};
const closed=(node:ArtworkNode)=>['rect','circle','ellipse','polygon'].includes(node.tag)||node.tag==='path'&&pathHasOnlyClosedSubpaths(node.attrs.d??'');
function renderNode(node:ArtworkNode,key:string,occlusion:boolean,closedShapes:boolean,inherited:Paint):ReactNode{
  const paint={fill:node.attrs.fill??inherited.fill,stroke:node.attrs.stroke??inherited.stroke,strokeWidth:node.attrs['stroke-width']??inherited.strokeWidth};
  const attrs=Object.fromEntries(Object.entries(node.attrs).map(([name,value])=>[names[name]??name,value]));
  if(occlusion){attrs.opacity='1';attrs.fillOpacity='1';attrs.strokeOpacity='1';}
  if(occlusion&&node.tag!=='g'){
    const paintedFill=paint.fill!=='none',paintedStroke=paint.stroke!=='none'&&Number.parseFloat(paint.strokeWidth)>0;
    attrs.fill=paintedFill||closedShapes&&closed(node)?PAGE_BACKGROUND:'none';
    attrs.stroke=paintedStroke?PAGE_BACKGROUND:'none';
  }
  return createElement(node.tag,{...attrs,key},node.children.map((child,index)=>renderNode(child,`${key}-${index}`,occlusion,closedShapes,paint)));
}
export default function ArtworkRenderer({element,frame}:{element:ArtworkElement;frame:ArtworkElement['frame']}){
  const {viewBox,nodes}=element.document,base:Paint={fill:'black',stroke:'none',strokeWidth:'1'};
  const content=(occlusion:boolean)=>nodes.map((node,index)=>renderNode(node,String(index),occlusion,element.settings.occludeClosedShapes,base));
  return <svg x={frame.x} y={frame.y} width={frame.width} height={frame.height} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none" overflow="visible">
    {element.settings.occludeLowerLayers&&element.settings.opacity>0&&<g>{content(true)}</g>}<g opacity={element.settings.opacity/100}>{content(false)}</g>
  </svg>;
}
