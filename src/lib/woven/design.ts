export type Design = {
  version: 1; preset: 'rosette' | 'figure-eight'; width: number; height: number;
  loop: number; rotation: number; reverse: boolean; script: 'Fraktur' | 'TexturaQuadrata' | 'InsularMajuscule' | 'Copperplate';
  nib: number; xNib: number; ascNib: number; descNib: number;
  start: number; gap: number; clearance: number; fullGuides: boolean; annotated: boolean;
  overrides: Record<string, 'a' | 'b'>;
};
export const DEFAULT_DESIGN: Design = { version: 1, preset: 'rosette', width: 165, height: 165, loop: .32, rotation: 0, reverse: false, script: 'TexturaQuadrata', nib: .7, xNib: 5, ascNib: 2, descNib: 2, start: 3, gap: 8, clearance: .6, fullGuides: true, annotated: true, overrides: {} };
export const LIMITS = { width: [50, 185], height: [50, 260], loop: [.22, .42], rotation: [-180, 180], nib: [.2, 4], xNib: [2, 10], ascNib: [0, 6], descNib: [0, 6], start: [0, 100], gap: [0, 40], clearance: [0, 4] } as const;
export function parseDesign(input: unknown): Design {
  if (!input || typeof input !== 'object') throw new Error('This is not a Woven Calligraphy design.');
  const obj = input as Record<string, unknown>;
  if (obj.version !== 1 || !['rosette', 'figure-eight'].includes(String(obj.preset)) || !['Fraktur', 'TexturaQuadrata', 'InsularMajuscule', 'Copperplate'].includes(String(obj.script))) throw new Error('Unsupported design version, shape or script.');
  const result = { ...DEFAULT_DESIGN, preset: obj.preset, script: obj.script } as Design;
  for (const [key, range] of Object.entries(LIMITS)) {
    const value = obj[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) throw new Error(`Invalid ${key} in design file.`);
    Object.assign(result, { [key]: value });
  }
  for (const key of ['reverse', 'fullGuides', 'annotated'] as const) { if (typeof obj[key] !== 'boolean') throw new Error(`Invalid ${key}.`); result[key] = obj[key]; }
  if (!obj.overrides || typeof obj.overrides !== 'object' || Array.isArray(obj.overrides)) throw new Error('Invalid crossing choices.');
  result.overrides = {};
  for (const [key, value] of Object.entries(obj.overrides)) {
    if (!/^crossing-\d{1,3}$/.test(key) || (value !== 'a' && value !== 'b')) throw new Error('Invalid crossing choice.');
    result.overrides[key] = value;
  }
  return result;
}
