import type { ScriptContext } from '@/lib/scripts/types';
import {
  DEFAULT_SCALE,
  buildBaseModel,
  computeCalibrationFactors,
  clamp,
} from '@/lib/line-widths';

export type CopperplateCalibrationInput = {
  enabled: boolean;
  calWordLowerMM?: number; // measurement for CAL_WORD
  calWordDoubleMM?: number; // measurement for CAL_WORD_DOUBLE
  userScaleFactor?: number; // advanced tweak
  userSpaceFactor?: number; // advanced tweak
};

export type CopperplateContextResult = {
  ctx: ScriptContext;
  debug: {
    autoScale: number;
    autoSpaceMult: number;
    effectiveScaleNumeric: number;
    effectiveSpaceNumeric: number;
  };
};

/**
 * Build a Copperplate ScriptContext from UI inputs.
 * This centralizes the calibration + scaling logic so Align + Curve can share it.
 */
export function buildCopperplateContext(args: {
  xHeightMM: number;
  capStyle: 'simple' | 'flourished';
  calibration: CopperplateCalibrationInput;
}): CopperplateContextResult {
  const { xHeightMM, capStyle, calibration } = args;

  const baseModel = { ...buildBaseModel(xHeightMM, 1), capStyle };

  const enabled = !!calibration.enabled;

  const userScaleFactor = enabled ? clamp(calibration.userScaleFactor ?? 1, 0.7, 1.3) : 1;
  const userSpaceFactor = enabled ? clamp(calibration.userSpaceFactor ?? 1, 0.5, 1.5) : 1;

  const lowerMeas = enabled ? calibration.calWordLowerMM : undefined;
  const doubleMeas = enabled ? calibration.calWordDoubleMM : undefined;

  const factors = enabled
    ? (computeCalibrationFactors(
        baseModel,
        typeof lowerMeas === 'number' && Number.isFinite(lowerMeas) ? lowerMeas : undefined,
        typeof doubleMeas === 'number' && Number.isFinite(doubleMeas) ? doubleMeas : undefined
      ) as { autoScale: number; autoSpaceMult: number })
    : { autoScale: 1, autoSpaceMult: 1 };

  const autoScale = factors.autoScale ?? 1;
  const autoSpaceMult = factors.autoSpaceMult ?? 1;

  const scale = enabled ? DEFAULT_SCALE * autoScale * userScaleFactor : DEFAULT_SCALE;
  const spaceMult = enabled ? clamp(autoSpaceMult * userSpaceFactor, 0.5, 2.0) : 1;

  const ctx: ScriptContext = {
    xHeightMM,
    nibMM: 0,
    scale,
    spaceMult,
    capStyle,
  };

  return {
    ctx,
    debug: {
      autoScale,
      autoSpaceMult,
      effectiveScaleNumeric: enabled ? autoScale * userScaleFactor : 1,
      effectiveSpaceNumeric: enabled ? autoSpaceMult * userSpaceFactor : 1,
    },
  };
}
