import type { MeasuredRun } from '@/lib/scripts/types';
import type { Alignment, LineMetric } from '@/lib/line-widths';

/**
 * Convert a MeasuredRun (advances in mm) into an Align-friendly LineMetric with segments.
 * This is used for unit-based scripts like Textura.
 */
export function lineMetricFromMeasuredRun(text: string, run: MeasuredRun, alignment: Alignment): LineMetric {
  const segments: LineMetric['segments'] = [];
  let cursor = 0;

  for (const g of run.glyphs) {
    const startMM = cursor;
    const endMM = cursor + g.advMM;

    if (g.kind === 'space') {
      segments.push({ kind: 'space', startMM, endMM, spaceType: 'n' });
    } else {
      segments.push({ kind: 'letter', ch: g.ch, startMM, endMM });
    }

    cursor = endMM;
  }

  const lengthMM = cursor;
  const startFromRefMM = alignment === 'center' ? lengthMM / 2 : lengthMM;
  return { text, lengthMM, startFromRefMM, segments };
}
