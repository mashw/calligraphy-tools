import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node TypeScript runner uses the explicit .ts extension.
import { celticHalfUncialProfile } from './celtic-half-uncial.ts';

const context = { xHeightMM: 10, nibMM: 2, scale: 1, spaceMult: 1 };

test('Celtic half-uncial uses nib-width units and its own profile', () => {
  assert.equal(celticHalfUncialProfile.id, 'CelticHalfUncial');
  assert.equal(celticHalfUncialProfile.unitSystem, 'nib');
  assert.equal(celticHalfUncialProfile.unitToMm!({ xHeightMM: 10, nibMM: 2 }), 2);
});

test('rounded c and o are approximately an x-height wide', () => {
  assert.equal(celticHalfUncialProfile.glyphWidthUnits!('c', context), 5);
  assert.equal(celticHalfUncialProfile.glyphWidthUnits!('o', context), 5);
});

test('word spacing is approximately an o and punctuation has finite width', () => {
  assert.equal(celticHalfUncialProfile.afterSpacingUnits!('o', ' ', 'c', context), 5);
  assert.equal(celticHalfUncialProfile.afterSpacingUnits!('o', 'c', 'e', context), 0.75);
  assert.equal(celticHalfUncialProfile.afterSpacingUnits!('o', 'c', null, context), 0);
  assert.ok(celticHalfUncialProfile.glyphWidthUnits!('?', context) > 0);
});
