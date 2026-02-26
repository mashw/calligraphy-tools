export type PrintSvgOpts = {
  pageWmm: number;
  pageHmm: number;
  title?: string;
  autoClose?: boolean;
  autoPrint?: boolean;
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
  clone.setAttribute('viewBox', `0 0 ${pageWmm} ${pageHmm}`);
  clone.setAttribute('width', `${pageWmm}mm`);
  clone.setAttribute('height', `${pageHmm}mm`);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }
    html, body {
      margin: 0;
      background: #fff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    svg {
      width: ${pageWmm}mm;
      height: ${pageHmm}mm;
      display: block;
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
