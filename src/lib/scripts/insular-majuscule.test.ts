import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node TypeScript runner uses the explicit .ts extension.
import { insularMajusculeProfile } from './insular-majuscule.ts';
// @ts-expect-error The Node TypeScript runner requires .ts module specifiers.
import { measureRun } from '../measure/measure-run.ts';

const context = { xHeightMM: 10, nibMM: 2, scale: 1, spaceMult: 1 };

test('Insular majuscule uses nib-width units and its own profile', () => {
  assert.equal(insularMajusculeProfile.id, 'InsularMajuscule');
  assert.equal(insularMajusculeProfile.unitSystem, 'nib');
  assert.equal(insularMajusculeProfile.unitToMm!({ xHeightMM: 10, nibMM: 2 }), 2);
});

test('rounded c and o are approximately an x-height wide', () => {
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('c', context), 5);
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('o', context), 5);
});

test('word spacing is approximately an o and punctuation has finite width', () => {
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', ' ', 'c', context), 5);
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', 'c', 'e', context), 0.75);
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', 'c', null, context), 0);
  assert.ok(insularMajusculeProfile.glyphWidthUnits!('?', context) > 0);
});

test('proposed manuscript alphabet widths use o = 5 units', () => {
  const expected: Record<string,number> = {
    a:6,b:5,c:5,d:5.5,e:4.5,f:4,g:5,h:5,i:2,j:2,k:5,l:2,m:7.3,
    n:4.5,o:5,p:5,q:5,r:4,s:4,t:3.5,u:4.5,v:4.5,w:8,x:5,y:5,z:5
  };
  for (const [letter, width] of Object.entries(expected)) {
    assert.equal(insularMajusculeProfile.glyphWidthUnits!(letter, context), width, letter);
    assert.equal(insularMajusculeProfile.glyphWidthUnits!(letter.toUpperCase(), context), width, letter.toUpperCase());
  }
});
test('o width tracks x-height rather than projected pen width', () => {
  assert.equal(insularMajusculeProfile.unitToMm!({xHeightMM: 10, nibMM: 1.93}), 2);
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('o',context) * insularMajusculeProfile.unitToMm!({xHeightMM:10,nibMM:1.93}), 10);
});

test('shared measurement engine uses the new profile for text length and character advances', () => {
  const near = (actual:number, expected:number) => assert.ok(Math.abs(actual-expected)<1e-8, `${actual} differs from ${expected}`);
  const ctx = {xHeightMM:10, nibMM:2*Math.cos(Math.PI/12), scale:1, spaceMult:1};
  const run=measureRun('aom',insularMajusculeProfile,ctx);
  near(run.glyphs[0].wMM,12);
  near(run.glyphs[1].wMM,10);
  near(run.glyphs[2].wMM,14.6);
  near(run.totalAdvanceMM,39.6); // 12 + 1.5 + 10 + 1.5 + 14.6
  near(measureRun('AOM',insularMajusculeProfile,ctx).totalAdvanceMM,39.6);
  near(measureRun('o',insularMajusculeProfile,{...ctx,xHeightMM:15}).totalAdvanceMM,15);
});
