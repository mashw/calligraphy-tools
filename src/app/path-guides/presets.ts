import { PAPERS_MM } from '@/lib/curve-helpers';
import { type ScriptId } from '@/lib/scripts';

export type CopperplateRatioPreset = '3:2:3' | '2:1:2' | '1:1:1' | 'custom';
export type PaperId = keyof typeof PAPERS_MM;
export type Orientation = 'portrait' | 'landscape';
export type PairKey = string;
export type PairOverrides = Record<PairKey, Record<number, string>>;

export type Strap = {
  id: string;
  name: string;
  d: string;
  color: string;
  script: ScriptId;
  nibMMText: string;
  nibAngleDeg: 35 | 40 | 45;
  xHeightMMText?: string;
  copperplateRatioPreset?: CopperplateRatioPreset;
  copperplateDescUnitsText?: string;
  copperplateXUnitsText?: string;
  copperplateAscUnitsText?: string;
  xNibText?: string;
  ascNibText?: string;
  descNibText?: string;
  offset: { x: number; y: number };
  scalePct: number;
  rotDeg: number;
  flip: boolean;
  snapped: boolean;
  invertGuides: boolean;
};

export type StrapGroup = {
  id: string;
  name: string;
  strapIds: string[];
  collapsed: boolean;
};

export type PathGuidesPresetV1 = {
  version: 1;
  name: string;
  paper: PaperId;
  orientation: Orientation;
  straps: Strap[];
  groups: StrapGroup[];
  crossingOverrides: PairOverrides;
  ui?: {
    view: 'autofit' | 'fullpage' | 'custom';
    zoom: number;
    pan: { x: number; y: number };
    simplify: boolean;
    showCrossings: boolean;
    crossingsFilter: 'all' | 'selected';
    showAllCrossings: boolean;
  };
  notes?: string;
  createdAt?: string;
};

export const PATH_GUIDES_PRESETS: PathGuidesPresetV1[] = [
  {
    version: 1,
    name: 'Default circle',
    paper: 'A4',
    orientation: PAPERS_MM.A4.defaultOrientation,
    straps: [
      {
        id: 'strap-default-circle',
        name: 'Circle',
        d: 'M 40 0 A 40 40 0 1 1 -40 0 A 40 40 0 1 1 40 0 Z',
        color: '#1d4ed8',
        script: 'Copperplate',
        nibMMText: '2.5',
        nibAngleDeg: 45,
        xHeightMMText: '6',
        copperplateRatioPreset: '3:2:3',
        offset: { x: 105, y: 148.5 },
        scalePct: 100,
        rotDeg: 0,
        flip: false,
        snapped: false,
        invertGuides: false,
      },
    ],
    groups: [],
    crossingOverrides: {},
  },
  {
    version: 1,
    name: 'Fraktur S-curve (Two straps)',
    paper: 'A4',
    orientation: 'portrait',
    straps: [
      {
        id: 'strap-17e3862a-d626-450d-b11c-223eb0faaea3',
        name: 'scurve 1',
        d: 'M248.76,160.95c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08h.02c83.85,0,151.82,67.98,151.82,151.83s-67.97,151.82-151.82,151.83v.02c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08',
        color: '#ea580c',
        script: 'Fraktur',
        nibMMText: '4',
        nibAngleDeg: 40,
        xHeightMMText: '6',
        copperplateRatioPreset: '3:2:3',
        offset: { x: -205.28625537247697, y: -269.79313980106855 },
        scalePct: 44.62499345265998,
        rotDeg: 0,
        flip: true,
        snapped: false,
        invertGuides: false,
        xNibText: '4.5',
        ascNibText: '2',
        descNibText: '2',
      },
      {
        id: 'strap-5ce1b6ef-bf8b-46ba-96d1-d38d1e631bac',
        name: 'scurve 1 copy',
        d: 'M248.76,160.95c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08h.02c83.85,0,151.82,67.98,151.82,151.83s-67.97,151.82-151.82,151.83v.02c-29.87,0-54.08,24.21-54.08,54.08s24.21,54.08,54.08,54.08',
        color: '#16a34a',
        script: 'Fraktur',
        nibMMText: '4',
        nibAngleDeg: 40,
        xHeightMMText: '6',
        copperplateRatioPreset: '3:2:3',
        offset: { x: -167.61710430035964, y: -269.74352218735777 },
        scalePct: 44.62499345265998,
        rotDeg: -180,
        flip: true,
        snapped: false,
        invertGuides: false,
        xNibText: '4.5',
        ascNibText: '2',
        descNibText: '2',
      },
    ],
    groups: [],
    crossingOverrides: {
      'strap-17e3862a-d626-450d-b11c-223eb0faaea3|strap-5ce1b6ef-bf8b-46ba-96d1-d38d1e631bac': {
        0: 'strap-5ce1b6ef-bf8b-46ba-96d1-d38d1e631bac',
      },
    },
  },
];
