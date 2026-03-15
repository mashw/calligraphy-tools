'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GuideOverlay from '@/components/preview/GuideOverlay';
import { PAPERS_MM, pathD } from '@/lib/curve-helpers';
import { buildGuideSet } from '@/lib/guides/guide-template';
import { findCrossingsForStraps, type Crossing, type Pt } from '@/lib/paths/intersections';
import { samplePathDToPolyline } from '@/lib/paths/sample-svg-path';
import { transformPolyline } from '@/lib/paths/transform';
import { SCRIPT_PROFILES, type ScriptId } from '@/lib/scripts';

type ViewMode = 'autofit' | 'fullpage' | 'custom';
type CrossingsFilter = 'all' | 'selected';
type CopperplateRatioPreset = '3:2:3' | '2:1:2' | '1:1:1' | 'custom';
type PaperId = keyof typeof PAPERS_MM;
type Orientation = 'portrait' | 'landscape';
type PairKey = string;
type PairOverrides = Record<PairKey, Record<number, string>>;
type EndpointSide = 'start' | 'end';

type GuideJoinRef = {
  otherId: string;
  otherSide: EndpointSide;
};

type GuideJoin = {
  start?: GuideJoinRef;
  end?: GuideJoinRef;
};

type InsetLabeledFieldProps = {
  label: string;
  disabled?: boolean;
  className?: string;
  rightAdornment?: React.ReactNode;
  rightAdornmentInteractive?: boolean;
  adornmentClassName?: string;
  children: React.ReactNode;
};

type Strap = {
  id: string;
  name: string;
  d: string;
  color: string;
  script: ScriptId;
  nibMMText: string;
  nibAngleDeg: 35 | 40 | 45;
  xHeightMMText?: string;
  copperplateRatioPreset?: CopperplateRatioPreset;
  copperplateDescUnitsText?: string;
  copperplateXUnitsText?: string;
  copperplateAscUnitsText?: string;
  xNibText?: string;
  ascNibText?: string;
  descNibText?: string;
  offset: { x: number; y: number };
  scalePct: number;
  rotDeg: number;
  flip: boolean;
  snapped: boolean;
  invertGuides: boolean;
  guideJoin?: GuideJoin;
};

type StrapGroup = {
  id: string;
  name: string;
  strapIds: string[];
  collapsed: boolean;
};

type ExportedStateV1 = {
  paper: PaperId;
  orientation: Orientation;
  view: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  simplify: boolean;
  showCrossings: boolean;
  activeCrossingId: string | null;
  crossingsFilter: CrossingsFilter;
  showAllCrossings: boolean;
  crossingOverrides: PairOverrides;
  groups: StrapGroup[];
  straps: Strap[];
  activeId: string | null;
};

type PathGuidesPresetV1 = {
  id: string;
  name: string;
  state: ExportedStateV1;
};

const SNAP_IN_MM = 6;
const RELEASE_MM = 10;
const CROSS_EPS_MM = 1.2;
const CROSSING_MAX_SEGMENTS = 2800;
const GUIDE_JOIN_MAX_DIST_MM = 10;
const GUIDE_JOIN_MAX_SEAM_GAP_MM = 1.5;
const GUIDE_JOIN_OPPOSED_DOT_MAX = -0.3;
const FIT_MARGIN_MM = 12;
const PALETTE = ['#5778A4', '#E49444', '#D1615D', '#85B6B2', '#6A9F58', '#E7CA60', '#A87C9F', '#F1A2A9', '#967662', '#B8B0AC'];
const INSET_CONTROL_BASE = 'w-full border-0 rounded-none px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:text-slate-400 disabled:cursor-not-allowed';
const INSET_CONTROL_MM = `${INSET_CONTROL_BASE} pr-10`;
const INSET_CONTROL_WIDE = `${INSET_CONTROL_BASE} pr-14`;
const INLINE_NUMERIC_INPUT = 'w-[76px] h-8 rounded-md border border-slate-300 pl-2 pr-7 text-sm text-indigo-600 tabular-nums';
const INLINE_NUMERIC_INPUT_WIDE = 'w-[76px] h-8 rounded-md border border-slate-300 pl-2 pr-7 text-sm text-indigo-600 tabular-nums';
const INLINE_RESET_BUTTON = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700';
const INLINE_SLIDER = 'h-2 min-w-0 flex-1 appearance-none rounded-full bg-indigo-100 accent-indigo-600';
const SCALE_MIN_PCT = 1;
const SCALE_MAX_PCT = 220;

const snapHalf = (v: number) => Math.round(v * 2) / 2;

const stepHalfFrom = (current: number, dir: 1 | -1) => {
  const eps = 1e-9;
  const x2 = current * 2;
  const next2 = dir === 1 ? Math.ceil(x2 - eps) + 1 : Math.floor(x2 + eps) - 1;
  return next2 / 2;
};


const pairKey = (aId: string, bId: string): PairKey => (aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`);

const centroid = (pts: Pt[]) => {
  if (!pts.length) return { x: 0, y: 0 };
  const sum = pts.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
};

const boundsOf = (pts: Pt[]) => {
  if (!pts.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  pts.forEach((pt) => {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  });
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
};

const clampOffsetToPage = ({
  sampled,
  localCenter,
  strap,
  box,
  marginMM,
}: {
  sampled: Pt[];
  localCenter: Pt;
  strap: Pick<Strap, 'scalePct' | 'rotDeg' | 'flip' | 'offset'>;
  box: { w: number; h: number };
  marginMM: number;
}) => {
  const centered = sampled.map((p) => ({ x: p.x - localCenter.x, y: p.y - localCenter.y }));
  const transformed = transformPolyline(centered, {
    scalePct: strap.scalePct,
    rotDeg: strap.rotDeg,
    flipX: strap.flip,
    offset: { x: strap.offset.x + localCenter.x, y: strap.offset.y + localCenter.y },
  });
  const b = boundsOf(transformed);
  let adjustX = 0;
  let adjustY = 0;
  if (b.minX < marginMM) adjustX = marginMM - b.minX;
  if (b.maxX > box.w - marginMM) adjustX = (box.w - marginMM) - b.maxX;
  if (b.minY < marginMM) adjustY = marginMM - b.minY;
  if (b.maxY > box.h - marginMM) adjustY = (box.h - marginMM) - b.maxY;
  return { x: strap.offset.x + adjustX, y: strap.offset.y + adjustY };
};

const fitStrapToPage = ({
  d,
  box,
  centerX,
  centerY,
  marginMM,
}: {
  d: string;
  box: { w: number; h: number };
  centerX: number;
  centerY: number;
  marginMM: number;
}) => {
  const sampled = samplePathDToPolyline(d, 1.25);
  const localCenter = centroid(sampled);
  const b = boundsOf(sampled);
  const availW = box.w - 2 * marginMM;
  const availH = box.h - 2 * marginMM;
  const scalePct = Math.max(5, Math.min(400, Math.min(availW / Math.max(b.w, 1e-6), availH / Math.max(b.h, 1e-6)) * 100 * 0.85));
  const offset = { x: centerX - localCenter.x, y: centerY - localCenter.y };
  return { scalePct, offset };
};


const bandPolygonD = (asc: Pt[], desc: Pt[]) => {
  if (!asc?.length || !desc?.length) return '';
  const a = asc.map((p) => `${p.x},${p.y}`).join(' L ');
  const d = [...desc].reverse().map((p) => `${p.x},${p.y}`).join(' L ');
  return `M ${a} L ${d} Z`;
};



type EndpointInfo = {
  strapId: string;
  side: EndpointSide;
  point: Pt;
  inward: Pt;
};

type GuideJoinCandidate = {
  key: string;
  aId: string;
  aSide: EndpointSide;
  bId: string;
  bSide: EndpointSide;
  x: number;
  y: number;
  distanceMM: number;
  alreadyJoined: boolean;
};

type GuideJoinChainMember = {
  strapId: string;
  reversed: boolean;
};

type GuideJoinChain = {
  id: string;
  members: GuideJoinChainMember[];
  closed: boolean;
};

type JoinedPairComposite = {
  id: string;
  memberIds: [string, string];
};

type Step3Row = {
  id: string;
  memberIds: string[];
  label: string;
  color: string;
  indexLabel: string;
};


const slotOrderForPair = (crossingsForPair: Crossing[], aPts: Pt[], bPts: Pt[]) => {
  const ca = centroid(aPts);
  const cb = centroid(bPts);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy);
  const u = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  const v = { x: -u.y, y: u.x };
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };

  return crossingsForPair
    .map((crossing) => {
      const rx = crossing.x - mid.x;
      const ry = crossing.y - mid.y;
      return {
        crossing,
        t: rx * u.x + ry * u.y,
        s: rx * v.x + ry * v.y,
      };
    })
    .sort((left, right) => (
      right.t - left.t
      || left.s - right.s
      || left.crossing.id.localeCompare(right.crossing.id)
    ))
    .map((entry) => entry.crossing.id);
};


const endpointKey = (strapId: string, side: EndpointSide) => `${strapId}:${side}`;

const isOpenPolyline = (pts: Pt[]) => {
  if (pts.length < 2) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) > 0.05;
};

const getEndpointInfo = (strapId: string, pts: Pt[], side: EndpointSide): EndpointInfo | null => {
  if (!isOpenPolyline(pts) || pts.length < 2) return null;
  if (side === 'start') {
    const p0 = pts[0];
    const p1 = pts[1];
    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-6) return null;
    return { strapId, side, point: p0, inward: { x: vx / len, y: vy / len } };
  }
  const n = pts.length;
  const pn = pts[n - 1];
  const pprev = pts[n - 2];
  const vx = pprev.x - pn.x;
  const vy = pprev.y - pn.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return null;
  return { strapId, side, point: pn, inward: { x: vx / len, y: vy / len } };
};

const normalizeGuideJoinLinks = (straps: Strap[]): Strap[] => {
  const byId = new Map(straps.map((s) => [s.id, s]));
  const next = straps.map((strap) => ({ ...strap, guideJoin: strap.guideJoin ? { ...strap.guideJoin } : undefined }));
  const nextById = new Map(next.map((s) => [s.id, s]));

  const clearLink = (strap: Strap, side: EndpointSide) => {
    if (!strap.guideJoin) return;
    delete strap.guideJoin[side];
    if (!strap.guideJoin.start && !strap.guideJoin.end) delete strap.guideJoin;
  };

  next.forEach((strap) => {
    const join = strap.guideJoin;
    if (!join) return;
    (['start', 'end'] as EndpointSide[]).forEach((side) => {
      const ref = join[side];
      if (!ref) return;
      if (ref.otherId === strap.id) {
        clearLink(strap, side);
        return;
      }
      const otherOrig = byId.get(ref.otherId);
      const other = nextById.get(ref.otherId);
      if (!otherOrig || !other) {
        clearLink(strap, side);
        return;
      }
      const back = otherOrig.guideJoin?.[ref.otherSide];
      if (!back || back.otherId !== strap.id || back.otherSide !== side) {
        clearLink(strap, side);
        return;
      }
      if (!other.guideJoin) other.guideJoin = {};
      other.guideJoin[ref.otherSide] = { otherId: strap.id, otherSide: side };
    });
  });

  return next.map((strap) => {
    if (strap.guideJoin && !strap.guideJoin.start && !strap.guideJoin.end) {
      return { ...strap, guideJoin: undefined };
    }
    return strap;
  });
};

const buildGuideJoinCandidates = ({
  straps,
  transformedById,
}: {
  straps: Strap[];
  transformedById: Map<string, Pt[]>;
}): GuideJoinCandidate[] => {
  const endpoints: EndpointInfo[] = [];
  straps.forEach((strap) => {
    const pts = transformedById.get(strap.id) ?? [];
    const start = getEndpointInfo(strap.id, pts, 'start');
    const end = getEndpointInfo(strap.id, pts, 'end');
    if (start) endpoints.push(start);
    if (end) endpoints.push(end);
  });

  const bestByEndpoint = new Map<string, GuideJoinCandidate>();
  const addBest = (cand: GuideJoinCandidate) => {
    const keys = [endpointKey(cand.aId, cand.aSide), endpointKey(cand.bId, cand.bSide)];
    keys.forEach((key) => {
      const prev = bestByEndpoint.get(key);
      if (!prev || cand.distanceMM < prev.distanceMM - 1e-6 || (Math.abs(cand.distanceMM - prev.distanceMM) < 1e-6 && cand.key < prev.key)) {
        bestByEndpoint.set(key, cand);
      }
    });
  };

  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const a = endpoints[i];
      const b = endpoints[j];
      if (a.strapId === b.strapId) continue;
      const dx = a.point.x - b.point.x;
      const dy = a.point.y - b.point.y;
      const distanceMM = Math.hypot(dx, dy);
      if (distanceMM > GUIDE_JOIN_MAX_DIST_MM) continue;
      const dot = a.inward.x * b.inward.x + a.inward.y * b.inward.y;
      if (dot > GUIDE_JOIN_OPPOSED_DOT_MAX) continue;
      const aStrap = straps.find((s) => s.id === a.strapId);
      const bStrap = straps.find((s) => s.id === b.strapId);
      const alreadyJoined = aStrap?.guideJoin?.[a.side]?.otherId === b.strapId
        && aStrap?.guideJoin?.[a.side]?.otherSide === b.side
        && bStrap?.guideJoin?.[b.side]?.otherId === a.strapId
        && bStrap?.guideJoin?.[b.side]?.otherSide === a.side;
      const pairA = `${a.strapId}:${a.side}`;
      const pairB = `${b.strapId}:${b.side}`;
      const key = pairA < pairB ? `${pairA}|${pairB}` : `${pairB}|${pairA}`;
      addBest({
        key,
        aId: a.strapId,
        aSide: a.side,
        bId: b.strapId,
        bSide: b.side,
        x: (a.point.x + b.point.x) / 2,
        y: (a.point.y + b.point.y) / 2,
        distanceMM,
        alreadyJoined,
      });
    }
  }

  const selected = new Map<string, GuideJoinCandidate>();
  bestByEndpoint.forEach((cand) => {
    const aSel = bestByEndpoint.get(endpointKey(cand.aId, cand.aSide));
    const bSel = bestByEndpoint.get(endpointKey(cand.bId, cand.bSide));
    const aJoined = straps.find((s) => s.id === cand.aId)?.guideJoin?.[cand.aSide]?.otherId === cand.bId;
    const bJoined = straps.find((s) => s.id === cand.bId)?.guideJoin?.[cand.bSide]?.otherId === cand.aId;
    if ((aSel?.key === cand.key && bSel?.key === cand.key) || aJoined || bJoined || cand.alreadyJoined) {
      selected.set(cand.key, cand);
    }
  });

  return [...selected.values()].sort((l, r) => l.key.localeCompare(r.key));
};

const buildGuideJoinChains = (straps: Strap[]): GuideJoinChain[] => {
  const byId = new Map(straps.map((s) => [s.id, s]));

  const reciprocalLink = (strapId: string, side: EndpointSide) => {
    const strap = byId.get(strapId);
    const ref = strap?.guideJoin?.[side];
    if (!ref) return null;
    const other = byId.get(ref.otherId);
    const back = other?.guideJoin?.[ref.otherSide];
    if (!back || back.otherId !== strapId || back.otherSide !== side) return null;
    return { strapId: ref.otherId, side: ref.otherSide as EndpointSide };
  };

  const otherSide = (side: EndpointSide): EndpointSide =>
    (side === 'start' ? 'end' : 'start');

  const degreeByStrap = new Map<string, number>();
  straps.forEach((strap) => {
    let deg = 0;
    if (reciprocalLink(strap.id, 'start')) deg += 1;
    if (reciprocalLink(strap.id, 'end')) deg += 1;
    degreeByStrap.set(strap.id, deg);
  });

  if ([...degreeByStrap.values()].some((deg) => deg > 2)) return [];

  const usedStrapIds = new Set<string>();
  const chains: GuideJoinChain[] = [];

  const openStartIds = straps
    .filter((strap) => (degreeByStrap.get(strap.id) ?? 0) === 1)
    .map((strap) => strap.id)
    .sort();

  for (const startId of openStartIds) {
    if (usedStrapIds.has(startId)) continue;

    const startHasJoinAtStart = !!reciprocalLink(startId, 'start');
    const startHasJoinAtEnd = !!reciprocalLink(startId, 'end');

    let enterSide: EndpointSide;
    if (startHasJoinAtStart && !startHasJoinAtEnd) {
      enterSide = 'end';
    } else if (!startHasJoinAtStart && startHasJoinAtEnd) {
      enterSide = 'start';
    } else {
      continue;
    }

    const members: GuideJoinChainMember[] = [];
    const seenInThisChain = new Set<string>();
    let currentId = startId;
    let currentEnterSide = enterSide;
    let closed = false;

    while (true) {
      if (seenInThisChain.has(currentId)) {
        closed = true;
        break;
      }
      seenInThisChain.add(currentId);
      usedStrapIds.add(currentId);

      members.push({
        strapId: currentId,
        reversed: currentEnterSide === 'end',
      });

      const exitSide = otherSide(currentEnterSide);
      const next = reciprocalLink(currentId, exitSide);
      if (!next) break;

      currentId = next.strapId;
      currentEnterSide = next.side;
    }

    if (members.length > 1 && !closed) {
      const id = members
        .map((m) => `${m.strapId}:${m.reversed ? 'rev' : 'fwd'}`)
        .join('|');
      chains.push({ id, members, closed: false });
    }
  }

  const traceClosedCycle = (startId: string, startEnterSide: EndpointSide) => {
    const members: GuideJoinChainMember[] = [];
    const seenStates = new Set<string>();
    let currentId = startId;
    let currentEnterSide = startEnterSide;

    while (true) {
      if (members.length > 0 && currentId === startId && currentEnterSide === startEnterSide) {
        return members;
      }

      const stateKey = `${currentId}:${currentEnterSide}`;
      if (seenStates.has(stateKey)) return null;
      seenStates.add(stateKey);

      members.push({
        strapId: currentId,
        reversed: currentEnterSide === 'end',
      });

      const exitSide = otherSide(currentEnterSide);
      const next = reciprocalLink(currentId, exitSide);
      if (!next) return null;

      currentId = next.strapId;
      currentEnterSide = next.side;
    }
  };

  const closedStartIds = straps
    .filter((strap) => (degreeByStrap.get(strap.id) ?? 0) === 2 && !usedStrapIds.has(strap.id))
    .map((strap) => strap.id)
    .sort();

  for (const startId of closedStartIds) {
    if (usedStrapIds.has(startId)) continue;

    const traced =
      traceClosedCycle(startId, 'start')
      ?? traceClosedCycle(startId, 'end');

    if (!traced || traced.length < 2) continue;

    // Safety guard: only enable closed joined continuity for a simple paired loop for now.
    const uniqueIds = [...new Set(traced.map((m) => m.strapId))];
    if (uniqueIds.length !== 2) continue;

    uniqueIds.forEach((id) => usedStrapIds.add(id));

    const id = traced
      .map((m) => `${m.strapId}:${m.reversed ? 'rev' : 'fwd'}`)
      .join('|');

    chains.push({ id, members: traced, closed: true });
  }

  return chains;
};


const findPairCompanionCandidate = (candidates: GuideJoinCandidate[], base: GuideJoinCandidate) => {
  const samePair = candidates.filter((cand) => (
    pairKey(cand.aId, cand.bId) === pairKey(base.aId, base.bId)
    && cand.key !== base.key
  ));
  if (!samePair.length) return null;
  return samePair.find((cand) => (
    cand.aId === base.aId
    && cand.bId === base.bId
    && cand.aSide !== base.aSide
    && cand.bSide !== base.bSide
  )) ?? samePair[0];
};

const buildJoinedPairComposites = (straps: Strap[]): JoinedPairComposite[] => {
  const byId = new Map(straps.map((strap) => [strap.id, strap]));
  const indexById = new Map(straps.map((strap, index) => [strap.id, index]));
  const seenPairs = new Set<string>();
  const composites: JoinedPairComposite[] = [];

  const reciprocal = (strapId: string, side: EndpointSide) => {
    const strap = byId.get(strapId);
    const ref = strap?.guideJoin?.[side];
    if (!ref) return null;
    const other = byId.get(ref.otherId);
    const back = other?.guideJoin?.[ref.otherSide];
    if (!back || back.otherId !== strapId || back.otherSide !== side) return null;
    return { otherId: ref.otherId, otherSide: ref.otherSide };
  };

  straps.forEach((strap) => {
    const neighbors = new Set<string>();
    (['start', 'end'] as EndpointSide[]).forEach((side) => {
      const link = reciprocal(strap.id, side);
      if (link) neighbors.add(link.otherId);
    });
    if (neighbors.size !== 1) return;
    const otherId = [...neighbors][0];
    const other = byId.get(otherId);
    if (!other) return;

    const otherNeighbors = new Set<string>();
    (['start', 'end'] as EndpointSide[]).forEach((side) => {
      const link = reciprocal(other.id, side);
      if (link) otherNeighbors.add(link.otherId);
    });
    if (otherNeighbors.size !== 1 || !otherNeighbors.has(strap.id)) return;

    const key = pairKey(strap.id, other.id);
    if (seenPairs.has(key)) return;
    seenPairs.add(key);

    const sorted = [strap.id, other.id].sort((a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0)) as [string, string];
    composites.push({ id: `pair:${key}`, memberIds: sorted });
  });

  return composites;
};

const buildVirtualGuideBaselineForChain = ({
  chain,
  transformedById,
}: {
  chain: GuideJoinChain;
  transformedById: Map<string, Pt[]>;
}) => {
  const points: Pt[] = [];

  const stitchPoint = (a: Pt, b: Pt) => {
    const seamGap = Math.hypot(a.x - b.x, a.y - b.y);
    if (seamGap > GUIDE_JOIN_MAX_SEAM_GAP_MM) return null;
    if (seamGap < 1e-9) return a;
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  };

  for (let i = 0; i < chain.members.length; i += 1) {
    const member = chain.members[i];
    const raw = transformedById.get(member.strapId) ?? [];
    if (!isOpenPolyline(raw) || raw.length < 2) return null;

    const pts = member.reversed ? [...raw].reverse() : raw;

    if (!points.length) {
      points.push(...pts);
      continue;
    }

    const seam = stitchPoint(points[points.length - 1], pts[0]);
    if (!seam) return null;

    points[points.length - 1] = seam;
    points.push(...pts.slice(1));
  }

  if (chain.closed && points.length >= 2) {
    const seam = stitchPoint(points[points.length - 1], points[0]);
    if (!seam) return null;
    points[points.length - 1] = seam;
    points[0] = seam;
  }

  return points.length >= 2 ? { baseline: points } : null;
};


const buildCompatibleJoinedGuideData = ({
  chains,
  strapById,
  transformedById,
}: {
  chains: GuideJoinChain[];
  strapById: Map<string, { strap: Strap; metrics: ReturnType<typeof guideMetrics> }>;
  transformedById: Map<string, Pt[]>;
}) => {
  const result: Array<{
    chainId: string;
    members: GuideJoinChainMember[];
    guideSet: ReturnType<typeof buildGuideSet>;
  }> = [];

  chains.forEach((chain) => {
    const first = strapById.get(chain.members[0].strapId);
    if (!first) return;

    const allCompatible = chain.members.every((m) => {
      const item = strapById.get(m.strapId);
      if (!item) return false;
      if (item.strap.script !== first.strap.script) return false;
      if (item.strap.invertGuides !== first.strap.invertGuides) return false;
      const a = item.metrics;
      const b = first.metrics;
      return Math.abs(a.xMM - b.xMM) < 1e-6
        && Math.abs(a.ascMM - b.ascMM) < 1e-6
        && Math.abs(a.descMM - b.descMM) < 1e-6
        && Math.abs(a.nibMM - b.nibMM) < 1e-6
        && Math.abs(a.effectiveNibMM - b.effectiveNibMM) < 1e-6;
    });
    if (!allCompatible) return;

    const virtual = buildVirtualGuideBaselineForChain({ chain, transformedById });
    if (!virtual) return;

    const guideSet = buildGuideSet(
      first.strap.script === 'Copperplate' ? 'copperplate' : 'blackletter',
      {
        baseline: virtual.baseline,
        xMM: first.metrics.xMM,
        ascMM: first.metrics.ascMM,
        descMM: first.metrics.descMM,
        tickStepMM:
          first.strap.script === 'Copperplate'
            ? Math.max(2, first.metrics.nibMM)
            : first.metrics.effectiveNibMM,
        actualNibMM: first.metrics.nibMM,
        invertGuides: first.strap.invertGuides,
        tickAnchorS: 0,
      },
    );

    result.push({
      chainId: chain.id,
      members: chain.members,
      guideSet,
    });
  });

  return result;
};


function InsetLabeledField({ label, disabled = false, className = '', rightAdornment, rightAdornmentInteractive = false, adornmentClassName = 'right-3', children }: InsetLabeledFieldProps) {
  return (
    <div className={`relative rounded-lg border border-slate-300 overflow-hidden ${disabled ? 'bg-slate-50' : 'bg-white'} ${className}`}>
      <div className="absolute inset-x-0 top-0 h-5 bg-slate-50/80 border-b border-slate-300 px-3 flex items-center z-10 pointer-events-none">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
      </div>
      <div className="relative pt-5">
        {children}
        {rightAdornment && (
          <span className={`${rightAdornmentInteractive ? '' : 'pointer-events-none'} select-none absolute ${adornmentClassName} top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500`}>
            {rightAdornment}
          </span>
        )}
      </div>
    </div>
  );
}

function circlePathD(r = 40) {
  return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
}

const SHAPE_OPTIONS = [
  { kind: 'circle', label: 'Circle' },
  { kind: 'rounded-square', label: 'Rounded square' },
  { kind: 'rounded-right-angle', label: 'Rounded right angle' },
  { kind: 'hard-right-angle', label: 'Hard right angle' },
  { kind: 'hard-square', label: 'Hard square' },
  { kind: 'curved-arch', label: 'Curved arch' },
  { kind: 'horseshoe', label: 'Horseshoe' },
  { kind: 'shallow-s-curve', label: 'Shallow S curve' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'kite', label: 'Kite' },
  { kind: 'hard-zigzag', label: 'Hard zigzag' },
  { kind: 'curved-zigzag', label: 'Curved zigzag' },
  { kind: 'rectangle', label: 'Rectangle' },
] as const;

type ShapeKind = typeof SHAPE_OPTIONS[number]['kind'];

const assignDistinctColors = (straps: Strap[]): Strap[] => straps.map((strap, idx) => ({
  ...strap,
  color: PALETTE[idx % PALETTE.length],
}));

const shapePathD = (kind: ShapeKind): string => {
  switch (kind) {
    case 'circle': return circlePathD(45);
    case 'rounded-square': return 'M -45 -30 Q -45 -45 -30 -45 L 30 -45 Q 45 -45 45 -30 L 45 30 Q 45 45 30 45 L -30 45 Q -45 45 -45 30 Z';
    case 'rounded-right-angle': return 'M -40 -35 L -40 35 Q -40 45 -30 45 L 20 45 Q 35 45 35 30 L 35 20 L 15 20 L 15 25 Q 15 30 10 30 L -20 30 Q -25 30 -25 25 L -25 -35 Z';
    case 'hard-right-angle': return 'M -40 -35 L -40 40 L 10 40 L 10 15 L 35 15 L 35 -35 Z';
    case 'hard-square': return 'M -45 -45 L 45 -45 L 45 45 L -45 45 Z';
    case 'curved-arch': return 'M -50 35 Q 0 -45 50 35';
    case 'horseshoe': return 'M -38 -40 L -38 15 Q 0 55 38 15 L 38 -40';
    case 'shallow-s-curve': return 'M -48 -20 C -18 -50 18 10 48 -20 C 18 10 -18 50 -48 20';
    case 'diamond': return 'M 0 -50 L 45 0 L 0 50 L -45 0 Z';
    case 'kite': return 'M 0 -55 L 32 0 L 0 50 L -32 0 Z';
    case 'hard-zigzag': return 'M -50 25 L -25 -25 L 0 25 L 25 -25 L 50 25';
    case 'curved-zigzag': return 'M -50 20 Q -38 -22 -25 20 Q -12 55 0 20 Q 12 -22 25 20 Q 38 55 50 20';
    case 'rectangle': return 'M -60 -30 L 60 -30 L 60 30 L -60 30 Z';
    default: return circlePathD(45);
  }
};

const PATH_GUIDES_PRESETS: PathGuidesPresetV1[] = [

  {
    id: 'fraktur-scurve-weave-2',
    name: 'Fraktur S-curve weave (2 straps)',
    state: {
      paper: 'A4',
      orientation: 'portrait',
      view: 'custom',
      zoom: 1.1153276421780445,
      pan: { x: 6.869062493103284, y: 3.4364911042410142 },
      simplify: false,
      showCrossings: true,
      activeCrossingId:
        'strap-21f24596-a745-4fd4-97c6-769e53aa9acb|strap-8d1a8810-e85d-4281-85af-b1979c496a13|1021|2161',
      crossingsFilter: 'all',
      showAllCrossings: false,
      crossingOverrides: {
        'strap-21f24596-a745-4fd4-97c6-769e53aa9acb|strap-8d1a8810-e85d-4281-85af-b1979c496a13': {
          1: 'strap-21f24596-a745-4fd4-97c6-769e53aa9acb',
          3: 'strap-21f24596-a745-4fd4-97c6-769e53aa9acb',
        },
      },
      groups: [],
      straps: [
        {
          id: 'strap-8d1a8810-e85d-4281-85af-b1979c496a13',
          name: 'scurve 1',
          d: 'M248.76,160.95c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08h.02c83.85,0,151.82,67.98,151.82,151.83s-67.97,151.82-151.82,151.83v.02c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08',
          color: '#5778A4',
          script: 'Fraktur',
          nibMMText: '3.8',
          nibAngleDeg: 40,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: { x: -207.68742293228425, y: -272.5880849181708 },
          scalePct: 44.62499345265998,
          rotDeg: 0,
          flip: true,
          snapped: false,
          invertGuides: false,
          xNibText: '4.5',
          ascNibText: '2',
          descNibText: '2',
        },
        {
          id: 'strap-21f24596-a745-4fd4-97c6-769e53aa9acb',
          name: 'scurve2 1',
          d: 'M346.52,680.95c29.87,0,54.08-24.21,54.08-54.08s-24.21-54.08-54.08-54.08h-.02c-83.85,0-151.82-67.98-151.82-151.83s67.97-151.82,151.82-151.83v-.02c29.87,0,54.08-24.21,54.08-54.08s-24.21-54.08-54.08-54.08',
          color: '#E49444',
          script: 'Fraktur',
          nibMMText: '3.8',
          nibAngleDeg: 40,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: { x: -182.94658644083785, y: -272.6014905214777 },
          scalePct: 44.62499476212782,
          rotDeg: 0,
          flip: true,
          snapped: false,
          invertGuides: false,
          xNibText: '4.5',
          ascNibText: '2',
          descNibText: '2',
        },
      ],
      activeId: 'strap-8d1a8810-e85d-4281-85af-b1979c496a13',
    },
  },
  {
    id: 'woven-double-circle',
    name: 'Woven double circle',
    state: {
      paper: 'A4',
      orientation: 'portrait',
      view: 'autofit',
      zoom: 1.35,
      pan: { x: 0, y: 0 },
      simplify: true,
      showCrossings: true,
      activeCrossingId: null,
      crossingsFilter: 'all',
      showAllCrossings: false,
      crossingOverrides: {},
      groups: [],
      straps: [
        {
          id: 'preset-strap-1',
          name: 'Circle A',
          d: circlePathD(40),
          color: '#1d4ed8',
          script: 'Copperplate',
          nibMMText: '2.5',
          nibAngleDeg: 45,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: { x: 90, y: 140 },
          scalePct: 100,
          rotDeg: 0,
          flip: false,
          snapped: false,
          invertGuides: false,
        },
        {
          id: 'preset-strap-2',
          name: 'Circle B',
          d: circlePathD(40),
          color: '#ea580c',
          script: 'Copperplate',
          nibMMText: '2.5',
          nibAngleDeg: 45,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: { x: 120, y: 155 },
          scalePct: 100,
          rotDeg: 0,
          flip: false,
          snapped: false,
          invertGuides: false,
        },
      ],
      activeId: 'preset-strap-2',
    },
  },
];

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const SCRIPT_DEFAULTS = {
  TexturaQuadrata: {
    nibMMText: '4',
    nibAngleDeg: 45 as const,
    xNibText: '5',
    ascNibText: '2',
    descNibText: '2',
  },
  Fraktur: {
    nibMMText: '4',
    nibAngleDeg: 40 as const,
    xNibText: '4.5',
    ascNibText: '2',
    descNibText: '2',
  },
  Copperplate: {
    xHeightMMText: '6',
    copperplateRatioPreset: '3:2:3' as CopperplateRatioPreset,
  },
};

function applyScriptDefaults(strap: Strap, script: ScriptId): Strap {
  if (script === 'Copperplate') {
    return {
      ...strap,
      script,
      xHeightMMText: SCRIPT_DEFAULTS.Copperplate.xHeightMMText,
      copperplateRatioPreset: SCRIPT_DEFAULTS.Copperplate.copperplateRatioPreset,
      xNibText: undefined,
      ascNibText: undefined,
      descNibText: undefined,
    };
  }

  const blackletterDefaults = script === 'Fraktur'
    ? SCRIPT_DEFAULTS.Fraktur
    : SCRIPT_DEFAULTS.TexturaQuadrata;

  return {
    ...strap,
    script,
    nibMMText: blackletterDefaults.nibMMText,
    nibAngleDeg: blackletterDefaults.nibAngleDeg,
    xNibText: blackletterDefaults.xNibText,
    ascNibText: blackletterDefaults.ascNibText,
    descNibText: blackletterDefaults.descNibText,
  };
}

function guideMetrics(strap: Strap) {
  const nibMM = Math.max(0.2, Number.parseFloat(strap.nibMMText) || 2.5);

  if (strap.script === 'Copperplate') {
    const xMM = Math.max(0.5, Number.parseFloat(strap.xHeightMMText ?? '6') || 6);
    let descUnits = 3;
    let xUnits = 2;
    let ascUnits = 3;
    if (strap.copperplateRatioPreset === '2:1:2') {
      descUnits = 2;
      xUnits = 1;
      ascUnits = 2;
    } else if (strap.copperplateRatioPreset === '1:1:1') {
      descUnits = 1;
      xUnits = 1;
      ascUnits = 1;
    } else if (strap.copperplateRatioPreset === 'custom') {
      descUnits = Math.max(0, Number.parseFloat(strap.copperplateDescUnitsText ?? '3') || 3);
      xUnits = Math.max(0.5, Number.parseFloat(strap.copperplateXUnitsText ?? '2') || 2);
      ascUnits = Math.max(0, Number.parseFloat(strap.copperplateAscUnitsText ?? '3') || 3);
    }
    const unitMM = xMM / Math.max(0.5, xUnits);
    const ascMM = ascUnits * unitMM;
    const descMM = descUnits * unitMM;
    const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);
    return { xMM, ascMM, descMM, bandWidthMM, nibMM, effectiveNibMM: nibMM };
  }

  const angleRad = (strap.nibAngleDeg * Math.PI) / 180;
  const effectiveNibMM = Math.max(0.2, nibMM * Math.cos(angleRad));

  const xNib = Math.max(1, Number.parseFloat(strap.xNibText ?? '5') || 5);
  const ascNib = Math.max(0, Number.parseFloat(strap.ascNibText ?? '3') || 3);
  const descNib = Math.max(0, Number.parseFloat(strap.descNibText ?? '2') || 2);
  const ascMM = ascNib * nibMM;
  const descMM = descNib * nibMM;
  const xMM = xNib * nibMM;
  const bandWidthMM = Math.max(ascMM + xMM + descMM, 4);

  return {
    xMM,
    ascMM,
    descMM,
    bandWidthMM,
    nibMM,              // raw nib
    effectiveNibMM,     // projected nib (for tick spacing)
  };
}

export default function PathGuidesPage() {
  const [paper, setPaper] = useState<PaperId>('A4');
  const [orientation, setOrientation] = useState<Orientation>(PAPERS_MM.A4.defaultOrientation);
  const box = useMemo(() => {
    const raw = PAPERS_MM[paper];
    if (orientation === 'landscape' && raw.w < raw.h) return { w: raw.h, h: raw.w };
    if (orientation === 'portrait' && raw.w > raw.h) return { w: raw.h, h: raw.w };
    return { w: raw.w, h: raw.h };
  }, [orientation, paper]);
  const centerX = box.w / 2;
  const centerY = box.h / 2;
  const [view, setView] = useState<ViewMode>('fullpage');
  const [zoom, setZoom] = useState(1.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragListId, setDragListId] = useState<string | null>(null);
  const [groups, setGroups] = useState<StrapGroup[]>([]);
  const [simplify, setSimplify] = useState(true);
  const [showCrossings, setShowCrossings] = useState(true);
  const [activeCrossingId, setActiveCrossingId] = useState<string | null>(null);
  const [crossingsFilter, setCrossingsFilter] = useState<CrossingsFilter>('all');
  const [showAllCrossings, setShowAllCrossings] = useState(false);
  const [crossingOverrides, setCrossingOverrides] = useState<PairOverrides>({});
  const [showDebugPoints] = useState(false);
  const [dragSimplifyStrapId, setDragSimplifyStrapId] = useState<string | null>(null);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('circle');
  const dragActive = dragSimplifyStrapId !== null;
  const previewSimplify = simplify || dragActive;
  const [dragPaintTick, setDragPaintTick] = useState(0);
  const [scaleInputText, setScaleInputText] = useState('');
  const [rotationInputText, setRotationInputText] = useState('');
  const [nudgePaintTick, setNudgePaintTick] = useState(0);
  const [scrubPaintTick, setScrubPaintTick] = useState(0);

  const [straps, setStraps] = useState<Strap[]>(() => ([applyScriptDefaults({
    id: uid('strap'),
    name: 'Circle',
    d: circlePathD(40),
    color: PALETTE[0],
    script: 'Copperplate',
    nibMMText: '2.5',
    nibAngleDeg: 45,
    xHeightMMText: '6',
    copperplateRatioPreset: '3:2:3',
    offset: { x: centerX, y: centerY },
    scalePct: 100,
    rotDeg: 0,
    flip: false,
    snapped: false,
    invertGuides: false,
  }, 'Copperplate')]));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('custom');
  const lastAppliedPresetStateRef = useRef<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'strap';
    pointerId: number;
    startClient: { x: number; y: number };
    startPan: { x: number; y: number };
    rect?: { w: number; h: number };
    vb?: { vw: number; vh: number };
    strapId?: string;
    startOffset?: { x: number; y: number };
    startSnapped?: boolean;
    startLocalCenter?: { x: number; y: number };
    liveOffset?: { x: number; y: number };
    liveSnapped?: boolean;
  }>({
    mode: 'none',
    pointerId: -1,
    startClient: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const pendingDragPaintRef = useRef(false);
  const liveDragTranslateRef = useRef<{ strapId: string; dx: number; dy: number } | null>(null);
  const nudgeActiveRef = useRef(false);
  const nudgeTimerRef = useRef<number | null>(null);
  const nudgeBaseRef = useRef<{ strapId: string; baseOffset: { x: number; y: number }; baseSnapped: boolean } | null>(null);
  const nudgeSnappedRef = useRef<boolean>(false);

  // Live rotation/scale scrubbing (avoid heavy recompute while slider is being dragged)
  const scrubActiveRef = useRef(false);
  const scrubStrapIdRef = useRef<string | null>(null);
  const scrubBaseRef = useRef<{ rotDeg: number; scalePct: number } | null>(null);
  const scrubLiveRef = useRef<{ dRot: number; dScale: number } | null>(null);

  const activeStrap = straps.find((s) => s.id === (activeId ?? straps[0]?.id)) ?? straps[0] ?? null;
  const interactionActive = dragActive || nudgeActiveRef.current || scrubActiveRef.current;

  // While scrubbing, the preview uses an SVG transform delta, but we don't update strap state until commit.
  // These derived "display" values keep the slider thumb + numbers responsive.
  const scrubIsForActive =
    !!activeStrap && scrubActiveRef.current && scrubStrapIdRef.current === activeStrap.id && !!scrubBaseRef.current;
  const displayRotDeg = (() => {
    if (!activeStrap) return 0;
    if (!scrubIsForActive) return activeStrap.rotDeg;
    const base = scrubBaseRef.current!;
    const live = scrubLiveRef.current;
    const rot = base.rotDeg + (live?.dRot ?? 0);
    return Math.round(rot);
  })();
  const displayScalePct = (() => {
    if (!activeStrap) return 100;
    if (!scrubIsForActive) return activeStrap.scalePct;
    const base = scrubBaseRef.current!;
    const live = scrubLiveRef.current;
    const scale = base.scalePct * (live?.dScale ?? 1);
    return scale;
  })();

  const decimatePolyline = (pts: { x: number; y: number }[], maxPts: number) => {
    if (pts.length <= maxPts) return pts;
    if (maxPts < 2) return [pts[0], pts[pts.length - 1]];
    const stride = Math.ceil((pts.length - 1) / (maxPts - 1));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
    const last = pts[pts.length - 1];
    const end = out[out.length - 1];
    if (!end || end.x !== last.x || end.y !== last.y) out.push(last);
    return out;
  };

  const renderData = useMemo(() => straps.map((strap) => {
    const sampled = samplePathDToPolyline(strap.d, 1.25);
    const localCenter = centroid(sampled);
    const centered = sampled.map((p) => ({ x: p.x - localCenter.x, y: p.y - localCenter.y }));
    const transformed = transformPolyline(centered, {
      scalePct: strap.scalePct,
      rotDeg: strap.rotDeg,
      flipX: strap.flip,
      offset: { x: strap.offset.x + localCenter.x, y: strap.offset.y + localCenter.y },
    });
    const metrics = guideMetrics(strap);

    const guideSet =
      (transformed.length > 1)
        ? buildGuideSet(strap.script === 'Copperplate' ? 'copperplate' : 'blackletter', {
          baseline: transformed,
          xMM: metrics.xMM,
          ascMM: metrics.ascMM,
          descMM: metrics.descMM,
          tickStepMM: strap.script === 'Copperplate' ? Math.max(2, metrics.nibMM) : metrics.effectiveNibMM,
          actualNibMM: metrics.nibMM,
          invertGuides: strap.invertGuides,
        })
        : null;

    const transformedD = transformed.length > 1 ? pathD(transformed) : '';
    const bandD = guideSet ? bandPolygonD(guideSet.ascLine, guideSet.descLine) : '';
    const proxyBandD = guideSet
      ? bandPolygonD(
        decimatePolyline(guideSet.ascLine, 90),
        decimatePolyline(guideSet.descLine, 90),
      )
      : '';

    return { strap, transformed, transformedD, guideSet, bandD, proxyBandD, metrics, localCenter, sampled };
  }), [straps]);
  const totalSegments = useMemo(
    () => renderData.reduce((sum, r) => sum + Math.max(0, r.transformed.length - 1), 0),
    [renderData],
  );
  const crossingPerformanceWarning = totalSegments > CROSSING_MAX_SEGMENTS;
  const transformedById = useMemo(() => new Map(renderData.map((r) => [r.strap.id, r.transformed])), [renderData]);


  const baseCrossings = useMemo(() => {
    if (crossingPerformanceWarning) return [];
    return findCrossingsForStraps(
      renderData.map((r) => ({ id: r.strap.id, pts: r.transformed })),
      CROSS_EPS_MM,
    );
  }, [crossingPerformanceWarning, renderData]);

  const pairSlotsByCrossingId = useMemo(() => {
    const slots = new Map<string, { key: PairKey; slot: number }>();
    const crossingsByPair = new Map<PairKey, Crossing[]>();

    baseCrossings.forEach((crossing) => {
      const key = pairKey(crossing.aId, crossing.bId);
      if (!crossingsByPair.has(key)) crossingsByPair.set(key, []);
      crossingsByPair.get(key)!.push(crossing);
    });

    crossingsByPair.forEach((crossingsForPair) => {
      const first = crossingsForPair[0];
      const aPts = transformedById.get(first.aId) ?? [];
      const bPts = transformedById.get(first.bId) ?? [];
      const orderedIds = slotOrderForPair(crossingsForPair, aPts, bPts);
      orderedIds.forEach((crossingId, slot) => {
        slots.set(crossingId, { key: pairKey(first.aId, first.bId), slot });
      });
    });

    return slots;
  }, [baseCrossings, transformedById]);

  const crossingsWithOverrides = useMemo(
    () => baseCrossings.map((crossing) => {
      const slotMeta = pairSlotsByCrossingId.get(crossing.id);
      const overId = slotMeta ? (crossingOverrides[slotMeta.key]?.[slotMeta.slot] ?? crossing.overId) : crossing.overId;
      return { ...crossing, overId };
    }),
    [baseCrossings, crossingOverrides, pairSlotsByCrossingId],
  );

  const vb = useMemo(() => {
    if (view === 'fullpage') return { minX: 0, minY: 0, vw: box.w, vh: box.h, str: `0 0 ${box.w} ${box.h}` };
    const safeZoom = Math.max(0.35, zoom);
    const vw = box.w / safeZoom;
    const vh = box.h / safeZoom;
    const minX = (box.w - vw) / 2 - pan.x;
    const minY = (box.h - vh) / 2 - pan.y;
    return { minX, minY, vw, vh, str: `${minX} ${minY} ${vw} ${vh}` };
  }, [box.h, box.w, pan, view, zoom]);

  const strapById = useMemo(() => new Map(renderData.map((r) => [r.strap.id, r])), [renderData]);

  const guideJoinCandidates = useMemo(
    () => buildGuideJoinCandidates({ straps, transformedById }),
    [straps, transformedById],
  );

  const joinedPairComposites = useMemo(
    () => buildJoinedPairComposites(straps),
    [straps],
  );

  const compositeByMemberId = useMemo(() => {
    const map = new Map<string, JoinedPairComposite>();
    joinedPairComposites.forEach((composite) => {
      composite.memberIds.forEach((memberId) => map.set(memberId, composite));
    });
    return map;
  }, [joinedPairComposites]);


  const step3Rows = useMemo<Step3Row[]>(() => {
    const rows: Step3Row[] = [];
    const consumed = new Set<string>();
    straps.forEach((strap) => {
      if (consumed.has(strap.id)) return;
      const composite = compositeByMemberId.get(strap.id);
      if (composite) {
        const members = composite.memberIds
          .map((id) => straps.find((s) => s.id === id))
          .filter((s): s is Strap => !!s);
        members.forEach((member) => consumed.add(member.id));
        rows.push({
          id: composite.id,
          memberIds: members.map((member) => member.id),
          label: members.map((member) => member.name).join(' + '),
          color: members[0]?.color ?? strap.color,
          indexLabel: members.map((member) => `#${straps.findIndex((s) => s.id === member.id) + 1}`).join(', '),
        });
        return;
      }
      consumed.add(strap.id);
      rows.push({
        id: strap.id,
        memberIds: [strap.id],
        label: strap.name,
        color: strap.color,
        indexLabel: `#${straps.findIndex((s) => s.id === strap.id) + 1}`,
      });
    });
    return rows;
  }, [compositeByMemberId, straps]);

  const rowIdForActive = useMemo(() => {
    if (!activeId) return null;
    return compositeByMemberId.get(activeId)?.id ?? activeId;
  }, [activeId, compositeByMemberId]);

  const guideJoinChains = useMemo(
    () => buildGuideJoinChains(straps),
    [straps],
  );

  const compatibleJoinedGuideData = useMemo(
    () => buildCompatibleJoinedGuideData({ chains: guideJoinChains, strapById, transformedById }),
    [guideJoinChains, strapById, transformedById],
  );

  const joinedGuideSetByMemberId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildGuideSet>>();
    compatibleJoinedGuideData.forEach((chain) => {
      chain.members.forEach((member) => {
        map.set(member.strapId, chain.guideSet);
      });
    });
    return map;
  }, [compatibleJoinedGuideData]);

  function bandWindowDFromGuideSet(
    guideSet: NonNullable<(typeof renderData)[number]["guideSet"]>,
    segIdx: number,
    windowMM: number,
  ) {
    const asc0 = guideSet.ascLine;
    const desc0 = guideSet.descLine;
    if (!asc0?.length || !desc0?.length) return "";

    const ascN0 = asc0.length;
    const descN0 = desc0.length;

    // Detect "closed" by first ~= last (tiny tolerance in mm coords).
    const ascIsClosed =
      ascN0 > 2 &&
      Math.hypot(asc0[0].x - asc0[ascN0 - 1].x, asc0[0].y - asc0[ascN0 - 1].y) < 0.05;
    const descIsClosed =
      descN0 > 2 &&
      Math.hypot(desc0[0].x - desc0[descN0 - 1].x, desc0[0].y - desc0[descN0 - 1].y) < 0.05;

    // If closed, drop duplicate last point.
    const asc = ascIsClosed ? asc0.slice(0, -1) : asc0;
    const desc = descIsClosed ? desc0.slice(0, -1) : desc0;

    const n = Math.min(asc.length, desc.length);
    if (n < 2) return "";

    // segIdx comes from intersections; treat as point-ish index and clamp.
    const center = Math.max(0, Math.min(n - 1, segIdx));

    const wrap = ascIsClosed && descIsClosed;

    const dist = (i: number, j: number) =>
      Math.hypot(asc[i].x - asc[j].x, asc[i].y - asc[j].y);

    // Walk backward/forward from center until we hit ~windowMM along the asc polyline.
    let left = center;
    let right = center;

    // Backwards
    let acc = 0;
    while (acc < windowMM && (wrap ? acc < windowMM : left > 0)) {
      const prev = wrap ? (left - 1 + n) % n : left - 1;
      if (!wrap && prev < 0) break;
      acc += dist(left, prev);
      left = prev;
      if (!wrap && left === 0) break;
      if (wrap && left === center) break;
    }

    // Forwards
    acc = 0;
    while (acc < windowMM && (wrap ? acc < windowMM : right < n - 1)) {
      const next = wrap ? (right + 1) % n : right + 1;
      if (!wrap && next >= n) break;
      acc += dist(right, next);
      right = next;
      if (!wrap && right === n - 1) break;
      if (wrap && right === center) break;
    }

    // Collect indices from left..right (wrap-aware)
    const ascPts: { x: number; y: number }[] = [];
    const descPts: { x: number; y: number }[] = [];

    if (wrap && left > right) {
      // left..end, 0..right
      for (let i = left; i < n; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
      for (let i = 0; i <= right; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
    } else {
      for (let i = left; i <= right; i++) {
        ascPts.push(asc[i]);
        descPts.push(desc[i]);
      }
    }

    if (ascPts.length < 2 || descPts.length < 2) return "";

    const a = ascPts.map((p) => `${p.x},${p.y}`).join(" L ");
    const d = descPts
      .slice()
      .reverse()
      .map((p) => `${p.x},${p.y}`)
      .join(" L ");
    return `M ${a} L ${d} Z`;
  }

  // --- Weave masking: for each UNDER strap, collect the crossings where it is UNDER ---
  const underCrossings = useMemo(() => {
    const map = new Map<string, typeof crossingsWithOverrides>();
    crossingsWithOverrides.forEach((c) => {
      const under = c.aId === c.overId ? c.bId : c.aId;
      if (!map.has(under)) map.set(under, []);
      map.get(under)!.push(c);
    });
    return map;
  }, [crossingsWithOverrides]);

  const setCrossingOver = (crossing: Crossing, overId: string) => {
    const slotMeta = pairSlotsByCrossingId.get(crossing.id);
    if (!slotMeta) return;

    setCrossingOverrides((prev) => ({
      ...prev,
      [slotMeta.key]: {
        ...(prev[slotMeta.key] ?? {}),
        [slotMeta.slot]: overId,
      },
    }));
    setActiveCrossingId(crossing.id);
  };

  const buildExportedState = (): ExportedStateV1 => ({
    // Export canonical placement fields for each strap: d, offset, scalePct, rotDeg, flip, and array order.
    paper,
    orientation,
    view,
    zoom,
    pan,
    simplify,
    showCrossings,
    activeCrossingId,
    crossingsFilter,
    showAllCrossings,
    crossingOverrides,
    groups,
    straps,
    activeId,
  });

  const markPresetDirty = useCallback(() => {
    if (selectedPresetId === 'custom') return;
    setSelectedPresetId('custom');
    lastAppliedPresetStateRef.current = null;
  }, [selectedPresetId]);

  const updateCompositeSettings = useCallback((baseId: string, patch: Partial<Strap>) => {
    const composite = compositeByMemberId.get(baseId);
    const ids = composite ? new Set(composite.memberIds) : new Set([baseId]);
    markPresetDirty();
    setStraps((prev) =>
      normalizeGuideJoinLinks(
        prev.map((strap) => (
          ids.has(strap.id) ? { ...strap, ...patch } : strap
        )),
      ),
    );
  }, [compositeByMemberId, markPresetDirty]);

  const loadPreset = (preset: PathGuidesPresetV1) => {
    const state = { ...preset.state, straps: normalizeGuideJoinLinks(assignDistinctColors(preset.state.straps)) };
    setPaper(state.paper);
    setOrientation(state.orientation);
    setView(state.view);
    setZoom(state.zoom);
    setPan(state.pan);
    setSimplify(state.simplify);
    setShowCrossings(state.showCrossings);
    setActiveCrossingId(state.activeCrossingId);
    setCrossingsFilter(state.crossingsFilter);
    setShowAllCrossings(state.showAllCrossings);
    setCrossingOverrides(state.crossingOverrides);
    setGroups(state.groups);
    setStraps(state.straps);
    setActiveId(state.activeId);
    setError(null);
    setDragListId(null);
    setScaleInputText('');
    setRotationInputText('');
    setDragSimplifyStrapId(null);
    dragRef.current = { mode: 'none', pointerId: -1, startClient: { x: 0, y: 0 }, startPan: { x: 0, y: 0 } };
    liveDragTranslateRef.current = null;
    nudgeActiveRef.current = false;
    nudgeBaseRef.current = null;
    nudgeSnappedRef.current = false;
    if (nudgeTimerRef.current != null) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    setSelectedPresetId(preset.id);
    lastAppliedPresetStateRef.current = JSON.stringify(state);
  };

  const serializedCurrentState = useMemo(() => JSON.stringify({
    paper,
    orientation,
    view,
    zoom,
    pan,
    simplify,
    showCrossings,
    activeCrossingId,
    crossingsFilter,
    showAllCrossings,
    crossingOverrides,
    groups,
    straps,
    activeId,
  } satisfies ExportedStateV1), [
    paper,
    orientation,
    view,
    zoom,
    pan,
    simplify,
    showCrossings,
    activeCrossingId,
    crossingsFilter,
    showAllCrossings,
    crossingOverrides,
    groups,
    straps,
    activeId,
  ]);

  useEffect(() => {
    if (selectedPresetId === 'custom') return;
    if (serializedCurrentState === lastAppliedPresetStateRef.current) return;
    const timer = window.setTimeout(() => {
      setSelectedPresetId('custom');
      lastAppliedPresetStateRef.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedPresetId, serializedCurrentState]);

  const exportPresetJson = () => {
    const state = buildExportedState();
    const payload = {
      format: 'calligraphy-tools/path-guides-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      state,
    };
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
    const filename = `path-guides-preset_${paper}_${orientation}_${ts}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const updateStrap = (id: string, patch: Partial<Strap>) => {
    markPresetDirty();
    setStraps((prev) =>
      normalizeGuideJoinLinks(
        prev.map((strap) => (strap.id === id ? { ...strap, ...patch } : strap)),
      ),
    );
  };

  const requestScrubPaint = useCallback(() => {
    if (!pendingDragPaintRef.current) {
      pendingDragPaintRef.current = true;
      requestAnimationFrame(() => {
        pendingDragPaintRef.current = false;
        setScrubPaintTick((t) => (t + 1) % 1000000);
      });
    }
  }, []);

  const beginScrubTransform = useCallback((strapId: string) => {
    const strap = straps.find((s) => s.id === strapId);
    if (!strap) return;
    scrubActiveRef.current = true;
    scrubStrapIdRef.current = strapId;
    scrubBaseRef.current = { rotDeg: strap.rotDeg, scalePct: strap.scalePct };
    scrubLiveRef.current = { dRot: 0, dScale: 1 };
    requestScrubPaint();
  }, [requestScrubPaint, straps]);

  const updateScrubTransform = useCallback((strapId: string, next: { rotDeg?: number; scalePct?: number }) => {
    const base = scrubBaseRef.current;
    if (!base) return;
    if (scrubStrapIdRef.current !== strapId) return;
    const rot = next.rotDeg ?? (base.rotDeg + (scrubLiveRef.current?.dRot ?? 0));
    const scale = next.scalePct ?? (base.scalePct * (scrubLiveRef.current?.dScale ?? 1));
    const dRot = rot - base.rotDeg;
    const dScale = base.scalePct > 1e-6 ? (scale / base.scalePct) : 1;
    scrubLiveRef.current = { dRot, dScale };
    requestScrubPaint();
  }, [requestScrubPaint]);

  const commitScrubTransform = useCallback(() => {
    if (!scrubActiveRef.current) return;
    const strapId = scrubStrapIdRef.current;
    const base = scrubBaseRef.current;
    const live = scrubLiveRef.current;
    if (!strapId || !base || !live) {
      scrubActiveRef.current = false;
      scrubStrapIdRef.current = null;
      scrubBaseRef.current = null;
      scrubLiveRef.current = null;
      requestScrubPaint();
      return;
    }
    const finalRot = Math.round(base.rotDeg + live.dRot);
    const finalScale = base.scalePct * live.dScale;

    // If nothing actually changed, don't mark dirty and don't write state.
    // This avoids flipping presets back to "custom" on click-without-move.
    const rotChanged = finalRot !== base.rotDeg;
    const scaleChanged = Math.abs(finalScale - base.scalePct) > 1e-6;

    if (!rotChanged && !scaleChanged) {
      scrubActiveRef.current = false;
      scrubStrapIdRef.current = null;
      scrubBaseRef.current = null;
      scrubLiveRef.current = null;
      requestScrubPaint();
      return;
    }

    markPresetDirty();
    setStraps((prev) =>
      normalizeGuideJoinLinks(
        prev.map((s) =>
          s.id === strapId ? { ...s, rotDeg: finalRot, scalePct: finalScale } : s,
        ),
      ),
    );

    scrubActiveRef.current = false;
    scrubStrapIdRef.current = null;
    scrubBaseRef.current = null;
    scrubLiveRef.current = null;
    requestScrubPaint();
  }, [markPresetDirty, requestScrubPaint]);

  const applyViewPreset = (next: ViewMode) => {
    setView(next);
    if (next === 'autofit') {
      setZoom(1.35);
      setPan({ x: 0, y: 0 });
    }
    if (next === 'fullpage') setPan({ x: 0, y: 0 });
  };

  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      mode: 'pan',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPan: pan,
      rect: { w: e.currentTarget.getBoundingClientRect().width, h: e.currentTarget.getBoundingClientRect().height },
      vb: { vw: vb.vw, vh: vb.vh },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };

  const beginStrapDrag =
    (strapId: string) =>
      (e: React.PointerEvent<SVGPathElement | SVGLineElement | SVGPolylineElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const strap = straps.find((s) => s.id === strapId);
        if (!strap || !svgRef.current) return;
        setActiveId(strapId);
        setDragSimplifyStrapId(strapId);
        dragRef.current = {
          mode: 'strap',
          pointerId: e.pointerId,
          startClient: { x: e.clientX, y: e.clientY },
          startPan: pan,
          rect: svgRef.current.getBoundingClientRect ? { w: svgRef.current.getBoundingClientRect().width, h: svgRef.current.getBoundingClientRect().height } : undefined,
          vb: { vw: vb.vw, vh: vb.vh },
          strapId,
          startOffset: strap.offset,
          startSnapped: strap.snapped,
          startLocalCenter: strapById.get(strapId)?.localCenter,
          liveOffset: strap.offset,
          liveSnapped: strap.snapped,
        };
        svgRef.current.setPointerCapture(e.pointerId);
      };

  const onSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const drag = dragRef.current;
    if (drag.pointerId !== e.pointerId || drag.mode === 'none') return;
    const rectW = drag.rect?.w ?? e.currentTarget.getBoundingClientRect().width;
    const rectH = drag.rect?.h ?? e.currentTarget.getBoundingClientRect().height;
    if (!rectW || !rectH) return;
    const vbVW = drag.vb?.vw ?? vb.vw;
    const vbVH = drag.vb?.vh ?? vb.vh;

    const dxMM = ((e.clientX - drag.startClient.x) / rectW) * vbVW;
    const dyMM = ((e.clientY - drag.startClient.y) / rectH) * vbVH;

    if (drag.mode === 'pan') {
      const mmPerPxX = vbVW / rectW;
      const mmPerPxY = vbVH / rectH;
      const nx = drag.startPan.x + (e.clientX - drag.startClient.x) * mmPerPxX;
      const ny = drag.startPan.y + (e.clientY - drag.startClient.y) * mmPerPxY;
      setView('custom');
      setPan({ x: nx, y: ny });
      return;
    }

    if (!drag.strapId || !drag.startOffset) return;
    let nextX = drag.startOffset.x + dxMM;
    const nextY = drag.startOffset.y + dyMM;
    let snapped = drag.startSnapped ?? false;

    const cX = drag.startLocalCenter?.x ?? 0;
    if (snapped) {
      if (Math.abs((nextX + cX) - centerX) > RELEASE_MM) snapped = false;
      else nextX = centerX - cX;
    }
    if (!snapped && Math.abs((nextX + cX) - centerX) <= SNAP_IN_MM) {
      nextX = centerX - cX;
      snapped = true;
    }

    drag.liveOffset = { x: nextX, y: nextY };
    drag.liveSnapped = snapped;
    const dx = nextX - drag.startOffset.x;
    const dy = nextY - drag.startOffset.y;
    liveDragTranslateRef.current = { strapId: drag.strapId, dx, dy };

    if (!pendingDragPaintRef.current) {
      pendingDragPaintRef.current = true;
      requestAnimationFrame(() => {
        pendingDragPaintRef.current = false;
        setDragPaintTick((t) => (t + 1) % 1000000);
      });
    }
  };

  const requestNudgePaint = useCallback(() => {
    if (!pendingDragPaintRef.current) {
      pendingDragPaintRef.current = true;
      requestAnimationFrame(() => {
        pendingDragPaintRef.current = false;
        setNudgePaintTick((t) => (t + 1) % 1000000);
      });
    }
  }, []);


  const onSvgPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (dragRef.current.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsPanning(false);
      const finished = dragRef.current;
      if (finished.mode === 'strap' && finished.strapId && finished.startOffset && finished.liveOffset) {
        markPresetDirty();
        const finalOffset = finished.liveOffset;
        const finalSnapped = finished.liveSnapped ?? false;
        setStraps((prev) =>
          normalizeGuideJoinLinks(
            prev.map((s) =>
              s.id === finished.strapId
                ? { ...s, offset: finalOffset, snapped: finalSnapped }
                : s,
            ),
          ),
        );
      }
      dragRef.current = { mode: 'none', pointerId: -1, startClient: { x: 0, y: 0 }, startPan: { x: 0, y: 0 } };
      liveDragTranslateRef.current = null;
      setDragSimplifyStrapId(null);
    }
  };

  const addCircle = (name = `Circle ${straps.length + 1}`) => {
    markPresetDirty();
    const i = straps.length;
    const step = 10;
    const pattern = [
      { x: step, y: step },
      { x: step * 2, y: step },
      { x: step, y: step * 2 },
      { x: 0, y: step },
      { x: step, y: 0 },
      { x: step * 2, y: step * 2 },
      { x: 0, y: step * 2 },
      { x: step * 2, y: 0 },
      { x: 0, y: 0 },
    ];
    const localOffset = pattern[i % pattern.length];
    const baseD = circlePathD(40);
    const sampled = samplePathDToPolyline(baseD, 1.25);
    const localCenterPt = centroid(sampled);
    const offset = clampOffsetToPage({
      sampled,
      localCenter: localCenterPt,
      strap: { scalePct: 100, rotDeg: 0, flip: false, offset: { x: centerX + localOffset.x, y: centerY + localOffset.y } },
      box,
      marginMM: FIT_MARGIN_MM,
    });

    const next = applyScriptDefaults({
      id: uid('strap'),
      name,
      d: baseD,
      color: PALETTE[straps.length % PALETTE.length],
      script: 'Copperplate',
      nibMMText: '2.5',
      nibAngleDeg: 45,
      xHeightMMText: '6',
      copperplateRatioPreset: '3:2:3',
      offset,
      scalePct: 100,
      rotDeg: 0,
      flip: false,
      snapped: false,
      invertGuides: false,
    }, 'Copperplate');
    setStraps((prev) => normalizeGuideJoinLinks(assignDistinctColors([...prev, next])));
    setActiveId(next.id);
  };

  // Keyboard nudge: smaller increments for precise placement.
  // Arrow = 0.25mm, Shift+Arrow = 1.0mm.
  const NUDGE_MM = 0.25;
  const NUDGE_MULT_SHIFT = 4;
  const NUDGE_COMMIT_IDLE_MS = 90;

  useEffect(() => {
    const commitNudge = () => {
      const baseNow = nudgeBaseRef.current;
      const liveNow = liveDragTranslateRef.current;
      if (!baseNow || !liveNow || liveNow.strapId !== baseNow.strapId) return;
      markPresetDirty();
      const finalOffset = { x: baseNow.baseOffset.x + liveNow.dx, y: baseNow.baseOffset.y + liveNow.dy };
      const finalSnapped = nudgeSnappedRef.current;
      setStraps((prev) => prev.map((s) => (s.id === baseNow.strapId ? { ...s, offset: finalOffset, snapped: finalSnapped } : s)));
    };

    const endNudgeSession = () => {
      if (nudgeTimerRef.current != null) {
        window.clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
      }
      commitNudge();
      nudgeActiveRef.current = false;
      nudgeBaseRef.current = null;
      liveDragTranslateRef.current = null;
      requestNudgePaint();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      const strapId = activeId ?? straps[0]?.id;
      if (!strapId) return;
      const strap = straps.find((s) => s.id === strapId);
      if (!strap) return;

      e.preventDefault();

      if (!nudgeBaseRef.current || nudgeBaseRef.current.strapId !== strapId) {
        nudgeBaseRef.current = { strapId, baseOffset: strap.offset, baseSnapped: strap.snapped };
        nudgeSnappedRef.current = strap.snapped;
      }
      nudgeActiveRef.current = true;

      const step = NUDGE_MM * (e.shiftKey ? NUDGE_MULT_SHIFT : 1);
      const keyDx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const keyDy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

      const live = liveDragTranslateRef.current;
      const prevDx = live && live.strapId === strapId ? live.dx : 0;
      const prevDy = live && live.strapId === strapId ? live.dy : 0;

      let nextDx = prevDx + keyDx;
      const nextDy = prevDy + keyDy;

      const rd = strapById.get(strapId);
      const cX = rd?.localCenter?.x ?? 0;
      const startX = nudgeBaseRef.current.baseOffset.x;
      let snapped = nudgeSnappedRef.current;
      let finalX = startX + nextDx;
      if (snapped) {
        if (Math.abs((finalX + cX) - centerX) > RELEASE_MM) snapped = false;
        else finalX = centerX - cX;
      }
      if (!snapped && Math.abs((finalX + cX) - centerX) <= SNAP_IN_MM) {
        finalX = centerX - cX;
        snapped = true;
      }
      nextDx = finalX - startX;
      nudgeSnappedRef.current = snapped;

      liveDragTranslateRef.current = { strapId, dx: nextDx, dy: nextDy };
      requestNudgePaint();

      if (nudgeTimerRef.current != null) window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = window.setTimeout(() => {
        commitNudge();
        nudgeActiveRef.current = false;
        nudgeBaseRef.current = null;
        liveDragTranslateRef.current = null;
        requestNudgePaint();
      }, NUDGE_COMMIT_IDLE_MS);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', endNudgeSession);
    window.addEventListener('blur', endNudgeSession);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', endNudgeSession);
      window.removeEventListener('blur', endNudgeSession);
      if (nudgeTimerRef.current != null) window.clearTimeout(nudgeTimerRef.current);
    };
  }, [activeId, centerX, markPresetDirty, requestNudgePaint, strapById, straps]);


  const toggleGuideJoin = useCallback((cand: GuideJoinCandidate) => {
    markPresetDirty();
    setStraps((prev) => {
      const aIdx = prev.findIndex((s) => s.id === cand.aId);
      const bIdx = prev.findIndex((s) => s.id === cand.bId);
      if (aIdx < 0 || bIdx < 0) return prev;

      const next = prev.map((s) => ({ ...s, guideJoin: s.guideJoin ? { ...s.guideJoin } : undefined }));
      const a = next[aIdx];
      const b = next[bIdx];

      const pairCompanion = findPairCompanionCandidate(guideJoinCandidates, cand);
      const seams: Array<Pick<GuideJoinCandidate, 'aSide' | 'bSide'>> = [{ aSide: cand.aSide, bSide: cand.bSide }];
      if (pairCompanion) {
        if (pairCompanion.aId === cand.aId && pairCompanion.bId === cand.bId) {
          seams.push({ aSide: pairCompanion.aSide, bSide: pairCompanion.bSide });
        } else if (pairCompanion.aId === cand.bId && pairCompanion.bId === cand.aId) {
          seams.push({ aSide: pairCompanion.bSide, bSide: pairCompanion.aSide });
        }
      }

      const isSeamJoined = (aSide: EndpointSide, bSide: EndpointSide) => (
        a.guideJoin?.[aSide]?.otherId === b.id
        && a.guideJoin?.[aSide]?.otherSide === bSide
        && b.guideJoin?.[bSide]?.otherId === a.id
        && b.guideJoin?.[bSide]?.otherSide === aSide
      );

      const clearSide = (strap: Strap, side: EndpointSide) => {
        if (!strap.guideJoin) return;
        delete strap.guideJoin[side];
        if (!strap.guideJoin.start && !strap.guideJoin.end) delete strap.guideJoin;
      };

      const pairFullyJoined = seams.every((seam) => isSeamJoined(seam.aSide, seam.bSide));
      if (pairFullyJoined) {
        seams.forEach((seam) => {
          clearSide(a, seam.aSide);
          clearSide(b, seam.bSide);
        });
        return normalizeGuideJoinLinks(next);
      }

      const aPts = transformedById.get(a.id) ?? [];
      const bPts = transformedById.get(b.id) ?? [];
      const aEnd = getEndpointInfo(a.id, aPts, cand.aSide);
      const bEnd = getEndpointInfo(b.id, bPts, cand.bSide);
      if (!aEnd || !bEnd) return prev;

      let moveId = a.id;
      if (activeId === a.id) moveId = a.id;
      else if (activeId === b.id) moveId = b.id;
      else moveId = aIdx > bIdx ? a.id : b.id;

      const dx = moveId === a.id ? (bEnd.point.x - aEnd.point.x) : (aEnd.point.x - bEnd.point.x);
      const dy = moveId === a.id ? (bEnd.point.y - aEnd.point.y) : (aEnd.point.y - bEnd.point.y);

      const moveIdx = next.findIndex((s) => s.id === moveId);
      if (moveIdx >= 0) {
        const move = next[moveIdx];
        move.offset = { x: move.offset.x + dx, y: move.offset.y + dy };
        move.snapped = false;
      }

      if (!a.guideJoin) a.guideJoin = {};
      if (!b.guideJoin) b.guideJoin = {};
      seams.forEach((seam) => {
        a.guideJoin![seam.aSide] = { otherId: b.id, otherSide: seam.bSide };
        b.guideJoin![seam.bSide] = { otherId: a.id, otherSide: seam.aSide };
      });
      return normalizeGuideJoinLinks(next);
    });
  }, [activeId, guideJoinCandidates, markPresetDirty, transformedById]);

  const addShape = () => {
    markPresetDirty();
    const selected = SHAPE_OPTIONS.find((shape) => shape.kind === shapeKind) ?? SHAPE_OPTIONS[0];
    const d = shapePathD(selected.kind);
    const fit = fitStrapToPage({ d, box, centerX, centerY, marginMM: FIT_MARGIN_MM });
    if (selected.kind === 'circle') {
      addCircle(`Shape: ${selected.label}`);
      return;
    }
    const next = applyScriptDefaults({
      id: uid('strap'),
      name: `Shape: ${selected.label}`,
      d,
      color: PALETTE[straps.length % PALETTE.length],
      script: 'Copperplate',
      nibMMText: '2.5',
      nibAngleDeg: 45,
      xHeightMMText: '6',
      copperplateRatioPreset: '3:2:3',
      offset: fit.offset,
      scalePct: fit.scalePct,
      rotDeg: 0,
      flip: false,
      snapped: false,
      invertGuides: false,
    }, 'Copperplate');
    setStraps((prev) => normalizeGuideJoinLinks(assignDistinctColors([...prev, next])));
    setActiveId(next.id);
  };

  const parseUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    markPresetDirty();
    setError(null);
    const created: Strap[] = [];

    for (const file of Array.from(files)) {
      const text = await file.text();
      // v1 parser: regex path extraction; ignores transforms and non-<path> geometry.
      const matches = [...text.matchAll(/<path\b[^>]*\bd=(['"])([\s\S]*?)\1/gi)];
      matches.forEach((m, idx) => {
        const d = m[2]?.trim();
        if (!d) return;
        const fit = fitStrapToPage({ d, box, centerX, centerY, marginMM: FIT_MARGIN_MM });
        created.push(applyScriptDefaults({
          id: uid('strap'),
          name: `${file.name.replace(/\.svg$/i, '')} ${idx + 1}`,
          d,
          color: PALETTE[(straps.length + created.length) % PALETTE.length],
          script: 'Copperplate',
          nibMMText: '2.5',
          nibAngleDeg: 45,
          xHeightMMText: '6',
          copperplateRatioPreset: '3:2:3',
          offset: fit.offset,
          scalePct: fit.scalePct,
          rotDeg: 0,
          flip: false,
          snapped: false,
          invertGuides: false,
        }, 'Copperplate'));
      });
    }

    if (!created.length) {
      setError('No paths found in SVG');
      return;
    }

    setStraps((prev) => normalizeGuideJoinLinks(assignDistinctColors([...prev, ...created])));
    setActiveId(created[0].id);
  };

  const reorderStraps = (sourceRowId: string, targetRowId: string) => {
    markPresetDirty();
    setStraps((prev) => {
      const composites = buildJoinedPairComposites(prev);
      const membersForRow = (rowId: string) => {
        const composite = composites.find((item) => item.id === rowId);
        if (composite) return [...composite.memberIds];
        return [rowId];
      };
      const sourceIds = membersForRow(sourceRowId);
      const targetIds = membersForRow(targetRowId);
      if (!sourceIds.length || !targetIds.length) return prev;

      const sourceSet = new Set(sourceIds);
      const reduced = prev.filter((strap) => !sourceSet.has(strap.id));
      const targetIndex = reduced.findIndex((strap) => strap.id === targetIds[0]);
      if (targetIndex < 0) return prev;
      const moving = prev.filter((strap) => sourceSet.has(strap.id));
      reduced.splice(targetIndex, 0, ...moving);
      return normalizeGuideJoinLinks(reduced);
    });
  };

  const duplicateRowById = (rowId: string) => {
    const sourceIds = step3Rows.find((row) => row.id === rowId)?.memberIds ?? [rowId];
    const sourceStraps = sourceIds.map((id) => straps.find((strap) => strap.id === id)).filter((strap): strap is Strap => !!strap);
    if (!sourceStraps.length) return;
    markPresetDirty();

    const duplicates = sourceStraps.map((strap, index) => {
      const sampled = samplePathDToPolyline(strap.d, 1.25);
      const localCenter = centroid(sampled);
      const duplicate: Strap = {
        ...strap,
        id: uid('strap'),
        name: `${strap.name} copy`,
        color: PALETTE[(straps.length + index + 1) % PALETTE.length],
        offset: { x: strap.offset.x + 8, y: strap.offset.y + 8 },
        snapped: false,
        guideJoin: undefined,
      };
      duplicate.offset = clampOffsetToPage({ sampled, localCenter, strap: duplicate, box, marginMM: FIT_MARGIN_MM });
      return duplicate;
    });

    setStraps((prev) => normalizeGuideJoinLinks(assignDistinctColors([...prev, ...duplicates])));
    setActiveId(duplicates[0]?.id ?? null);
  };

  const removeRowById = (rowId: string) => {
    const ids = step3Rows.find((row) => row.id === rowId)?.memberIds ?? [rowId];
    if (straps.length <= ids.length) return;
    markPresetDirty();
    const toRemove = new Set(ids);
    setStraps((prev) => normalizeGuideJoinLinks(prev.filter((strap) => !toRemove.has(strap.id))));
    if (activeId && toRemove.has(activeId)) {
      setActiveId(straps.find((strap) => !toRemove.has(strap.id))?.id ?? null);
    }
  };


  const centerStrapX = (strapId: string) => {
    const strap = straps.find((s) => s.id === strapId);
    if (!strap) return;
    const cx = box.w / 2;
    markPresetDirty();
    updateStrap(strapId, { offset: { x: cx, y: strap.offset.y }, snapped: false });
  };

  const centerStrapY = (strapId: string) => {
    const strap = straps.find((s) => s.id === strapId);
    if (!strap) return;
    const cy = box.h / 2;
    markPresetDirty();
    updateStrap(strapId, { offset: { x: strap.offset.x, y: cy }, snapped: false });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeId) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) return;
      }

      const strap = straps.find((s) => s.id === activeId);
      if (!strap) return;

      const step = event.shiftKey ? 5 : event.altKey ? 0.5 : 1;
      const delta = { x: 0, y: 0 };
      if (event.key === 'ArrowLeft') delta.x = -step;
      if (event.key === 'ArrowRight') delta.x = step;
      if (event.key === 'ArrowUp') delta.y = -step;
      if (event.key === 'ArrowDown') delta.y = step;

      markPresetDirty();
      setStraps((prev) =>
        normalizeGuideJoinLinks(
          prev.map((s) => (
            s.id === activeId
              ? { ...s, offset: { x: s.offset.x + delta.x, y: s.offset.y + delta.y } }
              : s
          )),
        ),
      );
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, markPresetDirty, straps]);

  return (
    <main className="min-h-screen text-sm text-slate-900 relative">
      <div className="fixed inset-0 -z-10 bg-slate-100" style={{ backgroundImage: 'none' }} />

      <header className="px-6 pt-8 pb-4">
        <div className="max-w-[1120px] mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">Calligraphy Tools <span className="text-indigo-600">— Custom Guideline Tool</span></h1>
          <p className="mt-1 text-sm text-slate-600">Upload SVG paths and generate calligraphy guidelines that follow each path. Arrange and layer straps to plan interwoven layouts.</p>
        </div>
      </header>

      <section className="px-6">
        <div className="max-w-[1120px] mx-auto bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-start gap-3 mb-2">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-slate-800">Preview</h3>
              <select className="p-1.5 text-sm rounded-lg border border-slate-300" value={view} onChange={(e) => applyViewPreset(e.target.value as ViewMode)}>
                <option value="autofit">Auto-fit straps</option>
                <option value="fullpage">Full page</option>
                <option value="custom">Custom</option>
              </select>
              <button onClick={() => setSimplify((v) => !v)} className={`px-2 py-1 text-sm rounded-lg border ${simplify ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white'}`}>Simplify</button>
              <button onClick={() => setShowCrossings((v) => !v)} className={`px-2 py-1 text-sm rounded-lg border ${showCrossings ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white'}`}>Crossings</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button onClick={() => { setView('custom'); setZoom((z) => Math.max(0.35, z * 0.9)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">–</button>
              <button onClick={() => { setView('custom'); setZoom((z) => Math.min(6, z * 1.1)); }} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">+</button>
              <button onClick={() => applyViewPreset('autofit')} className="px-2 py-1 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">Reset view</button>
            </div>
          </div>

          {crossingPerformanceWarning && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              Too many points; increase step size.
            </div>
          )}

          <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-300">
            <svg
              ref={svgRef}
              viewBox={vb.str}
              className={`block mx-auto w-full h-[38vh] sm:h-[44vh] md:h-[50vh] touch-none ${isPanning ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'}`}
              style={{ background: '#cbd5e1' }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
            >
              {!previewSimplify && (
                <defs>
                  {renderData.map(({ strap, bandD }) => (
                    bandD ? (
                      <clipPath
                        key={`guide-clip-${strap.id}`}
                        id={`guide-clip-${strap.id}`}
                        clipPathUnits="userSpaceOnUse"
                      >
                        <path d={bandD} />
                      </clipPath>
                    ) : null
                  ))}
                  {[...underCrossings.entries()].map(([underId, list]) => (
                    <mask
                      key={`mask-${underId}`}
                      id={`mask-${underId}`}
                      maskUnits="userSpaceOnUse"
                      x={0}
                      y={0}
                      width={box.w}
                      height={box.h}
                    >
                      {/* Always start fully visible over the whole page (NOT viewBox). */}
                      <rect x={0} y={0} width={box.w} height={box.h} fill="white" />

                      {/* For every crossing where this strap is UNDER, cut out the OVER strap band near that crossing. */}
                      {list.map((c) => {
                        const overId = c.overId;
                        const over = strapById.get(overId);
                        if (!over?.guideSet) return null;

                        const overSeg = overId === c.aId ? c.aSeg : c.bSeg;
                        const centerIdx = overSeg + 1;
                        const windowMM = Math.max(12, over.metrics.bandWidthMM * 2.5);

                        const d0 = bandWindowDFromGuideSet(over.guideSet, centerIdx - 1, windowMM);
                        const d1 = bandWindowDFromGuideSet(over.guideSet, centerIdx, windowMM);
                        const d2 = bandWindowDFromGuideSet(over.guideSet, centerIdx + 1, windowMM);

                        return (
                          <g key={`hole-${underId}-${c.id}`}>
                            {d0 ? <path d={d0} fill="black" /> : null}
                            {d1 ? <path d={d1} fill="black" /> : null}
                            {d2 ? <path d={d2} fill="black" /> : null}
                          </g>
                        );
                      })}
                    </mask>
                  ))}
                </defs>
              )}
              <rect x={vb.minX} y={vb.minY} width={vb.vw} height={vb.vh} fill="#cbd5e1" />
              <rect x={0} y={0} width={box.w} height={box.h} fill="white" stroke="#cbd5e1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <line x1={centerX} y1={0} x2={centerX} y2={box.h} stroke="#e2e8f0" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

              {renderData.map(({ strap, transformed, transformedD, guideSet, bandD, proxyBandD, metrics, localCenter }) => {
  const joinedGuideSet = joinedGuideSetByMemberId.get(strap.id);
  const visibleGuideSet = joinedGuideSet ?? guideSet;

                const isSimplifiedForThisStrap = simplify || interactionActive;
                // Use paint tick so ref-driven translation repaints without heavy recompute.
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                dragPaintTick;
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                nudgePaintTick;
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                scrubPaintTick;
                const live = liveDragTranslateRef.current;
                const isLive = !!(interactionActive && live && live.strapId === strap.id);
                const dx = isLive ? live.dx : 0;
                const dy = isLive ? live.dy : 0;

                const isSelected = activeId === strap.id;

                // Live rotation/scale scrub transform is applied as an SVG transform delta around the strap's world center.
                // World center for this strap matches the transformPolyline origin: (offset + localCenter).
                const scrubOnThis = scrubActiveRef.current && scrubStrapIdRef.current === strap.id;
                const scrub = scrubOnThis ? scrubLiveRef.current : null;
                const worldCX = strap.offset.x + localCenter.x;
                const worldCY = strap.offset.y + localCenter.y;
                const scrubTransform = scrub
                  ? ` translate(${worldCX} ${worldCY}) rotate(${scrub.dRot}) scale(${scrub.dScale}) translate(${-worldCX} ${-worldCY})`
                  : '';

                const gTransform = `${dx || dy ? `translate(${dx} ${dy})` : ''}${scrubTransform}`;

                return (
                  <g
                    key={strap.id}
                    transform={gTransform.trim() ? gTransform : undefined}
                    mask={
                      !interactionActive && !isSimplifiedForThisStrap && underCrossings.get(strap.id)?.length
                        ? `url(#mask-${strap.id})`
                        : undefined
                    }
                  >
                    {/* Selected indicator: subtle halo that works in both simplify and full guideline view */}
                    {isSelected && (
                      isSimplifiedForThisStrap ? (
                        guideSet ? (
                          <path
                            d={(interactionActive ? proxyBandD : bandD) || ''}
                            fill="none"
                            stroke="#4f46e5"
                            strokeWidth={1.2}
                            opacity={0.55}
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                          />
                        ) : transformedD ? (
                          <path
                            d={transformedD}
                            fill="none"
                            stroke="#4f46e5"
                            strokeWidth={Math.max(1.2, metrics.bandWidthMM * 0.18)}
                            opacity={0.55}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                          />
                        ) : null
                      ) : transformedD ? (
                        <path
                          d={transformedD}
                          fill="none"
                          stroke="#4f46e5"
                          strokeWidth={2.2}
                          opacity={0.28}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      ) : null
                    )}
                    {isSimplifiedForThisStrap ? (
                      guideSet ? (
                        <path
                          d={interactionActive ? proxyBandD : bandD}
                          fill={strap.color}
                          stroke="none"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="fill"
                          onPointerDown={(e) => {
                            if (dragActive) return;
                            beginStrapDrag(strap.id)(e);
                          }}
                        />
                      ) : transformed.length > 1 ? (
                        <path
                          d={transformedD}
                          fill="none"
                          stroke={strap.color}
                          strokeWidth={metrics.bandWidthMM}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="stroke"
                          onPointerDown={(e) => {
                            if (dragActive) return;
                            beginStrapDrag(strap.id)(e);
                          }}
                        />
                      ) : null
                    ) : (
                      transformed.length > 1 ? (
                        <path
                          d={transformedD}
                          fill="none"
                          stroke={strap.color}
                          strokeWidth={0.9}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      ) : null
                    )}

{!interactionActive && !isSimplifiedForThisStrap && visibleGuideSet && (
  <GuideOverlay
    guideSet={visibleGuideSet}
    style={{
      thin: 0.45,
      bold: 0.75,
      colors: {
        thin: strap.color,
        bold: activeStrap?.id === strap.id ? '#7c3aed' : strap.color,
        tick: '#dbeafe',
        frame: 'transparent',
      },
    }}
    interactive={{ onGuidePointerDown: beginStrapDrag(strap.id), hitStrokeWidthMM: 6 }}
  />
)}

                    {showDebugPoints && !isSimplifiedForThisStrap && transformed.map((pt, i) => (
                      <g key={`dbg-${strap.id}-${i}`}>
                        <circle cx={pt.x} cy={pt.y} r={0.8} fill="#ef4444" vectorEffect="non-scaling-stroke" />
                        <text x={pt.x + 1} y={pt.y - 1} fontSize="2.6" fill="#b91c1c">{i}</text>
                      </g>
                    ))}
                  </g>
                );
              })}

              {simplify && !interactionActive && crossingsWithOverrides.map((crossing) => {
                const over = strapById.get(crossing.overId);
                if (!over?.guideSet) return null;

                const overSeg = crossing.overId === crossing.aId ? crossing.aSeg : crossing.bSeg;
                const centerIdx = overSeg + 1;
                const dOver = bandWindowDFromGuideSet(
                  over.guideSet,
                  centerIdx,
                  Math.max(12, over.metrics.bandWidthMM * 2.5),
                );
                if (!dOver) return null;

                return (
                  <g key={`weave-${crossing.id}`} pointerEvents="none">
                    <path
                      d={dOver}
                      fill={over.strap.color}
                      stroke="none"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {showCrossings && !interactionActive && crossingsWithOverrides.map((crossing, idx) => (
                <g
                  key={`marker-${crossing.id}`}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextOver = crossing.overId === crossing.aId ? crossing.bId : crossing.aId;
                    setCrossingOver(crossing, nextOver);
                  }}
                >
                  {activeCrossingId === crossing.id && (
                    <circle cx={crossing.x} cy={crossing.y} r={3} fill="none" stroke="#4f46e5" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  )}
                  <circle cx={crossing.x} cy={crossing.y} r={1.8} fill="#ffffff" stroke="#111827" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                  <text x={crossing.x + 2.6} y={crossing.y - 2.2} fontSize="3.2" fill="#111827" stroke="white" strokeWidth={0.15} paintOrder="stroke">{idx + 1}</text>
                </g>
              ))}

              {!interactionActive && guideJoinCandidates.map((candidate) => (
                <g
                  key={`guide-join-${candidate.key}`}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGuideJoin(candidate);
                  }}
                >
                  <rect
                    x={candidate.x - 2.4}
                    y={candidate.y - 2.4}
                    width={4.8}
                    height={4.8}
                    rx={0.8}
                    ry={0.8}
                    fill={candidate.alreadyJoined ? '#eef2ff' : '#ffffff'}
                    stroke="#1f2937"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text x={candidate.x} y={candidate.y + 1.05} textAnchor="middle" fontSize="3.1" fill="#111827" paintOrder="stroke" stroke="white" strokeWidth={0.2}>{candidate.alreadyJoined ? '−' : '+'}</text>
                </g>
              ))}

            </svg>
          </div>
        </div>
      </section>

      <section className="px-6 py-5 max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 1 — Manage straps</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InsetLabeledField label="Paper size">
              <select
                className={INSET_CONTROL_BASE}
                value={paper}
                onChange={(e) => {
                  markPresetDirty();
                  const nextPaper = e.target.value as PaperId;
                  setPaper(nextPaper);
                  setOrientation(PAPERS_MM[nextPaper].defaultOrientation);
                  setPan({ x: 0, y: 0 });
                }}
              >
                {Object.entries(PAPERS_MM).map(([id, p]) => (
                  <option key={id} value={id}>{p.label}</option>
                ))}
              </select>
            </InsetLabeledField>
            <InsetLabeledField label="Orientation">
              <select
                className={INSET_CONTROL_BASE}
                value={orientation}
                onChange={(e) => {
                  markPresetDirty();
                  setOrientation(e.target.value as Orientation);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </InsetLabeledField>
          </div>
          <div className="mt-3">
            <InsetLabeledField label="Presets:" className="w-full">
              <select
                className={INSET_CONTROL_BASE}
                value={selectedPresetId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (nextId === 'custom') {
                    setSelectedPresetId('custom');
                    return;
                  }
                  const preset = PATH_GUIDES_PRESETS.find((x) => x.id === nextId);
                  if (preset) loadPreset(preset);
                }}
              >
                <option value="custom">Custom (current)</option>
                {PATH_GUIDES_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </InsetLabeledField>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 items-end">
            <InsetLabeledField
              label="Add shape"
              className="flex-1 min-w-[220px]"
              rightAdornment={(
                <button
                  type="button"
                  onClick={addShape}
                  className="h-7 min-w-7 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label="Add selected shape"
                  title="Add selected shape"
                >
                  +
                </button>
              )}
              rightAdornmentInteractive
              adornmentClassName="right-1 top-[calc(50%+10px)]"
            >
              <select className={INSET_CONTROL_WIDE} value={shapeKind} onChange={(e) => setShapeKind(e.target.value as ShapeKind)}>
                {SHAPE_OPTIONS.map((shape) => (
                  <option key={shape.kind} value={shape.kind}>{shape.label}</option>
                ))}
              </select>
            </InsetLabeledField>
            <label className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Upload SVG(s)
              <input type="file" accept=".svg" multiple className="hidden" onChange={(e) => { parseUpload(e.target.files); }} />
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
          <div className="mt-5 border-t border-slate-200 pt-3">
            <button onClick={exportPresetJson} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100">Export preset JSON (dev)</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 2 — Strap settings</h2>
          <p className="mt-1 text-xs text-slate-600">{activeStrap?.script === 'Copperplate' ? 'Copperplate uses x-height (mm).' : 'Blackletter scripts use nib size and nib angle.'}</p>
          {!activeStrap && <p className="mt-3 text-slate-500">Select a strap.</p>}
          {activeStrap && (
            <div className="mt-3 space-y-3">
              <InsetLabeledField label="Script">
                <select
                  className={INSET_CONTROL_BASE}
                  value={activeStrap.script}
                  onChange={(e) => {
                    markPresetDirty();
                    const script = e.target.value as ScriptId;
                    const composite = compositeByMemberId.get(activeStrap.id);
                    const ids = composite ? new Set(composite.memberIds) : new Set([activeStrap.id]);
                    setStraps((prev) =>
                      normalizeGuideJoinLinks(
                        prev.map((strap) => (ids.has(strap.id) ? applyScriptDefaults(strap, script) : strap)),
                      ),
                    );
                  }}
                >
                  {Object.keys(SCRIPT_PROFILES).map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </InsetLabeledField>

              {activeStrap.script === 'Copperplate' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <InsetLabeledField label="X-height" rightAdornment="mm">
                      <input type="number" min={0.5} step="0.5" className={INSET_CONTROL_MM} value={activeStrap.xHeightMMText ?? '6'} onChange={(e) => updateCompositeSettings(activeStrap.id, { xHeightMMText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                    </InsetLabeledField>
                    <InsetLabeledField label="Guideline ratio">
                      <select className={INSET_CONTROL_BASE} value={activeStrap.copperplateRatioPreset ?? '3:2:3'} onChange={(e) => updateCompositeSettings(activeStrap.id, { copperplateRatioPreset: e.target.value as CopperplateRatioPreset })}>
                        <option value="3:2:3">3 : 2 : 3</option><option value="2:1:2">2 : 1 : 2</option><option value="1:1:1">1 : 1 : 1</option><option value="custom">Custom</option>
                      </select>
                    </InsetLabeledField>
                  </div>
                  {(activeStrap.copperplateRatioPreset ?? '3:2:3') === 'custom' && (
                    <div className="grid grid-cols-3 gap-2">
                      <InsetLabeledField label="Desc units">
                        <input type="number" step="0.5" min={0} className={INSET_CONTROL_BASE} value={activeStrap.copperplateDescUnitsText ?? '3'} onChange={(e) => updateCompositeSettings(activeStrap.id, { copperplateDescUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateDescUnitsText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { copperplateDescUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateDescUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateCompositeSettings(activeStrap.id, { copperplateDescUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                      <InsetLabeledField label="X units">
                        <input type="number" step="0.5" min={0.5} className={INSET_CONTROL_BASE} value={activeStrap.copperplateXUnitsText ?? '2'} onChange={(e) => updateCompositeSettings(activeStrap.id, { copperplateXUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateXUnitsText ?? '2') || 2; const next = Math.max(0.5, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { copperplateXUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateXUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0.5, snapHalf(parsed)) : 2; updateCompositeSettings(activeStrap.id, { copperplateXUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                      <InsetLabeledField label="Asc units">
                        <input type="number" step="0.5" min={0} className={INSET_CONTROL_BASE} value={activeStrap.copperplateAscUnitsText ?? '3'} onChange={(e) => updateCompositeSettings(activeStrap.id, { copperplateAscUnitsText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.copperplateAscUnitsText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { copperplateAscUnitsText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.copperplateAscUnitsText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateCompositeSettings(activeStrap.id, { copperplateAscUnitsText: String(next) }); }} />
                      </InsetLabeledField>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InsetLabeledField label="Nib size" rightAdornment="mm">
                      <input type="number" min={0.2} step="0.5" className={INSET_CONTROL_MM} value={activeStrap.nibMMText} onChange={(e) => updateCompositeSettings(activeStrap.id, { nibMMText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                    </InsetLabeledField>
                    <InsetLabeledField label="x-height (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                      <input type="number" step="0.5" min={1} className={INSET_CONTROL_WIDE} value={activeStrap.xNibText ?? '5'} onChange={(e) => updateCompositeSettings(activeStrap.id, { xNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.xNibText ?? '5') || 5; const next = Math.max(1, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { xNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.xNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(1, snapHalf(parsed)) : 5; updateCompositeSettings(activeStrap.id, { xNibText: String(next) }); }} />
                    </InsetLabeledField>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InsetLabeledField label="Ascender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                      <input type="number" step="0.5" min={0} className={INSET_CONTROL_WIDE} value={activeStrap.ascNibText ?? '3'} onChange={(e) => updateCompositeSettings(activeStrap.id, { ascNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.ascNibText ?? '3') || 3; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { ascNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.ascNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 3; updateCompositeSettings(activeStrap.id, { ascNibText: String(next) }); }} />
                    </InsetLabeledField>
                    <InsetLabeledField label="Descender (nibs)" rightAdornment="nibs" adornmentClassName="right-2">
                      <input type="number" step="0.5" min={0} className={INSET_CONTROL_WIDE} value={activeStrap.descNibText ?? '2'} onChange={(e) => updateCompositeSettings(activeStrap.id, { descNibText: e.target.value })} onWheel={(e) => e.currentTarget.blur()} onKeyDown={(e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const safe = Number.parseFloat(activeStrap.descNibText ?? '2') || 2; const next = Math.max(0, stepHalfFrom(safe, e.key === 'ArrowUp' ? 1 : -1)); updateCompositeSettings(activeStrap.id, { descNibText: String(next) }); }} onBlur={() => { const parsed = Number.parseFloat(activeStrap.descNibText ?? ''); const next = Number.isFinite(parsed) ? Math.max(0, snapHalf(parsed)) : 2; updateCompositeSettings(activeStrap.id, { descNibText: String(next) }); }} />
                    </InsetLabeledField>
                  </div>
                  <InsetLabeledField label="Nib angle (°)">
                    <select className={INSET_CONTROL_BASE} value={activeStrap.nibAngleDeg} onChange={(e) => updateCompositeSettings(activeStrap.id, { nibAngleDeg: Number(e.target.value) as 35 | 40 | 45 })}>
                      <option value={35}>35°</option><option value={40}>40°</option><option value={45}>45°</option>
                    </select>
                  </InsetLabeledField>
                </>
              )}

              <div className="grid grid-cols-1 gap-4 select-none">
                <div className="grid grid-cols-[56px_76px_32px_minmax(0,1fr)] items-center gap-2 min-w-0 select-none">
                  <label className="font-medium text-slate-700 shrink-0">Rotation</label>

                  <div className="relative">
                    <input
                      type="number"
                      className={INLINE_NUMERIC_INPUT}
                      min={-180}
                      max={180}
                      step={1}
                      value={rotationInputText || String(displayRotDeg)}
                      onFocus={() => beginScrubTransform(activeStrap.id)}
                      onPointerDown={() => beginScrubTransform(activeStrap.id)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRotationInputText(raw);
                        if (!raw.trim()) return;
                        const parsed = Number.parseInt(raw, 10);
                        if (!Number.isFinite(parsed)) return;
                        const nextRot = Math.max(-180, Math.min(180, parsed));
                        if (scrubActiveRef.current && scrubStrapIdRef.current === activeStrap.id) {
                          updateScrubTransform(activeStrap.id, { rotDeg: nextRot });
                          return;
                        }
                        updateStrap(activeStrap.id, { rotDeg: nextRot });
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setRotationInputText('');
                          commitScrubTransform();
                          return;
                        }
                        const parsed = Number.parseInt(raw, 10);
                        if (!Number.isFinite(parsed)) {
                          setRotationInputText('');
                          commitScrubTransform();
                          return;
                        }
                        const nextRot = Math.max(-180, Math.min(180, parsed));
                        if (scrubActiveRef.current && scrubStrapIdRef.current === activeStrap.id) {
                          updateScrubTransform(activeStrap.id, { rotDeg: nextRot });
                        } else {
                          updateStrap(activeStrap.id, { rotDeg: nextRot });
                        }
                        setRotationInputText('');
                        commitScrubTransform();
                      }}
                    />
                    <span className="pointer-events-none select-none absolute right-2 top-1 text-[10px] leading-none text-indigo-400">
                      °
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRotationInputText('');
                      updateStrap(activeStrap.id, { rotDeg: 0 });
                    }}
                    className={INLINE_RESET_BUTTON}
                    title="Reset rotation"
                    aria-label="Reset rotation"
                  >
                    ↺
                  </button>

                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={displayRotDeg}
                    onPointerDown={() => beginScrubTransform(activeStrap.id)}
                    onPointerUp={() => commitScrubTransform()}
                    onPointerCancel={() => commitScrubTransform()}
                    onChange={(e) => {
                      const nextRot = Number.parseInt(e.target.value, 10) || 0;
                      if (scrubActiveRef.current && scrubStrapIdRef.current === activeStrap.id) {
                        updateScrubTransform(activeStrap.id, { rotDeg: nextRot });
                        return;
                      }
                      updateStrap(activeStrap.id, { rotDeg: nextRot });
                    }}
                    className={INLINE_SLIDER}
                  />
                </div>

                <div className="grid grid-cols-[56px_76px_32px_minmax(0,1fr)] items-center gap-2 min-w-0 select-none">
                  <label className="font-medium text-slate-700 shrink-0">Scale</label>

                  <div className="relative">
                    <input
                      type="number"
                      min={SCALE_MIN_PCT}
                      max={SCALE_MAX_PCT}
                      step={1}
                      value={scaleInputText || String(Math.round(displayScalePct))}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setScaleInputText(raw);
                        if (!raw.trim()) return;
                        const parsed = Number.parseFloat(raw);
                        if (!Number.isFinite(parsed)) return;
                        const next = Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed));
                        updateStrap(activeStrap.id, { scalePct: next });
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setScaleInputText('');
                          return;
                        }
                        const parsed = Number.parseFloat(raw);
                        if (!Number.isFinite(parsed)) {
                          setScaleInputText('');
                          return;
                        }
                        const next = Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed));
                        updateStrap(activeStrap.id, { scalePct: next });
                        setScaleInputText('');
                      }}
                      className={INLINE_NUMERIC_INPUT_WIDE}
                    />
                    <span className="pointer-events-none select-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-400">
                      %
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setScaleInputText('');
                      updateStrap(activeStrap.id, { scalePct: 100 });
                    }}
                    className={INLINE_RESET_BUTTON}
                    title="Reset scale"
                    aria-label="Reset scale"
                  >
                    ↺
                  </button>

                  <input
                    type="range"
                    min={SCALE_MIN_PCT}
                    max={SCALE_MAX_PCT}
                    step={1}
                    value={displayScalePct}
                    onPointerDown={() => beginScrubTransform(activeStrap.id)}
                    onPointerUp={() => commitScrubTransform()}
                    onPointerCancel={() => commitScrubTransform()}
                    onChange={(e) => {
                      const parsed = Number.parseFloat(e.target.value);
                      const next = Number.isFinite(parsed)
                        ? Math.max(SCALE_MIN_PCT, Math.min(SCALE_MAX_PCT, parsed))
                        : 100;
                      if (scrubActiveRef.current && scrubStrapIdRef.current === activeStrap.id) {
                        updateScrubTransform(activeStrap.id, { scalePct: next });
                        return;
                      }
                      updateStrap(activeStrap.id, { scalePct: next });
                    }}
                    className={INLINE_SLIDER}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer select-none">
                  <span className="font-medium">Mirror path</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeStrap.flip}
                    aria-label="Mirror path"
                    onClick={() => updateStrap(activeStrap.id, { flip: !activeStrap.flip })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activeStrap.flip ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activeStrap.flip ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer select-none">
                  <span className="font-medium">Invert guidelines</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeStrap.invertGuides}
                    aria-label="Invert guidelines"
                    onClick={() => updateCompositeSettings(activeStrap.id, { invertGuides: !activeStrap.invertGuides })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activeStrap.invertGuides ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activeStrap.invertGuides ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Step 3 — Weave / Layer order</h2>
          <p className="mt-1 text-xs text-slate-600">Order controls render stack. First = back, last = front.</p>
          <div className="mt-3 space-y-2">
            {step3Rows.map((row) => (
              <div key={row.id} draggable onDragStart={() => setDragListId(row.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => {
                if (dragListId) reorderStraps(dragListId, row.id);
                setDragListId(null);
              }} className="rounded-lg border border-slate-200 p-2 flex items-center gap-2 cursor-move">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: row.color }} />
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setActiveId(row.memberIds[0] ?? null)} className={`px-2 py-1 rounded border border-slate-300 ${rowIdForActive === row.id ? 'border-indigo-300 text-indigo-700' : ''}`}>Select</button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => duplicateRowById(row.id)} className="px-2 py-1 rounded border border-slate-300" title="Duplicate strap" aria-label="Duplicate strap">⧉</button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => centerStrapX(row.memberIds[0])} className="px-2 py-1 rounded border border-slate-300" title="Center on page" aria-label="Center on page">⌖</button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => centerStrapY(row.memberIds[0])} className="px-2 py-1 rounded border border-slate-300" title="Center vertically" aria-label="Center vertically">↕</button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeRowById(row.id)} disabled={straps.length <= row.memberIds.length} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40" title="Delete strap" aria-label="Delete strap">✕</button>
                <span className="text-xs text-slate-500">{row.label}</span>
                <span className="text-xs text-slate-500 ml-auto">{row.indexLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
