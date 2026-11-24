export const DEFAULT_GRID_STROKE_MM = 0.12;

// The reference width is for a 2 mm nib. SVG user units are millimetres.
export function gridStrokeWidthMM(nibMM: number, referenceWidthMM = DEFAULT_GRID_STROKE_MM): number {
  return referenceWidthMM * nibMM / 2;
}
