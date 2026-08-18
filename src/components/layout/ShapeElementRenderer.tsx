import type { SVGProps } from 'react';
import { PAGE_BACKGROUND, shapePolygonPoints, type ShapeKind } from '@/lib/layout/shape';
import type { Frame, ShapeElement } from '@/lib/layout/types';

type GeometryProps = SVGProps<SVGElement> & { kind: ShapeKind; width: number; height: number; inset?: number; cornerRadiusMM?: number };

export function ShapeGeometry({ kind, width, height, inset = 0, cornerRadiusMM = 0, ...paint }: GeometryProps) {
  const innerWidth = Math.max(0, width - inset * 2), innerHeight = Math.max(0, height - inset * 2);
  const rounded = kind === 'roundedRectangle' || kind === 'roundedSquare';
  const radius = rounded ? Math.min(Math.max(0, cornerRadiusMM), innerWidth / 2, innerHeight / 2) : 0;
  const ellipse = kind === 'ellipse' || kind === 'circle';
  const polygon = shapePolygonPoints(kind, innerWidth, innerHeight);
  return <g transform={`translate(${inset} ${inset})`}>
    {ellipse ? <ellipse cx={innerWidth/2} cy={innerHeight/2} rx={innerWidth/2} ry={innerHeight/2} {...paint as SVGProps<SVGEllipseElement>} />
      : polygon ? <polygon points={polygon} {...paint as SVGProps<SVGPolygonElement>} />
      : <rect width={innerWidth} height={innerHeight} rx={radius} ry={radius} {...paint as SVGProps<SVGRectElement>} />}
  </g>;
}

export default function ShapeElementRenderer({ element, frame, selected }: { element: ShapeElement; frame: Frame; selected: boolean }) {
  const { settings } = element;
  const hasFill = settings.appearance === 'fill' || settings.appearance === 'fillAndBorder';
  const hasBorder = settings.appearance === 'border' || settings.appearance === 'fillAndBorder';
  const borderWidth = hasBorder ? Math.max(0, settings.borderWidthMM) : 0;
  const strokeInset = Math.min(borderWidth / 2, frame.width / 2, frame.height / 2);
  const geometry = { kind: settings.kind, width: frame.width, height: frame.height, cornerRadiusMM: settings.cornerRadiusMM };
  const roundedClearance = !['rectangle','square','roundedRectangle','roundedSquare'].includes(settings.kind);

  return <g transform={`translate(${frame.x} ${frame.y})`}>
    <ShapeGeometry {...geometry} fill={PAGE_BACKGROUND} stroke={PAGE_BACKGROUND} strokeWidth={Math.max(0, element.paddingMM) * 2} strokeLinejoin={roundedClearance ? 'round' : 'miter'} strokeLinecap="round" />
    {settings.appearance !== 'reserve' && <ShapeGeometry {...geometry} inset={strokeInset} fill={hasFill ? settings.fillColor : 'none'} stroke={hasBorder ? settings.borderColor : 'none'} strokeWidth={borderWidth} />}
    <g data-no-export="true" pointerEvents="none">
      {selected && element.paddingMM > 0 && <ShapeGeometry {...geometry} fill="none" stroke="#818cf8" strokeWidth={element.paddingMM * 2} strokeDasharray="4 3" strokeOpacity=".22" strokeLinejoin="round" strokeLinecap="round" />}
      {settings.appearance === 'reserve' && <ShapeGeometry {...geometry} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
    </g>
  </g>;
}
