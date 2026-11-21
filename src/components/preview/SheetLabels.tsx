import { useId } from 'react';
import { pathD } from '@/lib/curve-helpers';
import { guideTagColour, sheetLabelColour, sheetLabelFont, type SheetTag } from '@/lib/guides/sheet-labels';

export function SheetLabels({ tags }: { tags: (SheetTag | null)[] }) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return <g pointerEvents="none" fill={sheetLabelColour} fontFamily={sheetLabelFont}>
    {tags.map((tag, index) => {
      if (!tag) return null;
      const id = `guide-label-${prefix}-${index}`;
      return tag.path ? <g key={index}>
        <defs><path id={id} d={pathD(tag.path)} /></defs>
        <text data-guide-label="tag" fontSize={tag.size} textAnchor="middle" fill={guideTagColour(tag.colour)}>
          <textPath href={`#${id}`} startOffset="50%">{tag.text}</textPath>
        </text>
      </g> : <text key={index} data-guide-label="tag" fontSize={tag.size} textAnchor="middle" fill={guideTagColour(tag.colour)}
        transform={`translate(${tag.point.x} ${tag.point.y}) rotate(${tag.angle ?? 0})`}>{tag.text}</text>;
    })}
  </g>;
}

export function SheetHeader({ text, x, y, width, size = 3 }: { text: string; x: number; y: number; width: number; size?: number }) {
  return <text data-guide-label="header" pointerEvents="none" x={x} y={y} fontSize={size}
    fill={sheetLabelColour} fontFamily={sheetLabelFont}
    textLength={text.length * size * .59 > width ? Math.max(1, width) : undefined}
    lengthAdjust="spacingAndGlyphs">{text}</text>;
}
