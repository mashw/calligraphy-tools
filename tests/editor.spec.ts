import { test, expect } from '@playwright/test';
const routes = ['guidelines', 'align', 'curve', 'calligram', 'path-guides', 'layout', 'woven', 'knot', 'borders/dev'];
for (const route of routes) {
  test(`${route}: camera and responsive workspace`, async ({ page }) => {
    await page.goto('/' + route);
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const svg = page.locator('svg.editor-svg');
      await expect(svg).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Tool settings' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => page.locator('.editor-inspector').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await expect.poll(() => svg.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(100);
    }
    const svg = page.locator('svg.editor-svg');
    await page.getByRole('button', { name: route === 'align' ? 'Fit lines' : 'Fit page', exact: true }).click();
    const before = await svg.getAttribute('viewBox');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(svg).not.toHaveAttribute('viewBox', before!);
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(svg).toHaveAttribute('viewBox', before!);
    await page.getByRole('button', { name: 'Hide settings', exact: true }).click();
    await expect(page.locator('#tool-inspector')).toBeHidden();
    await page.getByRole('button', { name: 'Show settings', exact: true }).click();
    await expect(page.locator('#tool-inspector')).toBeVisible();
  });
}
test('SVG export preserves physical page after camera navigation', async ({ page }) => {
  await page.goto('/guidelines');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const stream = await file.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  const svg = Buffer.concat(parts).toString();
  expect(svg).toMatch(/width="210mm"/);
  expect(svg).toMatch(/height="297mm"/);
  expect(svg).toMatch(/viewBox="0 0 210 297"/);
  expect(svg).not.toContain('id="stage-bg"');
});
