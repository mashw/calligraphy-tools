import { expect, test } from '@playwright/test';

test('guidelines show only applicable construction and grid settings', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/guidelines');
  const dimensions = page.getByRole('button', { name: 'Script & Dimensions', exact: true });
  await dimensions.click();
  await expect(dimensions).toHaveAttribute('aria-expanded', 'false');
  await dimensions.click();
  const script = page.getByRole('combobox', { name: 'Script', exact: true });
  const construction = page.getByRole('button', { name: 'Construction guides', exact: true });
  await script.selectOption('InsularMajuscule');
  await expect(construction).toHaveCount(0);
  await script.selectOption('Fraktur');
  await expect(construction).toHaveAttribute('aria-expanded', 'false');
  await construction.click();
  const downstroke = page.getByRole('switch', { name: 'Downstroke start guide', exact: true });
  const appearance = page.getByLabel('Downstroke start guide appearance');
  await expect(appearance).toHaveCount(0);
  await downstroke.focus();
  await page.keyboard.press('Space');
  await appearance.selectOption('dots');
  await expect(page.getByLabel(/Dot every/)).toBeVisible();
  await downstroke.press('Space');
  await expect(appearance).toHaveCount(0);
  await downstroke.press('Space');
  await expect(appearance).toHaveValue('dots');
  await script.selectOption('InsularMajuscule');
  await page.getByRole('button', { name: 'Existing construction guides', exact: true }).click();
  await expect(page.getByLabel('Upper quadrant start guide appearance')).toHaveValue('dots');
  await page.getByRole('switch', { name: 'Upper quadrant start guide', exact: true }).press('Space');
  await expect(page.getByRole('button', { name: 'Existing construction guides', exact: true })).toHaveCount(0);

  const horizontal = page.getByRole('switch', { name: 'Horizontal grid lines' });
  const vertical = page.getByRole('switch', { name: 'Vertical grid lines' });
  for (const control of [horizontal, vertical]) {
    if (await control.isChecked()) await control.press('Space');
  }
  const contrast = page.getByRole('slider', { name: 'Grid contrast' });
  await expect(contrast).toHaveCount(0);
  await horizontal.press('Space');
  await expect(contrast).toBeVisible();
  const navigation = page.getByRole('group', { name: 'Preview navigation' });
  await expect(navigation.getByRole('button', { name: 'Top', exact: true })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Reset view' })).toHaveCount(0);
  await expect.poll(() => page.locator('.editor-inspector').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

for (const [route, section, label] of [
  ['calligram', 'Additional circles', 'Inner circle'],
  ['curve', 'Additional bands', 'Top band'],
] as const) {
  test(`${route} reveals mixed-script band settings without crowding narrow panes`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/' + route);
    await page.getByRole('button', { name: section, exact: true }).click();
    const options = page.locator(`[data-settings-section="${section}"]`);
    const enabled = options.getByRole('switch', { name: label });
    const bandScript = options.getByRole('combobox', { name: 'Script', exact: true });
    const construction = page.getByRole('button', { name: 'Construction guides', exact: true });
    await expect(enabled).toBeVisible();
    await page.getByRole('combobox', { name: 'Script', exact: true }).selectOption('Copperplate');
    await expect(construction).toHaveCount(0);
    await expect(bandScript).toHaveCount(0);
    await enabled.press('Space');
    await bandScript.selectOption('Fraktur');
    await expect(construction).toBeVisible();
    if (route === 'calligram') await expect(options.getByRole('slider', { name: /Inner radius/ })).toBeVisible();
    await expect.poll(() => page.locator('.editor-inspector').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await enabled.press('Space');
    await expect(bandScript).toHaveCount(0);
    await expect(construction).toHaveCount(0);
    await enabled.press('Space');
    await expect(bandScript).toHaveValue('Fraktur');
  });
}
