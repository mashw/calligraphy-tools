import { test, expect, type Locator } from '@playwright/test';
import { captureExportFiles, exportedText } from './export-file';

async function point(path: Locator) {
  if (await path.getAttribute('data-woven-hit') !== null) {
    return path.evaluate(node=>{const geometry=node as SVGPathElement,p=geometry.getPointAtLength(geometry.getTotalLength()*.45).matrixTransform(geometry.getScreenCTM()!);return{x:p.x,y:p.y,scale:geometry.getScreenCTM()!.a};});
  }
  await path.locator('xpath=ancestor::svg').scrollIntoViewIfNeeded();
  await path.evaluate(node=>node.ownerDocument.defaultView!.scrollBy(0, node.ownerSVGElement!.getBoundingClientRect().top - 150));
  await path.page().waitForTimeout(200);
  return path.evaluate(node => {
    const geometry = node as SVGPathElement;
    const matrix = geometry.getScreenCTM()!;
    const svg = geometry.ownerSVGElement!;
    const bounds = svg.getBoundingClientRect();
    for (let i = 1; i < 100; i++) {
      const p = geometry.getPointAtLength(geometry.getTotalLength() * i / 100).matrixTransform(matrix);
      if (p.x < Math.max(0, bounds.left) + 24 || p.x > Math.min(innerWidth, bounds.right) - 24 ||
          p.y < Math.max(0, bounds.top) + 24 || p.y > Math.min(innerHeight, bounds.bottom) - 24) continue;
      const hit = document.elementFromPoint(p.x, p.y);
      if (hit?.closest('[data-woven-shape]')) return { x: p.x, y: p.y, scale: Math.hypot(matrix.a, matrix.b) };
    }
    throw new Error('No visible, unobscured draggable path point ' + JSON.stringify({
      svg:{x:bounds.x,y:bounds.y,w:bounds.width,h:bounds.height},
      sample: Array.from({length:10},(_,i)=>{
        const p=geometry.getPointAtLength(geometry.getTotalLength()*i/10).matrixTransform(matrix);
        return {x:p.x,y:p.y,hit:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,150)};
      })
    }));
  });
}
for(const width of [390,1440]) {
  test(`Woven movement, panning, zoom, crossings and preview modes at ${width}px`,async({page})=>{
    test.setTimeout(90_000);await page.setViewportSize({width,height:900});await captureExportFiles(page);await page.goto('/woven');
    const x=page.getByRole('spinbutton',{name:'X position',exact:true}),y=page.getByRole('spinbutton',{name:'Y position',exact:true});
    const camera=page.locator('svg.editor-svg');
    for(const zoom of ['Zoom in','Zoom out']) {
      await page.getByRole('button',{name:zoom,exact:true}).click();
      const before=await camera.getAttribute('viewBox'),oldX=Number(await x.inputValue()),oldY=Number(await y.inputValue());
      const p=await point(page.locator('[data-woven-shape] path').first());
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+12,p.y+9,{steps:4});
      await expect(page.locator('[data-woven-simplified]')).toBeVisible();await expect(page.locator('[data-woven-detail]')).toHaveCount(0);
      await page.mouse.up();await expect(page.locator('[data-woven-detail]')).toBeVisible();
      expect(Number(await x.inputValue())).toBeCloseTo(oldX+12/p.scale,3);expect(Number(await y.inputValue())).toBeCloseTo(oldY+9/p.scale,3);
      expect(await camera.getAttribute('viewBox')).toBe(before);
    }
    const oldX=await x.inputValue(),before=await camera.getAttribute('viewBox'),p=await point(page.locator('[data-woven-shape] path').first());
    await page.keyboard.down('Alt');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y+10,{steps:3});await page.mouse.up();await page.keyboard.up('Alt');
    expect(await camera.getAttribute('viewBox')).not.toBe(before);await expect(x).toHaveValue(oldX);
    await page.locator('[data-crossing]').nth(2).click();
    await page.getByRole('button',{name:'Save design',exact:true}).click();const saved=JSON.parse(await exportedText(page,'application/json'));
    expect(Object.keys(saved.overrides)).toHaveLength(1);expect(saved.centerX).toBeCloseTo(Number(oldX),5);
    const fullSvg=async()=>{await page.getByRole('button',{name:'SVG',exact:true}).click();return exportedText(page,'image/svg+xml');};
    const full=await fullSvg();await page.getByRole('button',{name:'Simplify',exact:true}).click();await expect(page.locator('[data-woven-simplified]')).toBeVisible();expect(await fullSvg()).toBe(full);
    await page.getByRole('button',{name:'PDF',exact:true}).click();const pdf=await exportedText(page,'application/pdf');expect(pdf).not.toContain('/Subtype /Image');
    await page.getByRole('button',{name:'Centre on page',exact:true}).click();await expect(x).toHaveValue('105');await expect(y).toHaveValue('148.5');
    await page.locator('input[type=file]').setInputFiles({name:'moved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(x).toHaveValue(String(saved.centerX));
  });

  test(`Layout native Woven editing and transformations at ${width}px`,async({page})=>{
    test.setTimeout(90_000);await page.setViewportSize({width,height:900});await captureExportFiles(page);await page.goto('/layout');
    await page.getByRole('button',{name:'+ Woven Calligraphy',exact:true}).click();
    await expect(page.locator('[data-layout-id] [data-woven-detail]')).toBeVisible();
    const inspector=page.locator('.editor-inspector');
    const x=inspector.getByRole('spinbutton',{name:/^x\b/i}),widthInput=inspector.getByRole('spinbutton',{name:/^width/i});
    const oldX=Number(await x.inputValue()),p=await point(page.locator('[data-woven-hit]').first());
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+14,p.y+10,{steps:3});await expect(page.locator('[data-woven-simplified]')).toBeVisible();await page.mouse.up();expect(Number(await x.inputValue())).not.toBe(oldX);
    if(width===1440) {
      const detail=page.locator('[data-woven-detail] path').first(),before=await detail.getAttribute('d');
      const handle=page.locator('svg.editor-svg > g[data-no-export] > g[style*="nwse-resize"]').last();
      const box=(await handle.locator('rect').boundingBox())!;
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+16,box.y+box.height/2+16,{steps:4});
      await expect(page.locator('[data-woven-simplified]')).toBeVisible();expect(await detail.getAttribute('d')).toBe(before);await page.mouse.up();expect(await detail.getAttribute('d')).not.toBe(before);
      const height=Number(await inspector.getByRole('spinbutton',{name:/^height/i}).inputValue());expect(Number(await widthInput.inputValue())/height).toBeCloseTo(1,2);
      const rotate=(await page.locator('svg.editor-svg > g[data-no-export] > circle[style*="grab"]').first().boundingBox())!;
      await page.mouse.move(rotate.x+rotate.width/2,rotate.y+rotate.height/2);await page.mouse.down();await page.mouse.move(rotate.x+rotate.width/2+20,rotate.y+rotate.height/2-10,{steps:4});await expect(page.locator('[data-woven-simplified]')).toBeVisible();await page.mouse.up();expect(Number(await inspector.getByRole('spinbutton',{name:/^Rotation/}).inputValue())).not.toBe(0);
    }
    await widthInput.fill('130.5');await widthInput.press('Tab');
    const precise=await point(page.locator('[data-woven-hit]').first());await page.mouse.move(precise.x,precise.y);await page.mouse.down();await page.mouse.move(precise.x+6,precise.y+4,{steps:2});await page.mouse.up();await expect(widthInput).toHaveValue('130.5');
    await inspector.getByRole('spinbutton',{name:/^Rotation/}).fill('25');
    await inspector.getByRole('button',{name:'Shape & Geometry',exact:true}).click();await inspector.getByRole('combobox',{name:'Preset',exact:true}).selectOption('figure-eight');
    await inspector.getByRole('button',{name:'Writing guides',exact:true}).click();await inspector.getByRole('combobox',{name:'Script',exact:true}).selectOption('Copperplate');await expect(inspector.getByRole('spinbutton',{name:'Guide unit',exact:true})).toHaveCount(0);
    await inspector.getByRole('button',{name:'Route & crossings',exact:true}).click();await inspector.getByRole('button',{name:'Swap crossing 1',exact:true}).click();
    const layers=page.locator('.editor-layers');await layers.getByRole('button',{name:'Duplicate',exact:true}).first().click();await expect(page.locator('[data-layout-id]')).toHaveCount(2);
    await layers.getByRole('button',{name:'Move down',exact:true}).first().click();await layers.getByRole('button',{name:'Lock',exact:true}).first().click();
    await layers.getByRole('button',{name:'Save',exact:true}).click();const saved=JSON.parse(await exportedText(page,'application/json'));expect(saved.elements[0].type).toBe('woven');expect(saved.elements[0].settings.nib).toBe(1);expect(saved.elements[0].settings.overrides['crossing-0']).toBe('b');
    await layers.locator('input[type=file]').first().setInputFiles({name:'layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('[data-layout-id]')).toHaveCount(2);
    await layers.getByRole('button',{name:'Hide element',exact:true}).first().click();await expect(page.locator('[data-layout-id]')).toHaveCount(1);
  });
}

test('Layout Woven full SVG, PDF, Print and Cricut exports survive Simplify and layering',async({page})=>{
  test.setTimeout(120_000);await page.setViewportSize({width:1440,height:900});await captureExportFiles(page);await page.goto('/layout');
  await page.getByRole('button',{name:'+ Woven Calligraphy',exact:true}).click();
  const rendered=await page.locator('[data-woven-detail] path').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')));
  await page.getByRole('button',{name:'Simplify',exact:true}).click();
  await page.getByRole('button',{name:'SVG',exact:true}).click();await page.getByRole('button',{name:'Export SVG',exact:true}).click();
  const svg=await exportedText(page,'image/svg+xml');expect(svg).toContain('data-woven-detail');expect(svg).not.toContain('data-woven-simplified');expect(svg).not.toContain('50 mm');expect(svg).not.toContain('WRITING PLAN');expect(svg).not.toContain('display: none');
  expect(await page.evaluate(source=>Array.from(new DOMParser().parseFromString(source,'image/svg+xml').querySelectorAll('[data-woven-detail] path')).map(node=>node.getAttribute('d')),svg)).toEqual(rendered);
  await page.getByRole('button',{name:'PDF',exact:true}).click();await expect.poll(async()=>await exportedText(page,'application/pdf')).toContain('% Woven vector layer');expect(await exportedText(page,'application/pdf')).not.toContain('/Subtype /Image');
  await page.getByRole('button',{name:'+ Shape',exact:true}).click();await page.getByRole('button',{name:'PDF',exact:true}).click();await expect.poll(async()=>await exportedText(page,'application/pdf'),{timeout:30_000}).toContain('/SMask');
  await page.evaluate(()=>{Object.assign(window,{__printed:'',open:()=>({document:{open(){},write(html:string){Object.assign(window,{__printed:html});},close(){}},focus(){},print(){}})});});
  await page.getByRole('button',{name:'Print',exact:true}).click();const print=await page.evaluate(()=>Reflect.get(window,'__printed'));expect(print).toContain('data-woven-detail');expect(print).not.toContain('data-woven-simplified');
  await page.getByRole('button',{name:'Cricut Draw',exact:true}).click();await page.getByRole('button',{name:'Export Cricut SVG',exact:true}).click();
  const cricut=await exportedText(page,'image/svg+xml');expect(cricut).not.toContain('<image');expect(cricut).toContain('fill="none"');expect(cricut).not.toContain('data-woven-simplified');
});
