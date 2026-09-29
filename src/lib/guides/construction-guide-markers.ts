export type Pt = { x: number; y: number };
export type ConstructionGuideAppearance = 'nib-edge' | 'dots' | 'x' | 'dashed';
export type ConstructionGuideSettings = { upper: boolean; lower: boolean; color: string; appearance?: ConstructionGuideAppearance; upperAppearance?: ConstructionGuideAppearance; lowerAppearance?: ConstructionGuideAppearance; dotEvery?: number };

export const DEFAULT_CONSTRUCTION_GUIDES: ConstructionGuideSettings = { upper: false, lower: false, color: '#dc2626' };
export const CONSTRUCTION_GUIDE_DOT_RADIUS_MM = .2;
export const CONSTRUCTION_GUIDE_X_SIZE_MM = .9;

export function resolveConstructionGuideSettings(script: 'Fraktur' | 'TexturaQuadrata', value?: Partial<ConstructionGuideSettings>) {
  const dotEvery = Number.isFinite(value?.dotEvery) ? Math.max(1, Math.min(12, Math.round(value!.dotEvery!))) : 3;
  const defaultAppearance: ConstructionGuideAppearance = script === 'Fraktur' ? 'nib-edge' : 'dashed';
  return {
    upper: value?.upper ?? DEFAULT_CONSTRUCTION_GUIDES.upper,
    lower: value?.lower ?? DEFAULT_CONSTRUCTION_GUIDES.lower,
    color: value?.color ?? DEFAULT_CONSTRUCTION_GUIDES.color,
    upperAppearance: value?.upperAppearance ?? value?.appearance ?? defaultAppearance,
    lowerAppearance: value?.lowerAppearance ?? value?.appearance ?? defaultAppearance,
    dotEvery,
  };
}

export function nibEdgeMarkerSegment(point: Pt, tangent: Pt, nibMM: number, penAngleDeg: number, alignment: 'center' | 'right-edge' = 'center') {
  const angle = penAngleDeg * Math.PI / 180;
  const direction = {
    x: tangent.x * Math.cos(angle) - tangent.y * Math.sin(angle),
    y: tangent.x * Math.sin(angle) + tangent.y * Math.cos(angle),
  };
  if (alignment === 'right-edge') return { a: { x: point.x - direction.x * nibMM, y: point.y - direction.y * nibMM }, b: point };
  const half = nibMM / 2;
  return { a: { x: point.x - direction.x * half, y: point.y - direction.y * half }, b: { x: point.x + direction.x * half, y: point.y + direction.y * half } };
}

export function xMarkerSegments(point: Pt, sizeMM = CONSTRUCTION_GUIDE_X_SIZE_MM) {
  const half = sizeMM / 2;
  return [
    { a: { x: point.x - half, y: point.y - half }, b: { x: point.x + half, y: point.y + half } },
    { a: { x: point.x - half, y: point.y + half }, b: { x: point.x + half, y: point.y - half } },
  ];
}
