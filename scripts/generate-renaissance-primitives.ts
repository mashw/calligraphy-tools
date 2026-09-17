import fs from 'node:fs';
import path from 'node:path';
import { parseSvgPath } from '../src/lib/borders/acanthus/renaissance/svg-path.ts';

const root=process.cwd(), source=path.join(root,'src/lib/borders/acanthus/source/renaissance');
const expected={
  'deep-eye':false,'large-lobe-contour':false,'medium-lobe-contour':false,'small-lobe-contour':false,
  'terminal-open':false,'terminal-closed':true,turnover:true,
} as const;
const output:Record<string,unknown>={};
for(const [name,closedExpected] of Object.entries(expected)){
  const svg=fs.readFileSync(path.join(source,`${name}.svg`),'utf8');
  const paths=[...svg.matchAll(/<path\b[^>]*\bd=(['"])([\s\S]*?)\1/g)].map(match=>match[2]);
  if(paths.length!==1) throw new Error(`${name}.svg: expected exactly one path, found ${paths.length}.`);
  if(/<(?!\/?(?:svg|path|\?xml|!--)\b)[a-z][^>]*>/i.test(svg)) throw new Error(`${name}.svg: unsupported non-path geometry.`);
  const parsed=parseSvgPath(paths[0]);
  if(parsed.closed!==closedExpected) throw new Error(`${name}.svg: expected ${closedExpected?'closed':'open'} topology.`);
  const viewBox=svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
  if(!viewBox || viewBox.length!==4 || viewBox.some(n=>!Number.isFinite(n))) throw new Error(`${name}.svg: invalid viewBox.`);
  output[name]={name,viewBox,sourceD:paths[0],...parsed};
  console.log(`validated ${name}.svg: 1 ${parsed.closed?'closed':'open'} path, ${parsed.segments.length} cubic segments`);
}
const target=path.join(root,'src/lib/borders/acanthus/renaissance/generated-primitives.ts');
fs.writeFileSync(target,`// Generated from source/renaissance/*.svg by scripts/generate-renaissance-primitives.ts.\n// Do not hand edit; the committed SVG artwork is canonical.\nimport type { SourcePrimitive } from './types';\nexport const renaissancePrimitives = ${JSON.stringify(output,null,2)} as const satisfies Record<string, SourcePrimitive>;\n`);
console.log(`wrote ${path.relative(root,target)}`);
