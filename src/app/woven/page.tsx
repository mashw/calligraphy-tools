"use client";

import { NumericInput, Button, Select, ActionGroup } from '@/components/editor/Controls';
import NumericSlider from '@/components/editor/NumericSlider';
import PreviewMeta from '@/components/editor/PreviewMeta';
import CompactHelp from '@/components/editor/CompactHelp';
import { scaleShape, uniformScaleLimits, type ShapeDimensions } from '@/lib/woven/shape-controls';

import { useEditorCamera } from '@/components/editor/useEditorCamera';
import PreviewToolbar from '@/components/editor/PreviewToolbar';

import EditorWorkspace from '@/components/editor/EditorWorkspace';

import WovenSettings from '@/components/woven/WovenSettings';
import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import DisclosureSection from "@/components/layout/DisclosureSection";
import { PAPERS_MM } from "@/lib/curve-helpers";
import {
  DEFAULT_DESIGN,
  LIMITS,
  parseDesign,
  type Design,
} from "@/lib/woven/design";
import { WovenScene, WovenSimplified } from '@/components/woven/WovenRenderer';
import { sliceGuide } from '@/lib/woven/geometry';
import { buildWovenModel, buildWovenRouteModel } from "@/lib/woven/model";
import { pointsD, scenePdf, sceneSvg } from "@/lib/woven/vector-export";

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const button =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500";
type View = "autofit" | "fullpage" | "custom";
function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function WovenPage() {
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [scaleBase, setScaleBase] = useState<ShapeDimensions>({ width: DEFAULT_DESIGN.width, height: DEFAULT_DESIGN.height });
  const [selected, setSelected] = useState<string | null>(null);


  const [simplify,setSimplify]=useState(false);
  const [interacting,setInteracting]=useState(false);
  const previewSimplify=simplify||interacting;
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{pointer:number;x:number;y:number;inverse:DOMMatrix;origin:{x:number;y:number};center:{x:number;y:number};crossing:string|null;moved:boolean}|null>(null);
  const routeModel=useMemo(()=>buildWovenRouteModel(design),[design]);
  const fullModel=useMemo(()=>previewSimplify?null:buildWovenModel(design),[design,previewSimplify]);
  const model={...routeModel,warnings:routeModel.warnings,usableLength:routeModel.intervals.reduce((sum,[a,b])=>sum+b-a,0)};
  const scene=fullModel?(design.annotated?fullModel.annotated:fullModel.clean):null;
  function exportScene(){const full=buildWovenModel(design);return design.annotated?full.annotated:full.clean;}
  const fit=useMemo(()=>{
    const xs=routeModel.route.points.map(p=>p.x),ys=routeModel.route.points.map(p=>p.y),pad=routeModel.halfBand+8;
    return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+pad*2,h:Math.max(...ys)-Math.min(...ys)+pad*2};
  },[routeModel]);

  const camera = useEditorCamera(svgRef, {x:0,y:0,w:model.page.w,h:model.page.h}, fit);
  const vb = camera;
  function update<K extends keyof Design>(key: K, value: Design[K]) {
    setDesign((d) => ({
      ...d,
      [key]: value,
      ...(["preset", "loop", "reverse"].includes(key) ? { overrides: {} } : {}),
    }));
    if (["preset", "loop", "reverse"].includes(key)) setSelected(null);
  }
  function setDimension(key: 'width' | 'height', value: number) {
    const next = { ...design, [key]: value };
    setDesign(next);
    setScaleBase({ width: next.width, height: next.height });
  }
  const scaleRange = uniformScaleLimits(scaleBase);
  const shapeScale = design.width / scaleBase.width * 100;
  function flip(id: string) {
    setSelected(id);
    setDesign((d) => ({
      ...d,
      overrides: {
        ...d.overrides,
        [id]: model.choices[id] === "a" ? "b" : "a",
      },
    }));
  }
  function preset(next: View) { camera.fit(next === 'autofit' ? 'content' : 'page'); }

  function print() {
    const frame = document.createElement("iframe");
    frame.title = "Print Woven Calligraphy";
    frame.style.cssText = "position:fixed;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>Woven Calligraphy</title><style>@page{size:${model.page.w}mm ${model.page.h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${model.page.w}mm;height:${model.page.h}mm}</style></head><body>${sceneSvg(exportScene())}</body></html>`,
    );
    doc.close();
    const win = frame.contentWindow;
    if (win) {
      win.onafterprint = () => frame.remove();
      win.focus();
      win.print();
    }
    setStatus(
      "Print at 100% / actual size, with browser headers and footers off. Check the 50 mm ruler.",
    );
  }
  function pointerDown(e:React.PointerEvent<SVGSVGElement>) {
    if(e.button!==0||e.altKey||!(e.target as Element).closest('[data-woven-shape],[data-crossing]'))return;
    const matrix=svgRef.current?.getScreenCTM();if(!matrix)return;
    const inverse=matrix.inverse(),origin=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);
    camera.freeze();
    drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,inverse,origin,center:{x:design.centerX??model.page.w/2,y:design.centerY??model.page.h/2},crossing:(e.target as Element).closest('[data-crossing]')?.getAttribute('data-crossing')??null,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);setInteracting(true);
  }
  function pointerMove(e:React.PointerEvent<SVGSVGElement>) {
    const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>4)d.moved=true;
    if(d.moved){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);setDesign(current=>({...current,centerX:d.center.x+p.x-d.origin.x,centerY:d.center.y+p.y-d.origin.y}));}
  }
  function pointerUp(e:React.PointerEvent<SVGSVGElement>) {
    const d=drag.current;if(!d||d.pointer!==e.pointerId)return;
    drag.current=null;setInteracting(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    if(e.type==='pointercancel'){setDesign(current=>({...current,centerX:d.center.x,centerY:d.center.y}));return;}
    if(!d.moved&&d.crossing)flip(d.crossing);
  }
  return (
    <EditorWorkspace preview={<>
<section
          className="preview-panel rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6"
          aria-label="Writing sheet preview"
        >
          <PreviewToolbar camera={camera}><Button className={button} aria-pressed={simplify} onClick={()=>setSimplify(value=>!value)}>Simplify</Button><Button
                className={button}
                onClick={() =>
                  download(sceneSvg(exportScene()), "image/svg+xml", "woven-guides.svg")
                }
              >
                SVG
              </Button>
<Button
                className={button}
                onClick={() =>
                  download(
                    new Uint8Array(scenePdf(exportScene())).buffer,
                    "application/pdf",
                    "woven-guides.pdf",
                  )
                }
              >
                PDF
              </Button>
<Button
                className={`${button} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-700`}
                onClick={print}
              >
                Print
              </Button></PreviewToolbar>
          <div
            className="overflow-hidden rounded-xl border border-slate-200 bg-slate-300"
            data-testid="preview-scroll"
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label={`${design.preset} calligraphy guideline preview`}
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              className="editor-svg"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
              onLostPointerCapture={()=>{drag.current=null;setInteracting(false);}}
            >
              <title>Woven Calligraphy writing sheet</title>
              <defs>
                <clipPath id="woven-page">
                  <rect width={model.page.w} height={model.page.h} />
                </clipPath>
              </defs>
              <rect width={model.page.w} height={model.page.h} fill="white" />
              <g clipPath="url(#woven-page)">
                {scene?<WovenScene scene={scene}/>:<WovenSimplified model={routeModel}/>}
                <g data-woven-shape="true" data-camera-interactive="true" fill="none" stroke="transparent" strokeWidth={Math.max(5,routeModel.halfBand*2)} pointerEvents="stroke" style={{cursor:'move'}}>
                  {routeModel.intervals.map((interval,i)=><path key={i} d={pointsD(sliceGuide(routeModel.route,routeModel.route.points,interval))}/>)}
                </g>
                {previewSimplify&&<rect x={fit.x+8} y={fit.y+8} width={fit.w-16} height={fit.h-16} fill="none" stroke="#818cf8" strokeWidth={.25} strokeDasharray="2 2" pointerEvents="none"/>}
                {model.crossings.map((c, i) => (
                  <g
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    data-crossing={c.id}
                    aria-label={`Swap crossing ${i + 1}`}
                    aria-pressed={selected === c.id}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        flip(c.id);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <title>{`Crossing ${i + 1}: click to swap over/under`}</title>
                    <circle
                      cx={c.point.x}
                      cy={c.point.y}
                      r={3.5}
                      fill="transparent"
                      stroke={selected === c.id ? "#4f46e5" : "transparent"}
                      strokeWidth={0.35}
                    />
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <div className="woven-status" role="status" aria-live="polite" aria-atomic="true" aria-label="Design status" tabIndex={0}>
            {status && <p>{status}</p>}
            {model.warnings.map(warning => <p key={warning} className="text-amber-900">{warning}</p>)}
            {!status && model.warnings.length === 0 && <p>No geometry warnings.</p>}
          </div>
          <PreviewMeta help={<><p>Drag the design to move it. Alt-drag or middle-drag to pan; click a crossing to swap over/under.</p><p>Exports use the full page. Print at actual size / 100%, with headers and footers off; check the 50 mm ruler.</p></>}>
            <span>{model.page.w} × {model.page.h} mm</span>
            <span>{model.crossings.length} crossings · {Math.round(model.usableLength)} mm visible route</span>
            {selected && <span>Crossing {model.crossings.findIndex(c => c.id === selected) + 1} selected</span>}
          </PreviewMeta>
        </section>
</>} inspector={<>
<div className="inspector-actions"><details><summary>Related tools</summary><nav aria-label="Related tools">
          <Link className={button} href="/calligram">
            Calligram
          </Link>
          <Link className={button} href="/guidelines">
            Guidelines
          </Link>
          <Link className={button} href="/path-guides">
            Path Guides
          </Link>
        </nav></details><ActionGroup label="Design files">
          <Button className={button} onClick={() => fileRef.current?.click()}>
            Open design
          </Button>
          <Button
            className={button}
            onClick={() =>
              download(
                JSON.stringify(design, null, 2),
                "application/json",
                "woven-design.json",
              )
            }
          >
            Save design
          </Button>
        </ActionGroup></div>
<input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Open Woven Calligraphy design"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 100000) throw Error("Design file is too large.");
            const loaded = parseDesign(JSON.parse(await file.text()));
            setDesign(loaded);
            setScaleBase({ width: loaded.width, height: loaded.height });
            setSelected(null);
            preset("autofit");
            setStatus("Design opened.");
          } catch (error) {
            setStatus(
              error instanceof Error ? error.message : "Could not open design.",
            );
          }
          e.target.value = "";
        }}
      />
<div className="grid items-start gap-4  ">
          <DisclosureSection title="Shape" defaultOpen headerAction={<CompactHelp label="Shape controls help" below><p>Type custom values or use the sliders. Scale changes width and height together, preserving their ratio.</p><p>Editing either dimension or opening a design sets the current size as the new 100% reference. Preset, loop depth and direction changes reset crossing choices.</p></CompactHelp>}>
            <div className="space-y-3" onPointerDownCapture={event=>{if((event.target as HTMLInputElement).type==='range'){camera.freeze();setInteracting(true);}}} onPointerUpCapture={()=>setInteracting(false)} onPointerCancelCapture={()=>setInteracting(false)} onFocusCapture={event=>{if((event.target as HTMLInputElement).type==='number'){camera.freeze();setInteracting(true);}}} onBlurCapture={()=>setInteracting(false)} onKeyDownCapture={event=>{if((event.target as HTMLInputElement).type==='range'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){camera.freeze();setInteracting(true);}}} onKeyUpCapture={()=>setInteracting(false)}>
              <div className="grid grid-cols-2 gap-2">{(['centerX','centerY'] as const).map((key,i)=><label key={key} className="text-sm">{i===0?'X position':'Y position'} (mm)<NumericInput className={field} aria-label={i===0?'X position':'Y position'} step="any" value={design[key]??(i===0?model.page.w:model.page.h)/2} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))update(key,event.target.valueAsNumber);}}/></label>)}</div>
              <Button className={button} onClick={()=>setDesign(current=>({...current,centerX:model.page.w/2,centerY:model.page.h/2}))}>Centre on page</Button>
              <label className="block space-y-1 text-sm">
                Preset
                <Select
                  aria-label="Preset"
                  className={field}
                  value={design.preset}
                  onChange={(e) =>
                    update("preset", e.target.value as Design["preset"])
                  }
                >
                  <option value="rosette">Six-loop rosette</option>
                  <option value="figure-eight">Figure-eight</option>
                </Select>
              </label>
              <NumericSlider label="Width" value={design.width} min={LIMITS.width[0]} max={LIMITS.width[1]} step={0.5} unit="mm" onChange={value => setDimension('width', value)} />
              <NumericSlider label="Height" value={design.height} min={LIMITS.height[0]} max={LIMITS.height[1]} step={0.5} unit="mm" onChange={value => setDimension('height', value)} />
              <NumericSlider label="Scale" value={shapeScale} min={scaleRange.min} max={scaleRange.max} step={0.1} unit="%" onChange={value => setDesign(current => ({ ...current, ...scaleShape(scaleBase, value) }))} />
              {design.preset === "rosette" &&
                <NumericSlider label="Loop depth" value={design.loop} min={LIMITS.loop[0]} max={LIMITS.loop[1]} step={0.01} onChange={value => update('loop', value)} />}
              <NumericSlider label="Rotation" value={design.rotation} min={LIMITS.rotation[0]} max={LIMITS.rotation[1]} step={1} unit="°" onChange={value => update('rotation', value)} />
            </div>
          </DisclosureSection>
          <WovenSettings design={design} onChange={setDesign} model={model} selected={selected} onSelect={setSelected} />
          <DisclosureSection title="Page & export" defaultOpen>
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                Paper
                <Select
                  aria-label="Paper"
                  className={field}
                  value={design.paper}
                  onChange={(e) => {
                    update("paper", e.target.value as Design["paper"]);
                    preset("autofit");
                  }}
                >
                  {Object.entries(PAPERS_MM).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                Orientation
                <Select
                  aria-label="Orientation"
                  className={field}
                  value={design.orientation}
                  onChange={(e) => {
                    update(
                      "orientation",
                      e.target.value as Design["orientation"],
                    );
                    preset("autofit");
                  }}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                Sheet contents
                <Select
                  aria-label="Sheet contents"
                  className={field}
                  value={design.annotated ? "plan" : "clean"}
                  onChange={(e) =>
                    update("annotated", e.target.value === "plan")
                  }
                >
                  <option value="plan">Annotated writing plan</option>
                  <option value="clean">Clean guidelines</option>
                </Select>
              </label>
            </div>
          </DisclosureSection>
        </div>
</>}></EditorWorkspace>
  );
}
