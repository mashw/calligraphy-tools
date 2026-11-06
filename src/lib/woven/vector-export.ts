import type { Point } from './geometry';
export type Stroke = { points: Point[]; color: string; width: number };
export type Label = { point: Point; text: string; size: number; color: string };
export type Scene = { strokes: Stroke[]; labels: Label[]; page?: { w: number; h: number } };
const n = (value: number) => value.toFixed(3);
export const pointsD = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' ');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function sceneSvg(scene: Scene): string {
  const {w,h} = scene.page ?? {w:210,h:297};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><title>Woven Calligraphy writing guides</title>${scene.strokes.map(s => `<path d="${pointsD(s.points)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}${scene.labels.map(l => `<text x="${n(l.point.x)}" y="${n(l.point.y)}" font-family="Helvetica,Arial,sans-serif" font-size="${l.size}" fill="${l.color}">${escapeXml(l.text)}</text>`).join('')}</svg>`;
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
    const text = l.text.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
    commands.push(`BT /F1 ${px(l.size)} Tf ${rgb(l.color)} rg ${px(l.point.x)} ${py(l.point.y)} Td (${text}) Tj ET`);
  }
  const stream = commands.join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${px(w)} ${px(h)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

