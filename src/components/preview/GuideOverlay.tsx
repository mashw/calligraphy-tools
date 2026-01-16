import React from 'react';

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
      accent?: string;
      tick?: string;
      frame?: string;
    };
  };
  interactive?: {
    onGuidePointerDown?: (
      e: React.PointerEvent<SVGPathElement | SVGLineElement>,
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
  const hitStrokeWidth = interactive?.hitStrokeWidthMM ?? Math.max(8, style.bold * 8);

  const guidePaths = [
    { key: 'asc', pts: guideSet.ascLine, stroke: colors.thin, width: style.thin },
    { key: 'waist', pts: guideSet.waistLine, stroke: colors.bold, width: style.bold },
    { key: 'base', pts: guideSet.baseLine, stroke: colors.bold, width: style.bold },
    { key: 'desc', pts: guideSet.descLine, stroke: colors.thin, width: style.thin },
  ];

  return (
    <g>
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
            pointerEvents="stroke"
            className="cursor-move"
            onPointerDown={interactive.onGuidePointerDown}
          />
        ))}

      {guideSet.ticks?.map((tick, idx) => (
        <g key={`tick-${idx}`}>
          <line
            x1={tick.a.x}
            y1={tick.a.y}
            x2={tick.b.x}
            y2={tick.b.y}
            stroke={colors.tick}
            strokeWidth={style.thin}
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
    </g>
  );
}
