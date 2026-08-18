import type { LayoutElement } from './types';
export function moveLayer(items:LayoutElement[], id:string, delta:-1|1){ const i=items.findIndex(e=>e.id===id); const j=i+delta; if(i<1||j<1||j>=items.length)return items; const next=[...items]; [next[i],next[j]]=[next[j],next[i]]; return next; }
export function removeLayer(items:LayoutElement[],id:string){return id==='page'?items:items.filter(e=>e.id!==id)}
