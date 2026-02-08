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
        {guideSet.ticks?.map((tick, idx) => (
          <g key={`tick-${idx}`}>
            <line
              x1={tick.a.x}
              y1={tick.a.y}
              x2={tick.b.x}
              y2={tick.b.y}
              stroke={gridColors.tick ?? colors.tick}
              strokeWidth={gridThin ?? style.thin}
              vectorEffect="non-scaling-stroke"
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

        {guideSet.hGuides?.map((poly, idx) => {
          const points = poly.map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <g key={`hguide-${idx}`}>
              <polyline
                points={points}
                fill="none"
                stroke={gridColors.tick ?? colors.tick}
                strokeWidth={gridThin ?? style.thin}
                vectorEffect="non-scaling-stroke"
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
      </g>

      {guideSet.hGuides?.map((poly, idx) => {
        const points = poly.map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={`hguide-${idx}`}>
            <polyline
              points={points}
              fill="none"
              stroke={gridColors.tick ?? colors.tick}
              strokeWidth={gridThin ?? style.thin}
              vectorEffect="non-scaling-stroke"
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
