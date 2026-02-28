declare module 'svg2pdf.js' {
  import type { jsPDF } from 'jspdf';

  export function svg2pdf(
    element: SVGElement,
    pdf: jsPDF,
    options?: {
      xOffset?: number;
      yOffset?: number;
      scale?: number;
    }
  ): Promise<void>;
}
