import assert from "node:assert/strict";
import test from "node:test";
import { buildGuideSet } from "../src/lib/guides/guide-template.ts";
import {
  curvedSlant,
  classicSlant,
  clipSlantToBand,
  flowingSlants,
  makeSlantRoute,
  routeFrame,
  resolveSlantStyle,
} from "../src/lib/guides/slant-paths.ts";
import { buildWovenModel } from "../src/lib/woven/model.ts";
import { DEFAULT_DESIGN, parseDesign } from "../src/lib/woven/design.ts";
import { clipPassage } from "../src/lib/woven/curved-guides.ts";
import { buildCalligramModel } from "../src/lib/calligram/model.ts";
import { createDefaultCalligramSettings } from "../src/lib/calligram/settings.ts";
import { buildCurvedTitleModel } from "../src/lib/curved-title/model.ts";
import { createDefaultCurvedTitleSettings } from "../src/lib/curved-title/settings.ts";
import {
  parseLayoutDesign,
  serializeLayoutDesign,
} from "../src/lib/layout/design-file.ts";
import { pageElement, newElement } from "../src/lib/layout/types.ts";
import {
  buildPlotterExport,
  DEFAULT_PLOTTER_EXPORT_OPTIONS,
} from "../src/lib/layout/plotter-export.ts";

const circle = (radius = 40) =>
  Array.from({ length: 721 }, (_, i) => ({
    x: 80 + radius * Math.cos((i / 720) * 2 * Math.PI),
    y: 80 + radius * Math.sin((i / 720) * 2 * Math.PI),
  }));
const sCurve = Array.from({ length: 401 }, (_, i) => ({
  x: i * 0.25,
  y: 20 + 8 * Math.sin((i / 400) * 2 * Math.PI),
}));
const params = (baseline = sCurve) => ({
  baseline,
  xMM: 6,
  ascMM: 8,
  descMM: 8,
  tickStepMM: 8,
});
const finite = (lines: { x: number; y: number }[][]) =>
  lines.forEach((line) =>
    line.forEach((p) =>
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)),
    ),
  );
function checkAngle(
  route: ReturnType<typeof makeSlantRoute>,
  anchor: number,
  top = -5,
  bottom = 5,
) {
  const points = curvedSlant(route, anchor, top, bottom, 55);
  assert.ok(points.length > 20);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      f = routeFrame(route, (a.s + b.s) / 2),
      dx = b.x - a.x,
      dy = b.y - a.y;
    const angle =
      (Math.atan2(
        Math.abs(dx * f.n.x + dy * f.n.y),
        Math.abs(dx * f.t.x + dy * f.t.y),
      ) *
        180) /
      Math.PI;
    assert.ok(Math.abs(angle - 55) < 3, `local angle ${angle}`);
  }
  return points;
}
test("Classic remains the default and named mode changes no existing rails or ticks", () => {
  for (const baseline of [sCurve, circle(), [...sCurve].reverse()])
    for (const normalSign of [1, -1] as const)
      for (const invertGuides of [true, false]) {
        const p = { ...params(baseline), normalSign, invertGuides };
        assert.deepEqual(
          buildGuideSet("copperplate", p),
          buildGuideSet("copperplate", { ...p, slantStyle: "classic" }),
        );
        const flow = buildGuideSet("copperplate", {
            ...p,
            slantStyle: "flowing",
          }),
          classic = buildGuideSet("copperplate", p);
        for (const key of [
          "ascLine",
          "baseLine",
          "waistLine",
          "descLine",
        ] as const)
          assert.deepEqual(flow[key], classic[key]);
        assert.ok(flow.slantGuides!.length > 0);
        assert.equal(flow.ticks!.length, 0);
        finite(flow.slantGuides!);
      }
});
test("straight slants agree between modes, with real angle/spacing and trimmed open endpoints", () => {
  const route = makeSlantRoute([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  const classic = classicSlant(route, 50, -6, 6, 55),
    flow = curvedSlant(route, 50, -6, 6, 55);
  for (const [a, b] of [
    [classic[0], flow[0]],
    [classic.at(-1)!, flow.at(-1)!],
  ])
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-8);
  const lines = flowingSlants(route.points, -6, 6, 10);
  finite(lines);
  for (const line of lines)
    for (const p of line) assert.ok(p.x >= -1e-8 && p.x <= 100 + 1e-8);
  const atTop = lines
    .filter((l) => Math.abs(l[0].y + 6) < 1e-8)
    .map((l) => l[0].x);
  assert.ok(Math.abs(atTop[1] - atTop[0] - 10) < 1e-8);
  assert.ok(
    lines.some((l) => Math.abs(l[0].x) < 1e-8 || Math.abs(l.at(-1)!.x) < 1e-8),
  );
});
test("Flowing integrates the requested angle around circular, S and reversed paths", () => {
  for (const baseline of [
    circle(),
    sCurve,
    [...circle()].reverse(),
    [...sCurve].reverse(),
  ]) {
    const route = makeSlantRoute(baseline);
    for (const fraction of [0.1, 0.35, 0.7])
      checkAngle(route, route.length * fraction);
  }
  const route = makeSlantRoute(circle()),
    points = checkAngle(route, 0);
  const first = points[0],
    last = points.at(-1)!,
    mid = points[Math.floor(points.length / 2)];
  assert.ok(
    Math.abs(
      (last.x - first.x) * (mid.y - first.y) -
        (last.y - first.y) * (mid.x - first.x),
    ) > 0.1,
    "curved, rather than an edge chord",
  );
});
test("closed seams wrap without duplicated ticks and anchors preserve phase", () => {
  const baseline = circle(),
    route = makeSlantRoute(baseline),
    step = 8;
  const a = flowingSlants(baseline, -6, 6, step, 0),
    b = flowingSlants(baseline, -6, 6, step, route.length);
  assert.equal(a.length, Math.round(route.length / step));
  assert.equal(b.length, a.length);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a[i].length; j++)
      assert.ok(
        Math.hypot(a[i][j].x - b[i][j].x, a[i][j].y - b[i][j].y) < 1e-7,
      );
});
test("tight offset cusps terminate instead of crossing invalid geometry", () => {
  const route = makeSlantRoute(circle(3)),
    points = curvedSlant(route, 2, 0, 10, 55);
  finite([points]);
  assert.ok(points.length < Math.ceil(10 / 0.15));
  for (const p of points) assert.ok(Math.hypot(p.x - 80, p.y - 80) > 0.1);
  assert.deepEqual(flowingSlants([], 0, 10, 5), []);
  assert.deepEqual(flowingSlants([{ x: 0, y: 0 }], 0, 10, 5), []);
  assert.deepEqual(flowingSlants(sCurve, -5, 5, 0), []);
});
test("both Woven modes preserve per-passage crossing clips and secondary slants", () => {
  for (const preset of ["rosette", "figure-eight"] as const)
    for (const slantStyle of ["classic", "flowing"] as const) {
      const d = {
        ...DEFAULT_DESIGN,
        preset,
        script: "Copperplate" as const,
        slantStyle,
        secondSlant: true,
        secondAngle: 70,
      };
      const a = buildWovenModel(d),
        id = a.crossings[0].id;
      const b = buildWovenModel({
        ...d,
        overrides: { [id]: a.choices[id] === "a" ? "b" : "a" },
      });
      assert.notDeepEqual(a.clean.strokes, b.clean.strokes);
      finite(a.clean.strokes.map((s) => s.points));
      assert.ok(
        a.clean.strokes.length >
          buildWovenModel({ ...d, secondSlant: false }).clean.strokes.length,
      );
      const route = makeSlantRoute(a.route.points),
        line =
          slantStyle === "flowing"
            ? curvedSlant(route, route.length / 2, -4, 4, 55)
            : classicSlant(route, route.length / 2, -4, 4, 55);
      assert.equal(clipPassage(line, [], route.length).length, 0);
    }
});
test("mixed-script Layout models apply the style to every enabled Copperplate band only", () => {
  const c = {
    ...createDefaultCalligramSettings(),
    innerEnabled: true,
    outerEnabled: true,
    innerScript: "Copperplate" as const,
    outerScript: "Copperplate" as const,
    slantStyle: "flowing" as const,
  };
  const a = buildCalligramModel({ w: 210, h: 297 }, c),
    b = buildCalligramModel(
      { w: 210, h: 297 },
      { ...c, slantStyle: "classic" },
    );
  assert.deepEqual(a.main.guideSet, b.main.guideSet);
  assert.ok(a.inner.guideSet.slantGuides!.length);
  assert.ok(a.outer.guideSet.slantGuides!.length);
  const t = {
    ...createDefaultCurvedTitleSettings(),
    topBandEnabled: true,
    bottomBandEnabled: true,
    topBandScript: "Copperplate" as const,
    bottomBandScript: "Copperplate" as const,
    slantStyle: "flowing" as const,
  };
  const x = buildCurvedTitleModel({ w: 180, h: 90 }, t),
    y = buildCurvedTitleModel(
      { w: 180, h: 90 },
      { ...t, slantStyle: "classic" },
    );
  assert.deepEqual(x.guideSet, y.guideSet);
  assert.ok(x.top.guideSet.slantGuides!.length);
  assert.ok(x.bottom.guideSet.slantGuides!.length);
  assert.deepEqual(x.layout, y.layout);
  assert.deepEqual(a.main.layout, b.main.layout);
});
test("saved designs migrate their historical default and retain selected styles", () => {
  assert.equal(resolveSlantStyle(undefined), "classic");
  const old = { ...DEFAULT_DESIGN };
  delete (old as Partial<typeof old>).slantStyle;
  assert.equal(parseDesign(old).slantStyle, "flowing");
  assert.equal(
    parseDesign({ ...old, slantStyle: "classic" }).slantStyle,
    "classic",
  );
  assert.throws(() => parseDesign({ ...old, slantStyle: "bad" }));
  for (const type of ["calligram", "curved-title"] as const) {
    const element = newElement(type, 1, { width: 210, height: 297 });
    if (element.type === "calligram" || element.type === "curved-title") {
      delete element.settings.slantStyle;
      const loaded = parseLayoutDesign(
        serializeLayoutDesign([element, pageElement()], element.id),
      ).elements[0];
      assert.ok(loaded.type === "calligram" || loaded.type === "curved-title");
      assert.equal(loaded.settings.slantStyle, "classic");
      element.settings.slantStyle = "flowing";
      const round = parseLayoutDesign(
        serializeLayoutDesign([element, pageElement()], element.id),
      ).elements[0];
      assert.ok(round.type === "calligram" || round.type === "curved-title");
      assert.equal(round.settings.slantStyle, "flowing");
    }
  }
});
test("Layout plotter SVG exports Flowing vector polylines with physical page dimensions", () => {
  const element = newElement("calligram", 1, { width: 210, height: 297 });
  assert.equal(element.type, "calligram");
  if (element.type !== "calligram") return;
  element.settings = {
    ...element.settings,
    script: "Copperplate",
    slantStyle: "flowing",
    radiusMM: 40,
    xHeightMM: 3,
    showBoxes: false,
    showSpanFill: false,
  };
  const a = buildPlotterExport([element, pageElement()], {}, "12x12");
  const width = Number(a.svg.match(/width="([\d.]+)in"/)![1]),
    viewWidth = Number(a.svg.match(/viewBox="[^ ]+ [^ ]+ ([\d.]+)/)![1]);
  assert.ok(
    Math.abs(width * 25.4 - viewWidth) < 0.001,
    "millimetre coordinates retain their physical width",
  );
  assert.ok(
    (a.svg.match(/ L /g) ?? []).length > 1000,
    "sampled vector paths survive serialization",
  );
  assert.ok(!a.svg.includes("<image"));
  const off = buildPlotterExport([element, pageElement()], {}, "12x12", {
    ...DEFAULT_PLOTTER_EXPORT_OPTIONS,
    slantGuides: false,
  });
  assert.ok(a.polylineCount > off.polylineCount);
});

test("Classic chords are clipped to concave bands without bending or bridging gaps", () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 7, y: 10 },
    { x: 7, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.deepEqual(
    clipSlantToBand(
      [
        { x: -2, y: 5 },
        { x: 12, y: 5 },
      ],
      polygon,
    ),
    [
      [
        { x: 0, y: 5 },
        { x: 3, y: 5 },
      ],
      [
        { x: 7, y: 5 },
        { x: 10, y: 5 },
      ],
    ],
  );
});

test("joined open baselines share one slant phase across the join", () => {
  const first = sCurve.slice(0, 201),
    second = sCurve.slice(200);
  const stitched = [...first, ...second.slice(1)];
  const a = flowingSlants(sCurve, -6, 8, 8, 3),
    b = flowingSlants(stitched, -6, 8, 8, 3);
  assert.deepEqual(a, b);
  const reverseSecond = [...second].reverse();
  assert.deepEqual(
    flowingSlants([...first, ...reverseSecond.reverse().slice(1)], -6, 8, 8, 3),
    a,
  );
});
