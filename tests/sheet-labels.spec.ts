import { expect, test } from '@playwright/test';
import { captureExportFiles, exportedText } from './export-file';

test('Guidelines header follows the script and is included in SVG only when enabled', async ({ page }) => {
  await captureExportFiles(page);
  await page.goto('/guidelines');
  await page.getByRole('button', { name: 'Guide appearance', exact: true }).click();
  const header = page.locator('[data-guide-label="header"]');
  const toggle = page.getByRole('switch', { name: 'Show sheet header' });
  await expect(header).toContainText(/Copperplate.*mm x-height/);
  await page.getByRole('combobox', { name: 'Script', exact: true }).selectOption('Fraktur');
  await expect(header).toContainText(/Fraktur.*mm nib.*\d+(?:\.\d+)? nibs x-height/);
  await expect(header).not.toContainText('mm x-height');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = await exportedText(page, 'image/svg+xml');
  expect(svg).toContain('data-guide-label="header"');
  expect(svg).toContain('nibs x-height');
  await toggle.press('Space');
  await expect(header).toHaveCount(0);
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  expect(await exportedText(page, 'image/svg+xml')).not.toContain('data-guide-label');
});

test('Calligram labels identify all enabled circles and flow along the main ring', async ({ page }) => {
  await captureExportFiles(page);
  await page.goto('/calligram');
  await page.getByRole('button', { name: 'Additional circles', exact: true }).click();
  await page.getByRole('switch', { name: 'Inner circle' }).press('Space');
  await page.getByRole('switch', { name: 'Outer circle' }).press('Space');
  await page.getByRole('button', { name: 'Preview options', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Show guide tags' });
  const tags = page.locator('[data-guide-label="tag"]');
  await expect(tags).toHaveCount(0);
  await toggle.press('Space');
  await expect(tags).toHaveCount(3);
  await expect(tags.filter({ hasText: /^Main/ }).locator('textPath')).toHaveCount(1);
  await expect(tags.filter({ hasText: /^Inner/ })).toContainText('mm');
  await expect(tags.filter({ hasText: /^Outer/ })).toContainText('mm');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  expect(await exportedText(page, 'image/svg+xml')).toContain('<textPath');
  await page.getByRole('switch', { name: 'Inner circle' }).press('Space');
  await expect(tags.filter({ hasText: /^Inner/ })).toHaveCount(0);
});

test('Layout guide tags move with their layer', async ({ page }) => {
  await page.goto('/layout');
  await page.getByText('Add element', { exact: true }).click();
  await page.getByRole('button', { name: 'Guidelines', exact: true }).click();
  await page.getByRole('button', { name: 'Guide tags', exact: true }).click();
  await page.getByRole('switch', { name: 'Show guide tags' }).press('Space');
  const header = page.locator('[data-layout-id] [data-guide-label="header"]');
  await expect(header).toBeVisible();
  const x = await header.getAttribute('x');
  await page.getByRole('spinbutton', { name: /^x\s*mm$/i }).fill('35');
  await expect(header).not.toHaveAttribute('x', x!);
});

test('Interlace tags export and stay attached to editable Layout artwork', async ({ page }) => {
  await captureExportFiles(page);
  await page.goto('/interlace');
  await page.getByRole('switch', { name: 'Show guide tags' }).press('Space');
  const tags = page.locator('[data-guide-label="tag"]');
  await expect(tags.first()).toBeVisible();
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  expect(await exportedText(page, 'image/svg+xml')).toContain('data-guide-label="tag"');
  await page.getByRole('button', { name: 'Export for Layout', exact: true }).click();
  const artwork = await exportedText(page, 'image/svg+xml');
  await page.goto('/layout');
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({
    name: 'tagged-interlace.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(artwork),
  });
  await expect(tags.first()).toBeVisible();
  await page.getByRole('button', { name: 'Guide tags', exact: true }).click();
  await page.getByRole('switch', { name: 'Show guide tags' }).press('Space');
  await expect(tags).toHaveCount(0);
});
