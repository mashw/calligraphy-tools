export type HorizontalGridLineStyle = 'solid' | 'dashed';
export type HorizontalGridAppearance = { style: HorizontalGridLineStyle; dashMM: number; gapMM: number };
export const DEFAULT_HORIZONTAL_GRID_APPEARANCE: HorizontalGridAppearance = {
  style: 'solid',
  dashMM: 9,
  gapMM: 5,
};

export function resolveHorizontalGridAppearance(
  value?: Partial<HorizontalGridAppearance>,
): HorizontalGridAppearance {
  return {
    style: value?.style ?? 'solid',
    dashMM: Math.max(.1, value?.dashMM ?? 9),
    gapMM: Math.max(.1, value?.gapMM ?? 5),
  };
}
