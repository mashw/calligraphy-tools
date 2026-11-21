import { expect, test } from '@playwright/test';

test('Line Planner presents text and measurements before optional settings', async ({ page }) => {
  await page.goto('/align');
  const inspector = page.getByRole('complementary', { name: 'Tool settings' });
  const preview = inspector.getByRole('button', { name: 'Preview options', exact: true });
  await preview.click();
  await expect(inspector.getByRole('switch', { name: 'Show letter bounding boxes' })).toBeVisible();
  await expect(inspector.locator('[data-settings-section]').first()).toHaveAttribute('data-settings-section', 'Text & Placement');
  await inspector.getByRole('textbox', { name: 'Text lines' }).fill('A new line');
  await expect(inspector.getByRole('cell', { name: 'A new line' })).toBeVisible();
  await expect(inspector.getByRole('columnheader', { name: /Start from (centre|right edge)/ })).toBeVisible();
});

test('Border Lab shows controls for the selected study', async ({ page }) => {
  await page.goto('/borders/dev');
  const preview = page.getByRole('button', { name: 'Preview options', exact: true });
  await preview.click();
  await expect(page.getByRole('switch', { name: 'Show construction' })).toBeVisible();
  const study = page.getByLabel('Growth spine');
  const shading = page.getByRole('switch', { name: 'Line shading' });
  await expect(shading).toHaveCount(0);
  await study.selectOption({ label: 'Single leaf study' });
  await expect(shading).toBeVisible();
  await shading.press('Space');
  await expect(page.getByRole('combobox', { name: 'Shading density' })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Pitch/ })).toHaveCount(0);
  await study.selectOption({ label: 'Straight open line' });
  await expect(page.getByRole('slider', { name: /Pitch/ })).toBeVisible();
});
