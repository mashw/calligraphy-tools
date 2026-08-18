import type { CurvePresetId, PaperId } from '@/lib/curve-helpers';
import type { GuideTemplateId } from '@/lib/guides/guide-template';

export type Frame = { x: number; y: number; width: number; height: number };
type Base<T extends string> = { id: string; type: T; name: string; locked: boolean; frame: Frame };
export type PageElement = { id: 'page'; type: 'page'; name: 'Page'; locked: true; paper: PaperId; orientation: 'portrait' | 'landscape' };
export type GuidelinesElement = Base<'guidelines'> & { settings: { script: GuideTemplateId; xHeight: number; ascender: number; descender: number; rowGap: number; margin: number; slant: boolean; grid: boolean; highContrast: boolean } };
export type CurvedTitleElement = Base<'curve'> & { settings: { text: string; preset: CurvePresetId; showBands: boolean } };
export type CalligramElement = Base<'calligram'> & { settings: { text: string; startAngle: number; direction: 'clockwise' | 'counterclockwise'; innerBand: boolean; outerBand: boolean } };
export type ShapeElement = Base<'shape'> & { settings: { shape: 'rectangle' | 'rounded' | 'ellipse'; padding: number; mode: 'reserve' | 'fill' | 'border' | 'both'; fill: string; border: string; borderWidth: number } };
export type LayoutElement = PageElement | GuidelinesElement | CurvedTitleElement | CalligramElement | ShapeElement;
export type MovableElement = Exclude<LayoutElement, PageElement>;
export type ElementType = MovableElement['type'];
