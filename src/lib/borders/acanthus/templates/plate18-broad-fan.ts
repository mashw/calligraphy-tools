/**
 * Canonical acanthus motif reconstructed manually from the broad lower-right
 * leaf mass in Plate 18 supplied in the project conversation.
 *
 * This is authored geometry, not a procedural leaf generator.
 * Coordinates are skeleton-local:
 *   u = distance along the canonical growth axis (root=0, terminal=1)
 *   v = signed distance from the axis, expressed as a fraction of motif length.
 *
 * IMPORTANT: preserve these coordinates verbatim during the first rendering test.
 */

export type MotifPoint = { u: number; v: number };
export type MotifCubic = { p0: MotifPoint; c1: MotifPoint; c2: MotifPoint; p1: MotifPoint };
export type MotifStroke = { id: string; detail: 'core' | 'structural' | 'fine'; role: 'outline' | 'pipe' | 'vein' | 'fold' | 'eye'; surface: 'face' | 'fold' | 'underside' | 'recess'; closed?: boolean; cubics: MotifCubic[] };
export type MotifAnchor = { id: string; kind: 'root' | 'tip' | 'lobe-tip' | 'eye' | 'fold'; point: MotifPoint };
export type ShadingZone = { id: string; u0: number; u1: number; v0: number; v1: number; density: 'light' | 'medium' | 'dark'; flowBias: number };
export type CanonicalAcanthusMotif = { id: string; source: string; skeleton: MotifCubic[]; strokes: MotifStroke[]; anchors: MotifAnchor[]; shadingZones: ShadingZone[] };

const outline: MotifCubic[] = [
  { p0:{u:0.000,v:0.000}, c1:{u:0.100,v:-0.050}, c2:{u:0.260,v:-0.060}, p1:{u:0.380,v:-0.040} },
  { p0:{u:0.380,v:-0.040}, c1:{u:0.560,v:-0.020}, c2:{u:0.780,v:0.000}, p1:{u:1.000,v:0.100} },
  { p0:{u:1.000,v:0.100}, c1:{u:0.990,v:0.160}, c2:{u:0.950,v:0.210}, p1:{u:0.880,v:0.270} },
  { p0:{u:0.880,v:0.270}, c1:{u:0.840,v:0.300}, c2:{u:0.810,v:0.310}, p1:{u:0.780,v:0.290} },
  { p0:{u:0.780,v:0.290}, c1:{u:0.750,v:0.260}, c2:{u:0.760,v:0.180}, p1:{u:0.730,v:0.120} },
  { p0:{u:0.730,v:0.120}, c1:{u:0.710,v:0.190}, c2:{u:0.710,v:0.310}, p1:{u:0.680,v:0.360} },
  { p0:{u:0.680,v:0.360}, c1:{u:0.640,v:0.420}, c2:{u:0.600,v:0.430}, p1:{u:0.560,v:0.400} },
  { p0:{u:0.560,v:0.400}, c1:{u:0.530,v:0.360}, c2:{u:0.550,v:0.210}, p1:{u:0.520,v:0.120} },
  { p0:{u:0.520,v:0.120}, c1:{u:0.500,v:0.200}, c2:{u:0.480,v:0.340}, p1:{u:0.440,v:0.400} },
  { p0:{u:0.440,v:0.400}, c1:{u:0.400,v:0.470}, c2:{u:0.350,v:0.460}, p1:{u:0.310,v:0.410} },
  { p0:{u:0.310,v:0.410}, c1:{u:0.280,v:0.350}, c2:{u:0.300,v:0.180}, p1:{u:0.270,v:0.100} },
  { p0:{u:0.270,v:0.100}, c1:{u:0.250,v:0.170}, c2:{u:0.220,v:0.290}, p1:{u:0.180,v:0.330} },
  { p0:{u:0.180,v:0.330}, c1:{u:0.140,v:0.370}, c2:{u:0.100,v:0.340}, p1:{u:0.080,v:0.280} },
  { p0:{u:0.080,v:0.280}, c1:{u:0.060,v:0.220}, c2:{u:0.080,v:0.100}, p1:{u:0.060,v:0.050} },
  { p0:{u:0.060,v:0.050}, c1:{u:0.040,v:0.030}, c2:{u:0.020,v:0.010}, p1:{u:0.000,v:0.000} },
];

const primaryPipe: MotifCubic[] = [
  { p0:{u:0.020,v:0.005}, c1:{u:0.170,v:-0.010}, c2:{u:0.500,v:0.020}, p1:{u:0.900,v:0.145} },
];
const structuralVeins: MotifCubic[] = [
  { p0:{u:0.025,v:0.005}, c1:{u:0.075,v:0.040}, c2:{u:0.130,v:0.180}, p1:{u:0.180,v:0.300} },
  { p0:{u:0.040,v:0.000}, c1:{u:0.110,v:0.060}, c2:{u:0.200,v:0.200}, p1:{u:0.300,v:0.380} },
  { p0:{u:0.070,v:-0.005}, c1:{u:0.160,v:0.050}, c2:{u:0.300,v:0.190}, p1:{u:0.430,v:0.370} },
  { p0:{u:0.100,v:-0.010}, c1:{u:0.230,v:0.030}, c2:{u:0.420,v:0.160}, p1:{u:0.560,v:0.360} },
  { p0:{u:0.140,v:-0.015}, c1:{u:0.300,v:0.010}, c2:{u:0.530,v:0.100}, p1:{u:0.690,v:0.300} },
];
const foldLines: MotifCubic[] = [
  { p0:{u:0.180,v:-0.020}, c1:{u:0.380,v:-0.030}, c2:{u:0.600,v:0.020}, p1:{u:0.780,v:0.120} },
  { p0:{u:0.260,v:0.085}, c1:{u:0.300,v:0.120}, c2:{u:0.300,v:0.250}, p1:{u:0.310,v:0.380} },
  { p0:{u:0.510,v:0.110}, c1:{u:0.540,v:0.160}, c2:{u:0.540,v:0.300}, p1:{u:0.560,v:0.380} },
  { p0:{u:0.720,v:0.120}, c1:{u:0.750,v:0.170}, c2:{u:0.770,v:0.240}, p1:{u:0.790,v:0.280} },
];
const fineDetails: MotifCubic[] = [
  { p0:{u:0.405,v:0.438}, c1:{u:0.420,v:0.418}, c2:{u:0.425,v:0.390}, p1:{u:0.430,v:0.365} },
  { p0:{u:0.635,v:0.405}, c1:{u:0.645,v:0.382}, c2:{u:0.650,v:0.350}, p1:{u:0.655,v:0.325} },
  { p0:{u:0.835,v:0.295}, c1:{u:0.842,v:0.273}, c2:{u:0.845,v:0.250}, p1:{u:0.848,v:0.228} },
];

export const plate18BroadFan: CanonicalAcanthusMotif = {
  id: 'plate18-broad-fan',
  source: 'Manual simplified reconstruction from the broad lower-right acanthus leaf mass in supplied Plate 18.',
  skeleton: [
    { p0:{u:0.000,v:0.000}, c1:{u:0.250,v:-0.010}, c2:{u:0.650,v:0.020}, p1:{u:1.000,v:0.100} },
  ],
  strokes: [
    { id:'outline', detail:'core', role:'outline', surface:'face', closed:true, cubics:outline },
    { id:'primary-pipe', detail:'core', role:'pipe', surface:'face', cubics:primaryPipe },
    { id:'veins', detail:'structural', role:'vein', surface:'face', cubics:structuralVeins },
    { id:'folds', detail:'structural', role:'fold', surface:'fold', cubics:foldLines },
    { id:'fine', detail:'fine', role:'vein', surface:'face', cubics:fineDetails },
  ],
  anchors: [
    { id:'root', kind:'root', point:{u:0.000,v:0.000} },
    { id:'terminal', kind:'tip', point:{u:1.000,v:0.100} },
    { id:'lobe-1', kind:'lobe-tip', point:{u:0.180,v:0.330} },
    { id:'lobe-2', kind:'lobe-tip', point:{u:0.310,v:0.410} },
    { id:'lobe-3', kind:'lobe-tip', point:{u:0.440,v:0.400} },
    { id:'lobe-4', kind:'lobe-tip', point:{u:0.680,v:0.360} },
    { id:'lobe-5', kind:'lobe-tip', point:{u:0.880,v:0.270} },
    { id:'eye-1', kind:'eye', point:{u:0.060,v:0.050} },
    { id:'eye-2', kind:'eye', point:{u:0.270,v:0.100} },
    { id:'eye-3', kind:'eye', point:{u:0.520,v:0.120} },
    { id:'eye-4', kind:'eye', point:{u:0.730,v:0.120} },
    { id:'lower-fold', kind:'fold', point:{u:0.590,v:0.035} },
  ],
  shadingZones: [
    { id:'root-fan', u0:0.04, u1:0.42, v0:-0.01, v1:0.24, density:'medium', flowBias:0.20 },
    { id:'central-face', u0:0.28, u1:0.76, v0:0.06, v1:0.36, density:'light', flowBias:0.10 },
    { id:'eye-recesses', u0:0.24, u1:0.78, v0:0.08, v1:0.17, density:'dark', flowBias:-0.12 },
    { id:'terminal-turn', u0:0.72, u1:0.98, v0:0.10, v1:0.30, density:'medium', flowBias:-0.18 },
  ],
};
