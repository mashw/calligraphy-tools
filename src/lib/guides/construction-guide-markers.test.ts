import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's TypeScript runner requires the explicit extension.
import { CONSTRUCTION_GUIDE_DOT_RADIUS_MM, nibEdgeMarkerSegment, resolveConstructionGuideSettings, xMarkerSegments } from './construction-guide-markers.ts';

const length = (segment: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
const angle = (segment: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x) * 180 / Math.PI;

test('Fraktur defaults both construction guides to nib-edge marks without enabling them', () => {
  const settings = resolveConstructionGuideSettings('Fraktur');
  assert.equal(settings.upperAppearance, 'nib-edge');
  assert.equal(settings.lowerAppearance, 'nib-edge');
  assert.equal(settings.upper, false);
  assert.equal(settings.lower, false);
});

test('saved appearances resolve unchanged and remain independent', () => {
  const legacy = resolveConstructionGuideSettings('Fraktur', { appearance: 'dots' });
  assert.equal(legacy.upperAppearance, 'dots');
  assert.equal(legacy.lowerAppearance, 'dots');
  const independent = resolveConstructionGuideSettings('Fraktur', { upperAppearance: 'dashed', lowerAppearance: 'x' });
  assert.equal(independent.upperAppearance, 'dashed');
  assert.equal(independent.lowerAppearance, 'x');
});

test('nib-edge marker uses physical nib width at every supported pen angle', () => {
  for (const penAngle of [35, 40, 45]) {
    const marker = nibEdgeMarkerSegment({ x: 4, y: 5 }, { x: 1, y: 0 }, 2, penAngle);
    assert.ok(Math.abs(length(marker) - 2) < 1e-10);
    assert.ok(Math.abs(angle(marker) - penAngle) < 1e-10);
  }
});

test('nib-edge orientation is relative to the local curve tangent', () => {
  const horizontal = nibEdgeMarkerSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, 2, 45);
  const verticalTangent = nibEdgeMarkerSegment({ x: 0, y: 0 }, { x: 0, y: 1 }, 2, 45);
  assert.ok(Math.abs(length(verticalTangent) - length(horizontal)) < 1e-10);
  assert.ok(Math.abs(angle(verticalTangent) - angle(horizontal) - 90) < 1e-10);
});

test('X marker strokes cross at the marker point and dots use the reduced radius', () => {
  const point = { x: 7, y: 9 };
  const segments = xMarkerSegments(point);
  assert.equal(segments.length, 2);
  for (const segment of segments) assert.deepEqual({ x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 }, point);
  assert.equal(CONSTRUCTION_GUIDE_DOT_RADIUS_MM, .2);
});
