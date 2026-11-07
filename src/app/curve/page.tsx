'use client';

import { InspectorIntro } from '@/components/editor/Controls';

import { Button, Select, Toggle, NumericInput, Slider } from '@/components/editor/Controls';

import { InfoTip, InsetLabeledField, INSET_CONTROL_BASE, INSET_CONTROL_MM, INSET_CONTROL_WIDE } from '@/components/editor/Controls';

import { pointBounds } from '@/lib/editor/camera';
import { useEditorCamera } from '@/components/editor/useEditorCamera';
import PreviewToolbar from '@/components/editor/PreviewToolbar';

import DisclosureSection from '@/components/layout/DisclosureSection';
import EditorWorkspace from '@/components/editor/EditorWorkspace';

import SlantStyleControl from '@/components/guidelines/SlantStyleControl';
import { type SlantStyle } from '@/lib/guides/slant-paths';
import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import {
  PAPERS_MM,
  SCRIPT_DEFAULTS,
  Pt,
  PtCubic,
  sample,
  lengthPoly,
  pointAt,
  offset,
  pathD,
  buildPreset,
  transformCubic,
} from '@/lib/curve-helpers';

import {
  CAL_WORD,
  CAL_WORD_DOUBLE,
  clamp,
} from '@/lib/line-widths';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';
import type { ScriptContext } from '@/lib/scripts/types';
import { measureRun } from '@/lib/measure/measure-run';
import { buildCopperplateContext } from '@/lib/copperplate/context';
import { buildGuideSet, BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';
import GuideOverlay from '@/components/preview/GuideOverlay';
import ConstructionGuideControls from '@/components/guidelines/ConstructionGuideControls';
import { computeCurvedTitleLayout, type CurvedTitlePlace } from '@/lib/curved-title/model';
import { createDefaultCurvedTitleSettings, type CurvedTitleCurveId } from '@/lib/curved-title/settings';
import { fitCustomCurve, type CustomCurve } from '@/lib/curved-title/custom-curve';
import { buildTextSpanMarkers } from '@/lib/curved-title/span-markers';
import CustomCurveUpload from '@/components/curved-title/CustomCurveUpload';

import { cloneSvgForRasterExport, computeRasterPxPerMM, mmToPt, printJpegDataUrlToScale, renderSvgCloneToJpegDataUrl } from '@/lib/export/raster-export';

type PaperId = keyof typeof PAPERS_MM;
type CurvePresetId = CurvedTitleCurveId;
type Orientation = 'portrait' | 'landscape';
type AlignMode = 'start' | 'center' | 'end';

type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';

const X_OPTIONS = Array.from({ length: (10 - 2) / 0.5 + 1 }, (_, i) => 2 + i * 0.5);
const MIDLINE_DASH_GAP = 12;

const CAL_STORAGE_KEY_PREFIX = 'ct_curveplanner_calibration_v2_xh_';
const keyForXHeight = (x: number) => `${CAL_STORAGE_KEY_PREFIX}${x.toFixed(1)}`;

/* ---------------- Reusable InfoTip ---------------- */












/* ---------------- Export helpers ---------------- */
function stripNoExport(svg: SVGSVGElement) {
  // Remove any elements marked as non-export (green indicators etc.)
  svg.querySelectorAll('[data-no-export="true"]').forEach(n => n.remove());

  // Remove stage background rect if present
  const stage = svg.querySelector('#stage-bg');
  if (stage) stage.remove();

  // Remove any filters that might cause raster artefacts in print/export
  svg.querySelectorAll('filter').forEach(f => f.remove());
}

function bakeExportStrokes(source: SVGSVGElement, clone: SVGSVGElement, boxW: number) {
  const rect = source.getBoundingClientRect();
  if (!rect.width) return;
  const pxPerMM = rect.width / boxW;
  const sourceEls = Array.from(source.querySelectorAll<SVGElement>('*'));
  const cloneEls = Array.from(clone.querySelectorAll<SVGElement>('*'));

  sourceEls.forEach((el, idx) => {
    const cloneEl = cloneEls[idx];
    if (!cloneEl) return;
    const style = window.getComputedStyle(el);
    const strokeWidthPx = parseFloat(style.strokeWidth || '0');
    const hasStroke = (style.stroke && style.stroke !== 'none') || strokeWidthPx > 0;
    if (!hasStroke) {
      cloneEl.removeAttribute('vector-effect');
      return;
    }

    if (style.stroke && style.stroke !== 'none') {
      cloneEl.setAttribute('stroke', style.stroke);
    }
    if (!Number.isNaN(strokeWidthPx)) {
      cloneEl.setAttribute('stroke-width', String(strokeWidthPx / pxPerMM));
    }
    const dasharray = style.strokeDasharray;
    if (dasharray && dasharray !== 'none') {
      const baked = dasharray
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(entry => {
          const num = parseFloat(entry);
          return Number.isNaN(num) ? entry : String(num / pxPerMM);
        })
        .join(' ');
      cloneEl.setAttribute('stroke-dasharray', baked);
    } else if (dasharray === 'none') {
      cloneEl.removeAttribute('stroke-dasharray');
    }
    if (style.strokeLinecap) cloneEl.setAttribute('stroke-linecap', style.strokeLinecap);
    if (style.strokeLinejoin) cloneEl.setAttribute('stroke-linejoin', style.strokeLinejoin);
    if (style.strokeMiterlimit) cloneEl.setAttribute('stroke-miterlimit', style.strokeMiterlimit);
    if (style.strokeOpacity) cloneEl.setAttribute('stroke-opacity', style.strokeOpacity);

    cloneEl.removeAttribute('vector-effect');
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function b64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function flipCubicVertically(c: PtCubic, boxH: number): PtCubic {
  const flipPt = (p: Pt): Pt => ({ x: p.x, y: boxH - p.y });

  const out: PtCubic = {
    ...c,
    p0: flipPt(c.p0),
    p1: flipPt(c.p1),
    p2: flipPt(c.p2),
    p3: flipPt(c.p3),
  };

  const extra = (c as PtCubic)._extraSegs;
  if (extra && extra.length) {
    (out as PtCubic)._extraSegs = extra.map(seg => {
      // seg is [x0,y0,x1,y1,x2,y2,x3,y3]
      const s = seg.slice() as number[];
      s[1] = boxH - s[1];
      s[3] = boxH - s[3];
      s[5] = boxH - s[5];
      s[7] = boxH - s[7];
      return s as any;
    });
  }

  return out;
}

function translateCubic(c: PtCubic, dx: number, dy: number): PtCubic {
  const t = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });

  const out: PtCubic = {
    ...c,
    p0: t(c.p0),
    p1: t(c.p1),
    p2: t(c.p2),
    p3: t(c.p3),
  };

  const extra = (c as PtCubic)._extraSegs;
  if (extra && extra.length) {
    (out as PtCubic)._extraSegs = extra.map(seg => {
      const s = seg.slice() as number[];
      s[0] += dx; s[1] += dy;
      s[2] += dx; s[3] += dy;
      s[4] += dx; s[5] += dy;
      s[6] += dx; s[7] += dy;
      return s as any;
    });
  }

  return out;
}



function makeSimplePdfFromJpeg(
  jpegDataUrl: string,
  pageWpt: number,
  pageHpt: number,
  imgW: number,
  imgH: number
): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const imgBytes = b64ToUint8(base64);

  const EOL = '\n';
  const header = '%PDF-1.4' + EOL;

  const obj1 = `1 0 obj${EOL}<< /Type /Catalog /Pages 2 0 R >>${EOL}endobj${EOL}`;
  const obj2 = `2 0 obj${EOL}<< /Type /Pages /Count 1 /Kids [3 0 R] >>${EOL}endobj${EOL}`;
  const obj3 =
    `3 0 obj${EOL}` +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}` +
    `endobj${EOL}`;

  const contentStream = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;
  const obj5 =
    `5 0 obj${EOL}` +
    `<< /Length ${contentStream.length} >>${EOL}` +
    `stream${EOL}${contentStream}${EOL}endstream${EOL}` +
    `endobj${EOL}`;

  const obj4Head =
    `4 0 obj${EOL}` +
    `<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Filter /DCTDecode /Width ${imgW} /Height ${imgH} /Length ${imgBytes.byteLength} >>${EOL}` +
    `stream${EOL}`;
  const obj4Tail = `${EOL}endstream${EOL}endobj${EOL}`;

  const chunks: (string | Uint8Array)[] = [header];

  const xref: number[] = [];
  let offset = header.length;

  const pushStr = (s: string) => {
    chunks.push(s);
    offset += s.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.byteLength;
  };

  // obj 1
  xref.push(offset);
  pushStr(obj1);

  // obj 2
  xref.push(offset);
  pushStr(obj2);

  // obj 3
  xref.push(offset);
  pushStr(obj3);

  // obj 4 (record xref ONCE, at the start of "4 0 obj")
  xref.push(offset);
  pushStr(obj4Head);
  pushBytes(imgBytes);
  pushStr(obj4Tail);

  // obj 5
  xref.push(offset);
  pushStr(obj5);

  const xrefStart = offset;
  let xrefTable =
    `xref${EOL}` +
    `0 ${xref.length + 1}${EOL}` +
    `0000000000 65535 f ${EOL}`;
  for (const off of xref) {
    xrefTable += `${off.toString().padStart(10, '0')} 00000 n ${EOL}`;
  }

  const trailer =
    `trailer${EOL}` +
    `<< /Size ${xref.length + 1} /Root 1 0 R >>${EOL}` +
    `startxref${EOL}` +
    `${xrefStart}${EOL}` +
    `%%EOF`;

  chunks.push(xrefTable, trailer);

  return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' });
}

export default function CurvedTitlePage() {
  const curvedTitleDefaults = createDefaultCurvedTitleSettings();
  // ---------- State ----------
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);



  const snapHalf = (v: number) => Math.round(v * 2) / 2;

  // “next whole 0.5” in the direction of travel
  const stepHalfFrom = (current: number, dir: 1 | -1) => {
    const eps = 1e-9;
    const x2 = current * 2;
    const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
    return next2 / 2;
  };
  const snap05 = (v: number) => Math.round(v / 0.5) * 0.5;

  const [script, setScript] = useState<ScriptId>(curvedTitleDefaults.script);
  const [showInsularGrid, setShowInsularGrid] = useState(false);
  const [curve, setCurve] = useState<CurvePresetId>(curvedTitleDefaults.curve);
  const [customCurve, setCustomCurve] = useState<CustomCurve>();
  const [flipCurve, setFlipCurve] = useState(curvedTitleDefaults.flipCurve);
  const [align, setAlign] = useState<AlignMode>(curvedTitleDefaults.align);
  const [text, setText] = useState(curvedTitleDefaults.text);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');

  const [xHeightMM, setXHeightMM] = useState(curvedTitleDefaults.xHeightMM);
  const [capStyle, setCapStyle] = useState<'simple' | 'flourished'>(curvedTitleDefaults.capStyle);
  const [nibText, setNibText] = useState(curvedTitleDefaults.nibText);
  const [topBandEnabled, setTopBandEnabled] = useState(false);
  const [bottomBandEnabled, setBottomBandEnabled] = useState(false);
  const [topBandScript, setTopBandScript] = useState<ScriptId>('TexturaQuadrata');
  const [bottomBandScript, setBottomBandScript] = useState<ScriptId>('TexturaQuadrata');
  const [topBandSizeText, setTopBandSizeText] = useState('2');
  const [bottomBandSizeText, setBottomBandSizeText] = useState('2');
  const [copperplateRatioPreset, setCopperplateRatioPreset] = useState<CopperplateRatioPreset>('2:1:2');
  const [copperplateDescUnitsText, setCopperplateDescUnitsText] = useState('2');
  const [copperplateXUnitsText, setCopperplateXUnitsText] = useState('1');
  const [copperplateAscUnitsText, setCopperplateAscUnitsText] = useState('2');
  const [copperplateDescUnits, setCopperplateDescUnits] = useState(2);
  const [copperplateXUnits, setCopperplateXUnits] = useState(1);
  const [copperplateAscUnits, setCopperplateAscUnits] = useState(2);

  const nibMM = useMemo(() => {
    const v = parseFloat(nibText);
    return Number.isFinite(v) ? v : 2;
  }, [nibText]);
  const topBandSizeMM = useMemo(() => {
    const v = parseFloat(topBandSizeText);
    return Number.isFinite(v) ? v : nibMM;
  }, [topBandSizeText, nibMM]);
  const bottomBandSizeMM = useMemo(() => {
    const v = parseFloat(bottomBandSizeText);
    return Number.isFinite(v) ? v : nibMM;
  }, [bottomBandSizeText, nibMM]);
  const [penAngleDeg, setPenAngleDeg] = useState<15 | 35 | 40 | 45>(45);
  const [slantStyle, setSlantStyle] = useState<SlantStyle>('classic');
  const [constructionGuides, setConstructionGuides] = useState(() => ({ upper: false, lower: false, color: '#dc2626', ...curvedTitleDefaults.constructionGuides }));
  const [xNib, setXNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.xNib);

  const [ascNib, setAscNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.ascNib);
  const [descNib, setDescNib] = useState(BLACKLETTER_GUIDE_DEFAULTS.descNib);

  const [useCalibration, setUseCalibration] = useState(false);
  const [calWordLowerMM, setCalWordLowerMM] = useState('');
  const [calWordDoubleMM, setCalWordDoubleMM] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userScaleFactor, setUserScaleFactor] = useState(1);
  const [userSpaceFactor, setUserSpaceFactor] = useState(1);

  const [showBoxes, setShowBoxes] = useState(false);
  const [showSpanFill, setShowSpanFill] = useState(true);

  const [rotDeg, setRotDeg] = useState(0);
  const [scalePct, setScalePct] = useState(100);










  const [curveOffset, setCurveOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isCurveDragging, setIsCurveDragging] = useState(false);

  const dragRef = useRef<{
    px: number;
    py: number;
    panX: number;
    panY: number;
    mode?: 'pan' | 'curve';
    ox?: number;
    oy?: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);


  // Sticky centering: snap + hysteresis
  const snapStateRef = useRef<{ snapped: boolean }>({ snapped: true });

  const didInitPlacementRef = useRef(false);

  // Sensible feel in mm (snap in, release further out)
  const SNAP_IN_MM = 6;    // if within 6mm of center, snap
  const RELEASE_MM = 12;   // if snapped, must move beyond 12mm to release
  const CENTER_EPS_MM = 0.5; // considered "centered" for showing indicator

  // Full-viewport paint layer to hide any layout decorations behind this route






  useEffect(() => {
    if (script !== 'Copperplate') {
      setUseCalibration(false);
      setShowAdvanced(false);
    }
  }, [script]);

  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeightMM);
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (!raw) {
        setUseCalibration(false);
        setCalWordLowerMM('');
        setCalWordDoubleMM('');
        setUserScaleFactor(1);
        setUserSpaceFactor(1);
        setShowAdvanced(false);
        return;
      }
      const data = JSON.parse(raw);
      setUseCalibration(!!data.useCalibration);
      setCalWordLowerMM(typeof data.calWordLowerMM === 'string' ? data.calWordLowerMM : '');
      setCalWordDoubleMM(typeof data.calWordDoubleMM === 'string' ? data.calWordDoubleMM : '');
      setUserScaleFactor(typeof data.userScaleFactor === 'number' ? clamp(data.userScaleFactor, 0.7, 1.3) : 1);
      setUserSpaceFactor(typeof data.userSpaceFactor === 'number' ? clamp(data.userSpaceFactor, 0.5, 1.5) : 1);
      setShowAdvanced(false);
    } catch {
      // ignore
    }
  }, [xHeightMM, script]);

  useEffect(() => {
    if (script !== 'Copperplate') return;

    try {
      const key = keyForXHeight(xHeightMM);
      const data = {
        useCalibration,
        calWordLowerMM,
        calWordDoubleMM,
        userScaleFactor,
        userSpaceFactor,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch {
      // ignore
    }
  }, [xHeightMM, script, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const fs = (mm: number) => mm / Math.max(camera.zoom, 0.001);

  // ---------- Page box (mm) ----------
  const raw = PAPERS_MM[paper];
  const box = useMemo(() => {
    if (orientation === 'landscape' && raw.w < raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    if (orientation === 'portrait' && raw.w > raw.h) return { w: raw.h, h: raw.w, label: raw.label };
    return { w: raw.w, h: raw.h, label: raw.label };
  }, [raw, orientation]);

  // ---------- Derived sizes ----------
  const rad = (penAngleDeg * Math.PI) / 180;
  const effectiveNibMM = useMemo(() => (script === 'Copperplate' ? nibMM : nibMM * Math.cos(rad)), [script, nibMM, rad]);
  const effectiveTopNibMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM : topBandSizeMM * Math.cos(rad)),
    [topBandScript, topBandSizeMM, rad],
  );
  const effectiveBottomNibMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM : bottomBandSizeMM * Math.cos(rad)),
    [bottomBandScript, bottomBandSizeMM, rad],
  );

  const texturaXHeightMM = xNib * nibMM;

  const blackletterHeights = useMemo(
    () => ({ xMM: texturaXHeightMM, ascMM: ascNib * nibMM, descMM: descNib * nibMM }),
    [texturaXHeightMM, ascNib, descNib, nibMM],
  );

  const capMM = script === 'Copperplate'
    ? xHeightMM * 1.05
    : (SCRIPT_DEFAULTS[script]?.capHeight ?? 7) * nibMM;

  const copperplateHeights = useMemo(() => {
    if (copperplateRatioPreset === 'custom') {
      const xMM = xHeightMM * copperplateXUnits;
      const ascMM = xHeightMM * copperplateAscUnits;
      const descMM = xHeightMM * copperplateDescUnits;
      return { xMM, ascMM, descMM };
    }

    const presetUnits = {
      '2:1:2': { desc: 2, x: 1, asc: 2 },
      '3:2:3': { desc: 3, x: 2, asc: 3 },
      '1:1:1': { desc: 1, x: 1, asc: 1 },
    };

    const { desc, x, asc } = presetUnits[copperplateRatioPreset];
    const safeX = x > 0 ? x : 1;
    const descMM = xHeightMM * (desc / safeX);
    const ascMM = xHeightMM * (asc / safeX);
    return { xMM: xHeightMM, ascMM, descMM };
  }, [xHeightMM, copperplateRatioPreset, copperplateDescUnits, copperplateXUnits, copperplateAscUnits]);

  const guideHeights = script === 'Copperplate' ? copperplateHeights : blackletterHeights;
  const xMM = guideHeights.xMM;
  const ascMM = guideHeights.ascMM;
  const descMM = guideHeights.descMM;



  const swThin = Math.max(0.35, Math.min(0.7, Math.min(box.w, box.h) * 0.0025));
  const swBold = swThin * 1.8;

  // ---------- Measurement (shared) ----------
  const copper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);

    return buildCopperplateContext({
      xHeightMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [xHeightMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const ctx = useMemo<ScriptContext>(() => {
    if (script === 'Copperplate') return copper.ctx;
    return {
      xHeightMM: texturaXHeightMM,
      nibMM: effectiveNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [script, copper.ctx, texturaXHeightMM, effectiveNibMM]);

  const run = useMemo(() => measureRun(text, SCRIPT_PROFILES[script], ctx), [text, script, ctx]);
  const topCopper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);
    return buildCopperplateContext({
      xHeightMM: topBandSizeMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [topBandSizeMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);
  const bottomCopper = useMemo(() => {
    const lower = parseFloat(calWordLowerMM);
    const dbl = parseFloat(calWordDoubleMM);
    return buildCopperplateContext({
      xHeightMM: bottomBandSizeMM,
      capStyle,
      calibration: {
        enabled: useCalibration,
        calWordLowerMM: Number.isFinite(lower) ? lower : undefined,
        calWordDoubleMM: Number.isFinite(dbl) ? dbl : undefined,
        userScaleFactor,
        userSpaceFactor,
      },
    });
  }, [bottomBandSizeMM, capStyle, useCalibration, calWordLowerMM, calWordDoubleMM, userScaleFactor, userSpaceFactor]);

  const topCtx = useMemo<ScriptContext>(() => {
    if (topBandScript === 'Copperplate') return topCopper.ctx;
    return {
      xHeightMM: (topBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 5 : xNib) * topBandSizeMM,
      nibMM: effectiveTopNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [topBandScript, topCopper.ctx, topBandSizeMM, effectiveTopNibMM, xNib, script]);
  const bottomCtx = useMemo<ScriptContext>(() => {
    if (bottomBandScript === 'Copperplate') return bottomCopper.ctx;
    return {
      xHeightMM: (bottomBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 5 : xNib) * bottomBandSizeMM,
      nibMM: effectiveBottomNibMM,
      scale: 1,
      spaceMult: 1,
      capStyle: 'simple',
    };
  }, [bottomBandScript, bottomCopper.ctx, bottomBandSizeMM, effectiveBottomNibMM, xNib, script]);
  const topRun = useMemo(
    () => measureRun(topText, SCRIPT_PROFILES[topBandScript], topCtx),
    [topText, topBandScript, topCtx],
  );
  const bottomRun = useMemo(
    () => measureRun(bottomText, SCRIPT_PROFILES[bottomBandScript], bottomCtx),
    [bottomText, bottomBandScript, bottomCtx],
  );

  // ---------- Curve geometry ----------
  const cubicRaw = useMemo<PtCubic>(() => {
    const base = buildPreset(curve === 'custom' ? 'simpleArch' : curve, box);
    if (!flipCurve) return base;

    const flipped = flipCubicVertically(base, box.h);

    // Keep the same vertical anchor as the unflipped curve,
    // so the default placement doesn't jump when flipping.
    // Anchor choice: midpoint of endpoints (p0/p3).
    const baseAnchorY = (base.p0.y + base.p3.y) / 2;
    const flippedAnchorY = (flipped.p0.y + flipped.p3.y) / 2;
    const dy = baseAnchorY - flippedAnchorY;

    return translateCubic(flipped, 0, dy);
  }, [curve, box, flipCurve]);


  const cubic: PtCubic = useMemo(
    () => transformCubic(cubicRaw, box.w / 2, box.h / 2, scalePct / 100, rotDeg),
    [cubicRaw, box, scalePct, rotDeg],
  );


  const baselineBase = useMemo<Pt[]>(() => {
    if (curve === 'custom') return fitCustomCurve(customCurve ?? { filename: '', aspectRatio: 0, points: [{ x: -.5, y: 0 }, { x: .5, y: 0 }] }, box, scalePct / 100, rotDeg, flipCurve);
    const extra = (cubic as PtCubic)._extraSegs;
    if (extra && extra.length) {
      const pts: Pt[] = [];
      for (const s of extra) {
        const p0 = { x: s[0], y: s[1] };
        const p1 = { x: s[2], y: s[3] };
        const p2 = { x: s[4], y: s[5] };
        const p3 = { x: s[6], y: s[7] };
        const seg = sample(p0, p1, p2, p3, 220);
        if (pts.length) seg.shift();
        pts.push(...seg);
      }
      return pts;
    }
    return sample(cubic.p0, cubic.p1, cubic.p2, cubic.p3, 900);
  }, [cubic, curve, customCurve, box, scalePct, rotDeg, flipCurve]);

  const baselineBaseCenterX = useMemo(() => {
    if (!baselineBase.length) return box.w / 2;
    const xs = baselineBase.map(p => p.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }, [baselineBase, box.w]);

  // The curveOffset.x that makes the curve horizontally centered
  const centerDx = useMemo(() => box.w / 2 - baselineBaseCenterX, [box.w, baselineBaseCenterX]);

  // Determine if currently centered (for showing indicator)
  const centeredDistMM = useMemo(() => (baselineBaseCenterX + curveOffset.x) - box.w / 2, [baselineBaseCenterX, curveOffset.x, box.w]);
  const isCenteredHorizontally = Math.abs(centeredDistMM) <= CENTER_EPS_MM;

  const translatePoly = (poly: Pt[], dx: number, dy: number) => poly.map(p => ({ x: p.x + dx, y: p.y + dy }));

  const baseline = useMemo(() => translatePoly(baselineBase, curveOffset.x, curveOffset.y), [baselineBase, curveOffset]);

  const arcLen = useMemo(() => lengthPoly(baseline), [baseline]);
  const guideTemplate = script === 'Copperplate' ? 'copperplate' : 'blackletter';

  const tickStepMM = useMemo(
    () =>
      script === 'Copperplate'
        ? Math.max(xMM * 0.9, 3)
        : effectiveNibMM,
    [script, xMM, effectiveNibMM],
  );




  // ---------- Layout along the curve (shared with Layout) ----------
  const layout = useMemo(() => computeCurvedTitleLayout(run, baseline, arcLen, xMM, effectiveNibMM, capMM, script, align), [run, baseline, arcLen, xMM, effectiveNibMM, capMM, script, align]);

  const span = useMemo(() => {
    if (!layout.placements.length) return null;
    const first = layout.placements[0];
    const last = layout.placements[layout.placements.length - 1];
    const sStart = Math.max(0, first.sMid - first.w / 2);
    const sEnd = Math.min(arcLen, last.sMid + last.w / 2);
    return { sStart, sEnd };
  }, [layout, arcLen]);

  const textSpanMarkers=useMemo(()=>text.trim()&&layout.placements.length?buildTextSpanMarkers(baseline,span,xMM):null,[baseline,layout.placements.length,span,text,xMM]);

  const guideSet = useMemo(
    () =>
      buildGuideSet(guideTemplate, {
        baseline,
        xMM,
        ascMM,
        descMM,
        tickStepMM,
        tickAnchorS: span ? span.sStart : undefined,
        slantStyle, actualNibMM: nibMM,
        penAngleDeg, blackletterScript: script === 'Copperplate' ? undefined : script, constructionGuides,
      }),
    [baseline, guideTemplate, xMM, ascMM, descMM, tickStepMM, nibMM, span, penAngleDeg, script, constructionGuides, slantStyle],
  );

  const topBaseline = useMemo(() => guideSet.ascLine, [guideSet.ascLine]);
  const topArcLen = useMemo(() => lengthPoly(topBaseline), [topBaseline]);
  const topXMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM : topBandSizeMM * (topBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 5 : xNib)),
    [topBandScript, topBandSizeMM, xNib, script],
  );
  const topAscMM = useMemo(
    () => (topBandScript === 'Copperplate' ? topBandSizeMM * (2.5 / 2) : topBandSizeMM * (topBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 2 : ascNib)),
    [topBandScript, topBandSizeMM, ascNib, script],
  );
  const topCapMM = useMemo(
    () => (topBandScript === 'Copperplate'
      ? topXMM * 1.05
      : (SCRIPT_DEFAULTS[topBandScript]?.capHeight ?? 7) * topBandSizeMM),
    [topBandScript, topXMM, topBandSizeMM, penAngleDeg, constructionGuides],
  );
  const topTickStepMM = useMemo(
    () => (topBandScript === 'Copperplate' ? Math.max(topXMM * 0.9, 3) : effectiveTopNibMM),
    [topBandScript, topXMM, effectiveTopNibMM],
  );
  const topLayout = useMemo(
    () => computeCurvedTitleLayout(topRun, topBaseline, topArcLen, topXMM, effectiveTopNibMM, topCapMM, topBandScript, align),
    [topRun, topBaseline, topArcLen, topXMM, effectiveTopNibMM, topCapMM, topBandScript, align],
  );
  const topSpan = useMemo(() => {
    if (!topLayout.placements.length) return null;
    const first = topLayout.placements[0];
    const last = topLayout.placements[topLayout.placements.length - 1];
    const sStart = Math.max(0, first.sMid - first.w / 2);
    const sEnd = Math.min(topArcLen, last.sMid + last.w / 2);
    return { sStart, sEnd };
  }, [topLayout, topArcLen]);
  const topGuideSet = useMemo(
    () => buildGuideSet(topBandScript === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline: topBaseline,
      xMM: topXMM,
      ascMM: topAscMM,
      descMM: 0,
      tickStepMM: topTickStepMM,
      tickAnchorS: topSpan ? topSpan.sStart : undefined,
      slantStyle, actualNibMM: topBandSizeMM,
      penAngleDeg, blackletterScript: topBandScript === 'Copperplate' ? undefined : topBandScript, constructionGuides,
    }),
    [topBandScript, topBaseline, topXMM, topAscMM, topTickStepMM, topSpan, topBandSizeMM, penAngleDeg, constructionGuides, slantStyle],
  );

  const bottomXMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM : bottomBandSizeMM * (bottomBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 5 : xNib)),
    [bottomBandScript, bottomBandSizeMM, xNib, script],
  );
  const bottomDescMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? bottomBandSizeMM * (2.5 / 2) : bottomBandSizeMM * (bottomBandScript === 'InsularMajuscule' && script !== 'InsularMajuscule' ? 2 : descNib)),
    [bottomBandScript, bottomBandSizeMM, descNib, script],
  );
  const bottomCapMM = useMemo(
    () => (bottomBandScript === 'Copperplate'
      ? bottomXMM * 1.05
      : (SCRIPT_DEFAULTS[bottomBandScript]?.capHeight ?? 7) * bottomBandSizeMM),
    [bottomBandScript, bottomXMM, bottomBandSizeMM, penAngleDeg, constructionGuides],
  );
  const bottomBaseline = useMemo(() => offset(guideSet.descLine, bottomXMM), [guideSet.descLine, bottomXMM]);
  const bottomArcLen = useMemo(() => lengthPoly(bottomBaseline), [bottomBaseline]);
  const bottomTickStepMM = useMemo(
    () => (bottomBandScript === 'Copperplate' ? Math.max(bottomXMM * 0.9, 3) : effectiveBottomNibMM),
    [bottomBandScript, bottomXMM, effectiveBottomNibMM],
  );
  const bottomLayout = useMemo(
    () => computeCurvedTitleLayout(bottomRun, bottomBaseline, bottomArcLen, bottomXMM, effectiveBottomNibMM, bottomCapMM, bottomBandScript, align),
    [bottomRun, bottomBaseline, bottomArcLen, bottomXMM, effectiveBottomNibMM, bottomCapMM, bottomBandScript, align],
  );
  const bottomSpan = useMemo(() => {
    if (!bottomLayout.placements.length) return null;
    const first = bottomLayout.placements[0];
    const last = bottomLayout.placements[bottomLayout.placements.length - 1];
    const sStart = Math.max(0, first.sMid - first.w / 2);
    const sEnd = Math.min(bottomArcLen, last.sMid + last.w / 2);
    return { sStart, sEnd };
  }, [bottomLayout, bottomArcLen]);
  const bottomGuideSet = useMemo(
    () => buildGuideSet(bottomBandScript === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline: bottomBaseline,
      xMM: bottomXMM,
      ascMM: 0,
      descMM: bottomDescMM,
      tickStepMM: bottomTickStepMM,
      tickAnchorS: bottomSpan ? bottomSpan.sStart : undefined,
      slantStyle, actualNibMM: bottomBandSizeMM,
      penAngleDeg, blackletterScript: bottomBandScript === 'Copperplate' ? undefined : bottomBandScript, constructionGuides,
    }),
    [bottomBandScript, bottomBaseline, bottomXMM, bottomDescMM, bottomTickStepMM, bottomSpan, bottomBandSizeMM, penAngleDeg, constructionGuides, slantStyle],
  );

  const midAscPts = useMemo(() => {
    if (script !== 'Copperplate' || ascMM <= 0) return null;
    return offset(baseline, -(xMM + ascMM * 0.5));
  }, [script, baseline, xMM, ascMM]);

  const midDescPts = useMemo(() => {
    if (script !== 'Copperplate' || descMM <= 0) return null;
    return offset(baseline, descMM * 0.5);
  }, [script, baseline, descMM]);

  const topBandWaistLine = useMemo(() => (topBandEnabled ? topGuideSet.waistLine : null), [topBandEnabled, topGuideSet.waistLine]);

  const topBandAscLine = useMemo(() => (topBandEnabled ? topGuideSet.ascLine : null), [topBandEnabled, topGuideSet.ascLine]);

  const bottomBandBaseLine = useMemo(() => (bottomBandEnabled ? bottomGuideSet.baseLine : null), [bottomBandEnabled, bottomGuideSet.baseLine]);

  const bottomBandDescLine = useMemo(() => (bottomBandEnabled ? bottomGuideSet.descLine : null), [bottomBandEnabled, bottomGuideSet.descLine]);






  const spanPoly = useMemo(() => {
    if (!span) return null;
    const ds = script === 'Copperplate' ? Math.max(0.5, xMM * 0.2) : Math.max(0.5, effectiveNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = span.sStart; s <= span.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAt(baseline, Math.min(arcLen, s));
      waistPts.push({ x: p.x - n.x * xMM, y: p.y - n.y * xMM });
      basePts.push({ x: p.x, y: p.y });
    }
    return { waistPts, basePts };
  }, [span, baseline, arcLen, xMM, effectiveNibMM]);

  const topHasText = topText.trim().length > 0;
  const bottomHasText = bottomText.trim().length > 0;

  const topSpanPoly = useMemo(() => {
    if (!topSpan || !topBandEnabled || !topHasText || !topLayout.placements.length) return null;
    const ds = topBandScript === 'Copperplate' ? Math.max(0.5, topXMM * 0.2) : Math.max(0.5, effectiveTopNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = topSpan.sStart; s <= topSpan.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAt(topGuideSet.baseLine, Math.min(topArcLen, s));
      waistPts.push({ x: p.x - n.x * topXMM, y: p.y - n.y * topXMM });
      basePts.push({ x: p.x, y: p.y });
    }
    return { waistPts, basePts };
  }, [topSpan, topBandEnabled, topHasText, topLayout.placements.length, topBandScript, topXMM, effectiveTopNibMM, topGuideSet.baseLine, topArcLen]);

  const bottomSpanPoly = useMemo(() => {
    if (!bottomSpan || !bottomBandEnabled || !bottomHasText || !bottomLayout.placements.length) return null;
    const ds = bottomBandScript === 'Copperplate' ? Math.max(0.5, bottomXMM * 0.2) : Math.max(0.5, effectiveBottomNibMM * 0.5);
    const waistPts: Pt[] = [];
    const basePts: Pt[] = [];
    for (let s = bottomSpan.sStart; s <= bottomSpan.sEnd + 0.0001; s += ds) {
      const { p, n } = pointAt(bottomGuideSet.baseLine, Math.min(bottomArcLen, s));
      waistPts.push({ x: p.x - n.x * bottomXMM, y: p.y - n.y * bottomXMM });
      basePts.push({ x: p.x, y: p.y });
    }
    return { waistPts, basePts };
  }, [bottomSpan, bottomBandEnabled, bottomHasText, bottomLayout.placements.length, bottomBandScript, bottomXMM, effectiveBottomNibMM, bottomGuideSet.baseLine, bottomArcLen]);

  const bandPolyBetween = (aPts: Pt[], bPts: Pt[]) => `M ${aPts.map(pt => `${pt.x},${pt.y}`).join(' L ')} L ${[...bPts].reverse().map(pt => `${pt.x},${pt.y}`).join(' L ')} Z`;

  const topBandClipT1 = useMemo(() => bandPolyBetween(topGuideSet.baseLine, topGuideSet.waistLine), [topGuideSet.baseLine, topGuideSet.waistLine]);
  const topBandClipT2 = useMemo(() => bandPolyBetween(topGuideSet.waistLine, topGuideSet.ascLine), [topGuideSet.waistLine, topGuideSet.ascLine]);
  const bottomBandClipX = useMemo(() => bandPolyBetween(bottomGuideSet.waistLine, bottomGuideSet.baseLine), [bottomGuideSet.waistLine, bottomGuideSet.baseLine]);
  const bottomBandClipD = useMemo(() => bandPolyBetween(bottomGuideSet.baseLine, bottomGuideSet.descLine), [bottomGuideSet.baseLine, bottomGuideSet.descLine]);

  const startPt = baseline[0];
  const endPt = baseline[baseline.length - 1];
  const endpointsDistance = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
  const baselineLength = arcLen;
  const pageCenter = { x: box.w / 2, y: box.h / 2 };
  const radiusToStart = Math.hypot(pageCenter.x - startPt.x, pageCenter.y - startPt.y);
  const overWarn = layout.overBy > 0;

  const renderLetterBoxes = (
    placements: CurvedTitlePlace[],
    baseGuideLine: Pt[],
    bandArcLen: number,
    bandHeightMM: number,
    scriptId: ScriptId,
    keyPrefix: string,
  ) => placements.map((pl, i) => {
    const sMid = Math.min(bandArcLen, Math.max(0, pl.sMid));
    const halfW = pl.w / 2;
    const h = bandHeightMM;

    const sL = Math.max(0, Math.min(bandArcLen, sMid - halfW));
    const sR = Math.max(0, Math.min(bandArcLen, sMid + halfW));

    const isCopper = scriptId === 'Copperplate';
    const SLANT_FROM_BASELINE_DEG = 55;
    const steps = Math.max(16, Math.ceil((sR - sL) / 2));

    const basePts: { x: number; y: number }[] = [];
    const waistPts: { x: number; y: number }[] = [];

    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const s = sL + (sR - sL) * u;

      const C = pointAt(baseGuideLine, s)
      const p = C.p;
      const n = C.n;

      basePts.push({ x: p.x, y: p.y });

      const dx = isCopper ? (h / Math.tan((SLANT_FROM_BASELINE_DEG * Math.PI) / 180)) : 0;
      const sTop = Math.max(0, Math.min(bandArcLen, isCopper ? (s + dx) : s));

      const Ct = pointAt(baseGuideLine, sTop);
      waistPts.push({ x: Ct.p.x - Ct.n.x * h, y: Ct.p.y - Ct.n.y * h });
    }

    const isCap = pl.ch >= 'A' && pl.ch <= 'Z';
    const fillCol = isCap ? 'rgba(99,102,241,0.10)' : 'rgba(16,185,129,0.10)';
    const strokeCol = isCap ? '#6366f1' : '#10b981';
    const boxPathD = (() => {
      const top = waistPts.map((pt) => `${pt.x},${pt.y}`).join(' L ');
      const bot = [...basePts].reverse().map((pt) => `${pt.x},${pt.y}`).join(' L ');
      return `M ${top} L ${bot} Z`;
    })();

    return (
      <g key={`${keyPrefix}-${i}`}>
        <path
          d={boxPathD}
          fill={fillCol}
          stroke={strokeCol}
          strokeWidth={swThin}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  });







  // ---------- ViewBox (includes stage margin so paper stands out) ----------
  const camera = useEditorCamera(svgRef, {x:0,y:0,w:box.w,h:box.h}, pointBounds([guideSet, ...(topBandEnabled ? [topGuideSet] : []), ...(bottomBandEnabled ? [bottomGuideSet] : [])].flatMap(g => [...g.ascLine, ...g.waistLine, ...g.baseLine, ...g.descLine]),{x:0,y:0,w:box.w,h:box.h},8));
  const vb = camera;


  /* ---------------- Export actions ---------------- */
  function downloadSVG() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Export is always exact page, not stage
    clone.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    clone.setAttribute('width', `${box.w}mm`);
    clone.setAttribute('height', `${box.h}mm`);

    bakeExportStrokes(svg, clone, box.w);
    stripNoExport(clone);

    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'curved-title.svg');
  }

  async function downloadPDF() {
    const svg = svgRef.current;
    if (!svg) return;

    const { wPx, hPx } = computeRasterPxPerMM(box.w, box.h);

    const clone = cloneSvgForRasterExport(svg, box.w, box.h, wPx, hPx, bakeExportStrokes, stripNoExport);
    const dataUrl = await renderSvgCloneToJpegDataUrl(clone, wPx, hPx);

    const pdfBlob = makeSimplePdfFromJpeg(dataUrl, mmToPt(box.w), mmToPt(box.h), wPx, hPx);
    downloadBlob(pdfBlob, 'curved-title.pdf');
  }

  async function printToScale() {
    const svg = svgRef.current;
    if (!svg) return;

    const { wPx, hPx } = computeRasterPxPerMM(box.w, box.h);

    const clone = cloneSvgForRasterExport(svg, box.w, box.h, wPx, hPx, bakeExportStrokes, stripNoExport);
    const dataUrl = await renderSvgCloneToJpegDataUrl(clone, wPx, hPx);
    printJpegDataUrlToScale(dataUrl, box.w, box.h);
  }

  /* ---------------- Pan & Curve Drag handlers ---------------- */


  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mmPerPxX = vb.vw / rect.width;
    const mmPerPxY = vb.vh / rect.height;

    if (dragRef.current.mode === 'curve') {
      const proposedX = (dragRef.current.ox ?? curveOffset.x) + (e.clientX - dragRef.current.px) * mmPerPxX;
      const proposedY = (dragRef.current.oy ?? curveOffset.y) + (e.clientY - dragRef.current.py) * mmPerPxY;

      // Clamp
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const nx = clamp(proposedX, -box.w, box.w);
      const ny = clamp(proposedY, -box.h, box.h);

      // Sticky horizontal centre:
      // target x offset that centers curve = centerDx
      const diffToCenter = nx - centerDx;
      const snapped = snapStateRef.current.snapped;

      let finalX = nx;
      let nextSnapped = snapped;

      if (snapped) {
        // Keep snapped until user drags far enough to "break free"
        if (Math.abs(diffToCenter) > RELEASE_MM) {
          nextSnapped = false;
          finalX = nx;
        } else {
          finalX = centerDx;
        }
      } else {
        // Not snapped: snap in if close enough (gives that “magnetic” feel)
        if (Math.abs(diffToCenter) < SNAP_IN_MM) {
          nextSnapped = true;
          finalX = centerDx;
        } else {
          finalX = nx;
        }
      }

      snapStateRef.current.snapped = nextSnapped;
      setCurveOffset({ x: finalX, y: ny });
      return;
    }


  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    setIsCurveDragging(false);


  }








  function defaultGuideOffset() {
    // Use the current guideSet (which is built from baseline including curveOffset)
    // but compute the offset as if we were centered on X and at y=0.
    // We do that by measuring current guide center and shifting it to a target Y.
    const pts = [
      ...guideSet.ascLine,
      ...guideSet.waistLine,
      ...guideSet.baseLine,
      ...guideSet.descLine,
    ];

    const ys = pts.map(p => p.y);
    const guideCy = (Math.min(...ys) + Math.max(...ys)) / 2;

    // Closer to top than before. Tune if needed.
    const targetCy = box.h * 0.22;

    // Because guideSet already includes the current curveOffset,
    // return the delta needed from the current y.
    return targetCy - guideCy;
  }

  function resetGuidePlacement() {
    // Same placement as initial load: centered X, and guide center nearer the top.
    const pts = [
      ...guideSet.ascLine,
      ...guideSet.waistLine,
      ...guideSet.baseLine,
      ...guideSet.descLine,
    ];
    const ys = pts.map(p => p.y);
    const guideCy = (Math.min(...ys) + Math.max(...ys)) / 2;

    const targetCy = box.h * 0.22;
    const dy = targetCy - guideCy;

    snapStateRef.current.snapped = true;

    setCurveOffset(prev => ({
      x: centerDx,
      y: prev.y + dy,
    }));
  }



  function centerCurveHorizontally() {
    snapStateRef.current.snapped = true;
    setCurveOffset(prev => ({ x: centerDx, y: prev.y }));
  }

  function resetTransform() {
    setRotDeg(0);
    setScalePct(100);
  }

  function onGuidePointerDown(e: React.PointerEvent<SVGPathElement | SVGLineElement>) {
    camera.freeze();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);



    dragRef.current = {
      px: e.clientX,
      py: e.clientY,
      panX: 0,
      panY: 0,
      mode: 'curve',
      ox: curveOffset.x,
      oy: curveOffset.y,
    };
    setIsCurveDragging(true);
  }

  useLayoutEffect(() => {
    // On first mount only: center horizontally and move the curve nearer the top (A4 default feel).
    // After that, do not fight the user.
    if (didInitPlacementRef.current) return;
    didInitPlacementRef.current = true;

    // Compute current guide bounds center (with current curveOffset)
    const pts = [
      ...guideSet.ascLine,
      ...guideSet.waistLine,
      ...guideSet.baseLine,
      ...guideSet.descLine,
    ];
    const ys = pts.map(p => p.y);
    const guideCy = (Math.min(...ys) + Math.max(...ys)) / 2;

    // Target: closer to the top (tune to match screenshot)
    const targetCy = box.h * 0.22;


    snapStateRef.current.snapped = true;

    // Set X to true center, set Y so the guide center hits targetCy.
    // We compute the needed delta in page-mm coordinates.
    const dy = targetCy - guideCy;
    setCurveOffset(prev => ({ x: centerDx, y: prev.y + dy }));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <EditorWorkspace preview={<>
<section className="">




        <div className="preview-panel  mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <PreviewToolbar camera={camera}><Button
                onMouseDown={e => e.preventDefault()}
                onClick={resetGuidePlacement}
                className="shrink-0   text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                Reset guide
              </Button>
<Button
                onMouseDown={e => e.preventDefault()}
                onClick={centerCurveHorizontally}
                className="shrink-0   text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                Center horizontally
              </Button>
<Button
                onMouseDown={e => e.preventDefault()}
                onClick={downloadSVG}
                className="shrink-0 ml-2   text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                SVG
              </Button>
<Button
                onMouseDown={e => e.preventDefault()}
                onClick={downloadPDF}
                className="shrink-0   text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                PDF
              </Button>
<Button
                onMouseDown={e => e.preventDefault()}
                onClick={printToScale}
                className="shrink-0   text-sm rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none transition"
              >
                Print
              </Button></PreviewToolbar>


          {/* Darker stage behind paper */}
          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className="editor-svg"
              style={{ background: '#cbd5e1' }}
              preserveAspectRatio="xMidYMid meet"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <defs>
                <clipPath id="pageClip">
                  <rect x={0} y={0} width={box.w} height={box.h} />
                </clipPath>
                <clipPath id="topBandClip">
                  <path d={topBandClipT1} />
                  <path d={topBandClipT2} />
                </clipPath>
                <clipPath id="bottomBandClip">
                  <path d={bottomBandClipX} />
                  <path d={bottomBandClipD} />
                </clipPath>
              </defs>

              {/* stage bg (kept only for on-screen; removed in export) */}
              <rect id="stage-bg" x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />

              {/* Paper */}
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

              <g clipPath="url(#pageClip)">
                {midAscPts && (
                  <path
                    d={pathD(midAscPts)}
                    fill="none"
                    stroke="rgba(17, 24, 39, 0.35)"
                    strokeWidth={0.9}
                    strokeDasharray={`10 ${MIDLINE_DASH_GAP}`}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                  />
                )}
                {midDescPts && (
                  <path
                    d={pathD(midDescPts)}
                    fill="none"
                    stroke="rgba(17, 24, 39, 0.35)"
                    strokeWidth={0.9}
                    strokeDasharray={`10 ${MIDLINE_DASH_GAP}`}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                  />
                )}
                {topBandWaistLine && (
                  <path
                    d={pathD(topBandWaistLine)}
                    fill="none"
                    stroke={isCurveDragging ? '#7c3aed' : '#111827'}
                    strokeWidth={swBold}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {topBandAscLine && (
                  <path
                    d={pathD(topBandAscLine)}
                    fill="none"
                    stroke={isCurveDragging ? '#7c3aed' : '#111827'}
                    strokeWidth={swThin}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {bottomBandBaseLine && (
                  <path
                    d={pathD(bottomBandBaseLine)}
                    fill="none"
                    stroke={isCurveDragging ? '#7c3aed' : '#111827'}
                    strokeWidth={swBold}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {bottomBandDescLine && (
                  <path
                    d={pathD(bottomBandDescLine)}
                    fill="none"
                    stroke={isCurveDragging ? '#7c3aed' : '#111827'}
                    strokeWidth={swThin}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {/* Guides */}
                <GuideOverlay
                  guideSet={guideSet}
                  style={{
                    thin: swBold,
                    bold: swBold,
                    grid: { thin: swBold, showHorizontal: script !== 'InsularMajuscule' || showInsularGrid, showVertical: script !== 'InsularMajuscule' || showInsularGrid },
                    colors: {
                      thin: isCurveDragging ? '#7c3aed' : '#111827',
                      bold: isCurveDragging ? '#7c3aed' : '#111827',
                      tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                      frame: '#cbd5e1',
                      construction: constructionGuides.color,
                    },
                  }}
                  interactive={{
                    onGuidePointerDown,
                    hitStrokeWidthMM: Math.max(8, swBold * 8),
                  }}
                />

                {topBandEnabled && (
                  <g clipPath="url(#topBandClip)">
                    <GuideOverlay
                      guideSet={topGuideSet}
                      style={{
                        thin: swBold,
                        bold: swBold,
                        grid: { thin: swBold, showHorizontal: topBandScript !== 'InsularMajuscule' || showInsularGrid, showVertical: topBandScript !== 'InsularMajuscule' || showInsularGrid },
                        colors: {
                          thin: isCurveDragging ? '#7c3aed' : '#111827',
                          bold: isCurveDragging ? '#7c3aed' : '#111827',
                          tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                          frame: 'transparent',
                          construction: constructionGuides.color,
                          base: 'transparent',
                          desc: 'transparent',
                        },
                      }}
                    />
                  </g>
                )}

                {bottomBandEnabled && (
                  <g clipPath="url(#bottomBandClip)">
                    <GuideOverlay
                      guideSet={bottomGuideSet}
                      style={{
                        thin: swBold,
                        bold: swBold,
                        grid: { thin: swBold, showHorizontal: bottomBandScript !== 'InsularMajuscule' || showInsularGrid, showVertical: bottomBandScript !== 'InsularMajuscule' || showInsularGrid },
                        colors: {
                          thin: isCurveDragging ? '#7c3aed' : '#111827',
                          bold: isCurveDragging ? '#7c3aed' : '#111827',
                          tick: isCurveDragging ? '#a78bfa' : '#e2e8f0',
                          frame: 'transparent',
                          construction: constructionGuides.color,
                          asc: 'transparent',
                          waist: 'transparent',
                        },
                      }}
                    />
                  </g>
                )}

                {showSpanFill && spanPoly && (
                  <>
                    <path
                      d={`M ${spanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${spanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${spanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${spanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                      className="cursor-move"
                      onPointerDown={onGuidePointerDown}
                    />
                  </>
                )}
                {showSpanFill && topSpanPoly && (
                  <>
                    <path
                      d={`M ${topSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${topSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${topSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${topSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                      className="cursor-move"
                      onPointerDown={onGuidePointerDown}
                    />
                  </>
                )}

                {showSpanFill && bottomSpanPoly && (
                  <>
                    <path
                      d={`M ${bottomSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${bottomSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(148,163,184,0.18)"
                      stroke={isCurveDragging ? '#7c3aed' : 'rgba(100,116,139,0.55)'}
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${bottomSpanPoly.waistPts.map(p => `${p.x},${p.y}`).join(' L ')} L ${bottomSpanPoly.basePts
                        .slice()
                        .reverse()
                        .map(p => `${p.x},${p.y}`)
                        .join(' L ')} Z`}
                      fill="rgba(0,0,0,0.0001)"
                      stroke="none"
                      pointerEvents="fill"
                      className="cursor-move"
                      onPointerDown={onGuidePointerDown}
                    />
                  </>
                )}

                {/* Letter boxes: true rectangles */}
                {showBoxes && renderLetterBoxes(layout.placements, guideSet.baseLine, arcLen, xMM, script, 'main')}
                {showBoxes && topBandEnabled && renderLetterBoxes(topLayout.placements, topGuideSet.baseLine, topArcLen, topXMM, topBandScript, 'top')}
                {showBoxes && bottomBandEnabled && renderLetterBoxes(bottomLayout.placements, bottomGuideSet.baseLine, bottomArcLen, bottomXMM, bottomBandScript, 'bottom')}

                {textSpanMarkers&&<g data-text-span-markers="true" fill="none" stroke="#111827" strokeWidth={swBold} strokeLinecap="square" vectorEffect="non-scaling-stroke">
                  <line data-text-span-marker="start" x1={textSpanMarkers.start.from.x} y1={textSpanMarkers.start.from.y} x2={textSpanMarkers.start.to.x} y2={textSpanMarkers.start.to.y}/>
                  {textSpanMarkers.end.map((marker,index)=><line key={index} data-text-span-marker="end" x1={marker.from.x} y1={marker.from.y} x2={marker.to.x} y2={marker.to.y}/>) }
                </g>}

                {/* Endpoints */}
                <circle cx={startPt.x} cy={startPt.y} r={1} fill="#0ea5e9" />
                <circle cx={endPt.x} cy={endPt.y} r={1} fill="#0ea5e9" />

                {/* GREEN CENTER INDICATOR:
                    - Visible whenever horizontally centered (even if moved)
                    - NOT exported/printed
                */}
                {isCenteredHorizontally && (
                  <g data-no-export="true">
                    <circle cx={box.w / 2} cy={box.h / 2} r={1.1} fill="#22c55e" />
                    <line
                      x1={pageCenter.x}
                      y1={pageCenter.y}
                      x2={startPt.x}
                      y2={startPt.y}
                      stroke="#94a3b8"
                      strokeDasharray="4 3"
                      strokeWidth={swThin}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={pageCenter.x} y={pageCenter.y + 6} textAnchor="middle" fontSize={fs(3)} fill="#64748b">
                      Centre → start {radiusToStart.toFixed(1)} mm
                    </text>
                  </g>
                )}
              </g>
            </svg>

            <div className="pointer-events-none absolute right-3 bottom-2 text-[13px] text-slate-700 text-right space-y-0.5">
              {overWarn && <div className="text-[13px] text-red-600 font-medium">Title exceeds curve</div>}
              <div>
                Curve length: {baselineLength.toFixed(1)} mm · Script length: {run.totalAdvanceMM.toFixed(1)} mm
              </div>
            </div>
          </div>
        </div>
      </section>
</>} inspector={<><InspectorIntro>Plan curved headings (“resolutions”) for Copperplate and Textura Quadrata. Letters stay upright; guides follow the curve.
          </InspectorIntro>
<section className="   mx-auto grid grid-cols-1  gap-6">
        {/* Step 1 */}
        <DisclosureSection title="Document & Script" defaultOpen headerAction={<InfoTip side="right">Curve guide movement snaps to horizontal centre unless you pull far enough to release.</InfoTip>}>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div className="sm:col-span-2">
              <InsetLabeledField label="Script">
                <Select className={INSET_CONTROL_BASE} value={script} onChange={e => {
                   const next = e.target.value as ScriptId;
                   setScript(next);
                   if (next === 'InsularMajuscule') { setXNib(5); setAscNib(2); setDescNib(2); setPenAngleDeg(15); setShowInsularGrid(false); }
                   else if (next === 'Fraktur' || next === 'TexturaQuadrata') { setXNib(4.5); setAscNib(2); setDescNib(2); setPenAngleDeg(next === 'Fraktur' ? 40 : 45); }
                 }}>
                  <option value="Copperplate">Copperplate</option>
                  <option value="Fraktur">Fraktur</option>
                  <option value="TexturaQuadrata">Textura Quadrata</option>
                   <option value="InsularMajuscule">Insular Majuscule</option>
                </Select>
              </InsetLabeledField>
            </div>
            {(script === 'InsularMajuscule' || (topBandEnabled && topBandScript === 'InsularMajuscule') || (bottomBandEnabled && bottomBandScript === 'InsularMajuscule')) && <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm"><Toggle type="checkbox" checked={showInsularGrid} onChange={e => setShowInsularGrid(e.target.checked)} /> Show intermediate grid</label>}

            <div>
              <InsetLabeledField label="Paper size">
                <Select
                  className={INSET_CONTROL_BASE}
                  value={paper}
                  onChange={e => {
                    const id = e.target.value as PaperId;
                    setPaper(id);
                    setOrientation(PAPERS_MM[id].defaultOrientation);
                    camera.fit('page');
                  }}
                >
                  {Object.entries(PAPERS_MM).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </InsetLabeledField>
            </div>

            <div>
              <InsetLabeledField label="Orientation">
                <Select className={INSET_CONTROL_BASE} value={orientation} onChange={e => setOrientation(e.target.value as Orientation)}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </Select>
              </InsetLabeledField>
            </div>

            <div className="sm:col-span-2">
              <InsetLabeledField label="Curve">
                <Select className={INSET_CONTROL_BASE} value={curve} onChange={e => setCurve(e.target.value as CurvePresetId)}>
                  <option value="simpleArch">Simple Arch</option>
                  <option value="highArch">High Arch</option>
                  <option value="shallowArch">Shallow Arch</option>
                  <option value="compoundArch">Compound Arch</option>
                  <option value="zanerian">Zanerian Resolution</option>
                  <option value="custom">Custom</option>
                </Select>
              </InsetLabeledField>
              {curve === 'custom' && <CustomCurveUpload value={customCurve} onChange={setCustomCurve} />}
            </div>

            <div className="sm:col-span-2">
              <div className="my-2 border-t border-slate-200/70" />
            </div>

            <div className="sm:col-span-2">
              <InsetLabeledField label="Title text">
              <input className={INSET_CONTROL_BASE} value={text} onChange={e => setText(e.target.value)} />
              </InsetLabeledField>
            </div>

            {topBandEnabled && (
              <div className="sm:col-span-2">
                <InsetLabeledField label="Top text">
                <input className={INSET_CONTROL_BASE} value={topText} onChange={e => setTopText(e.target.value)} />
                </InsetLabeledField>
              </div>
            )}

            {bottomBandEnabled && (
              <div className="sm:col-span-2">
                <InsetLabeledField label="Bottom text">
                <input className={INSET_CONTROL_BASE} value={bottomText} onChange={e => setBottomText(e.target.value)} />
                </InsetLabeledField>
              </div>
            )}
          </div>
        </DisclosureSection>

        {/* Step 2 */}
        <DisclosureSection title="Script & Dimensions" defaultOpen headerAction={<InfoTip side="right">
              {script === 'Copperplate'
                ? 'Copperplate uses x-height (mm) with optional calibration for lowercase scale and spacing.'
                : 'Heights are nibs × nib size (mm).'}
            </InfoTip>}>


          {(script === 'Copperplate' || (topBandEnabled && topBandScript === 'Copperplate') || (bottomBandEnabled && bottomBandScript === 'Copperplate')) && <SlantStyleControl value={slantStyle} onChange={setSlantStyle} />}
          {script !== 'Copperplate' && <div className="mt-3 rounded-xl border border-slate-200 p-3"><h3 className="mb-2 text-sm font-semibold text-slate-700">Construction guides</h3><ConstructionGuideControls script={script} value={constructionGuides} onChange={setConstructionGuides} compact /></div>}

          {script === 'Copperplate' ? (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <InsetLabeledField label="X-height" rightAdornment="mm">
                    <Select
                      className={INSET_CONTROL_MM}
                      value={xHeightMM}
                      onChange={(e) => setXHeightMM(parseFloat(e.target.value))}
                    >
                      {X_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v.toFixed(1)}
                        </option>
                      ))}
                    </Select>
                  </InsetLabeledField>
                </div>
                <div>
                  <InsetLabeledField label="Capitals" disabled={useCalibration}>
                    <Select
                      className={INSET_CONTROL_BASE}
                      value={capStyle}
                      onChange={(e) => setCapStyle(e.target.value as 'simple' | 'flourished')}
                      disabled={useCalibration}
                    >
                      <option value="simple">Simple (body widths)</option>
                      <option value="flourished">Flourished (full widths)</option>
                    </Select>
                  </InsetLabeledField>
                  {useCalibration && <p className="mt-1 text-[11px] text-slate-400">Disabled while calibration is enabled.</p>}
                </div>
              </div>

              <div>
                <InsetLabeledField label="Guideline ratio (desc : x : asc)">
                <Select
                  className={INSET_CONTROL_BASE}
                  value={copperplateRatioPreset}
                  onChange={(e) => setCopperplateRatioPreset(e.target.value as CopperplateRatioPreset)}
                >
                  <option value="2:1:2">2 : 1 : 2 (default)</option>
                  <option value="3:2:3">3 : 2 : 3</option>
                  <option value="1:1:1">1 : 1 : 1</option>
                  <option value="custom">Custom…</option>
                </Select>
                </InsetLabeledField>
                <p className="mt-1 text-[11px] text-slate-400">Ascender/descender scale from x-height.</p>
              </div>

              <hr className="mt-4 mb-3 border-t border-slate-200" />
              <div className="mt-2 flex items-center gap-4">
  <div className="flex-1">
    <div className="text-sm font-medium text-slate-700">Calibration (optional)</div>
    <p className="text-xs text-slate-500">
      Stored per x-height. Adjusts lowercase scale + spacing.
    </p>
  </div>

  <Button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={() =>
      setUseCalibration((v) => {
        const next = !v;
        if (!next) setShowAdvanced(false);
        return next;
      })
    }
    className={`shrink-0 inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition select-none
      ${useCalibration
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
  >
    <span
      className={`mr-2 inline-flex h-4 w-7 items-center rounded-full transition
        ${useCalibration ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}
    >
      <span className="h-3 w-3 rounded-full bg-white shadow" />
    </span>
    {useCalibration ? 'Calibration: On' : 'Calibration: Off'}
  </Button>
</div>

              {useCalibration && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex flex-col gap-1">
                      <InsetLabeledField label={CAL_WORD} rightAdornment="mm">
                        <NumericInput
                          type="number"
                          step="0.1"
                          min="0"
                          className={INSET_CONTROL_MM}
                          placeholder="Lowercase word"
                          value={calWordLowerMM}
                          onChange={(e) => setCalWordLowerMM(e.target.value)}
                        />
                      </InsetLabeledField>
                    </div>

                    <div className="flex flex-col gap-1">
                      <InsetLabeledField label={CAL_WORD_DOUBLE} rightAdornment="mm">
                        <NumericInput
                          type="number"
                          step="0.1"
                          min="0"
                          className={INSET_CONTROL_MM}
                          placeholder="Double word"
                          value={calWordDoubleMM}
                          onChange={(e) => setCalWordDoubleMM(e.target.value)}
                        />
                      </InsetLabeledField>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-indigo-600 select-none"
                    >
                      <span className={`inline-block transform transition-transform ${showAdvanced ? 'rotate-90' : 'rotate-0'}`}>▶</span>
                      <span>Advanced tweaks</span>
                    </Button>

                    {showAdvanced && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-end">
                            <span className="font-mono text-slate-500">×{userScaleFactor.toFixed(2)}</span>
                          </div>
                          <InsetLabeledField label="Overall scale">
                            <NumericInput
                              type="number"
                              step="0.01"
                              min="0.7"
                              max="1.3"
                              className={INSET_CONTROL_BASE}
                              value={userScaleFactor}
                              onChange={(e) => setUserScaleFactor(clamp(parseFloat(e.target.value || '1') || 1, 0.7, 1.3))}
                            />
                          </InsetLabeledField>
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-end">
                            <span className="font-mono text-slate-500">×{userSpaceFactor.toFixed(2)}</span>
                          </div>
                          <InsetLabeledField label="Spacing factor">
                            <NumericInput
                              type="number"
                              step="0.01"
                              min="0.5"
                              max="1.5"
                              className={INSET_CONTROL_BASE}
                              value={userSpaceFactor}
                              onChange={(e) => setUserSpaceFactor(clamp(parseFloat(e.target.value || '1') || 1, 0.5, 1.5))}
                            />
                          </InsetLabeledField>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}



              {copperplateRatioPreset === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <InsetLabeledField label="Desc units">
                    <NumericInput
                      type="number"
                      min={0}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateDescUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateDescUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateDescUnits(Math.max(0, parsed));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();

                        const current = parseFloat(copperplateDescUnitsText);
                        const safe = Number.isFinite(current) ? current : copperplateDescUnits;
                        const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                        const stepped = stepHalfFrom(safe, dir);
                        const next = Math.max(0, stepped);
                        setCopperplateDescUnitsText(String(next));
                        setCopperplateDescUnits(next);
                      }}
                      onBlur={() => {
                        const v = parseFloat(copperplateDescUnitsText);
                        if (!Number.isFinite(v)) {
                          setCopperplateDescUnitsText(String(copperplateDescUnits));
                          return;
                        }
                        const next = Math.max(0, v);
                        setCopperplateDescUnitsText(String(next));
                        setCopperplateDescUnits(next);
                      }}
                    />
                    </InsetLabeledField>
                  </div>
                  <div>
                    <InsetLabeledField label="X units">
                    <NumericInput
                      type="number"
                      min={0.5}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateXUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateXUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateXUnits(Math.max(0.1, parsed));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();

                        const current = parseFloat(copperplateXUnitsText);
                        const safe = Number.isFinite(current) ? current : copperplateXUnits;
                        const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                        const stepped = stepHalfFrom(safe, dir);
                        const next = Math.max(0.5, stepped);
                        setCopperplateXUnitsText(String(next));
                        setCopperplateXUnits(next);
                      }}
                      onBlur={() => {
                        const v = parseFloat(copperplateXUnitsText);
                        if (!Number.isFinite(v)) {
                          setCopperplateXUnitsText(String(copperplateXUnits));
                          return;
                        }
                        const next = Math.max(0.5, v);
                        setCopperplateXUnitsText(String(next));
                        setCopperplateXUnits(next);
                      }}
                    />
                    </InsetLabeledField>
                  </div>
                  <div>
                    <InsetLabeledField label="Asc units">
                    <NumericInput
                      type="number"
                      min={0}
                      step="0.5"
                      className={INSET_CONTROL_BASE}
                      value={copperplateAscUnitsText}
                      onWheel={(e) => {
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCopperplateAscUnitsText(next);
                        const parsed = parseFloat(next);
                        if (Number.isFinite(parsed)) {
                          setCopperplateAscUnits(Math.max(0, parsed));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();

                        const current = parseFloat(copperplateAscUnitsText);
                        const safe = Number.isFinite(current) ? current : copperplateAscUnits;
                        const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                        const stepped = stepHalfFrom(safe, dir);
                        const next = Math.max(0, stepped);
                        setCopperplateAscUnitsText(String(next));
                        setCopperplateAscUnits(next);
                      }}
                      onBlur={() => {
                        const v = parseFloat(copperplateAscUnitsText);
                        if (!Number.isFinite(v)) {
                          setCopperplateAscUnitsText(String(copperplateAscUnits));
                          return;
                        }
                        const next = Math.max(0, v);
                        setCopperplateAscUnitsText(String(next));
                        setCopperplateAscUnits(next);
                      }}
                    />
                    </InsetLabeledField>
                  </div>
                </div>
              )}


            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <InsetLabeledField label="Nib size" rightAdornment="mm">
                  <NumericInput
                    type="number"
                    step="any"
                    min={0.2}
                    className={INSET_CONTROL_MM}
                    value={nibText}
                    onWheel={(e) => {
                      // Prevent mouse wheel from stepping this number input
                      (e.currentTarget as HTMLInputElement).blur();
                    }}
                    onChange={(e) => {
                      // Allow free typing (e.g. "3.8", "2.", "")
                      setNibText(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                      e.preventDefault();

                      const current = parseFloat(nibText);
                      const safe = Number.isFinite(current) ? current : 2;
                      const dir: 1 | -1 = e.key === 'ArrowUp' ? 1 : -1;

                      const stepped = stepHalfFrom(safe, dir);
                      setNibText(String(Math.max(0.2, stepped)));
                    }}
                    onBlur={() => {
                      // Validate only (NO snapping)
                      const v = parseFloat(nibText);
                      if (!Number.isFinite(v)) {
                        setNibText('2');
                        return;
                      }
                      setNibText(String(Math.max(0.2, v)));
                    }}
                  />
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="x-height (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <NumericInput type="number" step={0.5} min={1} max={8} className={INSET_CONTROL_WIDE} value={xNib} onChange={e => setXNib(parseFloat(e.target.value || '5'))} />
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="Ascender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <NumericInput type="number" step={0.5} min={0} max={8} className={INSET_CONTROL_WIDE} value={ascNib} onChange={e => setAscNib(parseFloat(e.target.value || '3'))} />
                </InsetLabeledField>
              </div>
              <div>
                <InsetLabeledField label="Descender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                  <NumericInput type="number" step={0.5} min={0} max={8} className={INSET_CONTROL_WIDE} value={descNib} onChange={e => setDescNib(parseFloat(e.target.value || '2'))} />
                </InsetLabeledField>
              </div>
              <div className="col-span-2">
                <InsetLabeledField label="Nib angle (°)">
                <Select
                  className={INSET_CONTROL_BASE}
                  value={penAngleDeg}
                  onChange={(e) => setPenAngleDeg(parseInt(e.target.value, 10) as 15 | 35 | 40 | 45)}
                >
                  <option value={15}>15°</option>
                   <option value={35}>35°</option>
                  <option value={40}>40°</option>
                  <option value={45}>45°</option>
                </Select>
                </InsetLabeledField>
              </div>
            </div>
          )}

          <div className="my-3 border-t border-slate-200/70" />
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-700">Top band</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <Toggle type="checkbox" className="sr-only peer" checked={topBandEnabled} onChange={e => setTopBandEnabled(e.target.checked)} aria-label="Top band" />
                  <span className="w-9 h-5 bg-slate-300 rounded-full transition-colors peer-checked:bg-indigo-600" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InsetLabeledField label="Script" disabled={!topBandEnabled}>
                  <Select
                    className={INSET_CONTROL_BASE}
                    value={topBandScript}
                    onChange={e => setTopBandScript(e.target.value as ScriptId)}
                    disabled={!topBandEnabled}
                  >
                    <option value="TexturaQuadrata">TexturaQuadrata</option>
                     <option value="InsularMajuscule">Insular Majuscule</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="Copperplate">Copperplate</option>
                  </Select>
                </InsetLabeledField>
                <InsetLabeledField label={topBandScript === 'Copperplate' ? 'x-height' : 'Nib size'} disabled={!topBandEnabled} rightAdornment="mm">
                    <NumericInput
                      type="number"
                      step="any"
                      min={0.2}
                      className={INSET_CONTROL_MM}
                      value={topBandSizeText}
                      onChange={e => setTopBandSizeText(e.target.value)}
                      disabled={!topBandEnabled}
                    />
                </InsetLabeledField>
              </div>
            </div>

            <div className="my-3 border-t border-slate-200/70" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-700">Bottom band</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <Toggle type="checkbox" className="sr-only peer" checked={bottomBandEnabled} onChange={e => setBottomBandEnabled(e.target.checked)} aria-label="Bottom band" />
                  <span className="w-9 h-5 bg-slate-300 rounded-full transition-colors peer-checked:bg-indigo-600" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InsetLabeledField label="Script" disabled={!bottomBandEnabled}>
                  <Select
                    className={INSET_CONTROL_BASE}
                    value={bottomBandScript}
                    onChange={e => setBottomBandScript(e.target.value as ScriptId)}
                    disabled={!bottomBandEnabled}
                  >
                    <option value="TexturaQuadrata">TexturaQuadrata</option>
                     <option value="InsularMajuscule">Insular Majuscule</option>
                    <option value="Fraktur">Fraktur</option>
                    <option value="Copperplate">Copperplate</option>
                  </Select>
                </InsetLabeledField>
                <InsetLabeledField label={bottomBandScript === 'Copperplate' ? 'x-height' : 'Nib size'} disabled={!bottomBandEnabled} rightAdornment="mm">
                    <NumericInput
                      type="number"
                      step="any"
                      min={0.2}
                      className={INSET_CONTROL_MM}
                      value={bottomBandSizeText}
                      onChange={e => setBottomBandSizeText(e.target.value)}
                      disabled={!bottomBandEnabled}
                    />
                </InsetLabeledField>
              </div>
            </div>
          </div>
        </DisclosureSection>


        {/* Step 3 */}
        <DisclosureSection title="Shape, Path & Guides" defaultOpen headerAction={<InfoTip side="right">Rotate and scale the curve.</InfoTip>}>


          <div className="grid grid-cols-1 gap-4 mt-3 select-none">



            <div>
              <label className="font-medium text-slate-700">Rotation (°) <span className="text-indigo-600">{rotDeg}°</span></label>
              <Slider type="range" min={-180} max={180} step={1} value={rotDeg} onChange={e => setRotDeg(parseInt(e.target.value, 10))} className="w-full" />
            </div>

            <div>
              <label className="font-medium text-slate-700">Scale (%) <span className="text-indigo-600">{scalePct}%</span></label>
              <Slider type="range" min={60} max={140} step={1} value={scalePct} onChange={e => setScalePct(parseInt(e.target.value, 10))} className="w-full" />
            </div>


            <div className="flex flex-wrap items-center gap-3">
              <Button onMouseDown={e => e.preventDefault()} onClick={resetTransform} className="  text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
                Reset rotation &amp; scale
              </Button>
              <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                <Toggle
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  checked={flipCurve}
                  onChange={e => setFlipCurve(e.target.checked)}
                />
                Flip curve
              </label>
            </div>
          </div>

            <div className="my-3 border-t border-slate-200/70" />
              <div>
              <InsetLabeledField label="Text alignment">
                <Select className={INSET_CONTROL_BASE} value={align} onChange={e => setAlign(e.target.value as AlignMode)}>
                <option value="start">Start</option>
                <option value="center">Centered</option>
                <option value="end">End</option>
              </Select>
              </InsetLabeledField>
            </div>
          <div className="mt-4 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <Toggle
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={showBoxes}
                onChange={e => setShowBoxes(e.target.checked)}
              />
              Letter bounding boxes
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-800">
              <Toggle
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={showSpanFill}
                onChange={e => setShowSpanFill(e.target.checked)}
              />
              Title span fill
            </label>
          </div>
        </DisclosureSection>
      </section>
</>}></EditorWorkspace>
  );
}
