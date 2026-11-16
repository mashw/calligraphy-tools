import type { Scene } from '../woven/vector-export';
import type { textFit } from './text-fit';
export function highContrastScene(scene:Scene):Scene {
  return {...scene,strokes:scene.strokes.map(s=>({...s,color:s.guide==='baseline'?'#111827':s.guide==='waist'?'#1e40af':s.role==='construction'?'#9f1239':s.role==='primary'?'#475569':s.role==='grid'?'#64748b':'#475569',width:Math.max(s.width,s.role==='primary'?.24:s.role==='construction'?.2:.16)}))};
}
/** Vector position boxes, separate from pen guides and independent of fonts. */
export function textEstimateScene(fit:ReturnType<typeof textFit>):Scene {
  const scene:Scene={strokes:[],labels:[]};
  for(const line of fit.lines){
    for(const g of line.placements.filter(p=>p.sMid<=line.available+p.w/2)){
      const point=(x:number,y:number)=>({x:g.point.x+g.tangent.x*x-g.tangent.y*y,y:g.point.y+g.tangent.y*x+g.tangent.x*y});
      scene.strokes.push({points:[point(-g.w/2,0),point(-g.w/2,-g.h),point(g.w/2,-g.h),point(g.w/2,0),point(-g.w/2,0)],color:g.collision?'#b91c1c':'#4338ca',width:.15,role:'annotation'});
    }
    if(line.available)for(const p of [line.start,line.end])scene.strokes.push({points:[{x:p.x-1,y:p.y-1},{x:p.x+1,y:p.y+1}],color:line.fits?'#4338ca':'#b91c1c',width:.25,role:'annotation'});
  }
  return scene;
}
