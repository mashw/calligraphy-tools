import { copperplateProfile } from './copperplate';
import { frakturProfile } from './fraktur';
import { celticHalfUncialProfile } from './celtic-half-uncial';
import { texturaQuadrataProfile } from './textura-quadrata';

export const SCRIPT_PROFILES = {
  Copperplate: copperplateProfile,
  Fraktur: frakturProfile,
  CelticHalfUncial: celticHalfUncialProfile,
  TexturaQuadrata: texturaQuadrataProfile,
} as const;

export type ScriptId = keyof typeof SCRIPT_PROFILES;
