import { copperplateProfile } from './copperplate';
import { frakturProfile } from './fraktur';
import { insularMajusculeProfile } from './insular-majuscule';
import { texturaQuadrataProfile } from './textura-quadrata';

export const SCRIPT_PROFILES = {
  Copperplate: copperplateProfile,
  Fraktur: frakturProfile,
  InsularMajuscule: insularMajusculeProfile,
  TexturaQuadrata: texturaQuadrataProfile,
} as const;

export type ScriptId = keyof typeof SCRIPT_PROFILES;
