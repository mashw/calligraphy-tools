import GuideOverlay from '@/components/preview/GuideOverlay';
import { buildStraightSlantLines, calculateStraightGuidelines } from '@/lib/guides/straight/model';
import type { GuidelinesSettings } from '@/lib/guides/straight/settings';

const rgba = (hex: string, alpha: number) => { const raw = hex.replace('#', ''); const value = parseInt(raw, 16); return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`; };
const gridColor = (contrast: number) => { const t = Math.max(0, (Math.max(0, Math.min(1, contrast)) - .5) / .5); const v = Math.round(226 * (1 - t)); return `rgb(${v},${Math.round(232*(1-t))},${Math.round(240*(1-t))})`; };

export default function GuidelinesRenderer({ box, settings, idPrefix }: { box: { width: number; height: number }; settings: GuidelinesSettings; idPrefix: string }) {
  const model = calculateStraightGuidelines(box, settings);
  const swThin = Math.max(.35, Math.min(.7, Math.min(box.width, box.height) * .0025)); const swBold = swThin * 1.8;
  const high = settings.appearance.highContrast; const alpha = high ? 1 : settings.appearance.xLineContrast;
  const clipId = `${idPrefix}-clip`; const maskId = `${idPrefix}-row-mask`;
  const slants = (angle: number) => buildStraightSlantLines(model.guideSets, box, settings.slant.spacingMM, angle);
  return <g>
    <defs><clipPath id={clipId}><rect x={settings.margins.left} y="0" width={Math.max(0, box.width-settings.margins.left-settings.margins.right)} height={Math.max(0, box.height-settings.margins.bottom)} /></clipPath>
      <mask id={maskId}><rect width={box.width} height={box.height} fill="black" />{model.guideSets.map((set, index) => <rect key={index} x={set.baseLine[0].x} y={set.ascLine[0].y} width={set.baseLine.at(-1)!.x-set.baseLine[0].x} height={set.descLine[0].y-set.ascLine[0].y} fill="white" />)}</mask>
    </defs>
    <g clipPath={`url(#${clipId})`}>
      {settings.script === 'Copperplate' && [settings.slant.angle, ...(settings.slant.secondEnabled ? [settings.slant.secondAngle] : [])].flatMap((angle, group) => slants(angle).map((line, index) => <line key={`${group}-${index}`} {...line} stroke="#000" strokeOpacity={high ? 1 : settings.slant.contrast} strokeWidth={swThin} vectorEffect="non-scaling-stroke" mask={`url(#${maskId})`} />))}
      {settings.appearance.centerLine && <line x1={box.width/2} x2={box.width/2} y1={settings.margins.top} y2={box.height-settings.margins.bottom} stroke="#000" strokeWidth={high ? swBold : swThin} vectorEffect="non-scaling-stroke" />}
      {model.guideSets.map((set, index) => { const x1=set.baseLine[0].x,x2=set.baseLine.at(-1)!.x; const midA=(set.ascLine[0].y+set.waistLine[0].y)/2,midD=(set.descLine[0].y+set.baseLine[0].y)/2; return <g key={index}>
        {settings.appearance.baselineIndicator && <circle cx={x1+3} cy={(set.waistLine[0].y+set.baseLine[0].y)/2} r=".9" fill={rgba(settings.appearance.baselineColor,alpha)} />}
        {settings.script === 'Copperplate' && [midA,midD].map(y => <line key={y} x1={x1} x2={x2} y1={y} y2={y} stroke={rgba('#111827',high?1:settings.appearance.midpointDashContrast)} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={`6 ${settings.appearance.midpointDashGap}`} />)}
        <GuideOverlay guideSet={set} style={{ thin: swBold*(high?1.8:settings.appearance.xLineThickness), bold: swBold*(high?1.8:settings.appearance.xLineThickness), colors: { asc:rgba('#111827',alpha),desc:rgba('#111827',alpha),base:rgba(high?'#111827':settings.appearance.baselineColor,alpha),waist:rgba(high?'#111827':settings.appearance.waistlineColor,alpha),construction:high?'#111827':(settings.constructionGuides?.color ?? '#dc2626'),tick:settings.script==='Copperplate'?'transparent':'#e2e8f0',frame:'transparent' }, grid: settings.script!=='Copperplate'?{thin:swBold*Math.min(high?1.4:settings.grid.thickness,1.4),colors:{tick:gridColor(settings.grid.contrast)},showHorizontal:settings.grid.horizontal,showVertical:settings.grid.vertical,showNibAngleGuide:settings.grid.nibAngleGuide,nibAngleDeg:settings.penAngleDeg}:undefined }} />
      </g>; })}
    </g>
  </g>;
}
