import type { Point } from './geometry';
import { guideTagColour, pdfTagCommands, sheetLabelFont, type SheetTag } from '@/lib/guides/sheet-labels';
export type Stroke = { points: Point[]; color: string; width: number; role?: 'primary'|'grid'|'slant'|'construction'|'annotation'; guide?:'baseline'|'waist' };
export type Label = { previewOnly?:boolean; point: Point; text: string; size: number; color: string };
export type Scene = { strokes: Stroke[]; labels: Label[]; tags?: SheetTag[]; page?: { w: number; h: number } };
const n = (value: number) => value.toFixed(3);
export const pointsD = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function sceneSvg(scene: Scene, { combineAdjacentStrokes = false } = {}): string {
  const {w,h} = scene.page ?? {w:210,h:297};
  const paths: { color: string; width: number; subpaths: string[] }[] = [];
  for (const stroke of scene.strokes) {
    const previous = paths.at(-1);
    const d = pointsD(stroke.points);
    if (combineAdjacentStrokes && previous?.color === stroke.color && previous.width === stroke.width) {
      previous.subpaths.push(d);
    } else {
      paths.push({ color: stroke.color, width: stroke.width, subpaths: [d] });
    }
  }
  const geometry = paths.map(path => `<path d="${path.subpaths.join(' ')}" fill="none" stroke="${path.color}" stroke-width="${path.width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const tags = scene.tags?.map((tag, index) => {
    const id = `guide-label-${index}`;
    const text = escapeXml(tag.text);
    const style = `data-guide-label="tag" font-family="${sheetLabelFont}" font-size="${tag.size}" fill="${guideTagColour(tag.colour)}" text-anchor="middle"`;
    return tag.path
      ? `<defs><path id="${id}" d="${pointsD(tag.path)}"/></defs><text ${style}><textPath href="#${id}" startOffset="50%">${text}</textPath></text>`
      : `${tag.backing ? `<rect x="${n(tag.point.x-tag.backing.width/2)}" y="${n(tag.point.y-tag.size)}" width="${n(tag.backing.width)}" height="${n(tag.backing.height)}" fill="white"/>` : ''}<text ${style} transform="translate(${n(tag.point.x)} ${n(tag.point.y)}) rotate(${n(tag.angle ?? 0)})">${text}</text>`;
  }).join('') ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><title>Woven Calligraphy writing guides</title>${geometry}${scene.labels.filter(l=>!l.previewOnly).map(l => `<text x="${n(l.point.x)}" y="${n(l.point.y)}" font-family="Helvetica,Arial,sans-serif" font-size="${l.size}" fill="${l.color}">${escapeXml(l.text)}</text>`).join('')}${tags}</svg>`;
}
/** Small vector-only PDF writer. Coordinates and pen widths remain physical mm. */
export function scenePdf(scene: Scene): Uint8Array {
  const {w,h} = scene.page ?? {w:210,h:297};
  const scale = 72 / 25.4;
  const rgb = (hex: string) => [1, 3, 5].map(i => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
  const px = (x: number) => n(x * scale), py = (y: number) => n((h - y) * scale);
  const commands = ['1 J 1 j'];
  for (const s of scene.strokes) {
    commands.push(`${rgb(s.color)} RG ${px(s.width)} w`, ...s.points.map((p, i) => `${px(p.x)} ${py(p.y)} ${i ? 'l' : 'm'}`), 'S');
  }
  for (const l of scene.labels) {
    if (l.previewOnly) continue;
    const text = l.text.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
    commands.push(`BT /F1 ${px(l.size)} Tf ${rgb(l.color)} rg ${px(l.point.x)} ${py(l.point.y)} Td (${text}) Tj ET`);
  }
  for (const tag of scene.tags ?? []) commands.push(pdfTagCommands(tag, point => point, h));
  const stream = commands.join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${px(w)} ${px(h)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

