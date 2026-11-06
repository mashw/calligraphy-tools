import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, findSelfCrossings, alternateWeave, visibleIntervals, crossingCuts, sliceGuide, atDistance } from '../src/lib/woven/geometry.ts';
import { DEFAULT_DESIGN, parseDesign } from '../src/lib/woven/design.ts';
import { scenePdf, sceneSvg } from '../src/lib/woven/vector-export.ts';

test('figure-eight seam is one self-crossing with two distinct route passages', () => {
  const route = makeRoute('figure-eight', 165, 165, .32, 0, false);
  const crossings = findSelfCrossings(route);
  assert.equal(crossings.length, 1);
  assert.equal(crossings[0].a, 0);
  assert.ok(Math.abs(crossings[0].b - route.length / 2) < .001);
  const choices = alternateWeave(crossings).choices;
  const visible = visibleIntervals(route.length, crossingCuts(crossings, choices, 3, .5));
  assert.ok(visible.some(([a, b]) => a <= 0 && b > 0), 'over passage remains visible');
  assert.ok(!visible.some(([a, b]) => a < route.length / 2 && b > route.length / 2), 'under passage is cut');
  choices[crossings[0].id] = 'b';
  const swapped = visibleIntervals(route.length, crossingCuts(crossings, choices, 3, .5));
  assert.ok(swapped.some(([a, b]) => a < route.length / 2 && b > route.length / 2));
  assert.ok(swapped.every(([a, b]) => a > 0 && b < route.length), 'seam cut wraps around both ends');
});

test('rosette crossings remain stable through size and rotation changes', () => {
  for (const reverse of [false, true]) {
    const route = makeRoute('rosette', 165, 165, .32, 0, reverse);
    assert.deepEqual(route.points[0], route.points.at(-1));
    const a = findSelfCrossings(route), b = findSelfCrossings(makeRoute('rosette', 150, 190, .32, 83, reverse));
    assert.equal(a.length, 6);
    assert.deepEqual(a.map(c => c.id), b.map(c => c.id));
    assert.equal(alternateWeave(a).conflicts, 0);
  }
});

test('overlapping and wrapped gaps form a union without duplicate sections', () => {
  assert.deepEqual(visibleIntervals(100, [{ center: 0, half: 5 }, { center: 10, half: 10 }, { center: 60, half: 5 }]), [[20, 55], [65, 95]]);
  assert.deepEqual(visibleIntervals(100, [{ center: 50, half: 60 }]), []);
  const route = makeRoute('figure-eight', 100, 100, .32, 0, false);
  const points = route.points.map(p => ({ x: p.x + 5, y: p.y + 3 }));
  const sliced = sliceGuide(route, points, [20, 40]);
  assert.deepEqual(sliced[0], atDistance(route, 20, points));
  assert.deepEqual(sliced.at(-1), atDistance(route, 40, points));
});

test('design round-trip preserves crossing choices and rejects invalid input', () => {
  const design = { ...DEFAULT_DESIGN, overrides: { 'crossing-0': 'b' as const } };
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))), design);
  for (const patch of [{ version: 2 }, { width: Infinity }, { width: 999 }, { nib: -1 }, { script: 'unknown' }, { overrides: { 'crossing-1': 'c' } }]) assert.throws(() => parseDesign({ ...design, ...patch }));
});

test('SVG and PDF export physical vector strokes with correct PDF xref offsets', () => {
  const scene = { strokes: [{ points: [{ x: 10, y: 20 }, { x: 60, y: 20 }], color: '#52677c', width: .2 }], labels: [{ point: { x: 10, y: 25 }, text: '50 mm (test)', color: '#52677c', size: 3 }] };
  const svg = sceneSvg(scene), pdf = new TextDecoder().decode(scenePdf(scene));
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /M10.000 20.000 L60.000 20.000/);
  assert.match(pdf, /\/MediaBox \[0 0 595.276 841.890\]/);
  assert.ok(!pdf.includes('/Image'));
  const offset = Number(pdf.match(/startxref\n(\d+)/)![1]);
  assert.equal(pdf.slice(offset, offset + 4), 'xref');
  for (const [index, match] of [...pdf.matchAll(/(\d{10}) 00000 n/g)].entries()) assert.ok(pdf.slice(Number(match[1])).startsWith(`${index + 1} 0 obj`));
});
