import { test, expect } from '@playwright/test';
import { captureExportFiles, exportedText } from './export-file';

const design = { version:1, preset:'rosette', width:165, height:165, loop:.32, rotation:0, reverse:false, script:'TexturaQuadrata', nib:.7, xNib:5, ascNib:2, descNib:2, start:3, gap:8, clearance:.6, fullGuides:true, annotated:true, overrides:{} };

for (const width of [390, 1440]) {
  test(`Woven sliders stay fixed while warnings appear and clear at ${width}px`, async ({page}) => {
    test.setTimeout(120_000);
    await page.setViewportSize({width,height:900});
    await page.goto('/woven');
    const status = page.getByRole('status', {name:'Design status'});
    await expect(status).toHaveAttribute('aria-live', 'polite');
    const statusBounds = await status.boundingBox();
    for (const name of ['Width','Height','Scale','Loop depth']) {
      await page.locator('input[type=file]').setInputFiles({name:'drag.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(design))});
      const slider = page.getByRole('slider',{name:`${name} slider`,exact:true});
      await slider.scrollIntoViewIfNeeded();
      const box = (await slider.boundingBox())!;
      const warningStates = new Set<string>();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        for (const fraction of [0,.33,1,.33,0,.33,1,.33]) {
          // Account for the native range thumb radius; keep the pointer held down.
          await page.mouse.move(box.x + 8 + (box.width - 16) * fraction, box.y + box.height / 2, {steps:4});
          await page.evaluate(() => new Promise(requestAnimationFrame));
          expect(await slider.boundingBox(), `${name} moved during drag`).toEqual(box);
          expect(await status.boundingBox(), 'Status area changed height').toEqual(statusBounds);
          warningStates.add(await status.locator('.text-amber-900').allTextContents().then(items=>items.join('\n')));
        }
      } finally { await page.mouse.up(); }
      expect(warningStates.has(''), `${name}: warnings never cleared`).toBe(true);
      expect([...warningStates].some(Boolean), `${name}: warnings never appeared`).toBe(true);
    }
  });

  test(`Copperplate fixed unit survives switching and legacy Save/Open at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await captureExportFiles(page);
    await page.goto('/woven');
    await page.getByRole('combobox',{name:'Script',exact:true}).selectOption('Copperplate');
    await expect(page.getByRole('spinbutton',{name:/Guide unit|Nib width/})).toHaveCount(0);
    await expect(page.getByText('Copperplate uses a fixed 1 mm unit', {exact:false})).toBeVisible();
    await page.getByRole('spinbutton',{name:/^X-height/}).fill('5.5');
    await page.getByRole('spinbutton',{name:/^Ascender above waist/}).fill('4.5');
    await page.getByRole('spinbutton',{name:/^Descender below base/}).fill('3.5');
    await page.getByRole('button',{name:'Save design',exact:true}).click();
    const saved = JSON.parse(await exportedText(page,'application/json'));
    expect(saved.nib).toBe(1);
    expect([saved.xNib,saved.ascNib,saved.descNib]).toEqual([5.5,4.5,3.5]);
    await page.locator('input[type=file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,nib:2.5}))});
    await expect(page.getByRole('spinbutton',{name:/^X-height/})).toHaveValue('5.5');
    await page.getByRole('button',{name:'Save design',exact:true}).click();
    expect(JSON.parse(await exportedText(page,'application/json')).nib).toBe(1);
    await page.getByRole('combobox',{name:'Script',exact:true}).selectOption('TexturaQuadrata');
    await expect(page.getByRole('spinbutton',{name:/^Nib width/})).toBeVisible();
  });

  test(`Shared tool help opens without moving controls at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    for (const route of ['align','curve','calligram','guidelines','path-guides','knot','borders/dev']) {
      await page.goto(`/${route}`);
      const help=page.getByRole('button',{name:'About this tool',exact:true});
      await expect(page.locator('.inspector-heading').getByRole('button',{name:'About this tool'})).toHaveCount(1);
      await expect(page.locator('.editor-inspector > .inspector-intro')).toHaveCount(0);
      const firstSection=page.locator('.editor-inspector .section-card, .editor-inspector section').first();
      const before=await firstSection.boundingBox();
      await help.click();
      const popover=page.getByRole('dialog',{name:'About this tool'});
      await expect(popover).toBeVisible();
      expect(await firstSection.boundingBox()).toEqual(before);
      const box=(await popover.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();
      await help.focus(); await page.keyboard.press('Enter');
      await expect(popover).toBeVisible();
      await popover.getByRole('button',{name:'Close',exact:true}).click();
      await expect(popover).toBeHidden();
    }
  });
}

test('Inspector help supports touch and light dismissal', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:360,height:780},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.goto('/align');
  await page.getByRole('button',{name:'About this tool',exact:true}).tap();
  const popover=page.getByRole('dialog',{name:'About this tool'});
  await expect(popover).toBeVisible();
  await page.locator('.tool-heading').tap();
  await expect(popover).toBeHidden();
  await context.close();
});
