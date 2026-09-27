import type { SVGProps } from 'react';
import { PAGE_BACKGROUND, shapePathData, type ShapeKind } from '@/lib/layout/shape';
import type { Frame, ShapeElement } from '@/lib/layout/types';

type GeometryProps = SVGProps<SVGElement> & { kind: ShapeKind; width: number; height: number; inset?: number; cornerRadiusMM?: number };

export function ShapeGeometry({ kind, width, height, inset = 0, cornerRadiusMM = 0, ...paint }: GeometryProps) {
  const innerWidth = Math.max(0, width - inset * 2), innerHeight = Math.max(0, height - inset * 2);
  return <g transform={`translate(${inset} ${inset})`}><path d={shapePathData(kind,innerWidth,innerHeight,cornerRadiusMM)} {...paint as SVGProps<SVGPathElement>} /></g>;
}

export default function ShapeElementRenderer({ element, frame, selected }: { element: ShapeElement; frame: Frame; selected: boolean }) {
  const { settings } = element;
  const hasFill = settings.appearance === 'fill' || settings.appearance === 'fillAndBorder';
  const hasBorder = settings.appearance === 'border' || settings.appearance === 'fillAndBorder';
  const borderWidth = hasBorder ? Math.max(0, settings.borderWidthMM) : 0;
  const geometry = { kind: settings.kind, width: frame.width, height: frame.height, cornerRadiusMM: settings.cornerRadiusMM };
  const padding = Math.max(0, element.paddingMM);
  const knockoutFilterId = `shape-knockout-${element.id}`;
  const extent = padding + borderWidth / 2 + 1;

  return <g transform={`translate(${frame.x} ${frame.y})`}>
    <defs><filter id={knockoutFilterId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={-extent} y={-extent} width={frame.width+extent*2} height={frame.height+extent*2} colorInterpolationFilters="sRGB"><feMorphology in="SourceGraphic" operator="dilate" radius={padding} /></filter></defs>
    <ShapeGeometry {...geometry} fill={PAGE_BACKGROUND} stroke={hasBorder ? PAGE_BACKGROUND : 'none'} strokeWidth={borderWidth} strokeLinejoin="round" strokeLinecap="round" filter={padding > 0 ? `url(#${knockoutFilterId})` : undefined} />
    <g data-no-export="true" pointerEvents="none">
      {selected && padding > 0 && <><ShapeGeometry {...geometry} fill="#818cf8" fillOpacity=".14" stroke={hasBorder ? '#818cf8' : 'none'} strokeWidth={borderWidth} filter={`url(#${knockoutFilterId})`} /><ShapeGeometry {...geometry} fill={PAGE_BACKGROUND} stroke={hasBorder ? PAGE_BACKGROUND : 'none'} strokeWidth={borderWidth} /></>}
    </g>
    {settings.appearance !== 'reserve' && <ShapeGeometry {...geometry} fill={hasFill ? settings.fillColor : 'none'} stroke={hasBorder ? settings.borderColor : 'none'} strokeWidth={borderWidth} />}
    <g data-no-export="true" pointerEvents="none">
      {settings.appearance === 'reserve' && <ShapeGeometry {...geometry} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
    </g>
  </g>;
}
