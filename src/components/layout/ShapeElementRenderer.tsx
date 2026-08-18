import { PAGE_BACKGROUND } from '@/lib/layout/shape';
import type { Frame, ShapeElement } from '@/lib/layout/types';

export default function ShapeElementRenderer({ element, frame }: { element: ShapeElement; frame: Frame }) {
  const { settings } = element;
  const hasFill = settings.appearance === 'fill' || settings.appearance === 'fillAndBorder';
  const hasBorder = settings.appearance === 'border' || settings.appearance === 'fillAndBorder';
  const borderWidth = hasBorder ? Math.max(0, settings.borderWidthMM) : 0;
  const strokeInset = Math.min(borderWidth / 2, frame.width / 2, frame.height / 2);
  const artworkBox = { x: strokeInset, y: strokeInset, width: Math.max(0, frame.width - strokeInset * 2), height: Math.max(0, frame.height - strokeInset * 2) };
  const artwork = { fill: hasFill ? settings.fillColor : 'none', stroke: hasBorder ? settings.borderColor : 'none', strokeWidth: borderWidth };
  const ellipse = settings.kind === 'ellipse' || settings.kind === 'circle';
  const radius = settings.kind === 'roundedRectangle' ? Math.min(Math.max(0, settings.cornerRadiusMM), artworkBox.width / 2, artworkBox.height / 2) : 0;

  return <g transform={`translate(${frame.x} ${frame.y})`}>
    {ellipse
      ? <ellipse cx={artworkBox.x + artworkBox.width / 2} cy={artworkBox.y + artworkBox.height / 2} rx={artworkBox.width / 2} ry={artworkBox.height / 2} {...artwork} />
      : <rect x={artworkBox.x} y={artworkBox.y} width={artworkBox.width} height={artworkBox.height} rx={radius} ry={radius} {...artwork} />}
    {settings.appearance === 'reserve' && <rect data-no-export="true" width={frame.width} height={frame.height} fill={PAGE_BACKGROUND} fillOpacity=".28" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
  </g>;
}
