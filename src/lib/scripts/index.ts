import { copperplateProfile } from './copperplate';
import { texturaQuadrataProfile } from './textura-quadrata';

export const SCRIPT_PROFILES = {
  Copperplate: copperplateProfile,
  Fraktur: texturaQuadrataProfile,
  TexturaQuadrata: texturaQuadrataProfile,
} as const;

export type ScriptId = keyof typeof SCRIPT_PROFILES;
