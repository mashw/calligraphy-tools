export const EXPORT_TARGET_DPI = 600;
export const EXPORT_MAX_DIM_PX = 9000;
export const MM_TO_PT = 72 / 25.4;

export function computeRasterSize(
  pageWmm: number,
  pageHmm: number,
  opts: { targetDpi?: number; maxDimPx?: number } = {}
): { wPx: number; hPx: number; pxPerMM: number; scale: number } {
  const targetDpi = opts.targetDpi ?? EXPORT_TARGET_DPI;
  const maxDimPx = opts.maxDimPx ?? EXPORT_MAX_DIM_PX;

  const basePxPerMM = targetDpi / 25.4;
  let wPx = Math.max(1, Math.round(pageWmm * basePxPerMM));
  let hPx = Math.max(1, Math.round(pageHmm * basePxPerMM));

  const largest = Math.max(wPx, hPx);
  const scale = largest > maxDimPx ? maxDimPx / largest : 1;

  wPx = Math.max(1, Math.round(wPx * scale));
  hPx = Math.max(1, Math.round(hPx * scale));

  return { wPx, hPx, pxPerMM: basePxPerMM * scale, scale };
}

export function cloneSvgForRaster(
  sourceSvg: SVGSVGElement,
  pageWmm: number,
  pageHmm: number,
  wPx: number,
  hPx: number,
  bakeStrokes?: (source: SVGSVGElement, clone: SVGSVGElement, pageWmm: number) => void,
  stripNoExport?: (clone: SVGSVGElement) => void
): SVGSVGElement {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', `${wPx}`);
  clone.setAttribute('height', `${hPx}`);

  bakeStrokes?.(sourceSvg, clone, pageWmm);
  stripNoExport?.(clone);
  return clone;
}

async function waitForImageReady(img: HTMLImageElement): Promise<void> {
  const waitForLoad = () =>
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load rasterized SVG image.'));
    });

  if (typeof img.decode === 'function') {
    try { await img.decode(); return; } catch {}
  }

  await waitForLoad();
}

export async function renderSvgCloneToCanvas(clone: SVGSVGElement, wPx: number, hPx: number): Promise<HTMLCanvasElement> {
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.src = url;
    await waitForImageReady(img);

    const canvas = document.createElement('canvas');
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context for raster export.');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, wPx, hPx);
    ctx.drawImage(img, 0, 0, wPx, hPx);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

function toPlainUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

export async function deflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Lossless PDF export requires CompressionStream support in this browser.');
  }

  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  await writer.write(toPlainUint8Array(bytes));
  await writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(compressed);
}

export function makeSimplePdfFromFlateRgb(
  rgbBytesCompressed: Uint8Array,
  pageWpt: number,
  pageHpt: number,
  imgW: number,
  imgH: number
): Blob {
  const EOL = '\n';
  const header = '%PDF-1.4' + EOL;
  const obj1 = `1 0 obj${EOL}<< /Type /Catalog /Pages 2 0 R >>${EOL}endobj${EOL}`;
  const obj2 = `2 0 obj${EOL}<< /Type /Pages /Count 1 /Kids [3 0 R] >>${EOL}endobj${EOL}`;
  const obj3 =
    `3 0 obj${EOL}<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>${EOL}endobj${EOL}`;
  const contentStream = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im0 Do Q`;
  const obj5 = `5 0 obj${EOL}<< /Length ${contentStream.length} >>${EOL}stream${EOL}${contentStream}${EOL}endstream${EOL}endobj${EOL}`;
  const obj4Head =
    `4 0 obj${EOL}<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Filter /FlateDecode /Width ${imgW} /Height ${imgH} /Length ${rgbBytesCompressed.byteLength} >>${EOL}stream${EOL}`;
  const obj4Tail = `${EOL}endstream${EOL}endobj${EOL}`;

  const chunks: BlobPart[] = [header];
  const xref: number[] = [];
  let offset = header.length;
  const pushStr = (s: string) => { chunks.push(s); offset += s.length; };
  const pushBytes = (b: Uint8Array) => {
    const plain = toPlainUint8Array(b);
    chunks.push(plain);
    offset += plain.byteLength;
  };

  xref.push(offset); pushStr(obj1);
  xref.push(offset); pushStr(obj2);
  xref.push(offset); pushStr(obj3);
  xref.push(offset); pushStr(obj4Head); pushBytes(rgbBytesCompressed); pushStr(obj4Tail);
  xref.push(offset); pushStr(obj5);

  const xrefStart = offset;
  let xrefTable = `xref${EOL}0 6${EOL}0000000000 65535 f ${EOL}`;
  for (const off of xref) xrefTable += `${String(off).padStart(10, '0')} 00000 n ${EOL}`;
  const trailer = `trailer${EOL}<< /Size 6 /Root 1 0 R >>${EOL}startxref${EOL}${xrefStart}${EOL}%%EOF`;
  chunks.push(xrefTable, trailer);
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function canvasToCompressedRgb(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context for PDF export.');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    rgb[j++] = data[i];
    rgb[j++] = data[i + 1];
    rgb[j++] = data[i + 2];
  }
  return deflateBytes(rgb);
}

export async function rasterizeSvgToLosslessPdf(
  sourceSvg: SVGSVGElement,
  pageWmm: number,
  pageHmm: number,
  bakeStrokes?: (source: SVGSVGElement, clone: SVGSVGElement, pageWmm: number) => void,
  stripNoExport?: (clone: SVGSVGElement) => void,
  opts: { targetDpi?: number; maxDimPx?: number } = {}
): Promise<Blob> {
  const { wPx, hPx } = computeRasterSize(pageWmm, pageHmm, opts);
  const clone = cloneSvgForRaster(sourceSvg, pageWmm, pageHmm, wPx, hPx, bakeStrokes, stripNoExport);
  const canvas = await renderSvgCloneToCanvas(clone, wPx, hPx);
  const compressedRgb = await canvasToCompressedRgb(canvas);
  return makeSimplePdfFromFlateRgb(compressedRgb, pageWmm * MM_TO_PT, pageHmm * MM_TO_PT, wPx, hPx);
}

export async function printSvgRasterToScale(
  sourceSvg: SVGSVGElement,
  pageWmm: number,
  pageHmm: number,
  bakeStrokes?: (source: SVGSVGElement, clone: SVGSVGElement, pageWmm: number) => void,
  stripNoExport?: (clone: SVGSVGElement) => void,
  opts: { targetDpi?: number; maxDimPx?: number } = {}
): Promise<void> {
  const { wPx, hPx } = computeRasterSize(pageWmm, pageHmm, opts);
  const clone = cloneSvgForRaster(sourceSvg, pageWmm, pageHmm, wPx, hPx, bakeStrokes, stripNoExport);
  const canvas = await renderSvgCloneToCanvas(clone, wPx, hPx);
  const dataUrl = canvasToPngDataUrl(canvas);

  const win = window.open('', '_blank');
  if (!win) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
@page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; width: 100%; height: 100%; }
img { display: block; width: ${pageWmm}mm; height: ${pageHmm}mm; }
</style>
</head><body><img src="${dataUrl}" alt="print export"/>
<script>window.onload=()=>{ window.print(); setTimeout(()=>window.close(), 250); };</script>
</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
