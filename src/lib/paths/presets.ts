export function circlePathD(r = 40) {
  return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
}

export const SHAPE_OPTIONS = [
  { kind: 'circle', label: 'Circle' },
  { kind: 'rounded-square', label: 'Rounded square' },
  { kind: 'rounded-right-angle', label: 'Rounded right angle' },
  { kind: 'hard-right-angle', label: 'Hard right angle' },
  { kind: 'hard-square', label: 'Hard square' },
  { kind: 'curved-arch', label: 'Curved arch' },
  { kind: 'horseshoe', label: 'Horseshoe' },
  { kind: 'shallow-s-curve', label: 'Shallow S curve' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'kite', label: 'Kite' },
  { kind: 'hard-zigzag', label: 'Hard zigzag' },
  { kind: 'curved-zigzag', label: 'Curved zigzag' },
  { kind: 'rectangle', label: 'Rectangle' },
] as const;

export type ShapeKind = typeof SHAPE_OPTIONS[number]['kind'];

export const shapePathD = (kind: ShapeKind): string => {
  switch (kind) {
    case 'circle': return circlePathD(45);
    case 'rounded-square': return 'M -45 -30 Q -45 -45 -30 -45 L 30 -45 Q 45 -45 45 -30 L 45 30 Q 45 45 30 45 L -30 45 Q -45 45 -45 30 Z';
    case 'rounded-right-angle': return 'M -40 -35 L -40 35 Q -40 45 -30 45 L 20 45 Q 35 45 35 30 L 35 20 L 15 20 L 15 25 Q 15 30 10 30 L -20 30 Q -25 30 -25 25 L -25 -35 Z';
    case 'hard-right-angle': return 'M -40 -35 L -40 40 L 10 40 L 10 15 L 35 15 L 35 -35 Z';
    case 'hard-square': return 'M -45 -45 L 45 -45 L 45 45 L -45 45 Z';
    case 'curved-arch': return 'M -50 35 Q 0 -45 50 35';
    case 'horseshoe': return 'M -38 -40 L -38 15 Q 0 55 38 15 L 38 -40';
    case 'shallow-s-curve': return 'M -48 -20 C -18 -50 18 10 48 -20 C 18 10 -18 50 -48 20';
    case 'diamond': return 'M 0 -50 L 45 0 L 0 50 L -45 0 Z';
    case 'kite': return 'M 0 -55 L 32 0 L 0 50 L -32 0 Z';
    case 'hard-zigzag': return 'M -50 25 L -25 -25 L 0 25 L 25 -25 L 50 25';
    case 'curved-zigzag': return 'M -50 20 Q -38 -22 -25 20 Q -12 55 0 20 Q 12 -22 25 20 Q 38 55 50 20';
    case 'rectangle': return 'M -60 -30 L 60 -30 L 60 30 L -60 30 Z';
    default: return circlePathD(45);
  }
};

