'use client';

import GuidelinesSettingsPanel from '@/components/guidelines/GuidelinesSettingsPanel';
import DisclosureSection from '@/components/layout/DisclosureSection';
import { PAPERS_MM, type Orientation, type PaperId } from '@/lib/curve-helpers';
import { alignContent, pageContentRect, sizeToPageContent, type Alignment } from '@/lib/layout/geometry';
import { pageSize, type LayoutElement, type PageElement } from '@/lib/layout/types';
import { constrainFrameToSquare, createDefaultShapeSettings, isConstrainedShape, SHAPE_OPTIONS, type ShapeAppearance, type ShapeKind } from '@/lib/layout/shape';
import CurvedTitleSettingsPanel from '@/components/curved-title/CurvedTitleSettingsPanel';
import CalligramSettingsPanel from '@/components/calligram/CalligramSettingsPanel';
import { SettingsAccordion } from '@/components/layout/SettingsAccordion';
import { getNearestCompleteGuidelinesHeight } from '@/lib/guides/straight/model';

const input = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';
const smallButton = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const sectionClass = '';

function MillimetreField({ label, value, onChange, min, whole = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; whole?: boolean }) {
  const displayed = whole ? Math.round(value) : value;
  return <label className="space-y-1 text-xs font-medium capitalize text-slate-600">{label}<div className="relative"><input className={input} type="number" step={whole ? 1 : .5} min={min} value={displayed} onChange={event => { const parsed = Number(event.target.value); const next = whole ? Math.round(parsed) : parsed; if (Number.isFinite(next) && (min === undefined || next >= min)) onChange(next); }} /><span className="pointer-events-none absolute right-2 top-1.5 text-slate-400">mm</span></div></label>;
}

export default function LayoutInspector({ element, page, onChange }: { element: LayoutElement; page: PageElement; onChange: (element: LayoutElement) => void }) {
  const pageRect = pageContentRect(pageSize(page), page.settings.margins);
  const internalMargins = element.type === 'guidelines' ? element.settings.margins : { top: 0, right: 0, bottom: 0, left: 0 };
  const patchFrame = (key: 'x' | 'y' | 'width' | 'height', value: number) => {
    let frame = { ...element.frame, [key]: value };
    if (element.type === 'guidelines' && key === 'height' && !element.allowPartialGuidelines) frame.height = getNearestCompleteGuidelinesHeight(element.settings, value);
    if (element.type === 'shape' && isConstrainedShape(element.settings) && (key === 'width' || key === 'height')) {
      frame = key === 'width'
        ? { ...frame, height: value, y: element.frame.y + (element.frame.height - value) / 2 }
        : { ...frame, width: value, x: element.frame.x + (element.frame.width - value) / 2 };
    }
    if (element.type === 'calligram' && (key === 'width' || key === 'height')) {
      const diameter = value;
      frame = { ...frame, width: diameter, height: diameter, x: key === 'height' ? element.frame.x + (element.frame.width - diameter) / 2 : frame.x, y: key === 'width' ? element.frame.y + (element.frame.height - diameter) / 2 : frame.y };
      onChange({ ...element, frame, settings: { ...element.settings, radiusMM: Math.max(5, element.settings.radiusMM + (diameter - element.frame.width) / 2) } }); return;
    }
    onChange({ ...element, frame });
  };
  const align = (alignment: Alignment) => { if (element.type !== 'page') onChange({ ...element, frame: alignContent(element.frame, internalMargins, pageRect, alignment) }); };
  const quickSize = (axis: 'width' | 'height', fraction: 0.5 | 1) => {
    if (element.type === 'page') return;
    let frame = sizeToPageContent(element.frame, internalMargins, pageRect, axis, fraction);
    if (element.type === 'calligram') { const diameter=axis==='width'?frame.width:frame.height; frame={...frame,width:diameter,height:diameter}; onChange({...element,frame,settings:{...element.settings,radiusMM:Math.max(5,element.settings.radiusMM+(diameter-element.frame.width)/2)}}); return; }
    if (element.type === 'shape' && isConstrainedShape(element.settings)) frame = axis === 'width'
      ? { ...frame, height: frame.width, y: element.frame.y + (element.frame.height - frame.width) / 2 }
      : { ...frame, width: frame.height, x: element.frame.x + (element.frame.width - frame.height) / 2 };
    if (element.type === 'guidelines' && axis === 'height') {
      if (fraction === 1) { onChange({ ...element, allowPartialGuidelines: true, frame }); return; }
      if (!element.allowPartialGuidelines) frame.height = getNearestCompleteGuidelinesHeight(element.settings, frame.height);
    }
    onChange({ ...element, frame });
  };
  const changeShapeKind = (kind: ShapeKind) => {
    if (element.type !== 'shape') return;
    const constrained = isConstrainedShape({ ...element.settings, kind });
    const frame = constrained && !isConstrainedShape(element.settings) ? constrainFrameToSquare(element.frame) : element.frame;
    onChange({ ...element, frame, settings: { ...element.settings, kind } });
  };

  return <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <h2 className="font-semibold text-slate-800">Settings <span className="font-normal text-slate-400">—</span> {element.name}</h2>
    <SettingsAccordion sessionKey={element.id} defaultTitle={element.type === 'page' ? 'Page' : 'Position & Size'}>
      {element.type === 'page' ? <>
        <DisclosureSection title="Page" defaultOpen className={sectionClass}><div className="space-y-3"><label className="block space-y-1 text-xs font-medium text-slate-600">Paper size<select className={input} value={element.settings.paper} onChange={event => { const paper = event.target.value as PaperId; const settings = { ...element.settings, paper, orientation: PAPERS_MM[paper].defaultOrientation }; const size = pageSize({ ...element, settings }); onChange({ ...element, settings, frame: { x: 0, y: 0, ...size } }); }}>{Object.entries(PAPERS_MM).map(([id, paper]) => <option key={id} value={id}>{paper.label}</option>)}</select></label><label className="block space-y-1 text-xs font-medium text-slate-600">Orientation<select className={input} value={element.settings.orientation} onChange={event => { const settings = { ...element.settings, orientation: event.target.value as Orientation }; const size = pageSize({ ...element, settings }); onChange({ ...element, settings, frame: { x: 0, y: 0, ...size } }); }}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div></DisclosureSection>
        <DisclosureSection title="Page margins" defaultOpen className={sectionClass}><div className="grid grid-cols-2 gap-3">{(['top', 'right', 'bottom', 'left'] as const).map(key => <MillimetreField key={key} label={key} min={0} value={element.settings.margins[key]} onChange={value => onChange({ ...element, settings: { ...element.settings, margins: { ...element.settings.margins, [key]: value } } })} />)}</div></DisclosureSection>
        <DisclosureSection title="Centre lines" className={sectionClass}><div className="space-y-2">{(['vertical', 'horizontal'] as const).map(key => <label key={key} className="flex items-center justify-between text-sm text-slate-700"><span>Show {key} centre line</span><input type="checkbox" className="accent-indigo-600" checked={element.settings.centerLines[key]} onChange={event => onChange({ ...element, settings: { ...element.settings, centerLines: { ...element.settings.centerLines, [key]: event.target.checked } } })} /></label>)}</div></DisclosureSection>
      </> : <>
        <DisclosureSection title="Position & Size" defaultOpen className={sectionClass}>
          <div className="grid grid-cols-2 gap-3">{(['x', 'y', 'width', 'height'] as const).map(key => <MillimetreField key={key} label={key} whole min={key === 'width' || key === 'height' ? 4 : undefined} value={element.frame[key]} onChange={value => patchFrame(key, value)} />)}</div>
          {(element.type === 'guidelines' || element.type === 'shape' || element.type === 'curved-title' || element.type === 'calligram') && <><div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Align</div><div className="grid grid-cols-3 gap-2">{([['left', '←', 'Align left'], ['h-center', '↔', 'Align horizontal centre'], ['right', '→', 'Align right'], ['top', '↑', 'Align top'], ['v-center', '↕', 'Align vertical centre'], ['bottom', '↓', 'Align bottom']] as [Alignment, string, string][]).map(([action, symbol, title]) => <button key={action} type="button" title={title} aria-label={title} onClick={() => align(action)} className={smallButton}>{symbol}</button>)}</div></div>
            <div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick size</div><div className="grid grid-cols-2 gap-2"><button type="button" title="Set usable guideline width to half the usable page width" onClick={() => quickSize('width', .5)} className={smallButton}>½ Page width</button><button type="button" title="Set usable guideline width to the full usable page width" onClick={() => quickSize('width', 1)} className={smallButton}>Full width</button><button type="button" title="Set usable guideline height to half the usable page height" onClick={() => quickSize('height', .5)} className={smallButton}>½ Page height</button><button type="button" title="Set usable guideline height to the full usable page height" onClick={() => quickSize('height', 1)} className={smallButton}>Full height</button></div></div></>}
        </DisclosureSection>
        {element.type === 'guidelines' ? <GuidelinesSettingsPanel key={element.id} value={element.settings} onChange={settings => onChange({ ...element, settings, frame: element.allowPartialGuidelines ? element.frame : { ...element.frame, height: getNearestCompleteGuidelinesHeight(settings, element.frame.height) } })} paddingMM={element.paddingMM} onPaddingChange={paddingMM => onChange({ ...element, paddingMM })} allowPartialGuidelines={element.allowPartialGuidelines} onAllowPartialGuidelinesChange={allowPartialGuidelines => onChange({ ...element, allowPartialGuidelines, frame: allowPartialGuidelines ? element.frame : { ...element.frame, height: getNearestCompleteGuidelinesHeight(element.settings, element.frame.height) } })} /> : element.type === 'shape' ? <>
          <DisclosureSection title="Shape" defaultOpen className={sectionClass} headerAction={<button type="button" onClick={() => onChange({ ...element, paddingMM: 0, settings: createDefaultShapeSettings() })} className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">Reset</button>}><div className="space-y-3"><label className="block space-y-1 text-xs font-medium text-slate-600">Shape type<select className={input} value={element.settings.kind} onChange={event => changeShapeKind(event.target.value as ShapeKind)}>{SHAPE_OPTIONS.map(option => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select></label><MillimetreField label="Padding" min={0} value={element.paddingMM} onChange={paddingMM => onChange({ ...element, paddingMM })} />{(element.settings.kind === 'roundedRectangle' || element.settings.kind === 'roundedSquare') && <MillimetreField label="Corner radius" min={0} value={element.settings.cornerRadiusMM} onChange={value => onChange({ ...element, settings: { ...element.settings, cornerRadiusMM: value } })} />}</div></DisclosureSection>
          <DisclosureSection title="Appearance" defaultOpen className={sectionClass}><div className="space-y-3"><label className="block space-y-1 text-xs font-medium text-slate-600">Mode<select className={input} value={element.settings.appearance} onChange={event => onChange({ ...element, settings: { ...element.settings, appearance: event.target.value as ShapeAppearance } })}><option value="reserve">Reserve space only</option><option value="fill">Fill</option><option value="border">Border</option><option value="fillAndBorder">Fill + border</option></select></label>{(element.settings.appearance === 'fill' || element.settings.appearance === 'fillAndBorder') && <label className="block space-y-1 text-xs font-medium text-slate-600">Fill colour<input type="color" className="h-9 w-full rounded border border-slate-300" value={element.settings.fillColor} onChange={event => onChange({ ...element, settings: { ...element.settings, fillColor: event.target.value } })} /></label>}{(element.settings.appearance === 'border' || element.settings.appearance === 'fillAndBorder') && <><label className="block space-y-1 text-xs font-medium text-slate-600">Border colour<input type="color" className="h-9 w-full rounded border border-slate-300" value={element.settings.borderColor} onChange={event => onChange({ ...element, settings: { ...element.settings, borderColor: event.target.value } })} /></label><MillimetreField label="Border width" min={0} value={element.settings.borderWidthMM} onChange={value => onChange({ ...element, settings: { ...element.settings, borderWidthMM: value } })} /></>}</div></DisclosureSection>
        </> : element.type === 'curved-title' ? <CurvedTitleSettingsPanel value={element.settings} box={{ w: element.frame.width, h: element.frame.height }} paddingMM={element.paddingMM} onPaddingChange={paddingMM => onChange({ ...element, paddingMM })} onChange={settings => onChange({ ...element, settings })} /> : <CalligramSettingsPanel value={element.settings} box={{ w: element.frame.width, h: element.frame.height }} paddingMM={element.paddingMM} onPaddingChange={paddingMM => onChange({ ...element, paddingMM })} onChange={settings => { const diameter=element.frame.width+2*(settings.radiusMM-element.settings.radiusMM); onChange({...element,frame:{...element.frame,x:element.frame.x+(element.frame.width-diameter)/2,y:element.frame.y+(element.frame.height-diameter)/2,width:diameter,height:diameter},settings}); }} />}
      </>}
    </SettingsAccordion>
  </section>;
}
