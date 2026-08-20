import type { ScriptId } from '@/lib/scripts';

export type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';
export type GridWidthMode = 'effective' | 'actual';

export type GuidelinesSettings = {
  script: ScriptId;
  rowGapMM: number;
  margins: { top: number; bottom: number; left: number; right: number };
  xHeightMM: number;
  nibMM: number;
  copperplateRatioPreset: CopperplateRatioPreset;
  copperplateUnits: { desc: number; x: number; asc: number };
  penAngleDeg: 35 | 40 | 45;
  xNib: number;
  ascNib: number;
  descNib: number;
  slant: { angle: number; secondEnabled: boolean; secondAngle: number; spacingMM: number; contrast: number };
  grid: { widthMode: GridWidthMode; contrast: number; thickness: number; horizontal: boolean; vertical: boolean; nibAngleGuide: boolean };
  appearance: {
    baselineIndicator: boolean; baselineColor: string; waistlineColor: string;
    xLineContrast: number; xLineThickness: number; midpointDashGap: number;
    midpointDashContrast: number; highContrast: boolean; centerLine: boolean;
  };
};

export function createDefaultGuidelinesSettings(): GuidelinesSettings {
  return {
    script: 'Copperplate', rowGapMM: 6, margins: { top: 15, bottom: 15, left: 10, right: 10 },
    xHeightMM: 6, nibMM: 2, copperplateRatioPreset: '3:2:3', copperplateUnits: { desc: 2, x: 1, asc: 2 },
    penAngleDeg: 45, xNib: 5, ascNib: 3, descNib: 2,
    slant: { angle: 55, secondEnabled: false, secondAngle: 55, spacingMM: 10, contrast: .3 },
    grid: { widthMode: 'effective', contrast: .5, thickness: 1, horizontal: true, vertical: true, nibAngleGuide: true },
    appearance: { baselineIndicator: false, baselineColor: '#111827', waistlineColor: '#111827', xLineContrast: 1, xLineThickness: 1, midpointDashGap: 6, midpointDashContrast: .5, highContrast: false, centerLine: false },
  };
}
