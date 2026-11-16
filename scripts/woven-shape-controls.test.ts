import assert from 'node:assert/strict';
import test from 'node:test';
import { scaleShape, uniformScaleLimits } from '../src/lib/woven/shape-controls.ts';
import { DEFAULT_DESIGN, parseDesign } from '../src/lib/woven/design.ts';
const close = (a: number, b: number) => assert.ok(Math.abs(a-b)<1e-9, `${a} should equal ${b}`);
test('uniform scaling retains a non-square aspect ratio and fractional dimensions', () => {
  const base={width:120.5,height:180.75}, next=scaleShape(base,150);
  assert.deepEqual(next,{width:180.75,height:271.125});
  close(next.width/next.height,base.width/base.height);
  assert.deepEqual(scaleShape(base,100),base);
  assert.deepEqual(scaleShape(base,150),next,'reference dimensions prevent accumulated scaling');
});
test('a shared scale limit stops either dimension without distorting the other', () => {
  for(const base of [{width:300,height:75},{width:75,height:300}]) {
    const range=uniformScaleLimits(base);
    close(range.min, 200/3); close(range.max,400/3);
    for(const percent of [-10,0,range.min,100,range.max,1000]){
      const next=scaleShape(base,percent);
      assert.ok(next.width>=50-1e-9&&next.width<=400+1e-9);
      assert.ok(next.height>=50-1e-9&&next.height<=400+1e-9);
      close(next.width/next.height,base.width/base.height);
    }
  }
});
test('uniform scale leaves document, guides and crossing overrides unchanged and round-trips in v1', () => {
  const design={...DEFAULT_DESIGN,width:120.5,height:180.75,overrides:{'crossing-1':'b' as const}};
  const scaled={...design,...scaleShape(design,150)};
  const restored=parseDesign(JSON.parse(JSON.stringify(scaled)));
  assert.deepEqual(restored,scaled);
  assert.equal(restored.nib,design.nib);assert.equal(restored.loop,design.loop);
  assert.deepEqual(restored.overrides,design.overrides);
  assert.equal(restored.version,1);
});
test('invalid scale input preserves the reference dimensions', () => {
  const base={width:165,height:165};
  assert.deepEqual(scaleShape(base,NaN),base);
  assert.deepEqual(scaleShape(base,Infinity),base);
});
