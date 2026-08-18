export type ElementType = 'page' | 'guidelines' | 'calligram' | 'curved-title' | 'shape';

export type Frame = { x: number; y: number; width: number; height: number };

export type LayoutElement = {
  id: string;
  type: ElementType;
  name: string;
  frame: Frame;
  locked: boolean;
};

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const PAGE = { width: 210, height: 297 } as const;

export const pageElement = (): LayoutElement => ({
  id: 'page', type: 'page', name: 'Page', locked: true,
  frame: { x: 0, y: 0, width: PAGE.width, height: PAGE.height },
});

const labels: Record<Exclude<ElementType, 'page'>, string> = {
  guidelines: 'Guidelines', calligram: 'Calligram', 'curved-title': 'Curved title', shape: 'Shape',
};

export function newElement(type: Exclude<ElementType, 'page'>, count: number): LayoutElement {
  const proportional = type === 'calligram' || type === 'curved-title';
  const size = proportional ? 65 : 72;
  return {
    id: `${type}-${crypto.randomUUID()}`,
    type,
    name: `${labels[type]} ${count}`,
    locked: false,
    frame: { x: 30 + (count % 5) * 5, y: 35 + (count % 5) * 5, width: size, height: proportional ? size : 50 },
  };
}

export function isProportional(element: LayoutElement) {
  return element.type === 'calligram' || element.type === 'curved-title';
}
