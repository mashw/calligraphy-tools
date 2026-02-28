export const EXPORT_PX_PER_MM = 12;
export const JPEG_QUALITY = 0.85;

export function applyExportOnlyGridTweaks(svg: SVGSVGElement): void {
  const gridNodes = new Set<SVGElement>();

  svg.querySelectorAll<SVGElement>('[data-export-role="grid"]').forEach((node) => {
    gridNodes.add(node);
  });
  svg.querySelectorAll<SVGElement>('[stroke-dasharray]').forEach((node) => {
    gridNodes.add(node);
  });

  gridNodes.forEach((node) => {
    node.setAttribute('stroke-linecap', 'butt');
    node.setAttribute('shape-rendering', 'crispEdges');
  });
}
