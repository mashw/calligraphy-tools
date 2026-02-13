'use client';

/**
 * Calligram tool (closed paths):
 * - `direction` controls tangent travel around the circle seam.
 * - `normalSide` flips guide/text offset side (outward vs inward).
 * - `startAngleDeg` moves the seam/start location around the circle.
 */
import React, { useMemo, useRef, useState } from 'react';
import { PAPERS_MM, pathD } from '@/lib/curve-helpers';
import GuideOverlay from '@/components/preview/GuideOverlay';
import { buildGuideSet } from '@/lib/guides/guide-template';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';
import { measureRun } from '@/lib/measure/measure-run';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { CirclePathAdapter, type CircleDirection, type CircleNormalMode, samplePathPolyline } from '@/lib/paths';

type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type ViewMode = 'autofit' | 'custom';

export default function CalligramPage() {
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const [marginMM, setMarginMM] = useState(12);
  const [view, setView] = useState<ViewMode>('autofit');
  const [zoom, setZoom] = useState(1.5);

  const [script, setScript] = useState<ScriptId>('TexturaQuadrata');
  const [text, setText] = useState('Calligram');
  const [xHeightMM, setXHeightMM] = useState(6);
  const [nibMM, setNibMM] = useState(1.8);

  const [radiusMM, setRadiusMM] = useState(60);
  const [centerXMM, setCenterXMM] = useState(105);
  const [centerYMM, setCenterYMM] = useState(148.5);
  const [startAngleDeg, setStartAngleDeg] = useState(-90);
  const [direction, setDirection] = useState<CircleDirection>('counterclockwise');
  const [normalSide, setNormalSide] = useState<CircleNormalMode>('outward');

  const svgRef = useRef<SVGSVGElement | null>(null);

  const raw = PAPERS_MM[paper];
  const box = orientation === 'portrait' ? { w: raw.w, h: raw.h } : { w: raw.h, h: raw.w };

  const circlePath = useMemo(
    () => new CirclePathAdapter(radiusMM, { x: centerXMM, y: centerYMM }, startAngleDeg, direction, normalSide),
    [radiusMM, centerXMM, centerYMM, startAngleDeg, direction, normalSide],
  );

  const baseline = useMemo(() => samplePathPolyline(circlePath, 1.2), [circlePath]);
  const arcLen = useMemo(() => circlePath.totalLength(), [circlePath]);

  const ctx = useMemo(
    () => (script === 'Copperplate'
      ? buildCopperplateContext({
          xHeightMM,
          capStyle: 'simple',
          calibration: { enabled: false },
        }).ctx
      : { xHeightMM, nibMM, scale: 1, spaceMult: 1 }),
    [script, xHeightMM, nibMM],
  );

  const run = useMemo(() => measureRun(text, SCRIPT_PROFILES[script], ctx), [text, script, ctx]);

  const xMM = xHeightMM;
  const ascMM = script === 'Copperplate' ? xHeightMM : xHeightMM * 0.7;
  const descMM = script === 'Copperplate' ? xHeightMM : xHeightMM * 0.7;

  const guideSet = useMemo(
    () => buildGuideSet(script === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline,
      xMM,
      ascMM,
      descMM,
      tickStepMM: script === 'Copperplate' ? Math.max(3, xMM * 0.8) : Math.max(1, nibMM),
      actualNibMM: nibMM,
    }),
    [script, baseline, xMM, ascMM, descMM, nibMM],
  );

  const placements = useMemo(() => {
    const total = run.glyphs.reduce((sum, g) => sum + g.advMM, 0);
    let cursor = (arcLen - total) / 2;
    return run.glyphs.flatMap((g) => {
      const adv = g.advMM;
      if (g.kind === 'space') {
        cursor += adv;
        return [];
      }
      const mid = cursor + g.wMM / 2;
      cursor += adv;
      const sample = circlePath.pointAtLength(mid);
      return [{ ch: g.ch, w: g.wMM, p: sample.p, t: sample.t }];
    });
  }, [run, arcLen, circlePath]);

  const viewBox = useMemo(() => {
    if (view === 'autofit') return `0 0 ${box.w} ${box.h}`;
    const zw = box.w / Math.max(0.25, zoom);
    const zh = box.h / Math.max(0.25, zoom);
    return `${box.w / 2 - zw / 2} ${box.h / 2 - zh / 2} ${zw} ${zh}`;
  }, [view, zoom, box]);

  const exportSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calligram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h1 className="text-lg font-semibold">Calligram (Circle)</h1>
          <textarea className="w-full border rounded p-2" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Script
              <select className="w-full border rounded p-1" value={script} onChange={(e) => setScript(e.target.value as ScriptId)}>
                {Object.keys(SCRIPT_PROFILES).map((id) => <option key={id}>{id}</option>)}
              </select>
            </label>
            <label>Paper
              <select className="w-full border rounded p-1" value={paper} onChange={(e) => setPaper(e.target.value as PaperId)}>
                {Object.entries(PAPERS_MM).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
              </select>
            </label>
            <label>Orientation
              <select className="w-full border rounded p-1" value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select>
            </label>
            <label>Margin (mm)<input className="w-full border rounded p-1" type="number" value={marginMM} onChange={(e) => setMarginMM(Number(e.target.value))} /></label>
            <label>X-height (mm)<input className="w-full border rounded p-1" type="number" value={xHeightMM} onChange={(e) => setXHeightMM(Number(e.target.value))} /></label>
            <label>Nib (mm)<input className="w-full border rounded p-1" type="number" value={nibMM} onChange={(e) => setNibMM(Number(e.target.value))} /></label>
          </div>

          <h2 className="font-medium pt-2">Circle controls</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Radius (mm)<input className="w-full border rounded p-1" type="number" value={radiusMM} onChange={(e) => setRadiusMM(Number(e.target.value))} /></label>
            <label>Start angle (°)<input className="w-full border rounded p-1" type="number" value={startAngleDeg} onChange={(e) => setStartAngleDeg(Number(e.target.value))} /></label>
            <label>Center X (mm)<input className="w-full border rounded p-1" type="number" value={centerXMM} onChange={(e) => setCenterXMM(Number(e.target.value))} /></label>
            <label>Center Y (mm)<input className="w-full border rounded p-1" type="number" value={centerYMM} onChange={(e) => setCenterYMM(Number(e.target.value))} /></label>
            <label>Direction
              <select className="w-full border rounded p-1" value={direction} onChange={(e) => setDirection(e.target.value as CircleDirection)}>
                <option value="clockwise">CW</option>
                <option value="counterclockwise">CCW</option>
              </select>
            </label>
            <label>Normal side
              <select className="w-full border rounded p-1" value={normalSide} onChange={(e) => setNormalSide(e.target.value as CircleNormalMode)}>
                <option value="outward">Outward</option>
                <option value="inward">Inward</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2 text-sm">
            <button className="px-2 py-1 border rounded" onClick={() => setView('autofit')}>Autofit</button>
            <button className="px-2 py-1 border rounded" onClick={() => setView('custom')}>Custom zoom</button>
            <input className="w-24" type="number" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <button className="px-2 py-1 border rounded" onClick={exportSvg}>Export SVG</button>
          </div>
        </section>

        <section className="bg-slate-200 rounded-xl border border-slate-300 p-3">
          <svg ref={svgRef} viewBox={viewBox} className="w-full h-[78vh] bg-white rounded-lg shadow">
            <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" />
            <rect x={marginMM} y={marginMM} width={Math.max(0, box.w - marginMM * 2)} height={Math.max(0, box.h - marginMM * 2)} fill="none" stroke="#e2e8f0" strokeDasharray="2 2" />

            <GuideOverlay
              guideSet={guideSet}
              style={{
                thin: 0.28,
                bold: 0.35,
                colors: { thin: '#334155', bold: '#0f172a', tick: '#e2e8f0' },
              }}
            />

            <path d={pathD(baseline)} stroke="#0ea5e9" strokeWidth={0.35} fill="none" />
            {placements.map((pl, i) => {
              const angle = (Math.atan2(pl.t.y, pl.t.x) * 180) / Math.PI;
              return (
                <text
                  key={`${pl.ch}-${i}`}
                  x={pl.p.x}
                  y={pl.p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${angle} ${pl.p.x} ${pl.p.y})`}
                  style={{ fontSize: `${Math.max(3, xMM * 0.95)}px`, fill: '#111827' }}
                >
                  {pl.ch}
                </text>
              );
            })}
          </svg>
        </section>
      </div>
    </main>
  );
}
