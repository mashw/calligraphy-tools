import type { ScriptContext, ScriptProfile, MeasuredRun, MeasuredGlyph } from '@/lib/scripts/types';
import type { WidthModel, Seg } from '@/lib/line-widths';
import { buildBaseModel, segmentsForLine } from '@/lib/line-widths';

export function buildCopperplateModel(ctx: ScriptContext): WidthModel {
  // buildBaseModel gives baseline ratios at a chosen x-height.
  // We then apply ctx.scale + ctx.spaceMult exactly like Align does.
  return {
    ...buildBaseModel(ctx.xHeightMM, 1),
    capStyle: ctx.capStyle ?? 'flourished',
    scale: ctx.scale,
    spaceMult: ctx.spaceMult,
  };
}

function segToGlyph(seg: Seg): MeasuredGlyph {
  const w = Math.max(0, seg.endMM - seg.startMM);
  if (seg.kind === 'letter') {
    return { ch: seg.ch, kind: 'glyph', wMM: w, advMM: w };
  }
  return { ch: ' ', kind: 'space', wMM: w, advMM: w };
}

export const copperplateProfile: ScriptProfile = {
  id: 'Copperplate',
  label: 'Copperplate',
  unitSystem: 'xheight',

  // Copperplate keeps its bespoke engine (joins, entry/exit, word space model).
  // We simply convert the engine's segments into the shared MeasuredRun format.
  measureRunOverride: (text: string, ctx: ScriptContext): MeasuredRun => {
    const model = buildCopperplateModel(ctx);
    const segs = segmentsForLine(text, model);

    const glyphs = segs.map(segToGlyph);
    const totalAdvanceMM = glyphs.reduce((sum, g) => sum + g.advMM, 0);

    return { input: text, glyphs, totalAdvanceMM };
  },
};
