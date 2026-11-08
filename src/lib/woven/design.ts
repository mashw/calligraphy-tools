import type { SlantStyle } from '../guides/slant-paths';
import { PAPERS_MM } from "../curve-helpers";
import type { ConstructionGuideSettings } from "../guides/guide-template";
export type Design = {
  centerX?: number;
  centerY?: number;
  slantStyle: SlantStyle;
  paper: keyof typeof PAPERS_MM;
  orientation: "portrait" | "landscape";
  penAngle: number;
  gridHorizontal: boolean;
  gridVertical: boolean;
  gridMode: "effective" | "actual" | "custom";
  gridWidth: number;
  gridContrast: number;
  gridThickness: number;
  slants: boolean;
  slantAngle: number;
  slantSpacing: number;
  slantContrast: number;
  secondSlant: boolean;
  secondAngle: number;
  construction: ConstructionGuideSettings;
  version: 1;
  preset: "rosette" | "figure-eight";
  width: number;
  height: number;
  loop: number;
  rotation: number;
  reverse: boolean;
  script: "Fraktur" | "TexturaQuadrata" | "InsularMajuscule" | "Copperplate";
  nib: number;
  xNib: number;
  ascNib: number;
  descNib: number;
  start: number;
  gap: number;
  clearance: number;
  fullGuides: boolean;
  annotated: boolean;
  overrides: Record<string, "a" | "b">;
};
export const DEFAULT_DESIGN: Design = {
  slantStyle: "flowing",
  paper: "A4",
  orientation: "portrait",
  penAngle: 45,
  gridHorizontal: true,
  gridVertical: true,
  gridMode: "effective",
  gridWidth: 1,
  gridContrast: 0.5,
  gridThickness: 0.12,
  slants: true,
  slantAngle: 55,
  slantSpacing: 10,
  slantContrast: 0.3,
  secondSlant: false,
  secondAngle: 55,
  construction: { upper: false, lower: false, color: "#dc2626" },
  version: 1,
  preset: "rosette",
  width: 165,
  height: 165,
  loop: 0.32,
  rotation: 0,
  reverse: false,
  script: "TexturaQuadrata",
  nib: 0.7,
  xNib: 5,
  ascNib: 2,
  descNib: 2,
  start: 3,
  gap: 8,
  clearance: 0.6,
  fullGuides: true,
  annotated: true,
  overrides: {},
};
export const LIMITS = {
  penAngle: [15, 75],
  gridWidth: [0.1, 10],
  gridContrast: [0, 1],
  gridThickness: [0.05, 0.5],
  slantAngle: [5, 90],
  slantSpacing: [1, 30],
  slantContrast: [0, 1],
  secondAngle: [5, 90],
  width: [50, 400],
  height: [50, 400],
  loop: [0.22, 0.42],
  rotation: [-180, 180],
  nib: [0.2, 4],
  xNib: [2, 10],
  ascNib: [0, 6],
  descNib: [0, 6],
  start: [0, 100],
  gap: [0, 40],
  clearance: [0, 4],
} as const;
export function parseDesign(input: unknown): Design {
  if (!input || typeof input !== "object")
    throw new Error("This is not a Woven Calligraphy design.");
  const obj = input as Record<string, unknown>;
  if (
    obj.version !== 1 ||
    !["rosette", "figure-eight"].includes(String(obj.preset)) ||
    !["Fraktur", "TexturaQuadrata", "InsularMajuscule", "Copperplate"].includes(
      String(obj.script),
    )
  )
    throw new Error("Unsupported design version, shape or script.");
  const result = {
    ...DEFAULT_DESIGN,
    preset: obj.preset,
    script: obj.script,
  } as Design;
  for (const [key, range] of Object.entries(LIMITS)) {
    const value = obj[key] ?? DEFAULT_DESIGN[key as keyof Design];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < range[0] ||
      value > range[1]
    )
      throw new Error(`Invalid ${key} in design file.`);
    Object.assign(result, { [key]: value });
  }
  for (const key of [
    "reverse",
    "fullGuides",
    "annotated",
    "gridHorizontal",
    "gridVertical",
    "slants",
    "secondSlant",
  ] as const) {
    if (
      obj[key] === undefined &&
      !["reverse", "fullGuides", "annotated"].includes(key)
    )
      continue;
    if (typeof obj[key] !== "boolean") throw new Error(`Invalid ${key}.`);
    result[key] = obj[key];
  }
  if (
    !obj.overrides ||
    typeof obj.overrides !== "object" ||
    Array.isArray(obj.overrides)
  )
    throw new Error("Invalid crossing choices.");
  result.overrides = {};
  for (const [key, value] of Object.entries(obj.overrides)) {
    if (!/^crossing-\d{1,3}$/.test(key) || (value !== "a" && value !== "b"))
      throw new Error("Invalid crossing choice.");
    result.overrides[key] = value;
  }
  if (obj.paper !== undefined) {
    if (typeof obj.paper !== "string" || !Object.hasOwn(PAPERS_MM, obj.paper))
      throw new Error("Invalid paper.");
    result.paper = obj.paper as Design["paper"];
  }
  if (obj.orientation !== undefined) {
    if (obj.orientation !== "portrait" && obj.orientation !== "landscape")
      throw new Error("Invalid orientation.");
    result.orientation = obj.orientation;
  }
  if (obj.gridMode !== undefined) {
    if (!["effective", "actual", "custom"].includes(String(obj.gridMode)))
      throw new Error("Invalid grid mode.");
    result.gridMode = obj.gridMode as Design["gridMode"];
  }
  if (obj.penAngle === undefined)
    result.penAngle =
      result.script === "InsularMajuscule"
        ? 15
        : result.script === "Fraktur"
          ? 40
          : 45;
  if (
    obj.gridHorizontal === undefined &&
    result.script === "InsularMajuscule"
  ) {
    result.gridHorizontal = false;
    result.gridVertical = false;
    result.penAngle = 15;
  }
  if (obj.construction !== undefined) {
    const c = obj.construction as ConstructionGuideSettings;
    if (
      !c ||
      typeof c !== "object" ||
      typeof c.upper !== "boolean" ||
      typeof c.lower !== "boolean" ||
      !/^#[0-9a-f]{6}$/i.test(c.color)
    )
      throw new Error("Invalid construction guides.");
    for (const appearance of [
      c.appearance,
      c.upperAppearance,
      c.lowerAppearance,
    ])
      if (
        appearance !== undefined &&
        !["dots", "x", "dashed", "nib-edge"].includes(appearance)
      )
        throw new Error("Invalid marker appearance.");
    if (
      c.dotEvery !== undefined &&
      (!Number.isInteger(c.dotEvery) || c.dotEvery < 1 || c.dotEvery > 12)
    )
      throw new Error("Invalid marker spacing.");
    result.construction = { ...c };
  }
  if (obj.slantStyle !== undefined) {
    if (obj.slantStyle !== 'classic' && obj.slantStyle !== 'flowing') throw new Error('Invalid slant style.');
    result.slantStyle = obj.slantStyle;
  }
  // Keep version 1 files readable while retiring Copperplate's artificial unit.
  // The editable proportions remain unchanged; broad-pen nib widths are retained.
  if (result.script === "Copperplate") result.nib = 1;
  for (const key of ['centerX', 'centerY'] as const) {
    if (obj[key] !== undefined) {
      if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key]) || Math.abs(obj[key]) > 10000) throw new Error('Invalid shape position.');
      result[key] = obj[key];
    }
  }
  return result;
}

export function pageSize(design: Pick<Design, "paper" | "orientation">) {
  const p = PAPERS_MM[design.paper];
  return design.orientation === "portrait"
    ? { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) }
    : { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) };
}
