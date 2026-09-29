import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clampCustomStartMM, customStartFromDrag, updatePlannedLinePlacement } from '../src/lib/layout/planned-line-placement.ts';
import type { LayoutElement } from '../src/lib/layout/types.ts';

test('Custom placement drag clamps throughout the numeric control range', () => {
  assert.equal(customStartFromDrag(0, 0, 40), 0);
  assert.equal(customStartFromDrag(0, 17.5, 40), 17.5);
  assert.equal(customStartFromDrag(17.5, 100, 40), 40);
  assert.equal(customStartFromDrag(17.5, -100, 40), 0);
  assert.equal(customStartFromDrag(17.5, Number.NaN, 40), 17.5);
  assert.equal(clampCustomStartMM(10, -1), 0);
});

test('placement callback changes only the requested Guidelines line', () => {
  const lines = [
    { id: 'first', text: 'unchanged', alignment: 'left' as const, customStartMM: 0 },
    { id: 'target', text: 'preserved text', alignment: 'right' as const, customStartMM: 2 },
  ];
  const guideline = { id: 'guide-a', type: 'guidelines', plannedLines: lines } as unknown as LayoutElement;
  const other = { id: 'guide-b', type: 'guidelines', plannedLines: [{ id: 'target', text: 'other', alignment: 'left', customStartMM: 9 }] } as unknown as LayoutElement;
  const result = updatePlannedLinePlacement([guideline, other], 'guide-a', 'target', 31);

  assert.deepEqual((result[0] as Extract<LayoutElement, {type:'guidelines'}>).plannedLines, [
    lines[0],
    { id: 'target', text: 'preserved text', alignment: 'custom', customStartMM: 31 },
  ]);
  assert.equal(result[1], other);
  assert.equal((result[0] as Extract<LayoutElement, {type:'guidelines'}>).plannedLines[1].id, 'target');
});

test('non-finite Custom placement is never persisted', () => {
  const guideline = { id: 'guide-a', type: 'guidelines', plannedLines: [{ id: 'line', text: 'Text', alignment: 'custom', customStartMM: 3 }] } as unknown as LayoutElement;
  const elements = [guideline];
  assert.equal(updatePlannedLinePlacement(elements, 'guide-a', 'line', Number.NaN), elements);
  assert.equal(updatePlannedLinePlacement(elements, 'guide-a', 'line', Infinity), elements);
});

test('preview handles are selected-Custom-only, CTM-based, cancellable, and non-exporting', () => {
  const source = readFileSync(new URL('../src/components/layout/LayoutStage.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-no-export="true" data-line-layout-overlay="true"/);
  assert.match(source, /const showHandles=selected&&line\.alignment==='custom'/);
  assert.match(source, /line\.rowIndex!==null&&line\.text\.trim\(\)/);
  assert.match(source, /getScreenCTM\(\)/);
  assert.match(source, /matrixTransform\(matrix\.inverse\(\)\)/);
  assert.match(source, /onPointerCancel=\{cancelDrag\} onLostPointerCapture=\{cancelDrag\}/);
  assert.match(source, /customStartFromDrag\(drag\.start,svgX-drag\.startSvgX,drag\.max\)/);
  assert.match(source, /\[start,end\]\.map/,'both handles share the same translation interaction');
  assert.doesNotMatch(source, /event\.clientX-drag\.clientX/,'drag no longer estimates SVG units from DOM width');
});

test('all Layout UI overlays are stripped from normal exports', () => {
  const source = readFileSync(new URL('../src/components/layout/LayoutStage.tsx', import.meta.url), 'utf8');
  assert.match(source, /querySelectorAll\('\[data-no-export="true"\], #stage-bg'\)/);
  const plotter = readFileSync(new URL('../src/lib/layout/plotter-export.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(plotter, /custom-placement-handle|line-layout-overlay/);
});
