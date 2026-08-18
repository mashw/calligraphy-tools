import GuideOverlay from '@/components/preview/GuideOverlay';
import { pathD, pointAt, type Pt } from '@/lib/curve-helpers';
import { buildCurvedTitleModel, type CurvedTitlePlace, type SpanPoly } from '@/lib/curved-title/model';
import type { CurvedTitleSettings } from '@/lib/curved-title/settings';
import type { ScriptId } from '@/lib/scripts';

const polyD=(poly:SpanPoly)=>`M ${poly.waistPts.map(p=>`${p.x},${p.y}`).join(' L ')} L ${[...poly.basePts].reverse().map(p=>`${p.x},${p.y}`).join(' L ')} Z`;

function LetterBoxes({placements,base,arcLen,height,script,prefix}:{placements:CurvedTitlePlace[];base:Pt[];arcLen:number;height:number;script:ScriptId;prefix:string}) {
  return <>{placements.map((pl,i)=>{const mid=Math.min(arcLen,Math.max(0,pl.sMid)),left=Math.max(0,mid-pl.w/2),right=Math.min(arcLen,mid+pl.w/2),steps=Math.max(16,Math.ceil((right-left)/2)),bottom:Pt[]=[],top:Pt[]=[];for(let k=0;k<=steps;k++){const at=left+(right-left)*k/steps,c=pointAt(base,at);bottom.push(c.p);const shift=script==='Copperplate'?height/Math.tan(55*Math.PI/180):0,ct=pointAt(base,Math.max(0,Math.min(arcLen,at+shift)));top.push({x:ct.p.x-ct.n.x*height,y:ct.p.y-ct.n.y*height});}const d=`M ${top.map(p=>`${p.x},${p.y}`).join(' L ')} L ${bottom.reverse().map(p=>`${p.x},${p.y}`).join(' L ')} Z`,cap=pl.ch>='A'&&pl.ch<='Z';return <path key={`${prefix}-${i}`} d={d} fill={cap?'rgba(99,102,241,.10)':'rgba(16,185,129,.10)'} stroke={cap?'#6366f1':'#10b981'} strokeWidth=".35" vectorEffect="non-scaling-stroke"/>})}</>;
}

export default function CurvedTitleRenderer({box,settings,idPrefix,pageBackground,paddingMM=0,selected=false}:{box:{w:number;h:number};settings:CurvedTitleSettings;idPrefix:string;pageBackground?:string;paddingMM?:number;selected?:boolean}) {
  const model=buildCurvedTitleModel(box,settings),topClip=`${idPrefix}-top`,bottomClip=`${idPrefix}-bottom`,style={thin:.38,bold:.65,colors:{thin:'#111827',bold:'#111827',tick:'#e2e8f0',frame:'transparent'}};
  return <g><defs><clipPath id={topClip}><path d={model.top.clip}/></clipPath><clipPath id={bottomClip}><path d={model.bottom.clip}/></clipPath></defs>
    {pageBackground&&<><path d={model.footprintD} pointerEvents="fill" fill={pageBackground}/>{paddingMM>0&&<path d={model.footprintD} fill="none" stroke={pageBackground} strokeWidth={paddingMM*2} strokeLinejoin="round" strokeLinecap="round"/>}</>}
    {selected&&paddingMM>0&&<path data-no-export="true" pointerEvents="none" d={model.footprintD} fill="none" stroke="#818cf8" strokeWidth={paddingMM*2} strokeDasharray="4 3" strokeOpacity=".5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
    <g>
    {model.midAscPts&&<path d={pathD(model.midAscPts)} fill="none" stroke="rgba(17,24,39,.35)" strokeWidth=".45" strokeDasharray="10 12" vectorEffect="non-scaling-stroke"/>}{model.midDescPts&&<path d={pathD(model.midDescPts)} fill="none" stroke="rgba(17,24,39,.35)" strokeWidth=".45" strokeDasharray="10 12" vectorEffect="non-scaling-stroke"/>}
    <GuideOverlay guideSet={model.guideSet} style={style}/>
    {model.top.enabled&&<g clipPath={`url(#${topClip})`}><GuideOverlay guideSet={model.top.guideSet} style={{...style,colors:{...style.colors,frame:'transparent',base:'transparent',desc:'transparent'}}}/></g>}
    {model.bottom.enabled&&<g clipPath={`url(#${bottomClip})`}><GuideOverlay guideSet={model.bottom.guideSet} style={{...style,colors:{...style.colors,frame:'transparent',asc:'transparent',waist:'transparent'}}}/></g>}
    {settings.showSpanFill&&model.spanPoly&&<path d={polyD(model.spanPoly)} fill="rgba(148,163,184,.18)" stroke="rgba(100,116,139,.55)" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>}
    {settings.showSpanFill&&model.top.spanPoly&&<path d={polyD(model.top.spanPoly)} fill="rgba(148,163,184,.18)" stroke="rgba(100,116,139,.55)" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>}{settings.showSpanFill&&model.bottom.spanPoly&&<path d={polyD(model.bottom.spanPoly)} fill="rgba(148,163,184,.18)" stroke="rgba(100,116,139,.55)" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>}
    {settings.showBoxes&&<LetterBoxes placements={model.layout.placements} base={model.guideSet.baseLine} arcLen={model.arcLen} height={model.xMM} script={settings.script} prefix={`${idPrefix}-main`}/>} {settings.showBoxes&&model.top.enabled&&<LetterBoxes placements={model.top.layout.placements} base={model.top.guideSet.baseLine} arcLen={model.top.arcLen} height={model.top.xMM} script={settings.topBandScript} prefix={`${idPrefix}-top-box`}/>} {settings.showBoxes&&model.bottom.enabled&&<LetterBoxes placements={model.bottom.layout.placements} base={model.bottom.guideSet.baseLine} arcLen={model.bottom.arcLen} height={model.bottom.xMM} script={settings.bottomBandScript} prefix={`${idPrefix}-bottom-box`}/>} 
  </g></g>;
}
