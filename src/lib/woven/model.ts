import { visitIntervals } from './passages';
import { writingBands, borderGuideTags, bandEdges, borderBendWarning } from './bands';
import { guideLabel, routeTag } from '@/lib/guides/sheet-labels';
import { slantPath, clipSlantToBand } from "../guides/slant-paths";
import { offset } from "@/lib/curve-helpers";
import { buildGuideSet } from "@/lib/guides/guide-template";
import { pageSize, type Design } from "./design";
import { resolveBlackletterGridWidthMM } from "@/lib/guides/straight/blackletter";
import { dashPolylinePoints } from "@/lib/guides/polyline-dash";
import { clipPassage, routeFrame } from "./curved-guides";
import {
  alternateWeave,
  atDistance,
  crossingCuts,
  findSelfCrossings,
  makeRoute,
  minimumRadius,
  sliceGuide,
  visibleIntervals,
  wrap,
} from "./geometry";
import type { Scene, Stroke } from "./vector-export";

/** Route and crossing geometry only: safe to regenerate during pointer interactions. */
export function buildWovenRouteModel(design: Design) {
  const page = pageSize(design);
  const route = makeRoute(
    design.preset,
    design.width,
    design.height,
    design.loop,
    design.rotation,
    design.reverse,
    { x: design.centerX ?? page.w / 2, y: design.centerY ?? page.h / 2 },
  );
  const crossings = findSelfCrossings(route);
  const alternate = alternateWeave(crossings);
  const choices = { ...alternate.choices, ...design.overrides };
  const guideUnit = design.script === "Copperplate" ? 1 : design.nib;
  const x = guideUnit * design.xNib,
    asc = guideUnit * design.ascNib,
    desc = guideUnit * design.descNib;
  const bands = writingBands(design,x,asc,desc);
  const edges = bandEdges(bands);
  const halfBand = bands.length > 1 ? Math.max(-edges.top,edges.bottom) : x / 2 + Math.max(asc, desc);
  const start = (design.start / 100) * route.length;
  const cuts = crossingCuts(crossings, choices, halfBand, design.clearance);
  const intervals = visibleIntervals(route.length, [
    ...cuts,
    { center: start, half: design.gap / 2 },
  ]);
  const warnings: string[] = [];
  const bendWarning = borderBendWarning(route.points,bands);
  if (bendWarning) warnings.push(bendWarning);
  if (minimumRadius(route) < halfBand * 1.5)
    warnings.push(
      "Some bends are tight for this lettering size. Reduce the lettering size or enlarge the shape; inspect the inner guides before printing.",
    );
  if (crossings.some((c) => c.sine < 0.25))
    warnings.push(
      "A shallow crossing needs a long gap. Adjust the shape or reduce the lettering size.",
    );
  if (
    [edges.top, edges.bottom].some(distance =>
      offset(route.points, distance).some(
        (p) => p.x < 10 || p.x > page.w - 10 || p.y < 25 || p.y > page.h - 27,
      ),
    )
  )
    warnings.push(
      "The guides extend outside the recommended printing area. Reduce the size or rotation.",
    );
  if (
    cuts.some(
      (c) =>
        Math.min(
          wrap(c.center - start, route.length),
          wrap(start - c.center, route.length),
        ) <
        c.half + design.gap / 2,
    )
  )
    warnings.push(
      "The start/end gap overlaps a crossing. Move the start position to a clearer section.",
    );
  if (alternate.conflicts)
    warnings.push(
      "This route cannot use the suggested alternating weave everywhere. Review the crossing choices.",
    );
  const usableLength = intervals.reduce((sum, [a, b]) => sum + b - a, 0);
  if (usableLength < route.length * 0.5)
    warnings.push(
      "Crossing gaps occupy more than half the route. Try smaller lettering or less clearance.",
    );
  return { page, route, crossings, alternate, choices, x, asc, desc, halfBand, start, cuts, intervals, warnings, usableLength };
}

/** Generate physical strokes for one writing passage. Intervals use its own arc length. */
export function writingStrokes(design: Design, route: import('../guides/slant-paths').SlantRoute,
  intervals: import('./geometry').Interval[], x: number, asc: number, desc: number, invertGuides = false, baselineOffset = x / 2): Stroke[] {
  return writingBands(design,x,asc,desc,invertGuides,baselineOffset).flatMap(b =>
    singleBandStrokes(b, route, intervals, invertGuides));
}

function singleBandStrokes(band: ReturnType<typeof writingBands>[number], route: import('../guides/slant-paths').SlantRoute,
  intervals: import('./geometry').Interval[], invertGuides: boolean): Stroke[] {
  const { design, x, asc, desc, anchor: baselineOffset, hiddenExtension } = band;
  const baseline = baselineOffset === 0 ? route.points : offset(route.points, baselineOffset);
  const guides = buildGuideSet(
    design.script === "Copperplate" ? "copperplate" : "blackletter",
    {
      baseline,
      invertGuides,
      xMM: x,
      ascMM: asc,
      descMM: desc,
      tickStepMM: resolveBlackletterGridWidthMM(
        design.gridMode,
        design.nib,
        design.penAngle,
        design.gridWidth,
      ),
      actualNibMM: design.nib,
      penAngleDeg: design.penAngle,
      constructionGuides: design.construction,
      blackletterScript:
        design.script === "Copperplate" ? undefined : design.script,
    },
  );
  const rails: Stroke[] = [
    { points: guides.baseLine, color: "#52677c", width: 0.16, guide:"baseline" },
    { points: guides.waistLine, color: "#52677c", width: 0.16, guide:"waist" },
  ];
  if (design.fullGuides) {
    if (hiddenExtension !== "ascender")
      rails.push({ points: guides.ascLine, color: "#9aa7b3", width: 0.12 });
    if (hiddenExtension !== "descender")
      rails.push({ points: guides.descLine, color: "#9aa7b3", width: 0.12 });
  }
  const gray = (contrast: number) => {
    const v = Math.round(220 * (1 - contrast));
    return "#" + v.toString(16).padStart(2, "0").repeat(3);
  };
  if (design.script !== "Copperplate" && design.gridHorizontal)
    for (const points of guides.hGuides ?? [])
      rails.push({
        points,
        color: gray(design.gridContrast),
        width: design.gridThickness,
        role: 'grid',
      });
  const strokes: Stroke[] = rails.flatMap((rail) =>
    intervals.map((interval) => ({
      ...rail,
      role: rail.role ?? 'primary',
      points: sliceGuide(route, rail.points, interval),
    })),
  );
  let slantBand: { x: number; y: number }[] | null = null;
  let locatedRole: Stroke['role'] = 'slant';
  const addLocated = (
    points: { x: number; y: number; s: number }[],
    color: string,
    width: number,
  ) => {
    for (const piece of clipPassage(points, intervals, route.length, route.closed ?? true))
      if (piece.length > 1) {
        const parts = slantBand ? clipSlantToBand(piece, slantBand) : [piece];
        for (const points of parts) strokes.push({ points, color, width, role: locatedRole });
      }
  };
  const direction = invertGuides ? -1 : 1;
  const top = baselineOffset - x / 2 + direction * (-x / 2 - (design.fullGuides ? asc : 0));
  const bottom = baselineOffset - x / 2 + direction * (x / 2 + (design.fullGuides ? desc : 0));
  if (design.script === "Copperplate" && design.slants) {
    if (design.slantStyle === "classic")
      slantBand = [
        ...offset(route.points, top),
        ...offset(route.points, bottom).reverse(),
      ];
    for (const angle of [
      design.slantAngle,
      ...(design.secondSlant ? [design.secondAngle] : []),
    ])
      for (let s = 0; s < route.length; s += design.slantSpacing)
        addLocated(
          slantPath(route, s, top, bottom, angle, design.slantStyle),
          gray(design.slantContrast),
          design.gridThickness,
        );
  }
  slantBand = null;
  locatedRole = 'grid';
  // Shared ticks/markers are phased by baseline arc length. Map that phase back
  // to the original route so crossings cannot affect the other passage.
  const distances = [0];
  for (let i = 1; i < baseline.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          baseline[i].x - baseline[i - 1].x,
          baseline[i].y - baseline[i - 1].y,
        ),
    );
  const step = resolveBlackletterGridWidthMM(
    design.gridMode,
    design.nib,
    design.penAngle,
    design.gridWidth,
  );
  const sourceS = (index: number) => {
    const target = Math.min(distances.at(-1)!, index * step);
    let i = 1;
    while (i < distances.length - 1 && distances[i] < target) i++;
    const t =
      (target - distances[i - 1]) / (distances[i] - distances[i - 1] || 1);
    return (
      route.distances[i - 1] + t * (route.distances[i] - route.distances[i - 1])
    );
  };
  if (design.script !== "Copperplate" && design.gridVertical)
    for (let i = 0; i < (guides.ticks?.length ?? 0); i++) {
      const s = sourceS(i),
        f = routeFrame(route, s);
      addLocated(
        [
          { x: f.p.x + f.n.x * top, y: f.p.y + f.n.y * top, s },
          { x: f.p.x + f.n.x * bottom, y: f.p.y + f.n.y * bottom, s },
        ],
        gray(design.gridContrast),
        design.gridThickness,
      );
    }
  locatedRole = 'construction';
  for (const guide of guides.constructionGuides ?? []) {
    if (guide.appearance === "dashed") {
      for (const interval of intervals)
        for (const points of dashPolylinePoints(
          sliceGuide(route, guide.line, interval),
          2,
          2,
        ))
          strokes.push({
            points,
            color: guide.color,
            role: 'construction',
            width: design.gridThickness,
          });
    } else {
      const every = guide.dotEvery;
      const segments =
        guide.appearance === "x" ? guide.xSegments : guide.nibEdgeSegments;
      if (guide.appearance === "dots") {
        guide.markerPoints.forEach((p, i) => {
          if (i % every) return;
          const s = sourceS(i);
          const f = routeFrame(route, s);
          const points = Array.from({ length: 17 }, (_, k) => {
            const a = (k / 16) * Math.PI * 2;
            const dx = 0.2 * Math.cos(a),
              dy = 0.2 * Math.sin(a);
            return { x: p.x + dx, y: p.y + dy, s: s + dx * f.t.x + dy * f.t.y };
          });
          addLocated(points, guide.color, 0.15);
        });
      } else
        segments.forEach((segment, i) => {
          const markerIndex =
            Math.floor(i / (guide.appearance === "x" ? 2 : 1)) * every;
          const s = sourceS(markerIndex),
            p = guide.markerPoints[markerIndex],
            f = routeFrame(route, s);
          if (!p) return;
          addLocated(
            [segment.a, segment.b].map((q) => ({
              ...q,
              s: s + (q.x - p.x) * f.t.x + (q.y - p.y) * f.t.y,
            })),
            guide.color,
            design.gridThickness,
          );
        });
    }
  }
  return strokes;
}

function borderedStrokes(design: Design, route: ReturnType<typeof makeRoute>, crossings: ReturnType<typeof findSelfCrossings>,
  choices: Record<string,'a'|'b'>, start: number, bands: ReturnType<typeof writingBands>): Stroke[] {
  const edges = bandEdges(bands);
  const top = offset(route.points,edges.top-design.clearance);
  const bottom = offset(route.points,edges.bottom+design.clearance);
  const visits = crossings.flatMap(c => [c.a,c.b]).sort((a,b)=>a-b);
  const visit = (at: number) => visitIntervals(visits,at,route.length,true);
  const masks = crossings.flatMap(c => {
    const over = choices[c.id] === 'a' ? c.a : c.b;
    const under = choices[c.id] === 'a' ? c.b : c.a;
    const region = visit(over);
    const polygon = [...region.flatMap(i=>sliceGuide(route,top,i)), ...region.flatMap(i=>sliceGuide(route,bottom,i)).reverse()];
    return visit(under).map(interval=>({interval,polygon}));
  });
  const strokes: Stroke[] = [];
  for (const [a,b] of visibleIntervals(route.length,[{center:start,half:design.gap/2}])) {
    const stops = [...new Set([a,b,...masks.flatMap(m=>m.interval).filter(s=>s>a && s<b)])].sort((p,q)=>p-q);
    for (let i=1;i<stops.length;i++) {
      const from=stops[i-1],to=stops[i],mid=(from+to)/2;
      let parts = bands.flatMap(band=>singleBandStrokes(band, route, [[from, to]], false));
      for (const mask of masks) if (mid>=mask.interval[0] && mid<=mask.interval[1])
        parts=parts.flatMap(stroke=>clipSlantToBand(stroke.points,mask.polygon,false).map(points=>({...stroke,points})));
      strokes.push(...parts);
    }
  }
  return strokes;
}

export function buildWovenModel(design: Design, { furniture = true }: { furniture?: boolean } = {}) {
  const page = pageSize(design);
  const { route, crossings, choices, x, asc, desc, start, intervals, warnings, usableLength, halfBand } = buildWovenRouteModel(design);
  const bands = writingBands(design,x,asc,desc);
  const strokes = bands.length === 1 ? writingStrokes(design, route, intervals, x, asc, desc) :
    borderedStrokes(design,route,crossings,choices,start,bands);
  const tag = design.showGuideTags ? routeTag(guideLabel(design.script, x, design.nib), route.points, halfBand + 4, .32) : null;
  const tags = tag ? [tag, ...borderGuideTags(bands, route.points, false, .32)] : undefined;
  const clean: Scene = { strokes, labels: [], tags, page };
  const startS = wrap(start + design.gap / 2, route.length);
  const startPoint = atDistance(route, startS);
  const tip = atDistance(route, wrap(startS + 6, route.length));
  const near = atDistance(route, wrap(startS + 5.5, route.length));
  const angle = Math.atan2(tip.y - near.y, tip.x - near.x);
  const annotated: Scene = {
    page,
    tags,
    strokes: [
      ...strokes,
      { points: [startPoint, tip], color: "#9f483b", width: 0.35 },
      {
        points: [
          {
            x: tip.x - 2 * Math.cos(angle - 0.5),
            y: tip.y - 2 * Math.sin(angle - 0.5),
          },
          tip,
          {
            x: tip.x - 2 * Math.cos(angle + 0.5),
            y: tip.y - 2 * Math.sin(angle + 0.5),
          },
        ],
        color: "#9f483b",
        width: 0.35,
      },
    ],
    labels: [
      ...(furniture ? [{
        point: { x: 15, y: 18 },
        text: "WOVEN CALLIGRAPHY - WRITING PLAN",
        size: 3,
        color: "#52677c",
      }] : []),
      {
        point: { x: startPoint.x + 3, y: startPoint.y - 3 },
        text: "Start",
        size: 2.5,
        color: "#9f483b",
      },
    ],
  };
  crossings.forEach((c, i) =>
    annotated.labels.push({
      point: { x: c.point.x + 3, y: c.point.y - 3 },
      text: String(i + 1),
      size: 2.5,
      color: "#9f483b",
    }),
  );
  // Include the ruler on both sheets so printed dimensions can be checked.
  if (furniture) for (const scene of [clean, annotated]) {
    scene.strokes.push({
      points: [
        { x: 15, y: page.h - 17 },
        { x: 65, y: page.h - 17 },
      ],
      color: "#52677c",
      width: 0.2,
    });
    for (let i = 0; i <= 5; i++)
      scene.strokes.push({
        points: [
          { x: 15 + i * 10, y: page.h - 18.5 },
          { x: 15 + i * 10, y: page.h - 15.5 },
        ],
        color: "#52677c",
        width: 0.2,
      });
    scene.labels.push({
      point: { x: 15, y: page.h - 11 },
      text: "50 mm - print at 100% / actual size",
      size: 2.5,
      color: "#52677c",
    });
  }
  return {
    page,
    route,
    crossings,
    choices,
    intervals,
    clean,
    annotated,
    startPoint,
    usableLength,
    warnings,
  };
}
