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

test('rounded c and o reflect their separate planning widths', () => {
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('c', context), 5);
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('o', context), 17 / 3);
});

test('word spaces remain provisional and interletter gaps are pair-dependent', () => {
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', ' ', 'c', context), 5);
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', 'c', 'e', context), 0);
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', 'p', 'o', context), -1 / 3);
  assert.equal(insularMajusculeProfile.afterSpacingUnits!('o', 'c', null, context), 0);
  assert.ok(insularMajusculeProfile.glyphWidthUnits!('?', context) > 0);
});

test('proposed manuscript alphabet widths use o = 5 units', () => {
  const expected: Record<string,number> = {
    a:6,b:5,c:5,d:5.5,e:4.5,f:4,g:5,h:5,i:2,j:2,k:5,l:2,m:23/3,
    n:17/3,o:17/3,p:6,q:5,r:19/3,s:15.5/3,t:17/3,u:16/3,v:4.5,w:8,x:5,y:5,z:5
  };
  for (const [letter, width] of Object.entries(expected)) {
    assert.equal(insularMajusculeProfile.glyphWidthUnits!(letter, context), width, letter);
    assert.equal(insularMajusculeProfile.glyphWidthUnits!(letter.toUpperCase(), context), width, letter.toUpperCase());
  }
});
test('o width tracks x-height rather than projected pen width', () => {
  assert.equal(insularMajusculeProfile.unitToMm!({xHeightMM: 10, nibMM: 1.93}), 2);
  assert.equal(insularMajusculeProfile.glyphWidthUnits!('o',context) * insularMajusculeProfile.unitToMm!({xHeightMM:10,nibMM:1.93}), 34 / 3);
});

test('shared measurement engine uses the new profile for text length and character advances', () => {
  const near = (actual:number, expected:number) => assert.ok(Math.abs(actual-expected)<1e-8, `${actual} differs from ${expected}`);
  const ctx = {xHeightMM:10, nibMM:2*Math.cos(Math.PI/12), scale:1, spaceMult:1};
  const run=measureRun('aom',insularMajusculeProfile,ctx);
  near(run.glyphs[0].wMM, 12);
  near(run.glyphs[1].wMM, 34 / 3);
  near(run.glyphs[2].wMM, 46 / 3);
  near(run.totalAdvanceMM, 12 + 34 / 3 + 46 / 3);
  near(measureRun('AOM',insularMajusculeProfile,ctx).totalAdvanceMM,run.totalAdvanceMM);
  near(measureRun('o',insularMajusculeProfile,{...ctx,xHeightMM:15}).totalAdvanceMM,17);
});

test('measured single-letter and pair samples at 3 mm reproduce advances', () => {
  const measuredCtx = { ...context, xHeightMM: 15, nibMM: 3 };
  const singles: Record<string,number> = {o:17,p:18,u:16,m:23,n:17,s:15.5,t:17,r:19};
  const pairs: Record<string,number> = {
    oo:34,pp:38,uu:34,po:34,op:34,pu:35,ru:31,su:27,nt:34,
  };
  for (const [word, mm] of Object.entries({...singles,...pairs})) {
    const result = measureRun(word, insularMajusculeProfile, measuredCtx);
    assert.ok(Math.abs(result.totalAdvanceMM - mm) < 1e-8, `${word}: ${result.totalAdvanceMM} != ${mm}`);
  }
});

test('multiple-letter comparisons remain plausible without overfitting a single word', () => {
  const ctx = {...context,xHeightMM:15,nibMM:3};
  const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
  near(measureRun('pop',insularMajusculeProfile,ctx).totalAdvanceMM,51);
  near(measureRun('runt',insularMajusculeProfile,ctx).totalAdvanceMM,67);
  near(measureRun('sunt',insularMajusculeProfile,ctx).totalAdvanceMM,63);
  near(measureRun('esse',insularMajusculeProfile,ctx).totalAdvanceMM,58);
});
