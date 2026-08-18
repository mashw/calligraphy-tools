import GuideOverlay from '@/components/preview/GuideOverlay';
import { buildGuideSet } from '@/lib/guides/guide-template';
import { buildPreset, pathD, sample } from '@/lib/curve-helpers';
import type { MovableElement } from '@/lib/layout/types';

const line=(w:number,y:number)=>[{x:0,y},{x:w,y}];
export default function ElementRenderer({element}:{element:MovableElement}){
 const {width:w,height:h}=element.frame;
 if(element.type==='guidelines'){
  const s=element.settings, rows=[]; const stride=s.ascender+s.xHeight+s.descender+s.rowGap;
  for(let base=s.margin+s.ascender+s.xHeight;base+s.descender<=h-s.margin;base+=stride) rows.push(buildGuideSet(s.script,{baseline:line(w-s.margin*2,base).map(p=>({...p,x:p.x+s.margin})),xMM:s.xHeight,ascMM:s.ascender,descMM:s.descender,tickStepMM:s.grid?s.xHeight:999,actualNibMM:s.xHeight/5}));
  return <>{rows.map((g,i)=><GuideOverlay key={i} box={{w,h}} guideSet={g} style={{thin:.25,bold:.35,colors:{thin:s.highContrast?'#334155':'#94a3b8',bold:'#334155'},grid:{thin:.18,showHorizontal:s.grid,showVertical:s.grid}}}/>)}</>;
 }
 if(element.type==='curve'){
  const cubic=buildPreset(element.settings.preset,{w,h}); const pts=sample(cubic.p0,cubic.p1,cubic.p2,cubic.p3,180); const guide=buildGuideSet('blackletter',{baseline:pts,xMM:4,ascMM:8,descMM:5,tickStepMM:5,actualNibMM:1});
  return <><GuideOverlay box={{w,h}} guideSet={guide} style={{thin:.25,bold:.4}}/><path d={pathD(pts)} fill="none" stroke="#111827" strokeWidth=".3"/><text fontSize="5" fill="#111827"><textPath href={`#unused`}>{element.settings.text}</textPath></text></>;
 }
 if(element.type==='calligram'){
  const r=Math.min(w,h)/2-7,cx=w/2,cy=h/2; return <g fill="none" stroke="#334155"><circle cx={cx} cy={cy} r={r} strokeWidth=".45"/>{element.settings.innerBand&&<circle cx={cx} cy={cy} r={r-4} strokeWidth=".25"/>}{element.settings.outerBand&&<circle cx={cx} cy={cy} r={r+4} strokeWidth=".25"/>}<text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#111827" stroke="none" fontSize="5">{element.settings.text}</text></g>;
 }
 const s=element.settings, fill=s.mode==='fill'||s.mode==='both'?s.fill:'white', stroke=s.mode==='border'||s.mode==='both'?s.border:'none';
 return s.shape==='ellipse'?<ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={s.borderWidth}/>:<rect width={w} height={h} rx={s.shape==='rounded'?Math.min(5,w/6,h/6):0} fill={fill} stroke={stroke} strokeWidth={s.borderWidth}/>;
}
