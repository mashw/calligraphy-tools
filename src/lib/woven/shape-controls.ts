import { LIMITS } from './design';

export type ShapeDimensions = { width: number; height: number };

export function uniformScaleLimits(base: ShapeDimensions) {
  return {
    min: Math.max(LIMITS.width[0] / base.width, LIMITS.height[0] / base.height) * 100,
    max: Math.min(LIMITS.width[1] / base.width, LIMITS.height[1] / base.height) * 100,
  };
}

/** Clamp the factor once, so neither dimension can distort the aspect ratio. */
export function scaleShape(base: ShapeDimensions, percent: number): ShapeDimensions {
  const range = uniformScaleLimits(base);
  const factor = Math.min(range.max, Math.max(range.min, Number.isFinite(percent) ? percent : 100)) / 100;
  return { width: base.width * factor, height: base.height * factor };
}
