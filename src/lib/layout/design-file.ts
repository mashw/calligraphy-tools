import type { LayoutElement } from './types';

export const LAYOUT_DESIGN_FORMAT = 'calligraphy-tools-layout';
export const LAYOUT_DESIGN_VERSION = 1;

export type LayoutDesignSnapshot = {
  elements: LayoutElement[];
  selectedElementId: string;
};

type JsonObject = Record<string, unknown>;

const ELEMENT_TYPES = new Set(['page', 'guidelines', 'calligram', 'curved-title', 'shape', 'artwork']);
const ARTWORK_TAGS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const LINE_ALIGNMENTS = new Set(['left', 'center', 'right', 'custom']);
const PAPER_IDS = new Set(['A3', 'A4', 'A5', 'DL', 'C5', 'C6', 'Custom']);

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function fail(message: string): never {
  throw new Error(message);
}

function validateFrame(value: unknown, label: string) {
  if (!isObject(value)) fail(`${label} is missing its frame.`);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!isFiniteNumber(value[key])) fail(`${label} has an invalid frame.`);
  }
  if ((value.width as number) <= 0 || (value.height as number) <= 0) fail(`${label} has an invalid size.`);
}

function validateMargins(value: unknown) {
  if (!isObject(value)) fail('The saved page has invalid margins.');
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    if (!isFiniteNumber(value[key])) fail('The saved page has invalid margins.');
  }
}

function validateArtworkNode(value: unknown, state: { count: number }) {
  if (!isObject(value) || typeof value.tag !== 'string' || !ARTWORK_TAGS.has(value.tag)) fail('Saved artwork contains invalid vector data.');
  if (!isObject(value.attrs) || Object.values(value.attrs).some(attribute => typeof attribute !== 'string')) fail('Saved artwork contains invalid vector attributes.');
  if (!Array.isArray(value.children)) fail('Saved artwork contains invalid vector data.');
  state.count += 1;
  if (state.count > 2_000) fail('Saved artwork exceeds the supported vector element limit.');
  for (const child of value.children) validateArtworkNode(child, state);
}

function validateArtworkDocument(value: unknown) {
  if (!isObject(value) || !isObject(value.viewBox) || !Array.isArray(value.nodes)) fail('Saved artwork is incomplete.');
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (!isFiniteNumber(value.viewBox[key])) fail('Saved artwork has an invalid viewBox.');
  }
  if ((value.viewBox.width as number) <= 0 || (value.viewBox.height as number) <= 0) fail('Saved artwork has an invalid viewBox.');
  if (value.warning !== null && typeof value.warning !== 'string') fail('Saved artwork has invalid metadata.');
  const state = { count: 0 };
  for (const node of value.nodes) validateArtworkNode(node, state);
}

function validateBaseElement(value: JsonObject, index: number) {
  const label = `Element ${index + 1}`;
  if (typeof value.id !== 'string' || !value.id) fail(`${label} is missing an id.`);
  if (typeof value.name !== 'string') fail(`${label} has an invalid name.`);
  if (typeof value.type !== 'string' || !ELEMENT_TYPES.has(value.type)) fail(`${label} has an unsupported type.`);
  if (typeof value.locked !== 'boolean') fail(`${label} has an invalid lock state.`);
  validateFrame(value.frame, label);

  if (value.type !== 'page') {
    if (!isFiniteNumber(value.paddingMM) || (value.paddingMM as number) < 0) fail(`${label} has invalid padding.`);
    if (value.rotationDeg !== undefined && !isFiniteNumber(value.rotationDeg)) fail(`${label} has an invalid rotation.`);
  }
}

function validatePage(value: JsonObject) {
  if (value.id !== 'page' || value.locked !== true || !isObject(value.settings)) fail('The saved design has an invalid page element.');
  const settings = value.settings;
  if (typeof settings.paper !== 'string' || !PAPER_IDS.has(settings.paper) || !['portrait', 'landscape'].includes(String(settings.orientation))) fail('The saved page has invalid paper settings.');
  if (!isFiniteNumber(settings.customWidthMM) || !isFiniteNumber(settings.customHeightMM) || (settings.customWidthMM as number) <= 0 || (settings.customHeightMM as number) <= 0) fail('The saved page has invalid custom dimensions.');
  validateMargins(settings.margins);
  if (!isObject(settings.centerLines) || typeof settings.centerLines.vertical !== 'boolean' || typeof settings.centerLines.horizontal !== 'boolean') fail('The saved page has invalid centre-line settings.');
}

function validateGuidelines(value: JsonObject) {
  if (!isObject(value.settings) || !isObject(value.mask)) fail('Saved guidelines are incomplete.');
  if (typeof value.allowPartialGuidelines !== 'boolean' || typeof value.fitText !== 'string' || !['estimate', 'line-layout'].includes(String(value.textMode))) fail('Saved guidelines have invalid text settings.');
  if (!['waist', 'baseline'].includes(String(value.rightAlignMode)) || typeof value.avoidOccludingElements !== 'boolean') fail('Saved guidelines have invalid layout settings.');
  if (!Array.isArray(value.plannedLines)) fail('Saved guidelines have invalid planned lines.');
  for (const line of value.plannedLines) {
    if (!isObject(line) || typeof line.id !== 'string' || typeof line.text !== 'string' || typeof line.alignment !== 'string' || !LINE_ALIGNMENTS.has(line.alignment) || !isFiniteNumber(line.customStartMM)) {
      fail('Saved guidelines contain an invalid planned line.');
    }
  }
  const mask = value.mask;
  if (typeof mask.enabled !== 'boolean' || typeof mask.kind !== 'string' || typeof mask.textLayoutRespectsMask !== 'boolean' || typeof mask.showOutline !== 'boolean' || typeof mask.outlineColor !== 'string' || !isFiniteNumber(mask.outlineWidthMM) || !isFiniteNumber(mask.cornerRadiusMM)) {
    fail('Saved guidelines have invalid mask settings.');
  }
}

function validateArtwork(value: JsonObject) {
  if (typeof value.sourceFilename !== 'string' || !isFiniteNumber(value.intrinsicAspectRatio) || (value.intrinsicAspectRatio as number) <= 0) fail('Saved artwork has invalid source metadata.');
  validateArtworkDocument(value.document);
  if (!isObject(value.settings)) fail('Saved artwork settings are missing.');
  const settings = value.settings;
  if (typeof settings.lockProportions !== 'boolean' || !isFiniteNumber(settings.opacity) || typeof settings.occludeLowerLayers !== 'boolean' || typeof settings.occludeClosedShapes !== 'boolean') fail('Saved artwork has invalid settings.');
  if (settings.occlusionArea !== undefined && !['visible-artwork', 'bounds'].includes(String(settings.occlusionArea))) fail('Saved artwork has an invalid occlusion mode.');
  if (settings.textFitExclusion !== undefined && !['bounds', 'geometry'].includes(String(settings.textFitExclusion))) fail('Saved artwork has an invalid text-fit mode.');
}

function validateElement(value: unknown, index: number): asserts value is LayoutElement {
  if (!isObject(value)) fail(`Element ${index + 1} is invalid.`);
  validateBaseElement(value, index);
  if (value.type === 'page') return validatePage(value);
  if (value.type === 'guidelines') return validateGuidelines(value);
  if (value.type === 'artwork') return validateArtwork(value);
  if (!isObject(value.settings)) fail(`${value.name || `Element ${index + 1}`} is missing its settings.`);
}

export function serializeLayoutDesign(elements: LayoutElement[], selectedElementId: string) {
  return JSON.stringify({
    format: LAYOUT_DESIGN_FORMAT,
    version: LAYOUT_DESIGN_VERSION,
    savedAt: new Date().toISOString(),
    selectedElementId,
    elements,
  }, null, 2);
}

export function parseLayoutDesign(source: string): LayoutDesignSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail('This is not a valid layout design file.');
  }

  if (!isObject(parsed) || parsed.format !== LAYOUT_DESIGN_FORMAT) fail('This file is not a Calligraphy Tools layout design.');
  if (parsed.version !== LAYOUT_DESIGN_VERSION) fail(`This layout file uses unsupported version ${String(parsed.version)}.`);
  if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) fail('The saved design contains no elements.');

  const ids = new Set<string>();
  let pageCount = 0;
  parsed.elements.forEach((element, index) => {
    validateElement(element, index);
    if (ids.has(element.id)) fail(`The saved design contains duplicate element id "${element.id}".`);
    ids.add(element.id);
    if (element.type === 'page') pageCount += 1;
  });

  if (pageCount !== 1) fail('The saved design must contain exactly one page.');
  if (parsed.elements.at(-1)?.type !== 'page') fail('The page must be the bottom layer in the saved design.');

  const elements = parsed.elements as LayoutElement[];
  const selectedElementId = typeof parsed.selectedElementId === 'string' && ids.has(parsed.selectedElementId)
    ? parsed.selectedElementId
    : (elements.find(element => element.type !== 'page')?.id ?? 'page');

  return { elements, selectedElementId };
}
