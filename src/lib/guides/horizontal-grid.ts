export type HorizontalGridLineStyle = 'solid' | 'dashed';
export type HorizontalGridAppearance = { style: HorizontalGridLineStyle; dashMM: number; gapMM: number };
export const DEFAULT_HORIZONTAL_GRID_APPEARANCE: HorizontalGridAppearance = { style: 'solid', dashMM: 2, gapMM: 2 };
export function resolveHorizontalGridAppearance(value?:Partial<HorizontalGridAppearance>):HorizontalGridAppearance{return{style:value?.style??'solid',dashMM:Math.max(.1,value?.dashMM??2),gapMM:Math.max(.1,value?.gapMM??2)};}
