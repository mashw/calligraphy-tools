export const saxonMarginBraid = { id: 'saxon-margin-braid', name: 'Three-strap margin braid' } as const;

// The approved page proof is 780 by 1103 units. Extend the three paths
// 12 units past each trim edge so their ends disappear when printed.
export const marginBraidHeight = 1127;
const inks = ['Woad', 'Oxblood', 'Ochre'];
export const marginBraidStrands = inks.map((name, i) => {
  const at = (t: number) => {
    const a = t + 2 * Math.PI * i / 3, c = Math.cos(a);
    return { x: 111 + 43 * c - 21 * Math.max(0, -c) ** 2,
      y: t * 295 / (2 * Math.PI) + 13 * Math.sin(2 * a) - 11 * Math.sin(a) };
  };
  // y increases along each strap. Locate exact page-bleed endpoints.
  function parameter(y: number) {
    let low = -2, high = 30;
    for (let j = 0; j < 42; j++) {
      const mid = (low + high) / 2;
      if (at(mid).y < y) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }
  const start = parameter(-12), end = parameter(1115);
  return { id: 'margin-' + i, name: name + ' strap',
    points: Array.from({length: 801}, (_, j) => at(start + (end - start) * j / 800)) };
});
