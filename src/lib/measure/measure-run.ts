import type { ScriptContext, ScriptProfile, MeasuredRun, MeasuredGlyph } from '@/lib/scripts/types';

function kindOf(ch: string): MeasuredGlyph['kind'] {
  if (ch === ' ') return 'space';
  if (/[a-zA-Z0-9]/.test(ch)) return 'glyph';
  return 'punct';
}

export function measureRun(text: string, profile: ScriptProfile, ctx: ScriptContext): MeasuredRun {
  // Bespoke engine override (Copperplate)
  if (profile.measureRunOverride) return profile.measureRunOverride(text, ctx);

  // Unit-based scripts
  if (!profile.unitToMm || !profile.glyphWidthUnits || !profile.afterSpacingUnits) {
    throw new Error(`ScriptProfile "${profile.id}" missing unit-based measurement functions.`);
  }

  const chars = Array.from(text);
  const unitMM = profile.unitToMm(ctx);

  const glyphs: MeasuredGlyph[] = [];

  for (let i = 0; i < chars.length; i++) {
    const prev = i > 0 ? chars[i - 1] : null;
    const ch = chars[i];
    const next = i < chars.length - 1 ? chars[i + 1] : null;

    const bodyU = profile.glyphWidthUnits(ch, ctx) * ctx.scale;
    const afterU = profile.afterSpacingUnits(prev, ch, next, ctx) * ctx.spaceMult;

    const wMM = bodyU * unitMM;
    const advMM = (bodyU + afterU) * unitMM;

    glyphs.push({ ch, kind: kindOf(ch), wMM, advMM });
  }

  const totalAdvanceMM = glyphs.reduce((sum, g) => sum + g.advMM, 0);
  return { input: text, glyphs, totalAdvanceMM };
}
