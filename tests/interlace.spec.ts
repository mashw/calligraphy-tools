import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function downloaded(page:Page, label:string) {
  const waiting=page.waitForEvent('download');
  await page.getByRole('button',{name:label,exact:true}).click();
  if(label==='Cricut Draw') await page.getByRole('button',{name:'Export Cricut SVG',exact:true}).click();
  const path=await (await waiting).path();
  return readFile(path!,'utf8');
}
async function upload(page:Page,name:string,content:string) {
  await page.locator('input[type=file]').setInputFiles({name,mimeType:name.endsWith('.json')?'application/json':'image/svg+xml',buffer:Buffer.from(content)});
}
test('mixed sheet retains full vector export across camera, Simplify and Save/Open',async({page})=>{
  await page.goto('/interlace');
  await upload(page,'curve.svg','<svg xmlns="http://www.w3.org/2000/svg" width="198mm" height="40mm" viewBox="0 0 198 40"><path id="curve" d="M0 10 Q99 50 198 10"/></svg>');
  await expect(page.locator('[role=status]')).toContainText('SVG paths added');
  const path=page.locator('path[aria-label="curve"]');
  const at=await path.evaluate(node=>{
    const p=node as SVGPathElement, loc=p.getPointAtLength(p.getTotalLength()*.5).matrixTransform(p.getScreenCTM()!);
    return {x:loc.x,y:loc.y};
  });
  await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.move(at.x+8,at.y+8,{steps:4});
  await expect(page.locator('[data-woven-detail]')).toHaveCount(0);
  await page.mouse.up();await expect(page.locator('[data-woven-detail]')).toBeVisible();
  await page.getByRole('button',{name:'Crossings',exact:true}).click();
  const markers=page.locator('svg[aria-label="Interlace writing sheet"] g[data-camera-interactive]');
  expect(await markers.count()).toBeGreaterThan(6);
  await page.locator('[data-crossing-kind=self]').first().click();
  await page.locator('[data-crossing-kind=between]').first().click();
  const saved=await downloaded(page,'Save'), doc=JSON.parse(saved);
  expect(doc.strands).toHaveLength(2);expect(doc.overrides).toHaveLength(2);
  const svg=await downloaded(page,'SVG');
  const cricut=await downloaded(page,'Cricut Draw');
  await page.getByRole('button',{name:'Simplify',exact:true}).click();
  expect(await downloaded(page,'SVG')).toEqual(svg);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.keyboard.down('Alt');await page.mouse.move(at.x,at.y);await page.mouse.down();
  await page.mouse.move(at.x+20,at.y+12);await page.mouse.up();await page.keyboard.up('Alt');
  expect(await downloaded(page,'Cricut Draw')).toEqual(cricut);
  await upload(page,'composition.json',saved);
  await expect(page.locator('[role=status]')).toContainText('Composition opened');
  expect(await downloaded(page,'SVG')).toEqual(svg);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('svg[aria-label="Interlace writing sheet"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
test('imports original Woven and multi-strap Path Guides downloads',async({page})=>{
  await page.goto('/woven');
  await page.locator('button[aria-label="Swap crossing 1"]').click();
  const woven=await downloaded(page,'Save design');
  await page.goto('/interlace');await upload(page,'woven.json',woven);
  await expect(page.locator('[role=status]')).toContainText('Imported Woven');
  expect(JSON.parse(await downloaded(page,'Save')).overrides).toHaveLength(1);
  await page.goto('/path-guides');
  const menu=page.locator('select').filter({has:page.locator('option[value="woven-double-circle"]')});
  const panel=page.getByRole('button',{name:'Page & straps',exact:true});
  if(await panel.getAttribute('aria-expanded')==='false')await panel.click();
  await menu.selectOption('fraktur-scurve-weave-2');
  const preset=await downloaded(page,'Export preset JSON (dev)');
  await page.goto('/interlace');await upload(page,'preset.json',preset);
  await expect(page.locator('[role=status]')).toContainText('Imported paths');
  const imported=JSON.parse(await downloaded(page,'Save'));
  expect(imported.strands).toHaveLength(2);expect(imported.overrides).toHaveLength(2);
  await page.goto('/layout');await expect(page.getByRole('heading',{name:'Layout Editor',exact:true}).first()).toBeVisible();
});

test('joined Copperplate is continuous in the workspace and retains underpass cuts in Cricut output',async({page})=>{
  await page.goto('/interlace');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/interlace-join.json');
  await expect(page.locator('[role=status]')).toContainText('Composition opened');
  await page.getByRole('button',{name:'Fit content',exact:true}).click();
  await page.getByRole('button',{name:'Joins',exact:true}).click();
  const join=page.getByRole('button',{name:'Copperplate left → Copperplate right',exact:true});
  await expect(join).toHaveAttribute('aria-pressed','true');
  const preview=page.locator('[data-woven-detail] path');
  const paths=await preview.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));
  const xml=await downloaded(page,'Cricut Draw');
  const plotted=await page.evaluate(str=>Array.from(new DOMParser().parseFromString(str,'image/svg+xml').querySelectorAll('path'),p=>p.getAttribute('d')),xml);
  const expected=await page.evaluate(()=>Array.from(document.querySelectorAll('[data-woven-detail] path')).slice(0,-7).map(n=>n.getAttribute('d')));
  const points=(values:(string|null)[])=>values.join(' ').match(/-?\\d+(?:\\.\\d+)?/g)?.map(Number);
  // Plotter output combines subpaths and adds its registration anchor.
  const coordinates=points(plotted)!;
  const guideCoordinates=points(expected)!;
  expect(coordinates.length-6).toBe(guideCoordinates.length);
  coordinates.slice(6).forEach((value,i)=>expect(Math.abs(value-guideCoordinates[i])).toBeLessThanOrEqual(.0006));
  expect(xml).toContain('fill="none"');
  expect(xml).not.toMatch(/<mask|clipPath|<image|data-camera/);
  expect(paths.length).toBe(expected.length+7);
  const snapshot=await downloaded(page,'SVG');
  await join.click();await expect(join).toHaveAttribute('aria-pressed','false');
  expect(await downloaded(page,'SVG')).not.toBe(snapshot);
  await join.click();expect(await downloaded(page,'SVG')).toBe(snapshot);
});
