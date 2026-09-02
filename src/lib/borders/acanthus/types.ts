export type AcanthusSide = 'left' | 'right' | 'both' | 'inward' | 'outward';
export type DetailLevel = 'low' | 'medium' | 'high';
export type ShadingDensity = 'light' | 'medium' | 'rich';

export type AcanthusOptions = {
  leafSize: number;
  pitch: number;
  fullness: number;
  side: AcanthusSide;
  detail: DetailLevel;
  organic: number;
  seed: number;
  lineShading: boolean;
  shadingDensity: ShadingDensity;
};

export type LeafParameters = {
  length: number;
  width: number;
  lobes: number;
  side: -1 | 1;
  sweep: number;
  compression: number;
  detail: DetailLevel;
  shading: false | ShadingDensity;
  motif: number;
};

