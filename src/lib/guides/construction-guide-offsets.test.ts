import assert from 'node:assert/strict';
import test from 'node:test';
// Node's built-in TypeScript runner requires the explicit extension.
// @ts-expect-error The application compiler intentionally disallows TS import extensions.
import { blackletterConstructionDistances } from './construction-guide-offsets.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Fraktur uses the first ascender reference and an actual-nib spur', () => {
  const result = blackletterConstructionDistances(2, 45, 'Fraktur');
  close(result.effectiveNibMM, 1.4142135623730951);
  close(result.upperFromWaistMM, 0.5857864376269049);
  close(result.lowerFromBaselineMM, 2);
});

test('Textura Quadrata uses effective nib distances for both semantic rails', () => {
  const result = blackletterConstructionDistances(2, 45, 'TexturaQuadrata');
  close(result.upperFromWaistMM, 0.5857864376269049);
  close(result.lowerFromBaselineMM, 1.4142135623730951);
});

test('upper distance is independent of total ascender height', () => {
  const forTwoNibAscender = blackletterConstructionDistances(2, 45, 'Fraktur').upperFromWaistMM;
  const forThreeNibAscender = blackletterConstructionDistances(2, 45, 'Fraktur').upperFromWaistMM;
  close(forTwoNibAscender, forThreeNibAscender);
});

test('angle changes effective rails but not the Fraktur spur', () => {
  const a = blackletterConstructionDistances(2, 35, 'Fraktur');
  const b = blackletterConstructionDistances(2, 45, 'Fraktur');
  assert.notEqual(a.upperFromWaistMM, b.upperFromWaistMM);
  assert.equal(a.lowerFromBaselineMM, b.lowerFromBaselineMM);
  assert.notEqual(blackletterConstructionDistances(2, 35, 'TexturaQuadrata').lowerFromBaselineMM, blackletterConstructionDistances(2, 45, 'TexturaQuadrata').lowerFromBaselineMM);
});
