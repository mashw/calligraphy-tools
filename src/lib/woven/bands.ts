import { guideLabel, pathTag } from '../guides/sheet-labels';
import { offset, type Pt } from '../curve-helpers';
import type { Design } from './design';

export function writingBands(design: Design, x: number, asc: number, desc: number, invert = false, anchor = x / 2) {
  const main = { side: undefined as 'inner' | 'outer' | undefined, design, x, asc, desc, anchor, hiddenExtension: undefined as 'ascender' | 'descender' | undefined };
  const bands = [main];
  const direction = invert ? -1 : 1;
  const mainBase = invert ? anchor - x : anchor;
  for (const side of ['outer', 'inner'] as const) {
    const border = design.borders?.[side];
    if (!border?.enabled) continue;
    const script = border.script;
    const nibs = script === 'TexturaQuadrata' ? 5 : script === 'Copperplate' ? 4 : 4.5;
    const unit = border.xHeight / nibs;
    const extension = unit * (script === 'Copperplate' ? 6 : 2);
    const mainExtension = side === 'outer' ? asc : desc;
    const space = border.gap + (border.share ? Math.max(mainExtension, extension) : mainExtension + extension);
    // Only the part outside the main extension is available for border guides.
    const visibleExtension = border.share ? Math.min(extension, space - mainExtension) : extension;
    const overlapsMain = border.share && space - extension <= mainExtension;
    const base = mainBase + direction * (side === 'outer' ? -x - space : space + border.xHeight);
    bands.push({ side, design: { ...design, script, nib: script === 'Copperplate' ? 1 : unit,
      penAngle: script === 'InsularMajuscule' ? 15 : script === 'Fraktur' ? 40 : 45 },
      x: border.xHeight, asc: side === 'inner' ? visibleExtension : extension,
      desc: side === 'outer' ? visibleExtension : extension, anchor: base + (invert ? border.xHeight : 0),
      hiddenExtension: overlapsMain ? (side === 'outer' ? 'descender' : 'ascender') : undefined });
  }
  return bands;
}

export function borderGuideTags(bands: ReturnType<typeof writingBands>, points: Pt[], invert: boolean, fraction: number, prefix = '') {
  return bands.slice(1).flatMap(band => {
    const outer = band.side === 'outer';
    const edges = bandEdges([band], invert);
    const distance = outer !== invert ? edges.top - 3 : edges.bottom + 3;
    const label = prefix + (outer ? 'Outer' : 'Inner') + ' · ' + guideLabel(band.design.script, band.x, band.design.nib);
    const tag = pathTag(label, offset(points, distance), (fraction + (outer ? .33 : .67)) % 1);
    return tag ? [tag] : [];
  });
}

export function bandEdges(bands: ReturnType<typeof writingBands>, invert = false) {
  return {
    top: Math.min(...bands.map(b => b.anchor - b.x - (b.design.fullGuides ? (invert ? b.desc : b.asc) : 0))),
    bottom: Math.max(...bands.map(b => b.anchor + (b.design.fullGuides ? (invert ? b.asc : b.desc) : 0))),
  };
}

/** A folded offset has a segment pointing back against the source tangent. */
export function borderBendWarning(points: Pt[], bands: ReturnType<typeof writingBands>, invert = false) {
  for (const band of bands.slice(1)) {
    const { top, bottom } = bandEdges([band], invert);
    for (const amount of [top, bottom]) {
      const edge = offset(points, amount);
      for (let i = 1; i < edge.length; i++) {
        const a = points[i-1], b = points[i];
        if ((b.x-a.x)*(edge[i].x-edge[i-1].x) + (b.y-a.y)*(edge[i].y-edge[i-1].y) < 0)
          return `Writing border folds near (${Math.round(b.x)}, ${Math.round(b.y)}) mm. Reduce the border size or gap.`;
      }
    }
  }
}
