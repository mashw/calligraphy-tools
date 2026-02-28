import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

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

export function applyExportOnlyGridTweaks(svg: SVGSVGElement): void {
  svg
    .querySelectorAll<SVGElement>('[data-export-role="grid"], [stroke-dasharray]')
    .forEach((el) => {
      el.setAttribute('stroke-linecap', 'butt');
      el.setAttribute('shape-rendering', 'crispEdges');
    });
}

export async function exportVectorPdf(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  filename: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, filename, prepareClone } = opts;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', `${pageWmm}mm`);
  clone.setAttribute('height', `${pageHmm}mm`);

  prepareClone?.(clone);
  applyExportOnlyGridTweaks(clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.left = '-99999px';
  tempContainer.style.top = '0';
  tempContainer.style.visibility = 'hidden';
  tempContainer.innerHTML = xml;
  document.body.appendChild(tempContainer);

  try {
    const svgNode = tempContainer.querySelector('svg') as SVGSVGElement | null;
    if (!svgNode) return;

    const doc = new jsPDF({
      unit: 'mm',
      format: [pageWmm, pageHmm],
      orientation: pageWmm > pageHmm ? 'landscape' : 'portrait',
    });

    await svg2pdf(svgNode, doc, { xOffset: 0, yOffset: 0, scale: 1 });
    const blob = doc.output('blob');
    downloadBlob(blob, filename);
  } finally {
    document.body.removeChild(tempContainer);
  }
}

export async function printVectorToScale(opts: {
  svgEl: SVGSVGElement;
  pageWmm: number;
  pageHmm: number;
  title?: string;
  prepareClone?: (clone: SVGSVGElement) => void;
}): Promise<void> {
  const { svgEl, pageWmm, pageHmm, title, prepareClone } = opts;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', `${pageWmm}mm`);
  clone.setAttribute('height', `${pageHmm}mm`);

  prepareClone?.(clone);
  applyExportOnlyGridTweaks(clone);

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title ?? 'print'}</title>
<style>
  @page{size:${pageWmm}mm ${pageHmm}mm;margin:0}
  html,body{height:100%;margin:0;background:#fff}
  body{display:flex;align-items:center;justify-content:center}
  svg{width:${pageWmm}mm;height:${pageHmm}mm;display:block}
</style>
</head><body>${clone.outerHTML}<script>
  window.onload=()=>{ window.print(); setTimeout(()=>window.close(), 250); }
</script></body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
