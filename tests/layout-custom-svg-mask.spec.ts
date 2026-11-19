import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg=(contents:string)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120">'+contents+'</svg>';
const arch=svg('<polygon points="0,0 100,0 100,100 70,100 70,30 30,30 30,100 0,100"/>');
const curve=svg('<g transform="translate(10 5) rotate(15 50 50)"><path d="M10 50 C10 10 90 10 90 50 A40 30 0 0 1 10 50 Z"/></g>');
const file=(name:string,contents:string)=>({name,mimeType:name.endsWith('.svg')?'image/svg+xml':'application/json',buffer:Buffer.from(contents)});

async function start(page:Page) {
  await page.goto('/layout');
  await page.getByRole('button',{name:'+ Guidelines',exact:true}).click();
  await page.getByLabel('Shape mask').selectOption('customSvg');
}

async function download(page:Page,button:string,confirm?:string) {
  const wait=page.waitForEvent('download');
  await page.getByRole('button',{name:button,exact:true}).click();
  if(confirm)await page.getByRole('button',{name:confirm,exact:true}).click();
  return readFile((await (await wait).path())!);
}

test('imports curved and transformed silhouettes, rejects open geometry, and saves and reopens the mask',async({page})=>{
  await start(page);
  await page.getByLabel('Upload SVG mask').setInputFiles(file('open.svg',svg('<path d="M10 10L90 90"/>')));
  await expect(page.getByRole('alert').filter({hasText:'closed SVG path'})).toBeVisible();
  await page.getByLabel('Upload SVG mask').setInputFiles(file('curve.svg',curve));
  const silhouette=page.locator('[data-custom-mask-silhouette]');
  await expect(silhouette).toHaveAttribute('d',/C10 10.*A40 30/);
  const initial=await silhouette.getAttribute('transform');
  await expect(page.getByLabel(/^x\s*mm$/i)).toHaveValue('30');
  await page.getByLabel(/^width\s*mm$/i).fill('90');
  await page.getByLabel(/Rotation/).fill('19');
  await page.getByLabel(/Internal padding/i).fill('5');
  await page.getByLabel('Show mask outline').check();
  await page.getByLabel(/Outline width/i).fill('1.5');
  await expect(page.locator('[data-custom-mask-outline]')).toHaveAttribute('stroke-width','1.5');
  await expect(silhouette).not.toHaveAttribute('transform',initial!);
  const transform=await silhouette.getAttribute('transform');
  const data=await download(page,'Save');
  const saved=JSON.parse(data.toString());
  expect(saved.elements[0].frame.width/saved.elements[0].frame.height).toBeCloseTo(saved.elements[0].mask.customSvg.aspectRatio,8);
  expect(saved.elements[0].rotationDeg).toBe(19);
  await page.reload();
  await page.locator('input[accept*="calligraphy-layout"]').setInputFiles(file('custom.json',data.toString()));
  await expect(page.getByText('Opened custom.json.',{exact:true})).toBeVisible();
  await expect(silhouette).toHaveAttribute('transform',transform!);
  expect(JSON.parse((await download(page,'Save')).toString()).elements).toEqual(saved.elements);
  await page.getByRole('button',{name:'Remove SVG',exact:true}).click();
  await expect(silhouette).toHaveCount(0);
});

test('concave guides clip in SVG and Cricut Draw at the correct physical size',async({page})=>{
  await start(page);
  await page.getByLabel('Upload SVG mask').setInputFiles(file('arch.svg',arch));
  const guides=page.locator('[data-custom-mask-guides]');
  await expect(guides).toHaveAttribute('clip-path',/shape-mask/);
  await expect(guides).toHaveAttribute('mask',/padding/);
  const exported=(await download(page,'SVG','Export SVG')).toString();
  expect(exported).toContain('width="210mm" height="297mm"');
  const pixels=await page.evaluate(async xml=>{
    const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
    const group=doc.querySelector('[data-custom-mask-guides]')!;
    const frame=/translate\(([^ ]+) ([^)]+)\)/.exec(group.parentElement!.getAttribute('transform')!)!;
    const x=Number(frame[1]),y=Number(frame[2]);
    const guide=[...group.querySelectorAll('path')].filter(p=>!p.closest('defs')).map(p=>p.getAttribute('d')!)
      .map(d=>Number(d.match(/M\s*[-.\d]+[ ,]+([-.\d]+)/)?.[1])).find(yy=>yy>55&&yy<85)!;
    const url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));
    try{
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=1050;canvas.height=1485;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,1050,1485);
      return [20,75,130].map(px=>{
        const data=ctx.getImageData(Math.round((x+px)*5),Math.round((y+guide)*5)-2,1,5).data;
        return Math.min(...[data[0],data[4],data[8],data[12],data[16]]);
      });
    }finally{URL.revokeObjectURL(url);}
  },exported);
  expect(pixels[0]).toBeLessThan(250);
  expect(pixels[1]).toBe(255);
  expect(pixels[2]).toBeLessThan(250);
  const cut=(await download(page,'Cricut Draw','Export Cricut SVG')).toString();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(cut).not.toMatch(/<clipPath|<mask/);
  const bounds=await page.evaluate(xml=>{
    const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
    const root=doc.documentElement,view=root.getAttribute('viewBox')!.split(/ +/).map(Number);
    const paths=Array.from(root.querySelectorAll('path')).flatMap(path=>(path.getAttribute('d')??'').split(/(?=M)/));
    const archStrokes=paths.map(path=>Array.from(path.matchAll(/[ML]\s*([-\d.]+)[ ,]+([-\d.]+)/g),m=>[Number(m[1]),Number(m[2])]))
      .filter(points=>points.length>=2 && points.every(([,y])=>y>145 && y<190));
    return {view,units:[root.getAttribute('width'),root.getAttribute('height')],
      archStrokes:archStrokes.length,gapClear:archStrokes.every(points=>points.every(([x])=>x<75)||points.every(([x])=>x>135))};
  },cut);
  expect(bounds.archStrokes).toBeGreaterThan(3);
  expect(bounds.gapClear).toBe(true);
  expect(bounds.units.every(unit=>unit?.endsWith('in'))).toBe(true);
  expect(parseFloat(bounds.units[0]!)*25.4).toBeCloseTo(bounds.view[2],3);
  expect(parseFloat(bounds.units[1]!)*25.4).toBeCloseTo(bounds.view[3],3);
  const pdf=await download(page,'PDF');
  expect(pdf.subarray(0,8).toString()).toContain('%PDF-');
  expect(pdf.toString('latin1')).toContain('Custom SVG mask vector layer');
  expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
  expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 595\.\d+ 841\.\d+\]/);
});

for (const width of [390,1440]) {
  test(`edit masked rows, separate sections and regroup at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:960});
    await start(page);
    await page.getByLabel('Upload SVG mask').setInputFiles(file('arch.svg',arch));
    await page.getByRole('button',{name:'Edit guidelines within mask'}).click();
    const fixed=page.locator('[data-custom-mask-silhouette]');
    const boundary=await fixed.getAttribute('transform');
    const controls=page.locator('fieldset').filter({has:page.getByText('Finish editing guidelines',{exact:true})}).last();
    const field=(name:string)=>controls.getByRole('spinbutton',{name,exact:true});
    const rotate=page.getByLabel('Rotate guidelines',{exact:true});
    async function drag(row:number|'rotate',dx:number,dy:number){
      const target=row==='rotate'?rotate:page.locator('[data-edit-row="'+row+'"]');
      await target.scrollIntoViewIfNeeded();
      const point=await target.evaluate(el=>{
        const g=el as SVGGraphicsElement,b=g.getBBox();
        const p=new DOMPoint(b.x+b.width*.15,b.y+b.height/2).matrixTransform(g.getScreenCTM()!);
        return {x:p.x,y:p.y};
      });
      await page.mouse.move(point.x,point.y);await page.mouse.down();
      await page.mouse.move(point.x+dx,point.y+dy,{steps:4});await page.mouse.up();
    }
    await drag(0,4,3);
    expect(Number(await field('X (mm)').inputValue())).toBeGreaterThan(0);
    await drag('rotate',5,2);
    expect(Math.abs(Number(await field('Rotation (°)').inputValue()))).toBeGreaterThan(0);
    await page.getByRole('button',{name:'Reset group position and rotation'}).click();
    await page.getByRole('button',{name:'Release guidelines'}).click();
    await drag(1,3,2);
    await expect(page.getByLabel('Writing row')).toHaveValue('1');
    expect(Number(await field('X (mm)').inputValue())).toBeGreaterThan(0);
    await field('Y (mm)').fill('5');
    await field('Rotation (°)').fill('8');
    await page.getByRole('button',{name:'Regroup guidelines'}).click();
    await field('Rotation (°)').fill('12');
    await page.getByRole('button',{name:'Release guidelines'}).click();
    await expect(field('Rotation (°)')).toHaveValue('8');
    await expect(field('Y (mm)')).toHaveValue('5');
    await expect(fixed).toHaveAttribute('transform',boundary!);
    const rows=page.getByLabel('Writing row'),split=page.getByRole('button',{name:'Separate visible sections'});
    for(let i=0;i<await rows.locator('option').count();i++){
      await rows.selectOption(String(i));if(await split.isVisible())break;
    }
    await split.click();await expect(rows.locator('option:checked')).toHaveText(/section 1/);
    await field('X (mm)').fill('-3');
    await page.evaluate(()=>{
      const original=window.open;
      window.open=function(...args){
        const popup=original.apply(window,args);
        if(popup)popup.print=()=>{document.documentElement.dataset.printSvg=popup.document.querySelector('svg')?.outerHTML;popup.close();};
        return popup;
      };
    });
    await page.getByRole('button',{name:'Print',exact:true}).click();
    const printed=await page.locator('html').getAttribute('data-print-svg');
    expect(printed).toContain('-piece-');expect(printed).not.toContain('data-edit-row');
    const saved=await download(page,'Save');
    const arrangement=JSON.parse(saved.toString()).elements[0].mask.arrangement;
    expect(arrangement.group.angle).toBe(12);
    expect(Object.keys(arrangement.cuts)).toHaveLength(1);
    const svg=(await download(page,'SVG','Export SVG')).toString();
    expect(svg).not.toContain('data-edit-row');expect(svg).toContain('-piece-');
    const pdf=(await download(page,'PDF')).toString('latin1');
    expect(pdf).toMatch(/0\.97815 0\.20791 -0\.20791 0\.97815/);
    const cut=(await download(page,'Cricut Draw','Export Cricut SVG')).toString();
    expect(cut).not.toContain('clip-path');
    const frame=JSON.parse(saved.toString()).elements[0].frame;
    // The fixture has two legs below 30% of its height. Sample complete pen
    // segments as well as endpoints so a single line across the gap fails.
    const subpaths=cut.match(/<path d="([^"]+)"/)![1].split(/(?=M)/);
    let diagonal=0,escaped=0;
    for(const subpath of subpaths){
      const points=Array.from(subpath.matchAll(/[ML]\s*([-\d.]+)[ ,]+([-\d.]+)/g),m=>[Number(m[1])-frame.x,Number(m[2])-frame.y]);
      if(!points.length||points.every(([x,y])=>x<0||x>frame.width||y<0||y>frame.height))continue;
      for(let j=1;j<points.length;j++){
        const [x,y]=points[j-1],[u,v]=points[j],steps=Math.max(1,Math.ceil(Math.hypot(u-x,v-y)));
        if(Math.abs(u-x)>1&&Math.abs(v-y)>.1)diagonal++;
        for(let k=0;k<=steps;k++){
          const px=x+(u-x)*k/steps,py=y+(v-y)*k/steps;
          if(px<1.99||px>frame.width-1.99||py<1.99||py>frame.height-1.99||py>frame.height*.3&&px>frame.width*.3&&px<frame.width*.7)escaped++;
        }
      }
    }
    expect(escaped).toBe(0);
    expect(diagonal).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Reset selected row'}).click();
    await expect(field('X (mm)')).toHaveValue('0');
    await page.getByRole('button',{name:'Restore automatic arrangement'}).click();
    await expect(controls.getByText('Grouped',{exact:true})).toBeVisible();
    await page.locator('input[accept*="calligraphy-layout"]').setInputFiles(file('manual.json',saved.toString()));
    expect(JSON.parse((await download(page,'Save')).toString()).elements[0].mask.arrangement).toEqual(arrangement);
    await page.getByRole('button',{name:'Duplicate',exact:true}).first().click();
    const duplicate=JSON.parse((await download(page,'Save')).toString()).elements[0];
    expect(duplicate.mask.arrangement).toEqual(arrangement);
  });
}
