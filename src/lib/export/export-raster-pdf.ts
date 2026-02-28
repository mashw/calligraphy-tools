import { rasterizeSvgToOptimizedPng } from '@/lib/export/rasterize-svg-to-png';

const MM_TO_PT = 72 / 25.4;
const EOL = '\n';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function parseIndexedPng(pngBytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  signature.forEach((val, i) => {
    if (pngBytes[i] !== val) throw new Error('Invalid PNG signature.');
  });

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 3;
  let palette = new Uint8Array();
  const idatParts: Uint8Array[] = [];

  while (offset + 12 <= pngBytes.length) {
    const dv = new DataView(pngBytes.buffer, pngBytes.byteOffset + offset, 8);
    const len = dv.getUint32(0, false);
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    const data = pngBytes.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      const ihdr = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = ihdr.getUint32(0, false);
      height = ihdr.getUint32(4, false);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') {
      palette = new Uint8Array(data);
    } else if (type === 'IDAT') {
      idatParts.push(new Uint8Array(data));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || colorType !== 3 || bitDepth !== 8 || !palette.length || !idatParts.length) {
    throw new Error('Expected indexed 8-bit PNG from rasterizer.');
  }

  return { width, height, palette, idat: concatBytes(idatParts) };
}

function makePdfWithIndexedPng(opts: {
  pngBytes: Uint8Array;
  pageWpt: number;
  pageHpt: number;
}) {
  const { pngBytes, pageWpt, pageHpt } = opts;
  const { width, height, palette, idat } = parseIndexedPng(pngBytes);
  const paletteHex = Array.from(palette).map((b) => b.toString(16).padStart(2, '0')).join('');
  const maxIndex = Math.max(0, Math.floor(palette.length / 3) - 1);

  const header = `%PDF-1.4${EOL}`;
  const obj1 = `1 0 obj${EOL}<< /Type /Catalog /Pages 2 0 R >>${EOL}endobj${EOL}`;
  const obj2 = `2 0 obj${EOL}<< /Type /Pages /Count 1 /Kids [3 0 R] >>${EOL}endobj${EOL}`;
  const obj3 =
    `3 0 obj${EOL}` +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}` +
    `endobj${EOL}`;

  const obj4Head =
    `4 0 obj${EOL}` +
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
    `/ColorSpace [/Indexed /DeviceRGB ${maxIndex} <${paletteHex}>] ` +
    `/BitsPerComponent 8 /Filter /FlateDecode ` +
    `/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${width} >> ` +
    `/Length ${idat.byteLength} >>${EOL}stream${EOL}`;
  const obj4Tail = `${EOL}endstream${EOL}endobj${EOL}`;

  const content = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;
  const obj5 =
    `5 0 obj${EOL}` +
    `<< /Length ${content.length} >>${EOL}stream${EOL}${content}${EOL}endstream${EOL}` +
    `endobj${EOL}`;

  const chunks: (string | Uint8Array)[] = [header];
  const xref: number[] = [];
  let cur = header.length;
  const pushStr = (s: string) => { chunks.push(s); cur += s.length; };
  const pushBytes = (b: Uint8Array) => { chunks.push(b); cur += b.byteLength; };

  xref.push(cur); pushStr(obj1);
  xref.push(cur); pushStr(obj2);
  xref.push(cur); pushStr(obj3);
  xref.push(cur); pushStr(obj4Head); pushBytes(idat); pushStr(obj4Tail);
  xref.push(cur); pushStr(obj5);

  const xrefStart = cur;
  let xrefTable = `xref${EOL}0 ${xref.length + 1}${EOL}0000000000 65535 f ${EOL}`;
  xref.forEach((off) => { xrefTable += `${off.toString().padStart(10, '0')} 00000 n ${EOL}`; });
  const trailer = `trailer${EOL}<< /Size ${xref.length + 1} /Root 1 0 R >>${EOL}startxref${EOL}${xrefStart}${EOL}%%EOF`;

  return new Blob([...chunks, xrefTable, trailer] as BlobPart[], { type: 'application/pdf' });
}

export async function exportRasterPdf(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  filename: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, filename, prepareClone } = opts;
  const { pngBytes } = await rasterizeSvgToOptimizedPng({
    svgEl,
    pageWmm,
    pageHmm,
    prepareClone,
  });

  const pdfBlob = makePdfWithIndexedPng({
    pngBytes,
    pageWpt: pageWmm * MM_TO_PT,
    pageHpt: pageHmm * MM_TO_PT,
  });

  downloadBlob(pdfBlob, filename);
}

export async function printRasterToScale(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  title?: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, title = 'Print', prepareClone } = opts;
  const { pngBytes } = await rasterizeSvgToOptimizedPng({
    svgEl,
    pageWmm,
    pageHmm,
    prepareClone,
  });

  const dataUrl = `data:image/png;base64,${bytesToBase64(pngBytes)}`;
  const win = window.open('', '_blank');
  if (!win) return;

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  @page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  img { width: ${pageWmm}mm; height: ${pageHmm}mm; display: block; }
</style>
</head><body><img src="${dataUrl}" alt="${title}" /><script>
  window.onload = () => { window.print(); setTimeout(() => window.close(), 250); };
</script></body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
