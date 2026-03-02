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
    name: 'Fraktur S-curve (Exported preset)',
    paper: 'A4',
    orientation: 'portrait',
    straps: [
      {
        id: 'strap-d6fc900c-f4cd-4084-b385-efbedca6ef96',
        name: 'scurve 1 copy',
        d: 'M297.64,75.67c-37.83,0-68.5,30.67-68.5,68.5c0,37.83,30.67,68.5,68.5,68.5c37.83,0,68.5-30.67,68.5-68.5c0-37.83-30.67-68.5-68.5-68.5z',
        color: '#1d4ed8',
        script: 'Fraktur',
        nibMMText: '5',
        nibAngleDeg: 40,
        xHeightMMText: '6',
        copperplateRatioPreset: '3:2:3',
        offset: { x: -229.47842363337446, y: -257.028015448866 },
        scalePct: 30,
        rotDeg: -180,
        flip: true,
        snapped: false,
        invertGuides: false,
        xNibText: '4.5',
        ascNibText: '2',
        descNibText: '2',
      },
      {
        id: 'strap-b95576c0-ad8b-46d1-b29c-ee34aadf1445',
        name: 'scurve 1',
        d: 'M297.64,75.67c-37.83,0-68.5,30.67-68.5,68.5c0,37.83,30.67,68.5,68.5,68.5c37.83,0,68.5-30.67,68.5-68.5c0-37.83-30.67-68.5-68.5-68.5z',
        color: '#1d4ed8',
        script: 'Fraktur',
        nibMMText: '5',
        nibAngleDeg: 40,
        xHeightMMText: '6',
        copperplateRatioPreset: '3:2:3',
        offset: { x: -261.63392329405406, y: -256.9296699927915 },
        scalePct: 30,
        rotDeg: 0,
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
      'strap-b95576c0-ad8b-46d1-b29c-ee34aadf1445|strap-d6fc900c-f4cd-4084-b385-efbedca6ef96': {
        0: 'strap-d6fc900c-f4cd-4084-b385-efbedca6ef96',
        1: 'strap-d6fc900c-f4cd-4084-b385-efbedca6ef96',
      },
    },
  },
];
