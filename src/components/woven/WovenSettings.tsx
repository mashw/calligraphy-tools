'use client';
import { NumericInput, Toggle, Button, Select } from '@/components/editor/Controls';
import DisclosureSection from '@/components/layout/DisclosureSection';
import ConstructionGuideControls from '@/components/guidelines/ConstructionGuideControls';
import SlantStyleControl from '@/components/guidelines/SlantStyleControl';
import { INSULAR_MAJUSCULE_DEFAULTS } from '@/lib/guides/straight/blackletter';
import { LIMITS, type Design } from '@/lib/woven/design';
import type { buildWovenRouteModel } from '@/lib/woven/model';
const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const button='min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500';
export default function WovenSettings({design, onChange, model, selected, onSelect}: {design:Design;onChange:(design:Design)=>void;model?:ReturnType<typeof buildWovenRouteModel>;selected?:string|null;onSelect?:(id:string|null)=>void}) {
  const setDesign=(fn:(design:Design)=>Design)=>onChange(fn(design));
  function update<K extends keyof Design>(key:K,value:Design[K]) {
    onChange({...design,[key]:value,...(['preset','loop','reverse'].includes(key)?{overrides:{}}:{})});
  }
  function flip(id:string) {if(!model)return;onSelect?.(id);update('overrides',{...design.overrides,[id]:model.choices[id]==='a'?'b':'a'});}
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

  return <>          <DisclosureSection title="Writing guides" defaultOpen>
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
{model && <DisclosureSection title="Route & crossings" defaultOpen>
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
                    aria-pressed={model.choices[c.id] === 'b'}
                    title={`Passage ${model.choices[c.id]?.toUpperCase()} over`}
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
          </DisclosureSection>}
</>;
}
