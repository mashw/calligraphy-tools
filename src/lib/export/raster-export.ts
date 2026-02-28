export function mmToPt(mm: number): number {
  return mm * (72 / 25.4);
}

export function computeRasterPxPerMM(
  pageWmm: number,
  pageHmm: number,
  opts: { targetDpi?: number; maxDimPx?: number } = {}
): { pxPerMM: number; scale: number; wPx: number; hPx: number } {
  const targetDpi = opts.targetDpi ?? 900;
  const maxDimPx = opts.maxDimPx ?? 12000;

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

    return canvas.toDataURL('image/jpeg', 1.0);
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
