import type { CurvePresetId } from '@/lib/curve-helpers';
import type { ScriptId } from '@/lib/scripts';
import { BLACKLETTER_GUIDE_DEFAULTS } from '@/lib/guides/guide-template';

export type CurvedTitleAlign = 'start' | 'center' | 'end';
export type CopperplateRatioPreset = '2:1:2' | '3:2:3' | '1:1:1' | 'custom';

export type CurvedTitleSettings = {
  script: ScriptId; curve: CurvePresetId; flipCurve: boolean; align: CurvedTitleAlign; text: string;
  xHeightMM: number; capStyle: 'simple' | 'flourished'; nibText: string; penAngleDeg: 35 | 40 | 45;
  xNib: number; ascNib: number; descNib: number;
  copperplateRatioPreset: CopperplateRatioPreset;
  copperplateDescUnitsText: string; copperplateXUnitsText: string; copperplateAscUnitsText: string;
  topBandEnabled: boolean; topText: string; topBandScript: ScriptId; topBandSizeText: string;
  bottomBandEnabled: boolean; bottomText: string; bottomBandScript: ScriptId; bottomBandSizeText: string;
  useCalibration: boolean; calWordLowerMM: string; calWordDoubleMM: string; userScaleFactor: number; userSpaceFactor: number;
  rotation: number; scale: number; showBoxes: boolean; showSpanFill: boolean;
};

export function createDefaultCurvedTitleSettings(): CurvedTitleSettings {
  return {
    script: 'TexturaQuadrata', curve: 'simpleArch', flipCurve: false, align: 'center', text: 'Merry Christmas',
    xHeightMM: 6, capStyle: 'flourished', nibText: '2', penAngleDeg: 45,
    xNib: BLACKLETTER_GUIDE_DEFAULTS.xNib, ascNib: BLACKLETTER_GUIDE_DEFAULTS.ascNib, descNib: BLACKLETTER_GUIDE_DEFAULTS.descNib,
    copperplateRatioPreset: '2:1:2', copperplateDescUnitsText: '2', copperplateXUnitsText: '1', copperplateAscUnitsText: '2',
    topBandEnabled: false, topText: '', topBandScript: 'TexturaQuadrata', topBandSizeText: '2',
    bottomBandEnabled: false, bottomText: '', bottomBandScript: 'TexturaQuadrata', bottomBandSizeText: '2',
    useCalibration: false, calWordLowerMM: '', calWordDoubleMM: '', userScaleFactor: 1, userSpaceFactor: 1,
    rotation: 0, scale: 100, showBoxes: false, showSpanFill: true,
  };
}
