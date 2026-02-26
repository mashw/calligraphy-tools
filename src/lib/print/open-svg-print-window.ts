export type PrintSvgOpts = {
  pageWmm: number;
  pageHmm: number;
  title?: string;
  autoClose?: boolean;
  autoPrint?: boolean;
};

const normalizeNum = (v: string) => Number.parseFloat(v.trim());

const hasMatchingViewBox = (viewBox: string | null, pageWmm: number, pageHmm: number) => {
  if (!viewBox) return false;
  const parts = viewBox.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) return false;
  const [minX, minY, w, h] = parts.map(normalizeNum);
  if ([minX, minY, w, h].some(Number.isNaN)) return false;
  const eps = 1e-6;
  return Math.abs(minX) <= eps && Math.abs(minY) <= eps && Math.abs(w - pageWmm) <= eps && Math.abs(h - pageHmm) <= eps;
};

export function openSvgPrintWindow(svg: SVGSVGElement, opts: PrintSvgOpts): void {
  const {
    pageWmm,
    pageHmm,
    title = 'Print',
    autoClose = false,
    autoPrint = false,
  } = opts;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!hasMatchingViewBox(clone.getAttribute('viewBox'), pageWmm, pageHmm)) {
    clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  }
  clone.setAttribute('width', `${pageWmm}mm`);
  clone.setAttribute('height', `${pageHmm}mm`);

  const inlineStyle = clone.getAttribute('style');
  if (inlineStyle) {
    const nextStyle = inlineStyle
      .replace(/(?:^|;)\s*transform\s*:[^;]*/gi, '')
      .replace(/(?:^|;)\s*zoom\s*:[^;]*/gi, '')
      .replace(/^;|;$/g, '')
      .trim();
    if (nextStyle) {
      clone.setAttribute('style', nextStyle);
    } else {
      clone.removeAttribute('style');
    }
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    svg {
      display: block;
      width: ${pageWmm}mm;
      height: ${pageHmm}mm;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  </style>
</head>
<body>
  ${clone.outerHTML}
  ${autoPrint ? `<script>window.onload=()=>{window.print();${autoClose ? 'setTimeout(()=>window.close(),250);' : ''}}</script>` : ''}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
