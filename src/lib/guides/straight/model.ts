import { buildGuideSet } from '@/lib/guides/guide-template';
import type { Pt } from '@/lib/guides/guide-template';
import type { GuidelinesSettings } from './settings';

export function calculateGuidelinesVerticalMetrics(settings: GuidelinesSettings) {
  const { script, nibMM } = settings;
  const heights = (() => {
    if (script !== 'Copperplate') return { xMM: settings.xNib * nibMM, ascMM: settings.ascNib * nibMM, descMM: settings.descNib * nibMM };
    if (settings.copperplateRatioPreset === 'custom') return {
      xMM: settings.xHeightMM * settings.copperplateUnits.x,
      ascMM: settings.xHeightMM * settings.copperplateUnits.asc,
      descMM: settings.xHeightMM * settings.copperplateUnits.desc,
    };
    const units = { '2:1:2': [2, 1, 2], '3:2:3': [3, 2, 3], '1:1:1': [1, 1, 1] }[settings.copperplateRatioPreset];
    return { xMM: settings.xHeightMM, ascMM: settings.xHeightMM * units[2] / units[1], descMM: settings.xHeightMM * units[0] / units[1] };
  })();
  const lineHeightMM = heights.ascMM + heights.xMM + heights.descMM;
  return { ...heights, lineHeightMM, rowStepMM: lineHeightMM + settings.rowGapMM };
}

export function getGuidelinesCompleteRowHeight(settings: GuidelinesSettings, rowCount: number) {
  const { lineHeightMM, rowStepMM } = calculateGuidelinesVerticalMetrics(settings);
  return Math.max(4, settings.margins.top + lineHeightMM + (Math.max(1, Math.round(rowCount)) - 1) * rowStepMM + settings.margins.bottom);
}

export function getNearestCompleteGuidelinesHeight(settings: GuidelinesSettings, targetHeight: number) {
  const { lineHeightMM, rowStepMM } = calculateGuidelinesVerticalMetrics(settings);
  const firstHeight = settings.margins.top + lineHeightMM + settings.margins.bottom;
  const rowCount = rowStepMM > 0 ? Math.max(1, Math.round((targetHeight - firstHeight) / rowStepMM) + 1) : 1;
  return getGuidelinesCompleteRowHeight(settings, rowCount);
}

export function calculateStraightGuidelines(box: { width: number; height: number }, settings: GuidelinesSettings) {
  const { script, nibMM } = settings;
  const effectiveNibMM = script === 'Copperplate' ? nibMM : nibMM * Math.cos(settings.penAngleDeg * Math.PI / 180);
  const { lineHeightMM: lineHeight, rowStepMM, ...heights } = calculateGuidelinesVerticalMetrics(settings);
  const startY = settings.margins.top + heights.ascMM + heights.xMM;
  const overshootEndY = box.height + lineHeight + rowStepMM;
  const count = rowStepMM > 0 ? Math.max(0, Math.ceil((overshootEndY - startY) / rowStepMM)) : -1;
  const baselinePositions = Array.from({ length: count + 1 }, (_, index) => startY + index * rowStepMM);
  const guideSets = baselinePositions.map(y => {
    const baseline: Pt[] = [{ x: settings.margins.left, y }, { x: box.width - settings.margins.right, y }];
    const gridUnitMM = settings.grid.widthMode === 'actual' ? nibMM : effectiveNibMM;
    return buildGuideSet(script === 'Copperplate' ? 'copperplate' : 'blackletter', {
      baseline, ...heights, tickStepMM: script === 'Copperplate' ? Math.max(heights.xMM * .9, 3) : gridUnitMM, actualNibMM: nibMM,
    });
  });
  return { ...heights, effectiveNibMM, lineHeight, rowStepMM, baselinePositions, guideSets };
}

export function buildStraightSlantLines(guideSets: ReturnType<typeof buildGuideSet>[], box: { width: number; height: number }, spacing: number, angle: number) {
  const first = guideSets[0]; if (!first || spacing <= 0) return [];
  const min = first.baseLine[0].x; const max = first.baseLine[first.baseLine.length - 1].x;
  const dx = box.height / Math.tan((-angle * Math.PI) / 180);
  const lines = []; for (let x = min - Math.abs(dx) - spacing * 2; x <= max + Math.abs(dx) + spacing * 2; x += spacing) lines.push({ x1: x, y1: 0, x2: x + dx, y2: box.height });
  return lines;
}
