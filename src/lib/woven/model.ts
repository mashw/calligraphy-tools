import { offset } from '@/lib/curve-helpers';
import { buildGuideSet } from '@/lib/guides/guide-template';
import type { Design } from './design';
import { alternateWeave, atDistance, crossingCuts, findSelfCrossings, makeRoute, minimumRadius, sliceGuide, visibleIntervals, wrap } from './geometry';
import type { Scene, Stroke } from './vector-export';

export function buildWovenModel(design: Design) {
  const route = makeRoute(design.preset, design.width, design.height, design.loop, design.rotation, design.reverse);
  const crossings = findSelfCrossings(route);
  const alternate = alternateWeave(crossings);
  const choices = { ...alternate.choices, ...design.overrides };
  const x = design.nib * design.xNib, asc = design.nib * design.ascNib, desc = design.nib * design.descNib;
  const halfBand = x / 2 + Math.max(asc, desc);
  const baseline = offset(route.points, x / 2);
  const guides = buildGuideSet(design.script === 'Copperplate' ? 'copperplate' : 'blackletter', {
    baseline, xMM: x, ascMM: asc, descMM: desc, tickStepMM: 10,
    blackletterScript: design.script === 'Copperplate' ? undefined : design.script,
  });
  const start = design.start / 100 * route.length;
  const cuts = crossingCuts(crossings, choices, halfBand, design.clearance);
  const intervals = visibleIntervals(route.length, [...cuts, { center: start, half: design.gap / 2 }]);
  const rails = [
    { points: guides.baseLine, color: '#52677c', width: .16 },
    { points: guides.waistLine, color: '#52677c', width: .16 },
    ...(design.fullGuides ? [{ points: guides.ascLine, color: '#9aa7b3', width: .12 }, { points: guides.descLine, color: '#9aa7b3', width: .12 }] : []),
  ];
  const strokes: Stroke[] = rails.flatMap(rail => intervals.map(interval => ({ ...rail, points: sliceGuide(route, rail.points, interval) })));
  const clean: Scene = { strokes, labels: [] };
  const startS = wrap(start + design.gap / 2, route.length);
  const startPoint = atDistance(route, startS);
  const tip = atDistance(route, wrap(startS + 6, route.length));
  const near = atDistance(route, wrap(startS + 5.5, route.length));
  const angle = Math.atan2(tip.y - near.y, tip.x - near.x);
  const annotated: Scene = { strokes: [...strokes, { points: [startPoint, tip], color: '#9f483b', width: .35 }, { points: [{ x: tip.x - 2 * Math.cos(angle - .5), y: tip.y - 2 * Math.sin(angle - .5) }, tip, { x: tip.x - 2 * Math.cos(angle + .5), y: tip.y - 2 * Math.sin(angle + .5) }], color: '#9f483b', width: .35 }], labels: [{ point: { x: 15, y: 18 }, text: 'WOVEN CALLIGRAPHY - WRITING PLAN', size: 3, color: '#52677c' }, { point: { x: startPoint.x + 3, y: startPoint.y - 3 }, text: 'Start', size: 2.5, color: '#9f483b' }] };
  crossings.forEach((c, i) => annotated.labels.push({ point: { x: c.point.x + 3, y: c.point.y - 3 }, text: String(i + 1), size: 2.5, color: '#9f483b' }));
  // Include the ruler on both sheets so printed dimensions can be checked.
  for (const scene of [clean, annotated]) {
    scene.strokes.push({ points: [{ x: 15, y: 280 }, { x: 65, y: 280 }], color: '#52677c', width: .2 });
    for (let i = 0; i <= 5; i++) scene.strokes.push({ points: [{ x: 15 + i * 10, y: 278.5 }, { x: 15 + i * 10, y: 281.5 }], color: '#52677c', width: .2 });
    scene.labels.push({ point: { x: 15, y: 286 }, text: '50 mm - print at 100% / actual size', size: 2.5, color: '#52677c' });
  }
  const warnings: string[] = [];
  if (minimumRadius(route) < halfBand * 1.5) warnings.push('Some bends are tight for this lettering size. Reduce the nib or enlarge the shape; inspect the inner guides before printing.');
  if (crossings.some(c => c.sine < .25)) warnings.push('A shallow crossing needs a long gap. Adjust the shape or reduce the lettering size.');
  if (rails.some(rail => rail.points.some(p => p.x < 10 || p.x > 200 || p.y < 25 || p.y > 270))) warnings.push('The guides extend outside the recommended printing area. Reduce the size or rotation.');
  if (cuts.some(c => Math.min(wrap(c.center - start, route.length), wrap(start - c.center, route.length)) < c.half + design.gap / 2)) warnings.push('The start/end gap overlaps a crossing. Move the start position to a clearer section.');
  if (alternate.conflicts) warnings.push('This route cannot use the suggested alternating weave everywhere. Review the crossing choices.');
  const usableLength = intervals.reduce((sum, [a, b]) => sum + b - a, 0);
  if (usableLength < route.length * .5) warnings.push('Crossing gaps occupy more than half the route. Try a smaller nib or less clearance.');
  return { route, crossings, choices, intervals, clean, annotated, startPoint, usableLength, warnings };
}
