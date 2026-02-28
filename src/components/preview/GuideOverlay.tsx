import React, { useId } from 'react';

import { pathD } from '@/lib/curve-helpers';
import type { GuideSet } from '@/lib/guides/guide-template';

type GuideOverlayProps = {
  box?: { w: number; h: number };
  guideSet: GuideSet;
  style: {
    thin: number;
    bold: number;
    colors?: {
      thin?: string;
      bold?: string;
      asc?: string;
      waist?: string;
      base?: string;
      desc?: string;
      accent?: string;
      tick?: string;
      frame?: string;
    };
    grid?: {
      thin: number;
      showHorizontal?: boolean;
      showVertical?: boolean;
      showNibAngleGuide?: boolean;
      nibAngleDeg?: number;
      colors?: {
        tick?: string;
      };
    };
  };
  interactive?: {
    onGuidePointerDown?: (
      e: React.PointerEvent<SVGPathElement | SVGLineElement | SVGPolylineElement>,
    ) => void;
    hitStrokeWidthMM?: number;
  };
};

const defaultColors = {
  thin: '#cbd5e1',
  bold: '#111827',
  accent: '#7c3aed',
  tick: '#e2e8f0',
  frame: '#cbd5e1',
};

export default function GuideOverlay({
  box,
  guideSet,
  style,
  interactive,
}: GuideOverlayProps) {
  const colors = { ...defaultColors, ...style.colors };
  const gridThin = style.grid?.thin;
  const gridColors = style.grid?.colors ?? {};
  const showGridHorizontal = style.grid?.showHorizontal ?? true;
  const showGridVertical = style.grid?.showVertical ?? true;
  const showNibAngleGuide = style.grid?.showNibAngleGuide ?? false;
  const nibAngleDeg = style.grid?.nibAngleDeg ?? 0;
  const hitStrokeWidth =
    interactive?.hitStrokeWidthMM ?? Math.max(8, style.bold * 8);

  const guidePaths = [
    { key: 'asc', pts: guideSet.ascLine, stroke: colors.asc ?? colors.thin, width: style.thin },
    { key: 'waist', pts: guideSet.waistLine, stroke: colors.waist ?? colors.bold, width: style.bold },
    { key: 'base', pts: guideSet.baseLine, stroke: colors.base ?? colors.bold, width: style.bold },
    { key: 'desc', pts: guideSet.descLine, stroke: colors.desc ?? colors.thin, width: style.thin },
  ];

  const bandClipId = useId();

  const bandClipD = (() => {
    const asc = guideSet.ascLine;
    const desc = guideSet.descLine;
    if (!asc?.length || !desc?.length) return '';

    const a = asc.map(p => `${p.x},${p.y}`).join(' L ');
    const d = [...desc].reverse().map(p => `${p.x},${p.y}`).join(' L ');
    return `M ${a} L ${d} Z`;
  })();

  const markerData = (() => {
    if (!showNibAngleGuide) return null;
    if (!guideSet.hGuides?.length || !guideSet.ascLine?.length || !guideSet.waistLine?.length) return null;
    const topY = guideSet.ascLine[0].y;
    const waistY = guideSet.waistLine[0].y;
    const minY = Math.min(topY, waistY);
    const maxY = Math.max(topY, waistY);
    const candidates = guideSet.hGuides
      .map(poly => poly[0]?.y)
      .filter((y): y is number => typeof y === 'number' && y > minY && y < maxY)
      .sort((a, b) => Math.abs(a - topY) - Math.abs(b - topY));
    if (!candidates.length) return null;
    const firstAscY = candidates[0];
    const size = 0.5 * Math.abs(topY - firstAscY);
    if (size <= 0) return null;
    const x = guideSet.ascLine[0].x;
    return { x, y: topY, size };
  })();

  return (
    <g>
      {bandClipD && (
        <defs>
          <clipPath id={bandClipId} clipPathUnits="userSpaceOnUse">
            <path d={bandClipD} />
          </clipPath>
        </defs>
      )}

      {box && (
        <rect
          x={0}
          y={0}
          width={box.w}
          height={box.h}
          fill="none"
          stroke={colors.frame}
          strokeWidth={style.thin}
          vectorEffect="non-scaling-stroke"
        />
      )}

      <g clipPath={bandClipD ? `url(#${bandClipId})` : undefined}>
        {showGridVertical && guideSet.ticks?.map((tick, idx) => (
          <g key={`tick-${idx}`}>
            <line
              x1={tick.a.x}
              y1={tick.a.y}
              x2={tick.b.x}
              y2={tick.b.y}
              stroke={gridColors.tick ?? colors.tick}
              strokeWidth={gridThin ?? style.thin}
              vectorEffect="non-scaling-stroke"
              data-export-role="grid"
            />
            {interactive?.onGuidePointerDown && (
              <line
                x1={tick.a.x}
                y1={tick.a.y}
                x2={tick.b.x}
                y2={tick.b.y}
                stroke="rgba(0,0,0,0)"
                strokeWidth={hitStrokeWidth}
                vectorEffect="non-scaling-stroke"
                pointerEvents="stroke"
                className="cursor-move"
                onPointerDown={interactive.onGuidePointerDown}
              />
            )}
          </g>
        ))}

        {showGridHorizontal && guideSet.hGuides?.map((poly, idx) => {
          const points = poly.map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <g key={`hguide-${idx}`}>
              <polyline
                points={points}
                fill="none"
                stroke={gridColors.tick ?? colors.tick}
                strokeWidth={gridThin ?? style.thin}
                vectorEffect="non-scaling-stroke"
                data-export-role="grid"
              />
              {interactive?.onGuidePointerDown && (
                <polyline
                  points={points}
                  fill="none"
                  stroke="rgba(0,0,0,0)"
                  strokeWidth={hitStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  className="cursor-move"
                  onPointerDown={interactive.onGuidePointerDown}
                />
              )}
            </g>
          );
        })}

        {markerData && (() => {
          const { x, y, size } = markerData;
          const theta = (nibAngleDeg * Math.PI) / 180;
          const chipH = size * 3;
          const chipW = chipH / Math.tan(theta);
          const chipWClamped = Math.min(chipW, chipH * 6);
          const points = `${x},${y} ${x + chipWClamped},${y} ${x},${y + chipH}`;
          return (
            <polygon
              points={points}
              fill="#000"
            />
          );
        })()}
      </g>

      {guidePaths.map(({ key, pts, stroke, width }) => (
        <path
          key={key}
          d={pathD(pts)}
          stroke={stroke}
          strokeWidth={width}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {interactive?.onGuidePointerDown &&
        guidePaths.map(({ key, pts }) => (
          <path
            key={`${key}-hit`}
            d={pathD(pts)}
            stroke="rgba(0,0,0,0)"
            strokeWidth={hitStrokeWidth}
            fill="none"
            vectorEffect="non-scaling-stroke"
            pointerEvents="stroke"
            className="cursor-move"
            onPointerDown={interactive.onGuidePointerDown}
          />
        ))}
    </g>
  );
}
