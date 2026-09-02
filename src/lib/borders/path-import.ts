export type ImportedGuide = { name: string; d: string; closed: boolean };

const number = (element: Element, name: string, fallback = 0) => Number(element.getAttribute(name) ?? fallback);
const pointsD = (value: string, closed: boolean) => { const values = value.trim().split(/[\s,]+/).map(Number); if (values.length < 4 || values.some(v => !Number.isFinite(v))) return ''; let d = `M ${values[0]} ${values[1]}`; for (let i = 2; i + 1 < values.length; i += 2) d += ` L ${values[i]} ${values[i + 1]}`; return d + (closed ? ' Z' : ''); };

/** Deliberately imports centreline-capable primitives only; filled silhouettes are out of scope. */
export function importGuidePaths(source: string): ImportedGuide[] {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Not a valid SVG file.');
  const results: ImportedGuide[] = [];
  for (const [index, el] of [...doc.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')].entries()) {
    const tag = el.localName; let d = ''; let closed = false;
    if (tag === 'path') { d = el.getAttribute('d') ?? ''; closed = /z\s*$/i.test(d.trim()); }
    else if (tag === 'line') d = `M ${number(el, 'x1')} ${number(el, 'y1')} L ${number(el, 'x2')} ${number(el, 'y2')}`;
    else if (tag === 'polyline' || tag === 'polygon') { closed = tag === 'polygon'; d = pointsD(el.getAttribute('points') ?? '', closed); }
    else if (tag === 'circle' || tag === 'ellipse') { const cx = number(el, 'cx'), cy = number(el, 'cy'), rx = tag === 'circle' ? number(el, 'r') : number(el, 'rx'), ry = tag === 'circle' ? number(el, 'r') : number(el, 'ry'); closed = true; d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} Z`; }
    else { const x = number(el, 'x'), y = number(el, 'y'), w = number(el, 'width'), h = number(el, 'height'), r = Math.min(number(el, 'rx'), w / 2, h / 2); closed = true; d = r ? `M ${x+r} ${y} H ${x+w-r} Q ${x+w} ${y} ${x+w} ${y+r} V ${y+h-r} Q ${x+w} ${y+h} ${x+w-r} ${y+h} H ${x+r} Q ${x} ${y+h} ${x} ${y+h-r} V ${y+r} Q ${x} ${y} ${x+r} ${y} Z` : `M ${x} ${y} H ${x+w} V ${y+h} H ${x} Z`; }
    if (d.trim()) results.push({ name: el.getAttribute('id') || `${tag} ${index + 1}`, d, closed });
  }
  if (!results.length) throw new Error('No path or centreline vector primitives were found.');
  return results;
}

