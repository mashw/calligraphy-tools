import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node TypeScript runner uses the explicit .ts extension.
import { CELTIC_HALF_UNCIAL_DEFAULTS, blackletterVerticalMetricsMM, celticHalfUncialRowGapMM } from './blackletter.ts';

test('Celtic half-uncial starts with 2:5:2 physical nib proportions', () => {
  const defaults = CELTIC_HALF_UNCIAL_DEFAULTS;
  assert.deepEqual([defaults.descNib, defaults.xNib, defaults.ascNib], [2, 5, 2]);
  assert.deepEqual(blackletterVerticalMetricsMM(2, defaults.xNib, defaults.ascNib, defaults.descNib), { xMM: 10, ascMM: 4, descMM: 4 });
  assert.equal(defaults.penAngleDeg, 15);
});

test('Celtic intermediate grid and angle marker start off', () => {
  const defaults = CELTIC_HALF_UNCIAL_DEFAULTS;
  assert.equal(defaults.gridHorizontal, false);
  assert.equal(defaults.gridVertical, false);
  assert.equal(defaults.nibAngleGuide, false);
});

test('Celtic default leaves two minim heights between successive letter bodies', () => {
  const nibMM = 2;
  const { xNib, ascNib, descNib } = CELTIC_HALF_UNCIAL_DEFAULTS;
  const xHeightMM = xNib * nibMM;
  const ascenderMM = ascNib * nibMM;
  const descenderMM = descNib * nibMM;
  const clearRowGapMM = celticHalfUncialRowGapMM(nibMM);
  const baselineStepMM = xHeightMM + ascenderMM + descenderMM + clearRowGapMM;

  assert.equal(clearRowGapMM, 12);
  assert.equal(baselineStepMM, 30);
  assert.equal(baselineStepMM - xHeightMM, 2 * xHeightMM);
  assert.equal(celticHalfUncialRowGapMM(1), 6);
  assert.equal(celticHalfUncialRowGapMM(2, 6, 2, 2), 16);
});
