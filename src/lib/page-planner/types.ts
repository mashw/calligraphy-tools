export type PaperId = 'A3' | 'A4' | 'A5' | 'Letter';
export type Orientation = 'portrait' | 'landscape';
export type PlannerElementKind = 'page-guidelines' | 'guideline-block' | 'shape' | 'curved-title' | 'calligram-main-circle';

export type PlannerElementBase = {
  id: string; name: string; kind: PlannerElementKind; x: number; y: number;
  scalePct: number; rotDeg: number; visible: boolean; locked: boolean;
  previewOnly: boolean; blocksLower: boolean;
};
export type GuidelineElement = PlannerElementBase & { kind: 'page-guidelines' | 'guideline-block'; width: number; height: number; lineGap: number; xHeight: number; slant: boolean };
export type ShapeElement = PlannerElementBase & { kind: 'shape'; shape: 'rectangle' | 'ellipse'; width: number; height: number; filled: boolean };
export type CurvedTitleElement = PlannerElementBase & { kind: 'curved-title'; width: number; rise: number; bandHeight: number };
export type CircleElement = PlannerElementBase & { kind: 'calligram-main-circle'; radius: number; bandHeight: number };
export type PlannerElement = GuidelineElement | ShapeElement | CurvedTitleElement | CircleElement;
export type PaperSize = { width: number; height: number; label: string };
