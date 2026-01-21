export type UnitSystem = 'nib' | 'xheight' | 'mm';

export type ScriptContext = {
  xHeightMM: number;
  nibMM: number;
  penAngleDeg?: 35 | 40 | 45;

  /**
   * Global scale for glyph widths (Copperplate uses this heavily; nib-unit scripts typically keep at 1).
   */
  scale: number;

  /**
   * Spacing multiplier for joins/word spaces (Copperplate uses this; nib-unit scripts typically keep at 1).
   */
  spaceMult: number;

  capStyle?: 'simple' | 'flourished';
};

export type ScriptGlyphKind = 'glyph' | 'space' | 'punct';

export type MeasuredGlyph = {
  ch: string;
  kind: ScriptGlyphKind;

  /**
   * Body width in millimetres (not including after-spacing). For many unit scripts, body contributes to advMM.
   */
  wMM: number;

  /**
   * Advance in millimetres to move the cursor after this glyph/space.
   */
  advMM: number;
};

export type MeasuredRun = {
  input: string;
  glyphs: MeasuredGlyph[];
  totalAdvanceMM: number;
};

export type ScriptProfile = {
  id: string;
  label: string;
  unitSystem: UnitSystem;

  /**
   * Unit-based scripts:
   * - unitToMm converts 1 unit to millimetres.
   * - glyphWidthUnits returns body width in units.
   * - afterSpacingUnits returns spacing-after in units.
   */
  unitToMm?: (ctx: ScriptContext) => number;
  glyphWidthUnits?: (ch: string, ctx: ScriptContext) => number;
  afterSpacingUnits?: (prev: string | null, ch: string, next: string | null, ctx: ScriptContext) => number;

  /**
   * Override measurement for scripts with bespoke engines (Copperplate).
   * Returns advances in mm directly.
   */
  measureRunOverride?: (text: string, ctx: ScriptContext) => MeasuredRun;

  isSpace?: (ch: string) => boolean;
};
