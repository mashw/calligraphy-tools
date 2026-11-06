import { offset } from "@/lib/curve-helpers";
import { buildGuideSet } from "@/lib/guides/guide-template";
import { pageSize, type Design } from "./design";
import { resolveBlackletterGridWidthMM } from "@/lib/guides/straight/blackletter";
import { dashPolylinePoints } from "@/lib/guides/polyline-dash";
import { clipPassage, curvedSlant, routeFrame } from "./curved-guides";
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

export function buildWovenModel(design: Design) {
  const page = pageSize(design);
  const route = makeRoute(
    design.preset,
    design.width,
    design.height,
    design.loop,
    design.rotation,
    design.reverse,
    { x: page.w / 2, y: page.h / 2 },
  );
  const crossings = findSelfCrossings(route);
  const alternate = alternateWeave(crossings);
  const choices = { ...alternate.choices, ...design.overrides };
  const x = design.nib * design.xNib,
    asc = design.nib * design.ascNib,
    desc = design.nib * design.descNib;
  const halfBand = x / 2 + Math.max(asc, desc);
  const baseline = offset(route.points, x / 2);
  const guides = buildGuideSet(
    design.script === "Copperplate" ? "copperplate" : "blackletter",
    {
      baseline,
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
  const start = (design.start / 100) * route.length;
  const cuts = crossingCuts(crossings, choices, halfBand, design.clearance);
  const intervals = visibleIntervals(route.length, [
    ...cuts,
    { center: start, half: design.gap / 2 },
  ]);
  const rails = [
    { points: guides.baseLine, color: "#52677c", width: 0.16 },
    { points: guides.waistLine, color: "#52677c", width: 0.16 },
    ...(design.fullGuides
      ? [
          { points: guides.ascLine, color: "#9aa7b3", width: 0.12 },
          { points: guides.descLine, color: "#9aa7b3", width: 0.12 },
        ]
      : []),
  ];
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
      });
  const strokes: Stroke[] = rails.flatMap((rail) =>
    intervals.map((interval) => ({
      ...rail,
      points: sliceGuide(route, rail.points, interval),
    })),
  );
  const addLocated = (
    points: { x: number; y: number; s: number }[],
    color: string,
    width: number,
  ) => {
    for (const piece of clipPassage(points, intervals, route.length))
      if (piece.length > 1) strokes.push({ points: piece, color, width });
  };
  const top = -x / 2 - (design.fullGuides ? asc : 0),
    bottom = x / 2 + (design.fullGuides ? desc : 0);
  if (design.script === "Copperplate" && design.slants) {
    for (const angle of [
      design.slantAngle,
      ...(design.secondSlant ? [design.secondAngle] : []),
    ])
      for (let s = 0; s < route.length; s += design.slantSpacing)
        addLocated(
          curvedSlant(route, s, top, bottom, angle),
          gray(design.slantContrast),
          design.gridThickness,
        );
  }
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
  const clean: Scene = { strokes, labels: [], page };
  const startS = wrap(start + design.gap / 2, route.length);
  const startPoint = atDistance(route, startS);
  const tip = atDistance(route, wrap(startS + 6, route.length));
  const near = atDistance(route, wrap(startS + 5.5, route.length));
  const angle = Math.atan2(tip.y - near.y, tip.x - near.x);
  const annotated: Scene = {
    page,
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
      {
        point: { x: 15, y: 18 },
        text: "WOVEN CALLIGRAPHY - WRITING PLAN",
        size: 3,
        color: "#52677c",
      },
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
  for (const scene of [clean, annotated]) {
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
  const warnings: string[] = [];
  if (minimumRadius(route) < halfBand * 1.5)
    warnings.push(
      "Some bends are tight for this lettering size. Reduce the nib or enlarge the shape; inspect the inner guides before printing.",
    );
  if (crossings.some((c) => c.sine < 0.25))
    warnings.push(
      "A shallow crossing needs a long gap. Adjust the shape or reduce the lettering size.",
    );
  if (
    rails.some((rail) =>
      rail.points.some(
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
      "Crossing gaps occupy more than half the route. Try a smaller nib or less clearance.",
    );
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
