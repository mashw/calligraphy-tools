import { test, expect } from '@playwright/test';
import { captureExportFiles, exportedText } from './export-file';

test('Woven custom dimensions, paired controls and proportional scale survive Save/Open', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await captureExportFiles(page);
  await page.goto('/woven');
  const inspector=page.locator('.editor-inspector');
  const width=inspector.getByRole('spinbutton',{name:/^Width/});
  const height=inspector.getByRole('spinbutton',{name:/^Height/});
  const scale=inspector.getByRole('spinbutton',{name:/^Scale/});
  await width.fill('120.5'); await width.press('Tab');
  await height.fill('180.75'); await height.press('Tab');
  await expect(scale).toHaveValue('100');
  await scale.fill('150'); await scale.press('Tab');
  await expect(width).toHaveValue('180.75');
  await expect(height).toHaveValue('271.125');
  await width.fill('140');await width.press('Tab');
  await expect(scale).toHaveValue('100');
  await scale.fill('110');await scale.press('Tab');
  await expect(width).toHaveValue('154');
  await expect(height).toHaveValue('298.2375');
  const loop=inspector.getByRole('spinbutton',{name:'Loop depth',exact:true});
  await loop.fill('0.337');await loop.press('Tab');await expect(loop).toHaveValue('0.337');
  const rotation=inspector.getByRole('spinbutton',{name:/^Rotation/});
  await rotation.fill('12.25');await rotation.press('Tab');await expect(rotation).toHaveValue('12.25');
  await width.fill('');await width.press('Tab');await expect(width).toHaveValue('154');
  const download=page.waitForEvent('download');
  await inspector.getByRole('button',{name:'Save design',exact:true}).click();
  const file=await download;
  expect(file.suggestedFilename()).toBe('woven-design.json');
  const source=Buffer.from(await exportedText(page, 'application/json')),design=JSON.parse(source.toString());
  expect(design.width).toBe(154);expect(design.height).toBeCloseTo(298.2375,6);expect(design.loop).toBe(0.337);
  await width.fill('200');await width.press('Tab');
  await inspector.locator('input[type=file]').setInputFiles({name:'density-test.json',mimeType:'application/json',buffer:source});
  await expect(width).toHaveValue('154');await expect(height).toHaveValue('298.2375');await expect(scale).toHaveValue('100');
  await inspector.getByRole('slider',{name:'Width slider',exact:true}).focus();
  await inspector.getByRole('slider',{name:'Width slider',exact:true}).press('ArrowRight');
  await expect(width).not.toHaveValue('154');
});

for (const width of [390, 1024]) {
test(`Layout alignment and quick size keep compact rows at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:768});await page.goto('/layout');
  await page.getByRole('button',{name:'+ Shape',exact:true}).click();
  const alignment=page.getByRole('group',{name:'Alignment',exact:true});
  await expect(alignment.getByRole('button')).toHaveCount(6);
  const rows=await alignment.getByRole('button').evaluateAll(buttons=>new Set(buttons.map(b=>Math.round(b.getBoundingClientRect().top))).size);
  expect(rows).toBeLessThanOrEqual(2);
  await alignment.getByRole('button',{name:'Align left',exact:true}).click();
  const sizes=page.getByRole('group',{name:'Quick size',exact:true});
  await expect(sizes.getByRole('button')).toHaveCount(4);
  const sizeRows=await sizes.getByRole('button').evaluateAll(buttons=>new Set(buttons.map(b=>Math.round(b.getBoundingClientRect().top))).size);
  expect(sizeRows).toBe(2);
  await page.getByRole('button',{name:'Hide settings',exact:true}).click();
  await expect(page.locator('.editor-settings')).toBeHidden();
  await page.getByRole('button',{name:'Show settings',exact:true}).click();
  await expect(page.locator('.editor-settings')).toBeVisible();
});
}

test('Line Planner retains accessible sections without the extra card shell',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/align');
  await expect(page.locator('.editor-inspector .rounded-2xl')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Document & Script',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Document & Script',exact:true}).click();
  await expect(page.getByRole('button',{name:'Text & Placement',exact:true})).toBeVisible();
  await expect(page.locator('.workspace-switch')).toHaveCount(0);
  await page.getByRole('button',{name:'Hide settings',exact:true}).click();
  await expect(page.locator('#tool-inspector')).toBeHidden();
  await page.getByRole('button',{name:'Show settings',exact:true}).click();
  await expect(page.locator('#tool-inspector')).toBeVisible();
});
