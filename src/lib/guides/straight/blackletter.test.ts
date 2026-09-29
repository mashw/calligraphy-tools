import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's TypeScript runner requires the explicit extension.
import { BLACKLETTER_GUIDE_DEFAULTS, blackletterVerticalMetricsMM, effectiveBlackletterNibMM, resolveBlackletterGridWidthMM } from './blackletter.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Stroke-width remains the default blackletter grid mode calculation', () => {
  close(effectiveBlackletterNibMM(2, 45), Math.SQRT2);
  close(resolveBlackletterGridWidthMM('effective', 2, 45), Math.SQRT2);
});

test('actual and custom grid widths select only their configured horizontal spacing', () => {
  assert.equal(resolveBlackletterGridWidthMM('actual', 2, 45), 2);
  assert.equal(resolveBlackletterGridWidthMM('custom', 2, 45, 1.75), 1.75);
  close(resolveBlackletterGridWidthMM('custom', 2, 45), Math.SQRT2);
});

test('shared Fraktur and Textura Quadrata defaults use a 4.5-nib physical x-height', () => {
  assert.equal(BLACKLETTER_GUIDE_DEFAULTS.xNib, 4.5);
  for (const script of ['Fraktur', 'TexturaQuadrata']) {
    const at35 = blackletterVerticalMetricsMM(2, BLACKLETTER_GUIDE_DEFAULTS.xNib, BLACKLETTER_GUIDE_DEFAULTS.ascNib, BLACKLETTER_GUIDE_DEFAULTS.descNib);
    const at45 = blackletterVerticalMetricsMM(2, BLACKLETTER_GUIDE_DEFAULTS.xNib, BLACKLETTER_GUIDE_DEFAULTS.ascNib, BLACKLETTER_GUIDE_DEFAULTS.descNib);
    assert.equal(at35.xMM, 9, script);
    assert.deepEqual(at45, at35, `${script} vertical metrics must not depend on pen angle`);
    assert.equal(at35.ascMM, 6);
    assert.equal(at35.descMM, 4);
  }
});

test('custom grid changes do not alter blackletter vertical metrics', () => {
  const before = blackletterVerticalMetricsMM(2, 4.5, 3, 2);
  resolveBlackletterGridWidthMM('custom', 2, 45, .75);
  assert.deepEqual(blackletterVerticalMetricsMM(2, 4.5, 3, 2), before);
});
