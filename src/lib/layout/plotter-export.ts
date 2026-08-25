import { buildCalligramModel } from '@/lib/calligram/model';
import { buildCurvedTitleModel } from '@/lib/curved-title/model';
import { buildStraightSlantLines, calculateStraightGuidelines } from '@/lib/guides/straight/model';
import { constructionGuideDotPoints, type ConstructionGuideAppearance } from '@/lib/guides/guide-template';
import { occupiedRect } from '@/lib/layout/geometry';
import { pathHasOnlyClosedSubpaths, type ArtworkNode } from '@/lib/layout/artwork';
import { shapePolygonPoints } from '@/lib/layout/shape';
import { pageSize, type Frame, type LayoutElement, type PageElement } from '@/lib/layout/types';
import type { GuidelinesTextFitEntry } from '@/lib/layout/guidelines-text-fit';

/**
 * Cricut/plotter export invariant:
 *
 * Every point handled by this module is a physical page coordinate in millimetres.
 * We may split, clip, dash, or omit geometry, but we must never rescale the Layout.
 */

export type CricutMatId = '12x12' | '12x24';

export type PlotterExportOptions = {
  baselineIndicators: boolean;
  textStartEndMarkers: boolean;
  slantGuides: boolean;
  secondarySlantGuides: boolean;
  midpointReferences: boolean;
  constructionGrid: boolean;
  constructionGuides: boolean;
  nibAngleMarker: boolean;
  calligramCenterMarkers: boolean;
  shapeOutlines: boolean;
};

export const DEFAULT_PLOTTER_EXPORT_OPTIONS: PlotterExportOptions = {
  baselineIndicators: true,
  textStartEndMarkers: true,
  slantGuides: true,
  secondarySlantGuides: true,
  midpointReferences: true,
  constructionGrid: true,
  constructionGuides: true,
  nibAngleMarker: false,
  calligramCenterMarkers: false,
  shapeOutlines: true,
};

export const CRICUT_ANCHOR_MM = 6.35;
export const CRICUT_PEN_STROKE_MM = 0.2;

export const CRICUT_MATS: Record<CricutMatId, {
  label: string;
  physicalWidthMM: number;
  physicalHeightMM: number;
  drawableWidthMM: number;
  drawableHeightMM: number;
}> = {
  '12x12': {
    label: '12 × 12',
    physicalWidthMM: 304.8,
    physicalHeightMM: 304.8,
    drawableWidthMM: 292.1,
    drawableHeightMM: 292.1,
  },
  '12x24': {
    label: '12 × 24',
    physicalWidthMM: 304.8,
    physicalHeightMM: 609.6,
    drawableWidthMM: 292.1,
    drawableHeightMM: 596.9,
  },
};

type Pt = { x: number; y: number };
type PlotPolyline = { points: Pt[]; source: string };
type GuideLike = {
  ascLine: Pt[];
  waistLine: Pt[];
  baseLine: Pt[];
  descLine: Pt[];
  ticks?: { a: Pt; b: Pt }[];
  hGuides?: Pt[][];
  constructionGuides?: { kind: string; line: Pt[]; markerPoints: Pt[]; appearance: ConstructionGuideAppearance; dotEvery: number }[];
};

type Occluder = {
  bounds: Frame;
  contains: (point: Pt) => boolean;
  dispose?: () => void;
};

export type CricutSafeRect = Frame;

export type CricutSafetyReport = {
  safeRect: CricutSafeRect;
  pageFitsPhysicalMat: boolean;
  unsafePolylineCount: number;
  reasons: string[];
};

export type PlotterExportResult = {
  svg: string;
  warnings: string[];
  safety: CricutSafetyReport;
  polylineCount: number;
};

const EPS = 1e-6;
const OCCLUSION_SAMPLE_MM = 0.1;
const ARTWORK_SAMPLE_MM = 0.35;
const LINE_MARKER_HEIGHT_MM = 1.8;
const LINE_MARKER_DOUBLE_GAP_MM = 1.0;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const samePoint = (a: Pt, b: Pt, tolerance = 1e-5) => dist(a, b) <= tolerance;
const inBounds = (point: Pt, bounds: Frame) => point.x >= bounds.x - EPS && point.x <= bounds.x + bounds.width + EPS && point.y >= bounds.y - EPS && point.y <= bounds.y + bounds.height + EPS;

function fmt(value: number) {
  if (!Number.isFinite(value)) return '0';
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return normalized.toFixed(4).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function cleanPolyline(points: Pt[]) {
  const out: Pt[] = [];
  points.forEach(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (!out.length || !samePoint(out[out.length - 1], point)) out.push(point);
  });
  return out;
}

function polyline(points: Pt[], source: string): PlotPolyline | null {
  const cleaned = cleanPolyline(points);
  return cleaned.length >= 2 ? { points: cleaned, source } : null;
}

function linePolyline(a: Pt, b: Pt, source: string) {
  return polyline([a, b], source);
}

function translatePoints(points: Pt[], dx: number, dy: number) {
  return points.map(point => ({ x: point.x + dx, y: point.y + dy }));
}

function translatePolylines(lines: PlotPolyline[], dx: number, dy: number) {
  return lines.map(line => ({ ...line, points: translatePoints(line.points, dx, dy) }));
}

function parsePolygonPoints(text: string) {
  return text.trim().split(/\s+/).map(pair => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  }).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function closedPolyline(points: Pt[], source: string) {
  if (!points.length) return null;
  const closed = samePoint(points[0], points[points.length - 1]) ? points : [...points, points[0]];
  return polyline(closed, source);
}

function ellipseBoundary(frame: Frame, source: string) {
  const rx = frame.width / 2;
  const ry = frame.height / 2;
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt(Math.max(0, (3 * rx + ry) * (rx + 3 * ry))));
  const steps = clamp(Math.ceil(circumference / 0.6), 64, 720);
  const cx = frame.x + rx;
  const cy = frame.y + ry;
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = index / steps * Math.PI * 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
  return polyline(points, source);
}

function roundedRectBoundary(frame: Frame, radiusMM: number, source: string) {
  const r = Math.min(Math.max(0, radiusMM), frame.width / 2, frame.height / 2);
  if (r <= EPS) return closedPolyline([
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ], source);

  const cornerSteps = clamp(Math.ceil(Math.PI * r / 2 / 0.35), 6, 80);
  const points: Pt[] = [];
  const corners = [
    { cx: frame.x + frame.width - r, cy: frame.y + r, start: -Math.PI / 2 },
    { cx: frame.x + frame.width - r, cy: frame.y + frame.height - r, start: 0 },
    { cx: frame.x + r, cy: frame.y + frame.height - r, start: Math.PI / 2 },
    { cx: frame.x + r, cy: frame.y + r, start: Math.PI },
  ];
  corners.forEach(corner => {
    for (let index = 0; index <= cornerSteps; index++) {
      const angle = corner.start + index / cornerSteps * Math.PI / 2;
      points.push({ x: corner.cx + r * Math.cos(angle), y: corner.cy + r * Math.sin(angle) });
    }
  });
  return closedPolyline(points, source);
}

function circleOutline(cx: number, cy: number, radius: number, source: string) {
  const steps = clamp(Math.ceil(2 * Math.PI * radius / 0.25), 20, 96);
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = index / steps * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  return polyline(points, source);
}

function clipSegmentToRect(a: Pt, b: Pt, rect: Frame): [Pt, Pt] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const xMin = rect.x;
  const xMax = rect.x + rect.width;
  const yMin = rect.y;
  const yMax = rect.y + rect.height;
  let t0 = 0;
  let t1 = 1;
  const tests: [number, number][] = [
    [-dx, a.x - xMin],
    [dx, xMax - a.x],
    [-dy, a.y - yMin],
    [dy, yMax - a.y],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < EPS) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [lerp(a, b, t0), lerp(a, b, t1)];
}

function clipPolylineToRect(input: PlotPolyline, rect: Frame) {
  const out: PlotPolyline[] = [];
  let current: Pt[] = [];
  const flush = () => {
    const next = polyline(current, input.source);
    if (next) out.push(next);
    current = [];
  };
  for (let index = 1; index < input.points.length; index++) {
    const clipped = clipSegmentToRect(input.points[index - 1], input.points[index], rect);
    if (!clipped) {
      flush();
      continue;
    }
    const [start, end] = clipped;
    if (!current.length) current.push(start, end);
    else if (samePoint(current[current.length - 1], start, 1e-4)) current.push(end);
    else {
      flush();
      current.push(start, end);
    }
    if (!samePoint(end, input.points[index], 1e-4)) flush();
  }
  flush();
  return out;
}

function clipPolylinesToRect(lines: PlotPolyline[], rect: Frame) {
  return lines.flatMap(line => clipPolylineToRect(line, rect));
}

function dashPolyline(input: PlotPolyline, dashMM: number, gapMM: number) {
  if (dashMM <= EPS || gapMM < 0) return [input];
  const result: PlotPolyline[] = [];
  let drawing = true;
  let remainingPattern = dashMM;
  let current: Pt[] = [];
  const flush = () => {
    const next = polyline(current, input.source);
    if (next) result.push(next);
    current = [];
  };

  for (let index = 1; index < input.points.length; index++) {
    let start = input.points[index - 1];
    const end = input.points[index];
    let segmentRemaining = dist(start, end);
    if (segmentRemaining <= EPS) continue;

    while (segmentRemaining > EPS) {
      const take = Math.min(segmentRemaining, remainingPattern);
      const t = take / segmentRemaining;
      const next = lerp(start, end, t);
      if (drawing) {
        if (!current.length) current.push(start);
        current.push(next);
      } else {
        flush();
      }
      segmentRemaining -= take;
      start = next;
      remainingPattern -= take;
      if (remainingPattern <= EPS) {
        if (drawing) flush();
        drawing = !drawing;
        remainingPattern = drawing ? dashMM : Math.max(EPS, gapMM);
      }
    }
  }
  flush();
  return result;
}

function pointInPolygon(point: Pt, polygon: Pt[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentDistance(point: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function polygonOccluder(points: Pt[], padding: number): Occluder {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;
  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  return {
    bounds,
    contains: point => inBounds(point, bounds) && (
      pointInPolygon(point, points)
      || (padding > 0 && points.some((current, index) => segmentDistance(point, current, points[(index + 1) % points.length]) <= padding))
    ),
  };
}

function rectOccluder(bounds: Frame): Occluder {
  return { bounds, contains: point => inBounds(point, bounds) };
}

function shapeOccluder(element: Extract<LayoutElement, { type: 'shape' }>): Occluder {
  const { frame, settings } = element;
  const border = settings.appearance === 'border' || settings.appearance === 'fillAndBorder' ? settings.borderWidthMM / 2 : 0;
  const padding = Math.max(0, element.paddingMM + border);
  const bounds = { x: frame.x - padding, y: frame.y - padding, width: frame.width + padding * 2, height: frame.height + padding * 2 };
  const local = (point: Pt) => ({ x: point.x - frame.x, y: point.y - frame.y });

  if (settings.kind === 'ellipse' || settings.kind === 'circle') {
    return {
      bounds,
      contains: point => {
        const q = local(point);
        const rx = frame.width / 2 + padding;
        const ry = frame.height / 2 + padding;
        return ((q.x - frame.width / 2) / rx) ** 2 + ((q.y - frame.height / 2) / ry) ** 2 <= 1;
      },
    };
  }
  if (settings.kind === 'rectangle' || settings.kind === 'square') return rectOccluder(bounds);
  if (settings.kind === 'roundedRectangle' || settings.kind === 'roundedSquare') {
    return {
      bounds,
      contains: point => {
        const q = local(point);
        const radius = Math.min(settings.cornerRadiusMM, frame.width / 2, frame.height / 2) + padding;
        const cx = frame.width / 2;
        const cy = frame.height / 2;
        const dx = Math.max(Math.abs(q.x - cx) - (frame.width / 2 - radius), 0);
        const dy = Math.max(Math.abs(q.y - cy) - (frame.height / 2 - radius), 0);
        return dx * dx + dy * dy <= radius * radius;
      },
    };
  }
  const points = parsePolygonPoints(shapePolygonPoints(settings.kind, frame.width, frame.height)).map(point => ({ x: point.x + frame.x, y: point.y + frame.y }));
  return polygonOccluder(points, padding);
}

function appendArtworkNode(node: ArtworkNode, parent: Element, geometries?: SVGGeometryElement[]) {
  const child = document.createElementNS('http://www.w3.org/2000/svg', node.tag);
  Object.entries(node.attrs).forEach(([name, value]) => child.setAttribute(name, value));
  parent.appendChild(child);
  if (node.tag !== 'g') geometries?.push(child as SVGGeometryElement);
  node.children.forEach(item => appendArtworkNode(item, child, geometries));
}

function artworkOccluder(element: Extract<LayoutElement, { type: 'artwork' }>): Occluder | null {
  if (!element.settings.occludeLowerLayers || element.settings.opacity <= 0 || typeof document === 'undefined') return null;
  const ns = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(ns, 'svg');
  root.setAttribute('viewBox', `${element.document.viewBox.x} ${element.document.viewBox.y} ${element.document.viewBox.width} ${element.document.viewBox.height}`);
  root.setAttribute('preserveAspectRatio', 'none');
  root.style.cssText = `position:fixed;left:-10000px;top:-10000px;width:${element.frame.width}px;height:${element.frame.height}px;opacity:0;pointer-events:none`;
  const geometries: SVGGeometryElement[] = [];
  element.document.nodes.forEach(node => appendArtworkNode(node, root, geometries));
  document.body.appendChild(root);

  const closed = (geometry: SVGGeometryElement) => ['rect', 'circle', 'ellipse', 'polygon'].includes(geometry.localName)
    || (geometry.localName === 'path' && pathHasOnlyClosedSubpaths(geometry.getAttribute('d') ?? ''));
  const visible = (geometry: SVGGeometryElement) => {
    let node: Element | null = geometry;
    while (node && node !== root) {
      if (Number.parseFloat(getComputedStyle(node).opacity || '1') <= 0) return false;
      node = node.parentElement;
    }
    return true;
  };

  return {
    bounds: element.frame,
    dispose: () => root.remove(),
    contains: point => {
      const rootMatrix = root.getScreenCTM();
      if (!rootMatrix) return false;
      const viewBox = element.document.viewBox;
      const sourceX = viewBox.x + (point.x - element.frame.x) / element.frame.width * viewBox.width;
      const sourceY = viewBox.y + (point.y - element.frame.y) / element.frame.height * viewBox.height;
      const screen = new DOMPoint(sourceX, sourceY).matrixTransform(rootMatrix);
      return geometries.some(geometry => {
        if (!visible(geometry)) return false;
        const matrix = geometry.getScreenCTM();
        if (!matrix) return false;
        const local = screen.matrixTransform(matrix.inverse());
        const style = getComputedStyle(geometry);
        const fill = style.fill !== 'none';
        const stroke = style.stroke !== 'none' && Number.parseFloat(style.strokeWidth) > 0;
        return ((fill || (element.settings.occludeClosedShapes && closed(geometry))) && geometry.isPointInFill(local))
          || (stroke && geometry.isPointInStroke(local));
      });
    },
  };
}

function visualCalligramBounds(element: Extract<LayoutElement, { type: 'calligram' }>) {
  const visual = buildCalligramModel({ w: element.frame.width, h: element.frame.height }, element.settings).visualBounds;
  return { x: element.frame.x + visual.x, y: element.frame.y + visual.y, width: visual.width, height: visual.height };
}

function elementOccluders(element: LayoutElement): Occluder[] {
  if (element.type === 'page') return [];
  if (element.type === 'shape') return [shapeOccluder(element)];
  if (element.type === 'guidelines') return [rectOccluder(occupiedRect(element.frame, element.paddingMM))];
  if (element.type === 'artwork') {
    const occluder = artworkOccluder(element);
    return occluder ? [occluder] : [];
  }
  if (element.type === 'curved-title') {
    if (!(element.settings.transparentWhitespace ?? true)) return [rectOccluder(occupiedRect(element.frame, element.paddingMM))];
    const model = buildCurvedTitleModel({ w: element.frame.width, h: element.frame.height }, element.settings);
    return [polygonOccluder(model.footprintPoints.map(point => ({ x: point.x + element.frame.x, y: point.y + element.frame.y })), element.paddingMM)];
  }
  if (!(element.settings.transparentWhitespace ?? true)) return [rectOccluder(occupiedRect(visualCalligramBounds(element), element.paddingMM))];
  const model = buildCalligramModel({ w: element.frame.width, h: element.frame.height }, element.settings);
  return model.bands.map(band => polygonOccluder([
    ...band.guideSet.ascLine,
    ...[...band.guideSet.descLine].reverse(),
  ].map(point => ({ x: point.x + element.frame.x, y: point.y + element.frame.y })), element.paddingMM));
}

function isBlocked(point: Pt, occluders: Occluder[]) {
  return occluders.some(occluder => inBounds(point, occluder.bounds) && occluder.contains(point));
}

function clipPolylineByOccluders(input: PlotPolyline, occluders: Occluder[]) {
  if (!occluders.length) return [input];
  const result: PlotPolyline[] = [];
  let current: Pt[] = [];
  const flush = () => {
    const next = polyline(current, input.source);
    if (next) result.push(next);
    current = [];
  };

  for (let index = 1; index < input.points.length; index++) {
    const a = input.points[index - 1];
    const b = input.points[index];
    const length = dist(a, b);
    const steps = Math.max(1, Math.ceil(length / OCCLUSION_SAMPLE_MM));
    for (let step = 0; step < steps; step++) {
      const p0 = lerp(a, b, step / steps);
      const p1 = lerp(a, b, (step + 1) / steps);
      const mid = lerp(p0, p1, 0.5);
      if (isBlocked(mid, occluders)) {
        flush();
      } else if (!current.length) {
        current.push(p0, p1);
      } else if (samePoint(current[current.length - 1], p0, 1e-4)) {
        current.push(p1);
      } else {
        flush();
        current.push(p0, p1);
      }
    }
  }
  flush();
  return result;
}

function clipPolylinesByOccluders(lines: PlotPolyline[], occluders: Occluder[]) {
  return lines.flatMap(line => clipPolylineByOccluders(line, occluders));
}

function guideSetPolylines(
  guide: GuideLike,
  source: string,
  options?: {
    pathKeys?: Array<'asc' | 'waist' | 'base' | 'desc'>;
    ticks?: boolean;
    hGuides?: boolean;
    nibAngleMarker?: boolean;
    nibAngleDeg?: number;
    constructionGuides?: boolean;
  },
) {
  const keys = options?.pathKeys ?? ['asc', 'waist', 'base', 'desc'];
  const result: PlotPolyline[] = [];
  const add = (points: Pt[], suffix: string) => {
    const next = polyline(points, `${source}:${suffix}`);
    if (next) result.push(next);
  };
  const paths = {
    asc: guide.ascLine,
    waist: guide.waistLine,
    base: guide.baseLine,
    desc: guide.descLine,
  };
  keys.forEach(key => add(paths[key], key));

  const bandXs = guide.ascLine.map(point => point.x).concat(guide.descLine.map(point => point.x));
  const bandYs = guide.ascLine.map(point => point.y).concat(guide.descLine.map(point => point.y));
  const bandRect = bandXs.length && bandYs.length
    ? { x: Math.min(...bandXs), y: Math.min(...bandYs), width: Math.max(...bandXs) - Math.min(...bandXs), height: Math.max(...bandYs) - Math.min(...bandYs) }
    : null;

  if (options?.ticks !== false) {
    (guide.ticks ?? []).forEach((tick, index) => {
      const next = linePolyline(tick.a, tick.b, `${source}:tick-${index}`);
      if (!next) return;
      result.push(...(bandRect ? clipPolylineToRect(next, bandRect) : [next]));
    });
  }
  if (options?.hGuides !== false) {
    (guide.hGuides ?? []).forEach((points, index) => {
      const next = polyline(points, `${source}:h-${index}`);
      if (!next) return;
      result.push(...(bandRect ? clipPolylineToRect(next, bandRect) : [next]));
    });
  }
  if (options?.constructionGuides !== false) {
    (guide.constructionGuides ?? []).forEach(item => {
      if (item.appearance === 'dots') {
        constructionGuideDotPoints(item).forEach((point, index) => {
          const marker = circleOutline(point.x, point.y, 0.6, `${source}:construction-${item.kind}-dot-${index}`);
          if (marker) result.push(...(bandRect ? clipPolylineToRect(marker, bandRect) : [marker]));
        });
        return;
      }
      const next = polyline(item.line, `${source}:construction-${item.kind}`);
      if (!next) return;
      dashPolyline(next, 2, 1.5).forEach(dash => result.push(...(bandRect ? clipPolylineToRect(dash, bandRect) : [dash])));
    });
  }

  if (options?.nibAngleMarker && guide.hGuides?.length && guide.ascLine.length && guide.waistLine.length) {
    const topY = guide.ascLine[0].y;
    const waistY = guide.waistLine[0].y;
    const minY = Math.min(topY, waistY);
    const maxY = Math.max(topY, waistY);
    const candidates = guide.hGuides.map(points => points[0]?.y).filter((y): y is number => typeof y === 'number' && y > minY && y < maxY).sort((a, b) => Math.abs(a - topY) - Math.abs(b - topY));
    if (candidates.length) {
      const size = 0.5 * Math.abs(topY - candidates[0]);
      if (size > EPS) {
        const x = guide.ascLine[0].x;
        const angle = (options?.nibAngleDeg ?? 45) * Math.PI / 180;
        const chipH = size * 3;
        const chipW = Math.min(chipH / Math.tan(angle), chipH * 6);
        const marker = closedPolyline([{ x, y: topY }, { x: x + chipW, y: topY }, { x, y: topY + chipH }], `${source}:nib-angle`);
        if (marker) result.push(...(bandRect ? clipPolylineToRect(marker, bandRect) : [marker]));
      }
    }
  }

  return result;
}

function straightGuidelinesPolylines(element: Extract<LayoutElement, { type: 'guidelines' }>, textFitEntry: GuidelinesTextFitEntry | null, options: PlotterExportOptions) {
  const box = { width: element.frame.width, height: element.frame.height };
  const settings = element.settings;
  const model = calculateStraightGuidelines(box, settings);
  const clipRect = {
    x: settings.margins.left,
    y: 0,
    width: Math.max(0, box.width - settings.margins.left - settings.margins.right),
    height: Math.max(0, box.height - settings.margins.bottom),
  };
  const result: PlotPolyline[] = [];
  const guideAlpha = settings.appearance.highContrast ? 1 : settings.appearance.xLineContrast;
  const guideVisible = guideAlpha > 0.001;

  model.guideSets.forEach((guide, rowIndex) => {
    if (guideVisible) {
      const paths = guideSetPolylines(guide as GuideLike, `guidelines:${element.id}:row-${rowIndex}`, {
        ticks: settings.script !== 'Copperplate' && options.constructionGrid,
        hGuides: settings.script !== 'Copperplate' && options.constructionGrid,
        nibAngleMarker: settings.script !== 'Copperplate' && options.nibAngleMarker,
        nibAngleDeg: settings.penAngleDeg,
        constructionGuides: options.constructionGuides,
      });
      result.push(...clipPolylinesToRect(paths, clipRect));
    } else if (settings.script !== 'Copperplate') {
      const gridOnly = guideSetPolylines(guide as GuideLike, `guidelines:${element.id}:row-${rowIndex}:grid`, {
        pathKeys: [],
        ticks: options.constructionGrid,
        hGuides: options.constructionGrid,
        nibAngleMarker: options.nibAngleMarker,
        nibAngleDeg: settings.penAngleDeg,
        constructionGuides: options.constructionGuides,
      });
      result.push(...clipPolylinesToRect(gridOnly, clipRect));
    }

    if (options.baselineIndicators) {
      const x1 = guide.baseLine[0].x;
      const y = (guide.waistLine[0].y + guide.baseLine[0].y) / 2;
      const indicator = circleOutline(x1 + 3, y, 0.9, `guidelines:${element.id}:baseline-indicator-${rowIndex}`);
      if (indicator) result.push(...clipPolylineToRect(indicator, clipRect));
    }

    if (settings.script === 'Copperplate' && options.midpointReferences) {
      const x1 = guide.baseLine[0].x;
      const x2 = guide.baseLine.at(-1)!.x;
      const midAsc = (guide.ascLine[0].y + guide.waistLine[0].y) / 2;
      const midDesc = (guide.descLine[0].y + guide.baseLine[0].y) / 2;
      [midAsc, midDesc].forEach((y, index) => {
        const base = linePolyline({ x: x1, y }, { x: x2, y }, `guidelines:${element.id}:mid-${rowIndex}-${index}`);
        if (!base) return;
        dashPolyline(base, 6, settings.appearance.midpointDashGap).forEach(dash => result.push(...clipPolylineToRect(dash, clipRect)));
      });
    }
  });

  if (settings.script === 'Copperplate' && options.slantGuides) {
    const angles = [settings.slant.angle, ...(options.secondarySlantGuides && settings.slant.secondEnabled ? [settings.slant.secondAngle] : [])];
    angles.forEach((angle, group) => {
      const slants = buildStraightSlantLines(model.guideSets, box, settings.slant.spacingMM, angle);
      slants.forEach((slant, index) => {
        const raw = linePolyline({ x: slant.x1, y: slant.y1 }, { x: slant.x2, y: slant.y2 }, `guidelines:${element.id}:slant-${group}-${index}`);
        if (!raw) return;
        model.guideSets.forEach(guide => {
          const x1 = guide.baseLine[0].x;
          const x2 = guide.baseLine.at(-1)!.x;
          const rowRect = { x: x1, y: guide.ascLine[0].y, width: x2 - x1, height: guide.descLine[0].y - guide.ascLine[0].y };
          clipPolylineToRect(raw, rowRect).forEach(part => result.push(...clipPolylineToRect(part, clipRect)));
        });
      });
    });
  }

  if (settings.appearance.centerLine) {
    const center = linePolyline(
      { x: box.width / 2, y: settings.margins.top },
      { x: box.width / 2, y: box.height - settings.margins.bottom },
      `guidelines:${element.id}:center`,
    );
    if (center) result.push(...clipPolylineToRect(center, clipRect));
  }

  if (options.textStartEndMarkers && textFitEntry?.mode === 'line-layout') {
    textFitEntry.plan.lines.filter(line => line.rowIndex !== null && line.text).forEach(line => {
      const startX = line.baselineStartX - element.frame.x;
      const endX = line.baselineEndX - element.frame.x;
      const baselineY = line.baseY - element.frame.y;
      const markerBottom = baselineY + LINE_MARKER_HEIGHT_MM;
      const start = linePolyline({ x: startX, y: baselineY }, { x: startX, y: markerBottom }, `guidelines:${element.id}:line-${line.lineId}:start`);
      const end1 = linePolyline({ x: endX, y: baselineY }, { x: endX, y: markerBottom }, `guidelines:${element.id}:line-${line.lineId}:end-1`);
      const end2X = endX - LINE_MARKER_DOUBLE_GAP_MM;
      const end2 = linePolyline({ x: end2X, y: baselineY }, { x: end2X, y: markerBottom }, `guidelines:${element.id}:line-${line.lineId}:end-2`);
      [start, end1, end2].forEach(marker => { if (marker) result.push(...clipPolylineToRect(marker, clipRect)); });
    });
  }

  return translatePolylines(result, element.frame.x, element.frame.y);
}

function curvedTitlePolylines(element: Extract<LayoutElement, { type: 'curved-title' }>, options: PlotterExportOptions) {
  const model = buildCurvedTitleModel({ w: element.frame.width, h: element.frame.height }, element.settings);
  const result: PlotPolyline[] = [];
  result.push(...guideSetPolylines(model.guideSet as GuideLike, `curved:${element.id}:main`, { ticks: options.constructionGrid, hGuides: options.constructionGrid, constructionGuides: options.constructionGuides, nibAngleMarker: options.nibAngleMarker, nibAngleDeg: element.settings.penAngleDeg }));
  if (options.midpointReferences && model.midAscPts) {
    const base = polyline(model.midAscPts, `curved:${element.id}:mid-asc`);
    if (base) result.push(...dashPolyline(base, 10, 12));
  }
  if (options.midpointReferences && model.midDescPts) {
    const base = polyline(model.midDescPts, `curved:${element.id}:mid-desc`);
    if (base) result.push(...dashPolyline(base, 10, 12));
  }
  if (model.top.enabled) {
    result.push(...guideSetPolylines(model.top.guideSet as GuideLike, `curved:${element.id}:top`, { pathKeys: ['asc', 'waist'], ticks: options.constructionGrid, hGuides: options.constructionGrid, constructionGuides: options.constructionGuides, nibAngleMarker: options.nibAngleMarker, nibAngleDeg: element.settings.penAngleDeg }));
  }
  if (model.bottom.enabled) {
    result.push(...guideSetPolylines(model.bottom.guideSet as GuideLike, `curved:${element.id}:bottom`, { pathKeys: ['base', 'desc'], ticks: options.constructionGrid, hGuides: options.constructionGrid, constructionGuides: options.constructionGuides, nibAngleMarker: options.nibAngleMarker, nibAngleDeg: element.settings.penAngleDeg }));
  }
  return translatePolylines(result, element.frame.x, element.frame.y);
}

function calligramPolylines(element: Extract<LayoutElement, { type: 'calligram' }>, options: PlotterExportOptions) {
  const model = buildCalligramModel({ w: element.frame.width, h: element.frame.height }, element.settings);
  const guideOptions = { ticks: options.constructionGrid, hGuides: options.constructionGrid, constructionGuides: options.constructionGuides, nibAngleMarker: options.nibAngleMarker, nibAngleDeg: element.settings.penAngleDeg };
  const main = guideSetPolylines(model.main.guideSet as GuideLike, `calligram:${element.id}:main`, guideOptions);
  const mainBand = polygonOccluder([
    ...model.main.guideSet.ascLine,
    ...[...model.main.guideSet.descLine].reverse(),
  ], 0);
  const otherBands = [model.inner, model.outer].filter(band => band.enabled).flatMap(band => {
    const raw = guideSetPolylines(band.guideSet as GuideLike, `calligram:${element.id}:${band === model.inner ? 'inner' : 'outer'}`, guideOptions);
    return clipPolylinesByOccluders(raw, [mainBand]);
  });
  const result = [...main, ...otherBands];
  if (options.calligramCenterMarkers) {
    const centerMarker = circleOutline(element.frame.width / 2, element.frame.height / 2, 1.6, `calligram:${element.id}:center-marker`);
    if (centerMarker) result.push(centerMarker);
  }
  return translatePolylines(result, element.frame.x, element.frame.y);
}

function shapeBoundaryPolylines(element: Extract<LayoutElement, { type: 'shape' }>) {
  if (element.settings.appearance === 'reserve') return [];
  const frame = element.frame;
  const source = `shape:${element.id}`;
  const { kind } = element.settings;
  let boundary: PlotPolyline | null = null;
  if (kind === 'ellipse' || kind === 'circle') boundary = ellipseBoundary(frame, source);
  else if (kind === 'roundedRectangle' || kind === 'roundedSquare') boundary = roundedRectBoundary(frame, element.settings.cornerRadiusMM, source);
  else if (kind === 'rectangle' || kind === 'square') boundary = closedPolyline([
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ], source);
  else {
    const points = parsePolygonPoints(shapePolygonPoints(kind, frame.width, frame.height)).map(point => ({ x: point.x + frame.x, y: point.y + frame.y }));
    boundary = closedPolyline(points, source);
  }
  return boundary ? [boundary] : [];
}

function cumulativeOpacity(element: Element, root: Element) {
  let opacity = 1;
  let node: Element | null = element;
  while (node && node !== root) {
    const value = Number.parseFloat(getComputedStyle(node).opacity || '1');
    if (Number.isFinite(value)) opacity *= value;
    node = node.parentElement;
  }
  return opacity;
}

function sampleArtwork(element: Extract<LayoutElement, { type: 'artwork' }>, warnings: string[]) {
  if (element.settings.opacity <= 0 || typeof document === 'undefined') return [];
  const ns = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(ns, 'svg');
  const viewBox = element.document.viewBox;
  root.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  root.setAttribute('preserveAspectRatio', 'none');
  root.setAttribute('width', '100');
  root.setAttribute('height', '100');
  root.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:100px;height:100px;pointer-events:none;overflow:visible';
  const geometries: SVGGeometryElement[] = [];
  element.document.nodes.forEach(node => appendArtworkNode(node, root, geometries));
  document.body.appendChild(root);

  const result: PlotPolyline[] = [];
  let filledCount = 0;
  let suspiciousSubpathJump = false;

  try {
    const rootScreen = root.getScreenCTM();
    if (!rootScreen) {
      warnings.push(`${element.name}: artwork geometry could not be measured for Cricut export.`);
      return [];
    }
    const rootInverse = rootScreen.inverse();
    const pageScaleX = element.frame.width / viewBox.width;
    const pageScaleY = element.frame.height / viewBox.height;

    geometries.forEach((geometry, geometryIndex) => {
      const style = getComputedStyle(geometry);
      const opacity = cumulativeOpacity(geometry, root) * (element.settings.opacity / 100);
      const fillOpacity = Number.parseFloat(style.fillOpacity || '1');
      const strokeOpacity = Number.parseFloat(style.strokeOpacity || '1');
      const hasFill = style.fill !== 'none' && opacity * (Number.isFinite(fillOpacity) ? fillOpacity : 1) > 0.001;
      const hasStroke = style.stroke !== 'none' && Number.parseFloat(style.strokeWidth || '0') > 0 && opacity * (Number.isFinite(strokeOpacity) ? strokeOpacity : 1) > 0.001;
      if (!hasFill && !hasStroke) return;
      if (hasFill) filledCount++;

      let total = 0;
      try { total = geometry.getTotalLength(); } catch { total = 0; }
      if (!Number.isFinite(total) || total <= EPS) return;
      const screenMatrix = geometry.getScreenCTM();
      if (!screenMatrix) return;
      const localScaleX = Math.hypot(screenMatrix.a, screenMatrix.b) / Math.max(EPS, Math.hypot(rootScreen.a, rootScreen.b));
      const localScaleY = Math.hypot(screenMatrix.c, screenMatrix.d) / Math.max(EPS, Math.hypot(rootScreen.c, rootScreen.d));
      const mmPerLocal = Math.max(pageScaleX * localScaleX, pageScaleY * localScaleY, 1e-4);
      const steps = clamp(Math.ceil(total * mmPerLocal / ARTWORK_SAMPLE_MM), 2, 6000);
      const sampled: Pt[] = [];
      for (let index = 0; index <= steps; index++) {
        const local = geometry.getPointAtLength(total * index / steps);
        const screen = new DOMPoint(local.x, local.y).matrixTransform(screenMatrix);
        const source = screen.matrixTransform(rootInverse);
        sampled.push({
          x: element.frame.x + (source.x - viewBox.x) / viewBox.width * element.frame.width,
          y: element.frame.y + (source.y - viewBox.y) / viewBox.height * element.frame.height,
        });
      }

      const expectedStep = Math.max(ARTWORK_SAMPLE_MM, total * mmPerLocal / steps);
      let chunk: Pt[] = [];
      const flush = () => {
        const next = polyline(chunk, `artwork:${element.id}:${geometryIndex}`);
        if (next) result.push(next);
        chunk = [];
      };
      sampled.forEach(point => {
        if (chunk.length && dist(chunk[chunk.length - 1], point) > expectedStep * 8 + 1) {
          suspiciousSubpathJump = true;
          flush();
        }
        chunk.push(point);
      });

      const definitelyClosed = ['rect', 'circle', 'ellipse', 'polygon'].includes(geometry.localName)
        || (geometry.localName === 'path' && pathHasOnlyClosedSubpaths(geometry.getAttribute('d') ?? ''));
      if (definitelyClosed && chunk.length && !samePoint(chunk[0], chunk[chunk.length - 1], 0.05)) chunk.push(chunk[0]);
      flush();
    });
  } finally {
    root.remove();
  }

  if (filledCount) warnings.push(`${element.name}: ${filledCount} filled artwork shape${filledCount === 1 ? '' : 's'} will be plotted as outlines; Cricut cannot infer a lost centreline from an expanded/filled stroke.`);
  if (suspiciousSubpathJump) warnings.push(`${element.name}: a compound artwork path contained separated subpaths; they were split for plotter export.`);
  return result;
}

function elementPolylines(element: LayoutElement, textFitEntry: GuidelinesTextFitEntry | null, warnings: string[], options: PlotterExportOptions) {
  if (element.type === 'page') return [];
  if (element.type === 'guidelines') return straightGuidelinesPolylines(element, textFitEntry, options);
  if (element.type === 'shape') return options.shapeOutlines ? shapeBoundaryPolylines(element) : [];
  if (element.type === 'curved-title') return curvedTitlePolylines(element, options);
  if (element.type === 'calligram') return calligramPolylines(element, options);
  return sampleArtwork(element, warnings);
}

function pageCenterLinePolylines(pageElement: PageElement, page: { width: number; height: number }) {
  const content = {
    x: pageElement.settings.margins.left,
    y: pageElement.settings.margins.top,
    width: Math.max(0, page.width - pageElement.settings.margins.left - pageElement.settings.margins.right),
    height: Math.max(0, page.height - pageElement.settings.margins.top - pageElement.settings.margins.bottom),
  };
  const result: PlotPolyline[] = [];
  if (pageElement.settings.centerLines.vertical) {
    const next = linePolyline(
      { x: content.x + content.width / 2, y: content.y },
      { x: content.x + content.width / 2, y: content.y + content.height },
      'page:center-vertical',
    );
    if (next) result.push(...dashPolyline(next, 5, 4));
  }
  if (pageElement.settings.centerLines.horizontal) {
    const next = linePolyline(
      { x: content.x, y: content.y + content.height / 2 },
      { x: content.x + content.width, y: content.y + content.height / 2 },
      'page:center-horizontal',
    );
    if (next) result.push(...dashPolyline(next, 5, 4));
  }
  return result;
}

export function getCricutSafeRect(page: { width: number; height: number }, matId: CricutMatId): CricutSafeRect {
  const mat = CRICUT_MATS[matId];
  const right = Math.min(page.width, CRICUT_ANCHOR_MM + mat.drawableWidthMM);
  const bottom = Math.min(page.height, CRICUT_ANCHOR_MM + mat.drawableHeightMM);
  return {
    x: CRICUT_ANCHOR_MM,
    y: CRICUT_ANCHOR_MM,
    width: Math.max(0, right - CRICUT_ANCHOR_MM),
    height: Math.max(0, bottom - CRICUT_ANCHOR_MM),
  };
}

function analyzeSafety(lines: PlotPolyline[], page: { width: number; height: number }, matId: CricutMatId): CricutSafetyReport {
  const mat = CRICUT_MATS[matId];
  const safeRect = getCricutSafeRect(page, matId);
  const pageFitsPhysicalMat = page.width <= mat.physicalWidthMM + EPS && page.height <= mat.physicalHeightMM + EPS;
  const unsafe = lines.filter(line => line.points.some(point => !inBounds(point, safeRect)));
  const reasons: string[] = [];
  if (!pageFitsPhysicalMat) reasons.push(`The ${fmt(page.width)} × ${fmt(page.height)} mm paper does not physically fit the selected ${mat.label} mat.`);
  if (unsafe.length) reasons.push(`${unsafe.length} drawable path${unsafe.length === 1 ? '' : 's'} enter the Cricut non-drawable area for this mat.`);
  return { safeRect, pageFitsPhysicalMat, unsafePolylineCount: unsafe.length, reasons };
}

function anchorPolylines(page: { width: number; height: number }) {
  if (page.width < CRICUT_ANCHOR_MM + 0.5 || page.height < CRICUT_ANCHOR_MM + 0.5) return [];
  const a = CRICUT_ANCHOR_MM;
  const anchor = polyline([
    { x: a, y: a + 0.5 },
    { x: a, y: a },
    { x: a + 0.5, y: a },
  ], 'cricut:anchor');
  return anchor ? [anchor] : [];
}

function polylinesToPathD(lines: PlotPolyline[]) {
  return lines.map(line => {
    const [first, ...rest] = line.points;
    return `M ${fmt(first.x)} ${fmt(first.y)} ${rest.map(point => `L ${fmt(point.x)} ${fmt(point.y)}`).join(' ')}`;
  }).join(' ');
}

export function buildPlotterExport(
  elements: LayoutElement[],
  textFitPlans: Record<string, GuidelinesTextFitEntry>,
  matId: CricutMatId,
  options: PlotterExportOptions = DEFAULT_PLOTTER_EXPORT_OPTIONS,
): PlotterExportResult {
  const pageElement = elements.find((element): element is PageElement => element.type === 'page');
  if (!pageElement) throw new Error('Layout requires a Page element.');
  const page = pageSize(pageElement);
  if (page.width <= 0 || page.height <= 0) throw new Error('Page size must be greater than zero.');

  const warnings: string[] = [];
  const pageRect = { x: 0, y: 0, width: page.width, height: page.height };
  const occludersById = new Map<string, Occluder[]>();
  elements.forEach(element => occludersById.set(element.id, elementOccluders(element)));

  let drawing: PlotPolyline[] = [];
  try {
    elements.forEach((element, index) => {
      if (element.type === 'page') return;
      const higherOccluders = elements.slice(0, index).flatMap(item => occludersById.get(item.id) ?? []);
      let raw = elementPolylines(element, textFitPlans[element.id] ?? null, warnings, options);
      raw = clipPolylinesToRect(raw, pageRect);
      raw = clipPolylinesByOccluders(raw, higherOccluders);
      drawing.push(...raw);
    });

    const pageIndex = elements.findIndex(element => element.type === 'page');
    const allHigherThanPage = pageIndex >= 0 ? elements.slice(0, pageIndex).flatMap(item => occludersById.get(item.id) ?? []) : [];
    let centers = pageCenterLinePolylines(pageElement, page);
    centers = clipPolylinesToRect(centers, pageRect);
    centers = clipPolylinesByOccluders(centers, allHigherThanPage);
    drawing.push(...centers);
  } finally {
    occludersById.forEach(items => items.forEach(item => item.dispose?.()));
  }

  drawing = drawing.filter(line => line.points.length >= 2);
  const safety = analyzeSafety(drawing, page, matId);
  const allLines = [...anchorPolylines(page), ...drawing];
  const d = polylinesToPathD(allLines);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(page.width)}mm" height="${fmt(page.height)}mm" viewBox="0 0 ${fmt(page.width)} ${fmt(page.height)}"><path d="${d}" fill="none" stroke="#000000" stroke-width="${fmt(CRICUT_PEN_STROKE_MM)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return { svg, warnings, safety, polylineCount: allLines.length };
}
