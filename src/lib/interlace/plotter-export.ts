import { buildPlotterGeometryExport, type CricutMatId } from '../layout/plotter-export';
import { pageSize } from '../woven/design';
import { renderSheet, topology, warnings, type Sheet } from './model';

export type InterlacePlotterOptions = {
  slants: boolean;
  secondarySlants: boolean;
  grid: boolean;
  construction: boolean;
  ruler: boolean;
};
export const DEFAULT_INTERLACE_PLOTTER_OPTIONS: InterlacePlotterOptions = {
  slants: true, secondarySlants: true, grid: true, construction: true, ruler: false,
};
export function buildInterlacePlotterExport(sheet: Sheet, mat: CricutMatId, options = DEFAULT_INTERLACE_PLOTTER_OPTIONS) {
  const full = {...sheet, strands: sheet.strands.map(s => ({
    ...s, design: {...s.design, secondSlant: s.design.secondSlant && options.secondarySlants},
  }))};
  const graph = topology(full);
  const scene = renderSheet(full, graph, {ruler: options.ruler});
  const lines = scene.strokes.filter(s =>
    s.role === 'slant' ? options.slants :
    s.role === 'grid' ? options.grid :
    s.role === 'construction' ? options.construction : true
  ).map(s => ({points: s.points, source: 'interlace-guide'}));
  const page = pageSize(sheet);
  return buildPlotterGeometryExport([{elementId:'interlace',name:'Interlace writing guides',lines}],
    {width:page.w,height:page.h}, mat, 'combined', warnings(full,graph));
}
