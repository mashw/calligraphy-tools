const DEFAULT_TARGET_DPI = 600;
const DEFAULT_MAX_DIM_PX = 9000;
const DEFAULT_JPEG_QUALITY = 0.92;

export function mmToPt(mm: number): number {
  return mm * (72 / 25.4);
}

export function computeRasterPxPerMM(
  pageWmm: number,
  pageHmm: number,
  opts: { targetDpi?: number; maxDimPx?: number } = {}
): { pxPerMM: number; scale: number; wPx: number; hPx: number } {
  const targetDpi = opts.targetDpi ?? DEFAULT_TARGET_DPI;
  const maxDimPx = opts.maxDimPx ?? DEFAULT_MAX_DIM_PX;

  const basePxPerMM = targetDpi / 25.4;
  let wPx = Math.max(1, Math.round(pageWmm * basePxPerMM));
  let hPx = Math.max(1, Math.round(pageHmm * basePxPerMM));

  const maxDim = Math.max(wPx, hPx);
  const scale = maxDim > maxDimPx ? maxDimPx / maxDim : 1;

  wPx = Math.max(1, Math.round(wPx * scale));
  hPx = Math.max(1, Math.round(hPx * scale));

  return {
    pxPerMM: basePxPerMM * scale,
    scale,
    wPx,
    hPx,
  };
}

export function cloneSvgForRasterExport(
  svg: SVGSVGElement,
  pageWmm: number,
  pageHmm: number,
  wPx: number,
  hPx: number,
  bakeStrokes: (source: SVGSVGElement, clone: SVGSVGElement, pageWmm: number) => void,
  stripNoExport: (clone: SVGSVGElement) => void
): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', String(wPx));
  clone.setAttribute('height', String(hPx));

  bakeStrokes(svg, clone, pageWmm);
  stripNoExport(clone);

  return clone;
}

/**
 * Bake non-scaling SVG strokes into page user units before export.
 *
 * Preview strokes are expressed in CSS pixels. Once vector-effect is removed,
 * those values must be converted to the root page's millimetre coordinate
 * system or they would instead be interpreted as millimetres by the export.
 */
export function bakeExportStrokes(source: SVGSVGElement, clone: SVGSVGElement, pageWmm: number): void {
  const rect = source.getBoundingClientRect();
  if (!rect.width) return;
  const pxPerMM = rect.width / pageWmm;
  const sourceElements = Array.from(source.querySelectorAll<SVGElement>('*'));
  const cloneElements = Array.from(clone.querySelectorAll<SVGElement>('*'));

  sourceElements.forEach((element, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;
    const style = window.getComputedStyle(element);
    if (element.getAttribute('vector-effect') !== 'non-scaling-stroke' && style.vectorEffect !== 'non-scaling-stroke') return;
    const strokeWidthPx = Number.parseFloat(style.strokeWidth || '0');
    const hasStroke = (style.stroke && style.stroke !== 'none') || strokeWidthPx > 0;
    if (!hasStroke) {
      cloneElement.removeAttribute('vector-effect');
      return;
    }

    if (style.stroke && style.stroke !== 'none') cloneElement.setAttribute('stroke', style.stroke);
    if (!Number.isNaN(strokeWidthPx)) cloneElement.setAttribute('stroke-width', String(strokeWidthPx / pxPerMM));

    const dashArray = style.strokeDasharray;
    if (dashArray && dashArray !== 'none') {
      cloneElement.setAttribute('stroke-dasharray', dashArray
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(entry => {
          const value = Number.parseFloat(entry);
          return Number.isNaN(value) ? entry : String(value / pxPerMM);
        })
        .join(' '));
    } else if (dashArray === 'none') {
      cloneElement.removeAttribute('stroke-dasharray');
    }

    if (style.strokeLinecap) cloneElement.setAttribute('stroke-linecap', style.strokeLinecap);
    if (style.strokeLinejoin) cloneElement.setAttribute('stroke-linejoin', style.strokeLinejoin);
    if (style.strokeMiterlimit) cloneElement.setAttribute('stroke-miterlimit', style.strokeMiterlimit);
    if (style.strokeOpacity) cloneElement.setAttribute('stroke-opacity', style.strokeOpacity);
    cloneElement.removeAttribute('vector-effect');
  });
}

async function waitForImageReady(img: HTMLImageElement): Promise<void> {
  const waitForLoad = () =>
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load rasterized SVG image.'));
    });

  if (typeof img.decode === 'function') {
    try {
      await img.decode();
      return;
    } catch {
      // Fallback to onload for browsers where decode fails.
    }
  }

  await waitForLoad();
}

export async function renderSvgCloneToJpegDataUrl(clone: SVGSVGElement, wPx: number, hPx: number): Promise<string> {
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

    return canvas.toDataURL('image/jpeg', DEFAULT_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printJpegDataUrlToScale(dataUrl: string, pageWmm: number, pageHmm: number): void {
  const win = window.open('', '_blank');
  if (!win) return;

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page{size:${pageWmm}mm ${pageHmm}mm;margin:0}
  html,body{margin:0;height:100%;background:#fff}
  img{width:${pageWmm}mm;height:${pageHmm}mm;display:block}
</style>
</head><body><img src="${dataUrl}" alt="print export"/>
<script>
  window.onload=()=>{ window.print(); setTimeout(()=>window.close(), 250); };
</script></body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function jpegDataUrlToPdf(dataUrl: string, pageWmm: number, pageHmm: number, imgW: number, imgH: number): Blob {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
  const w = mmToPt(pageWmm);
  const h = mmToPt(pageHmm);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (value: string | Uint8Array) => { const part = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(part); length += part.length; };
  push('%PDF-1.4\n');
  const object = (id: number, body: string | Uint8Array, suffix = '') => {
    offsets[id] = length; push(`${id} 0 obj\n`); push(body); push(`${suffix}\nendobj\n`);
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, '\nendstream');
  // Insert the JPEG before the stream terminator while keeping the object offsets exact.
  chunks.splice(chunks.length - 1, 0, bytes); length += bytes.length;
  const stream = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  object(5, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const result = new Uint8Array(length); let cursor = 0;
  chunks.forEach(chunk => { result.set(chunk, cursor); cursor += chunk.length; });
  return new Blob([result], { type: 'application/pdf' });
}
