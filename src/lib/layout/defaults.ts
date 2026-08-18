import { PAPERS_MM } from '@/lib/curve-helpers';
import type { ElementType, LayoutElement, MovableElement, PageElement } from './types';

export const DEFAULT_PAGE: PageElement = { id: 'page', type: 'page', name: 'Page', locked: true, paper: 'A4', orientation: 'portrait' };
export function pageSize(page: PageElement) { const p = PAPERS_MM[page.paper]; return page.orientation === 'portrait' ? { width: Math.min(p.w,p.h), height: Math.max(p.w,p.h) } : { width: Math.max(p.w,p.h), height: Math.min(p.w,p.h) }; }
export function makeElement(type: ElementType, elements: LayoutElement[], page: PageElement): MovableElement {
  const n = elements.filter(e => e.type === type).length + 1, size = pageSize(page);
  const wh = type === 'guidelines' ? [Math.min(90,size.width-20), Math.min(180,size.height-20)] : type === 'curve' ? [Math.min(120,size.width-20),45] : type === 'calligram' ? [70,70] : [35,35];
  const base = { id: `${type}-${crypto.randomUUID()}`, type, name: `${type === 'curve' ? 'Curved title' : type[0].toUpperCase()+type.slice(1)} ${n}`, locked:false, frame:{x:(size.width-wh[0])/2,y:(size.height-wh[1])/2,width:wh[0],height:wh[1]} };
  if(type==='guidelines') return {...base,type,settings:{script:'copperplate',xHeight:4,ascender:4,descender:4,rowGap:3,margin:4,slant:true,grid:false,highContrast:false}};
  if(type==='curve') return {...base,type,settings:{text:'Curved title',preset:'simpleArch',showBands:true}};
  if(type==='calligram') return {...base,type,settings:{text:'Calligram',startAngle:-90,direction:'clockwise',innerBand:true,outerBand:true}};
  return {...base,type:'shape',settings:{shape:'rectangle',padding:4,mode:'reserve',fill:'#ffffff',border:'#111827',borderWidth:.6}};
}
