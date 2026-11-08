import assert from 'node:assert/strict';
import test from 'node:test';
import { fitBounds, pointBounds, resizeBounds, zoomBounds } from '../src/lib/editor/camera.ts';

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  for (const height of [180, 480, 900]) {
    for (const [w, h] of [[210, 297], [297, 210], [600, 40]]) {
      test(`fit ${w} × ${h} at ${width} × ${height} preserves padding and aspect`, () => {
        const b = { x: -15, y: 10, w, h }, frame = fitBounds(b, { width, height });
        const scale = width / frame.w;
        assert.ok(Math.abs(frame.w / frame.h - width / height) < 1e-9);
        assert.ok((b.x - frame.x) * scale >= 23.999);
        assert.ok((b.y - frame.y) * scale >= 23.999);
        assert.ok((frame.x + frame.w - b.x - b.w) * scale >= 23.999);
        assert.ok((frame.y + frame.h - b.y - b.h) * scale >= 23.999);
      });
    }
  }
}
test('zoom keeps an arbitrary focal point stationary and reverses without drift', () => {
  const original = { x: -20, y: 50, w: 400, h: 300 }, anchor = { x: .17, y: .83 };
  const zoomed = zoomBounds(original, 1.2, anchor);
  assert.ok(Math.abs(original.x + original.w * anchor.x - zoomed.x - zoomed.w * anchor.x) < 1e-9);
  assert.ok(Math.abs(original.y + original.h * anchor.y - zoomed.y - zoomed.h * anchor.y) < 1e-9);
  const restored = zoomBounds(zoomed, 1 / 1.2, anchor);
  for (const key of ['x', 'y', 'w', 'h'] as const) assert.ok(Math.abs(restored[key] - original[key]) < 1e-9);
});
test('custom resize retains center and screen scale when inspector opens', () => {
  const original = { x: -20, y: 50, w: 400, h: 300 };
  const next = resizeBounds(original, { width: 800, height: 600 }, { width: 420, height: 500 });
  assert.equal(next.w / 420, original.w / 800);
  assert.equal(next.x + next.w / 2, original.x + original.w / 2);
  assert.equal(next.y + next.h / 2, original.y + original.h / 2);
  assert.equal(next.w / next.h, 420 / 500);
});
test('invalid and empty bounds produce finite fallback frames', () => {
  const fallback = { x: 0, y: 0, w: 210, h: 297 };
  assert.deepEqual(pointBounds([], fallback), fallback);
  assert.deepEqual(pointBounds([{ x: NaN, y: 2 }], fallback), fallback);
  assert.ok(Object.values(fitBounds({ x: 0, y: 0, w: 0, h: Infinity }, { width: 0, height: 0 })).every(Number.isFinite));
  assert.deepEqual(pointBounds([{ x: 10, y: 15 }, { x: 25, y: 30 }], fallback, 3), { x: 7, y: 12, w: 21, h: 21 });
});
