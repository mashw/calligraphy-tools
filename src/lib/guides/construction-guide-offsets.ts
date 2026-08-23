export function blackletterConstructionDistances(actualNibMM: number, penAngleDeg: number, script: 'Fraktur' | 'TexturaQuadrata') {
  const effectiveNibMM = actualNibMM * Math.cos(penAngleDeg * Math.PI / 180);
  return {
    effectiveNibMM,
    upperFromWaistMM: effectiveNibMM,
    lowerFromBaselineMM: script === 'Fraktur' ? actualNibMM : effectiveNibMM,
  };
}
