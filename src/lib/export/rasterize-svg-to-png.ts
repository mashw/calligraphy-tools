export type ExportDpi = 300 | 600 | 1200;

const mmToPx = (mm: number, dpi: ExportDpi) => Math.round((mm * dpi) / 25.4);

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL.'));
  reader.readAsDataURL(blob);
});

export async function rasterizeSvgToPng(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  dpi: ExportDpi;
  background?: string;
}): Promise<{ blob: Blob; widthPx: number; heightPx: number; dataUrl: string }> {
  const { svgEl, pageWmm, pageHmm, dpi, background = '#fff' } = opts;
  const widthPx = mmToPx(pageWmm, dpi);
  const heightPx = mmToPx(pageHmm, dpi);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', String(widthPx));
  clone.setAttribute('height', String(heightPx));

  clone
    .querySelectorAll<SVGElement>('[data-export-role="grid"], [stroke-dasharray]')
    .forEach((el) => {
      el.setAttribute('stroke-linecap', 'butt');
      el.setAttribute('shape-rendering', 'crispEdges');
    });

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = new Image();
    const loadPromise = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    img.src = svgUrl;
    await loadPromise;
    if (typeof img.decode === 'function') {
      await img.decode();
    }

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create 2D canvas context.');

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => {
        if (!output) {
          reject(new Error('Failed to convert canvas to PNG blob.'));
          return;
        }
        resolve(output);
      }, 'image/png');
    });

    return {
      blob,
      widthPx,
      heightPx,
      dataUrl: await blobToDataUrl(blob),
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
