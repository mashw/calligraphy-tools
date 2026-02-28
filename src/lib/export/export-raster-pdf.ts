import { rasterizeSvgToPng, type ExportDpi } from '@/lib/export/rasterize-svg-to-png';

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

function makeSimplePdfFromRgb(opts: {
  rgbBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  pageWpt: number;
  pageHpt: number;
}) {
  const { rgbBytes, widthPx, heightPx, pageWpt, pageHpt } = opts;
  const header = `%PDF-1.4${EOL}`;

  const obj1 = `1 0 obj${EOL}<< /Type /Catalog /Pages 2 0 R >>${EOL}endobj${EOL}`;
  const obj2 = `2 0 obj${EOL}<< /Type /Pages /Count 1 /Kids [3 0 R] >>${EOL}endobj${EOL}`;
  const obj3 =
    `3 0 obj${EOL}` +
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}` +
    `endobj${EOL}`;

  const content = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;
  const obj5 =
    `5 0 obj${EOL}` +
    `<< /Length ${content.length} >>${EOL}stream${EOL}${content}${EOL}endstream${EOL}` +
    `endobj${EOL}`;

  const obj4Head =
    `4 0 obj${EOL}` +
    `<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Width ${widthPx} /Height ${heightPx} /Length ${rgbBytes.byteLength} >>${EOL}stream${EOL}`;
  const obj4Tail = `${EOL}endstream${EOL}endobj${EOL}`;

  const chunks: (string | Uint8Array)[] = [header];
  const xref: number[] = [];
  let offset = header.length;

  const pushStr = (s: string) => {
    chunks.push(s);
    offset += s.length;
  };

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.byteLength;
  };

  xref.push(offset); pushStr(obj1);
  xref.push(offset); pushStr(obj2);
  xref.push(offset); pushStr(obj3);
  xref.push(offset); pushStr(obj4Head); pushBytes(rgbBytes); pushStr(obj4Tail);
  xref.push(offset); pushStr(obj5);

  const xrefStart = offset;
  let xrefTable = `xref${EOL}0 ${xref.length + 1}${EOL}0000000000 65535 f ${EOL}`;
  for (const off of xref) {
    xrefTable += `${off.toString().padStart(10, '0')} 00000 n ${EOL}`;
  }

  const trailer =
    `trailer${EOL}<< /Size ${xref.length + 1} /Root 1 0 R >>${EOL}` +
    `startxref${EOL}${xrefStart}${EOL}%%EOF`;

  return new Blob([...chunks, xrefTable, trailer] as BlobPart[], { type: 'application/pdf' });
}

async function pngDataUrlToRgb(dataUrl: string, widthPx: number, heightPx: number) {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  img.src = dataUrl;
  await loaded;
  if (typeof img.decode === 'function') {
    await img.decode();
  }

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create 2D canvas context.');
  ctx.drawImage(img, 0, 0, widthPx, heightPx);

  const rgba = ctx.getImageData(0, 0, widthPx, heightPx).data;
  const rgb = new Uint8Array(widthPx * heightPx * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
  }
  return rgb;
}

export async function exportRasterPdf(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  dpi: ExportDpi;
  filename: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, dpi, filename, prepareClone } = opts;
  const prepared = svgEl.cloneNode(true) as SVGSVGElement;
  prepareClone?.(prepared);

  const { dataUrl, widthPx, heightPx } = await rasterizeSvgToPng({ svgEl: prepared, pageWmm, pageHmm, dpi });
  const rgbBytes = await pngDataUrlToRgb(dataUrl, widthPx, heightPx);
  const pdf = makeSimplePdfFromRgb({
    rgbBytes,
    widthPx,
    heightPx,
    pageWpt: pageWmm * MM_TO_PT,
    pageHpt: pageHmm * MM_TO_PT,
  });
  downloadBlob(pdf, filename);
}

export async function printRasterToScale(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  dpi: ExportDpi;
  title?: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, dpi, title = 'Print', prepareClone } = opts;

  const prepared = svgEl.cloneNode(true) as SVGSVGElement;
  prepareClone?.(prepared);

  const { dataUrl } = await rasterizeSvgToPng({
    svgEl: prepared,
    pageWmm,
    pageHmm,
    dpi,
  });

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
