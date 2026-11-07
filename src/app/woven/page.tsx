"use client";

import { NumericInput, Toggle, Button, Select, ActionGroup } from '@/components/editor/Controls';
import NumericSlider from '@/components/editor/NumericSlider';
import PreviewMeta from '@/components/editor/PreviewMeta';
import CompactHelp from '@/components/editor/CompactHelp';
import { scaleShape, uniformScaleLimits, type ShapeDimensions } from '@/lib/woven/shape-controls';

import { useEditorCamera } from '@/components/editor/useEditorCamera';
import PreviewToolbar from '@/components/editor/PreviewToolbar';

import EditorWorkspace from '@/components/editor/EditorWorkspace';

import SlantStyleControl from '@/components/guidelines/SlantStyleControl';
import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import DisclosureSection from "@/components/layout/DisclosureSection";
import ConstructionGuideControls from "@/components/guidelines/ConstructionGuideControls";
import { PAPERS_MM } from "@/lib/curve-helpers";
import { INSULAR_MAJUSCULE_DEFAULTS } from "@/lib/guides/straight/blackletter";
import {
  DEFAULT_DESIGN,
  LIMITS,
  parseDesign,
  type Design,
} from "@/lib/woven/design";
import { buildWovenModel } from "@/lib/woven/model";
import { pointsD, scenePdf, sceneSvg } from "@/lib/woven/vector-export";

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const button =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500";
type View = "autofit" | "fullpage" | "custom";
type Box = { x: number; y: number; w: number; h: number };
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


  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    box: Box;
    scale: number;
    crossing: string | null;
    moved: boolean;
  } | null>(null);
  const model = useMemo(() => buildWovenModel(design), [design]);
  const scene = design.annotated ? model.annotated : model.clean;
  const fit = useMemo(() => {
    const points = model.clean.strokes
      .flatMap((s) => s.points)
      .filter((p) => p.y > 25 && p.y < model.page.h - 27);
    if (!points.length) return { x: 0, y: 0, w: model.page.w, h: model.page.h };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return {
      x: minX - 8,
      y: minY - 8,
      w: maxX - minX + 16,
      h: maxY - minY + 16,
    };
  }, [model]);

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

  function numeric(
    key: keyof typeof LIMITS,
    label: string,
    step = 1,
    unit = "",
  ) {
    return (
      <label className="block space-y-1 text-sm text-slate-700" key={key}>
        <span>
          {label}
          {unit && ` (${unit})`}
        </span>
        <NumericInput
          aria-label={label}
          className={field}
          type="number"
          min={LIMITS[key][0]}
          max={LIMITS[key][1]}
          step={step}
          value={design[key]}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v))
              update(
                key,
                Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], v)),
              );
          }}
        />
      </label>
    );
  }
  function toggle(
    key:
      | "gridHorizontal"
      | "gridVertical"
      | "fullGuides"
      | "reverse"
      | "slants"
      | "secondSlant",
    label: string,
  ) {
    return (
      <label className="flex min-h-10 items-center gap-2 text-sm" key={key}>
        <Toggle
          type="checkbox"
          className="accent-indigo-600"
          checked={design[key]}
          onChange={(e) => update(key, e.target.checked)}
        />
        {label}
      </label>
    );
  }
  function selectScript(script: Design["script"]) {
    setDesign((d) => ({
      ...d,
      script,
      nib: script === "Copperplate" ? 1 : d.nib,
      xNib:
        script === "InsularMajuscule"
          ? INSULAR_MAJUSCULE_DEFAULTS.xNib
          : script === "TexturaQuadrata"
            ? 5
            : script === "Copperplate"
              ? 4
              : 4.5,
      ascNib: script === "Copperplate" ? 6 : 2,
      descNib: script === "Copperplate" ? 6 : 2,
      penAngle:
        script === "InsularMajuscule" ? 15 : script === "Fraktur" ? 40 : 45,
      gridHorizontal: script !== "InsularMajuscule",
      gridVertical: script !== "InsularMajuscule",
      construction: { ...d.construction, upper: false, lower: false },
    }));
  }
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
      `<!doctype html><html><head><title>Woven Calligraphy</title><style>@page{size:${model.page.w}mm ${model.page.h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${model.page.w}mm;height:${model.page.h}mm}</style></head><body>${sceneSvg(scene)}</body></html>`,
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
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const crossing =
      (e.target as Element)
        .closest("[data-crossing]")
        ?.getAttribute("data-crossing") ?? null;
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: vb,
      scale: matrix.a,
      crossing,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) {

      camera.setFrame({
        ...d.box,
        x: d.box.x - dx / d.scale,
        y: d.box.y - dy / d.scale,
      });
    }
  }
  function pointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved && d.crossing) flip(d.crossing);
  }
  return (
    <EditorWorkspace preview={<>
<section
          className="preview-panel rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6"
          aria-label="Writing sheet preview"
        >
          <PreviewToolbar camera={camera}><Button
                className={button}
                onClick={() =>
                  download(sceneSvg(scene), "image/svg+xml", "woven-guides.svg")
                }
              >
                SVG
              </Button>
<Button
                className={button}
                onClick={() =>
                  download(
                    new Uint8Array(scenePdf(scene)).buffer,
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
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              <title>Woven Calligraphy writing sheet</title>
              <defs>
                <clipPath id="woven-page">
                  <rect width={model.page.w} height={model.page.h} />
                </clipPath>
              </defs>
              <rect width={model.page.w} height={model.page.h} fill="white" />
              <g clipPath="url(#woven-page)">
                {scene.strokes.map((s, i) => (
                  <path
                    key={i}
                    d={pointsD(s.points)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {scene.labels.map((l, i) => (
                  <text
                    key={i}
                    x={l.point.x}
                    y={l.point.y}
                    fontSize={l.size}
                    fill={l.color}
                    fontFamily="Helvetica,Arial,sans-serif"
                  >
                    {l.text}
                  </text>
                ))}
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
          <PreviewMeta help={<><p>Drag to pan; click a crossing to swap over/under.</p><p>Exports use the full page. Print at actual size / 100%, with headers and footers off; check the 50 mm ruler.</p></>}>
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
            <div className="space-y-3">
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
          <DisclosureSection title="Writing guides" defaultOpen>
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                Script
                <Select
                  aria-label="Script"
                  className={field}
                  value={design.script}
                  onChange={(e) =>
                    selectScript(e.target.value as Design["script"])
                  }
                >
                  <option value="TexturaQuadrata">Textura Quadrata</option>
                  <option value="Fraktur">Fraktur</option>
                  <option value="InsularMajuscule">Insular Majuscule</option>
                  <option value="Copperplate">Copperplate</option>
                </Select>
              </label>
              {design.script !== "Copperplate" && numeric("nib", "Nib width", 0.05, "mm")}
              {numeric("xNib", "X-height", 0.5, "units")}
              {numeric("ascNib", "Ascender above waist", 0.5, "units")}
              {numeric("descNib", "Descender below base", 0.5, "units")}
              <p className="text-xs text-slate-500">
                X-height: {((design.script === "Copperplate" ? 1 : design.nib) * design.xNib).toFixed(2)} mm.{" "}
                {design.script === "Copperplate"
                  ? "Copperplate uses a fixed 1 mm unit for these proportions."
                  : "One unit equals one actual nib width."}
              </p>
              {toggle("fullGuides", "Show ascender and descender guides")}
            </div>
          </DisclosureSection>
          <DisclosureSection
            title={
              design.script === "Copperplate"
                ? "Slant lines"
                : "Grid & construction"
            }
            defaultOpen
          >
            <div className="space-y-3">
              {design.script === "Copperplate" ? (
                <>
                  {toggle("slants", "Show slant lines")}
                    <SlantStyleControl value={design.slantStyle} onChange={v=>update("slantStyle",v)} />
                  {numeric("slantAngle", "Slant angle", 1, "°")}
                  {numeric("slantSpacing", "Slant spacing", 0.5, "mm")}
                  {numeric("slantContrast", "Slant contrast", 0.05)}
                  {toggle("secondSlant", "Second slant angle")}
                  {design.secondSlant &&
                    numeric("secondAngle", "Second angle", 1, "°")}
                </>
              ) : (
                <>
                  {toggle("gridHorizontal", "Horizontal intermediate lines")}
                  {toggle("gridVertical", "Vertical divisions")}
                  <label className="block space-y-1 text-sm">
                    Grid width
                    <Select
                      aria-label="Grid width"
                      className={field}
                      value={design.gridMode}
                      onChange={(e) =>
                        update("gridMode", e.target.value as Design["gridMode"])
                      }
                    >
                      <option value="effective">Stroke-width</option>
                      <option value="actual">Actual nib</option>
                      <option value="custom">Custom</option>
                    </Select>
                  </label>
                  {design.gridMode === "custom" &&
                    numeric("gridWidth", "Custom grid width", 0.1, "mm")}
                  {numeric("penAngle", "Pen angle", 1, "°")}
                  {numeric("gridContrast", "Grid contrast", 0.05)}
                  <ConstructionGuideControls
                    script={design.script}
                    value={design.construction}
                    onChange={(v) => update("construction", v)}
                    compact
                  />
                </>
              )}
              {numeric("gridThickness", "Guide grid thickness", 0.01, "mm")}
            </div>
          </DisclosureSection>
          <DisclosureSection title="Route & crossings" defaultOpen>
            <div className="space-y-3">
              {numeric("start", "Start position", 0.5, "%")}
              {numeric("gap", "Start/end gap", 0.5, "mm")}
              {numeric("clearance", "Crossing clearance", 0.1, "mm")}
              {toggle("reverse", "Reverse writing direction")}
              <div className="flex flex-wrap gap-2">
                {model.crossings.map((c, i) => (
                  <Button
                    key={c.id}
                    aria-label={`Swap crossing ${i + 1}`}
                    aria-pressed={selected === c.id}
                    className={`${button} ${selected === c.id ? "!border-indigo-500 !bg-indigo-50" : ""}`}
                    onClick={() => flip(c.id)}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
              <Button
                className={button}
                onClick={() => update("overrides", {})}
              >
                Restore alternating weave
              </Button>
            </div>
          </DisclosureSection>
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
