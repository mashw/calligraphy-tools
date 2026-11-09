import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function downloaded(page:Page, label:string) {
  const waiting=page.waitForEvent('download');
  await page.getByRole('button',{name:label,exact:true}).click();
  const path=await (await waiting).path();
  return readFile(path!,'utf8');
}
async function upload(page:Page,name:string,content:string) {
  await page.locator('input[type=file]').setInputFiles({name,mimeType:name.endsWith('.json')?'application/json':'image/svg+xml',buffer:Buffer.from(content)});
}
test('mixed sheet retains full vector export across camera, Simplify and Save/Open',async({page})=>{
  await page.goto('/interlace');
  await upload(page,'curve.svg','<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="40mm" viewBox="0 0 150 40"><path id="curve" d="M0 10 Q70 50 150 10"/></svg>');
  await expect(page.getByRole('status')).toContainText('SVG paths added');
  await page.getByRole('button',{name:'Crossings',exact:true}).click();
  const markers=page.locator('svg[aria-label="Interlace writing sheet"] g[data-camera-interactive]');
  expect(await markers.count()).toBeGreaterThan(6);
  await markers.first().click();
  const saved=await downloaded(page,'Save'), doc=JSON.parse(saved);
  expect(doc.strands).toHaveLength(2);expect(doc.overrides).toHaveLength(1);
  const svg=await downloaded(page,'SVG');
  await page.getByRole('button',{name:'Simplify',exact:true}).click();
  expect(await downloaded(page,'SVG')).toEqual(svg);
  await page.getByRole('button',{name:'Fit content',exact:true}).click();
  expect(await downloaded(page,'Cricut Draw')).toEqual(svg);
  await upload(page,'composition.json',saved);
  await expect(page.getByRole('status')).toContainText('Composition opened');
  expect(await downloaded(page,'SVG')).toEqual(svg);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('svg[aria-label="Interlace writing sheet"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
test('imports original Woven and multi-strap Path Guides downloads',async({page})=>{
  await page.goto('/woven');
  await page.getByRole('button',{name:'Swap crossing 1',exact:true}).click();
  const woven=await downloaded(page,'Save design');
  await page.goto('/interlace');await upload(page,'woven.json',woven);
  await expect(page.getByRole('status')).toContainText('Imported Woven');
  expect(JSON.parse(await downloaded(page,'Save')).overrides).toHaveLength(1);
  await page.goto('/path-guides');
  const menu=page.locator('select').filter({has:page.locator('option[value="woven-double-circle"]')});
  await menu.selectOption('woven-double-circle');
  const preset=await downloaded(page,'Export preset JSON (dev)');
  await page.goto('/interlace');await upload(page,'preset.json',preset);
  await expect(page.getByRole('status')).toContainText('Imported paths');
  expect(JSON.parse(await downloaded(page,'Save')).strands).toHaveLength(2);
  await page.goto('/layout');await expect(page.getByRole('heading',{name:'Layout Editor',exact:true}).first()).toBeVisible();
});
