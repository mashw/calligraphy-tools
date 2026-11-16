import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function download(page:Page,name:string){const wait=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();if(name==='Cricut Draw')await page.getByRole('button',{name:'Export Cricut SVG',exact:true}).click();return readFile((await (await wait).path())!,'utf8');}
async function upload(page:Page,selector:string,name:string,content:string){await page.locator(selector).first().setInputFiles({name,mimeType:name.endsWith('.svg')?'image/svg+xml':'application/json',buffer:Buffer.from(content)});}
const json='input[accept=".json"]',svgInput='input[accept=".svg,image/svg+xml"]';
async function interlaceSourceButton(page: Page) {
  const section = page.getByRole('button', { name: 'Edit in Interlace', exact: true });
  await expect(section).toBeVisible();
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  const button = page.getByRole('button', { name: 'Download Interlace JSON', exact: true });
  await expect(button).toBeVisible();
}

test('editable Interlace SVG survives Layout sizing, transforms, duplication and Save/Open', async ({ page }) => {
  await page.goto('/interlace');
  await page.locator(json).setInputFiles('tests/fixtures/interlace-join.json');
  await expect(page.locator('[role=status]')).toContainText('Composition opened');
  await page.getByRole('button', { name: 'Add strand', exact: true }).last().click();
  await upload(page, 'input[accept=".svg"]', 'imported.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="10mm" viewBox="0 0 40 10"><path d="M0 5Q20 0 40 5"/></svg>');
  await expect(page.locator('[role=status]')).toContainText('SVG paths added');
  await page.getByRole('button', { name: 'Crossings', exact: true }).click();
  await page.locator('[data-crossing-kind]').first().click();
  await page.getByRole('button', { name: 'Text & Fit', exact: true }).click();
  await page.getByLabel('Text to plan').fill('Hi');

  const source = JSON.parse(await download(page, 'Save'));
  expect(source.strands).toHaveLength(5);
  expect(source.joins).toHaveLength(1);
  expect(source.overrides.length).toBeGreaterThan(0);

  const svg = await download(page, 'Export for Layout');
  expect(svg).toContain('<metadata id="calligraphy-tools/interlace-source">');
  expect(svg).not.toMatch(/<rect|data-camera|<mask|<text/);
  const size = /width="([^"]+)mm" height="([^"]+)mm"/.exec(svg)!;
  await page.goto('/layout');
  await upload(page, svgInput, 'editable.svg', svg);
  await interlaceSourceButton(page);
  const art = JSON.parse(await download(page, 'Save')).elements.find((e: { type: string }) => e.type === 'artwork');
  expect(art.frame.width).toBeCloseTo(Number(size[1]), 9);
  expect(art.frame.height).toBeCloseTo(Number(size[2]), 9);
  expect(art.interlaceSource.document.strands).toEqual(source.strands);

  await page.getByLabel(/^x\s*mm$/i).fill('24');
  await page.getByLabel(/^y\s*mm$/i).fill('31');
  await page.getByLabel(/Rotation/).fill('27');
  await page.getByLabel(/^width\s*mm$/i).fill('90');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
  const layout = await download(page, 'Save');
  const arts = JSON.parse(layout).elements.filter((e: { type: string }) => e.type === 'artwork');
  expect(arts).toHaveLength(2);
  expect(arts[1].frame.x).toBe(24);
  expect(arts[1].frame.y).toBeCloseTo(31 + (art.frame.height - arts[1].frame.height) / 2, 9);
  expect(arts[0].frame.x).toBe(29);
  expect(arts[0].frame.y).toBe(arts[1].frame.y + 5);
  for (const artwork of arts) {
    expect(artwork.frame.width).toBe(90);
    expect(artwork.rotationDeg).toBe(27);
    expect(artwork.interlaceSource.document.strands).toEqual(source.strands);
  }

  await page.reload();
  await upload(page, 'input[accept*="calligraphy-layout"]', 'saved.json', layout);
  await expect(page.getByText('Opened saved.json.', { exact: true })).toBeVisible();
  expect(JSON.parse(await download(page, 'Save')).elements).toEqual(JSON.parse(layout).elements);
  await interlaceSourceButton(page);
  const recovered = await download(page, 'Download Interlace JSON');
  expect(JSON.parse(recovered).joins).toEqual(source.joins);
  expect(JSON.parse(recovered).overrides).toEqual(source.overrides);
  await page.goto('/interlace');
  await upload(page, json, 'restored.json', recovered);
  await expect(page.locator('[role=status]')).toContainText('Composition opened');
  expect(JSON.parse(await download(page, 'Save')).strands).toEqual(source.strands);
  expect(await download(page, 'Export for Layout')).toBe(svg);
  await page.getByLabel('X (mm)', { exact: true }).fill('50');
  expect(await download(page, 'Export for Layout')).not.toBe(svg);
});

test('ordinary artwork works while invalid metadata fails safely and script geometry is stripped', async ({ page }) => {
  await page.goto('/interlace');
  const svg = await download(page, 'Export for Layout');
  await page.goto('/layout');
  await upload(page, svgInput, 'bad.svg', svg.replace('"version":1', '"version":999'));
  await expect(page.getByText(/Unsupported embedded Interlace source/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit in Interlace', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download Interlace JSON' })).toHaveCount(0);

  const unsafeGeometry = '<script>window.metadataExecuted=true</script><image href="https://example.com/x"/>';
  await upload(page, svgInput, 'safe.svg', svg.replace('</svg>', unsafeGeometry + '</svg>'));
  await expect(page.getByText('safe.svg: Some unsupported SVG features were removed.')).toBeVisible();
  await interlaceSourceButton(page);
  const layout = JSON.parse(await download(page, 'Save'));
  expect(JSON.stringify(layout.elements[0].document)).not.toMatch(/metadataExecuted|example.com/);
  expect(await page.evaluate(() => Object.hasOwn(window, 'metadataExecuted'))).toBe(false);
  const expectedSource = await page.evaluate(xml => {
    const document = new DOMParser().parseFromString(xml, 'image/svg+xml');
    return JSON.parse(document.querySelector('metadata')!.textContent!).document;
  }, svg);
  expect(JSON.parse(await download(page, 'Download Interlace JSON'))).toEqual(expectedSource);

  await page.goto('/layout');
  await upload(page, svgInput, 'ordinary.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><path d="M0 0L120 60" fill="none" stroke="black"/></svg>');
  await expect(page.getByRole('heading', { name: 'Properties — ordinary' })).toBeVisible();
  const ordinary = JSON.parse(await download(page, 'Save')).elements[0];
  expect(ordinary.type).toBe('artwork');
  expect(ordinary.frame.width).toBe(100);
  expect(ordinary.interlaceSource).toBeUndefined();
});
for(const width of [390,1440])test(`contrast, text planning and accessible stable notifications at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/interlace');const standard=await download(page,'SVG'),cricut=await download(page,'Cricut Draw');
  const guide=page.locator('[data-woven-detail] path').first(),color=await guide.getAttribute('stroke');await page.getByRole('button',{name:'High contrast',exact:true}).click();await expect(guide).not.toHaveAttribute('stroke',color!);expect(await download(page,'SVG')).toBe(standard);
  await page.getByRole('button',{name:'Simplify',exact:true}).click();await expect(page.locator('path[aria-label="Six-loop rosette"]')).toHaveAttribute('stroke','#1e40af');await page.getByRole('button',{name:'Simplify',exact:true}).click();
  await page.getByRole('button',{name:'Text & Fit',exact:true}).click();await page.getByLabel('Text to plan').fill('Hello world '.repeat(40));await expect(page.locator('[data-text-fit]')).toContainText('Does not fit');await page.getByLabel('Show text estimate').check();await expect(page.locator('[data-text-estimate] path[stroke="#b91c1c"]').first()).toBeAttached();
  await page.getByRole('button',{name:/Warnings \(/}).click();await expect(page.getByRole('dialog',{name:'Design warnings'})).toContainText('Text needs a longer continuous');await page.getByRole('button',{name:'Close warnings'}).click();
  const preview=page.locator('svg[aria-label="Interlace writing sheet"]'),before=await preview.evaluate(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}));
  await page.getByLabel('Text to plan').fill('Hi');await expect(page.locator('[data-text-fit]')).toContainText('Fits');await page.getByRole('button',{name:/Warnings \(/}).click();await expect(page.getByRole('dialog',{name:'Design warnings'})).not.toContainText('Text needs a longer continuous');await page.getByRole('button',{name:'Close warnings'}).click();expect(await preview.evaluate(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))).toEqual(before);
  expect(await download(page,'SVG')).toBe(standard);expect(await download(page,'Cricut Draw')).toBe(cricut);
  await page.getByRole('button',{name:'Export options',exact:true}).click();await page.getByLabel('Include text-position boxes in SVG / PDF / Print').check();await page.getByRole('button',{name:'Close options'}).click();expect(await download(page,'SVG')).not.toBe(standard);expect((await download(page,'PDF')).startsWith('%PDF')).toBe(true);
  await expect(page.locator('[role=status]')).toContainText('export prepared');await page.getByRole('button',{name:'Dismiss notification'}).click();await expect(page.locator('[role=status]')).toBeEmpty();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
});
