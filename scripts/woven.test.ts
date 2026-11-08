import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, findSelfCrossings, alternateWeave, visibleIntervals, crossingCuts, sliceGuide, atDistance } from '../src/lib/woven/geometry.ts';
import { DEFAULT_DESIGN, parseDesign } from '../src/lib/woven/design.ts';
import { scenePdf, sceneSvg } from '../src/lib/woven/vector-export.ts';

test('figure-eight seam is one self-crossing with two distinct route passages', () => {
  const route = makeRoute('figure-eight', 165, 165, .32, 0, false);
  const crossings = findSelfCrossings(route);
  assert.equal(crossings.length, 1);
  assert.equal(crossings[0].a, 0);
  assert.ok(Math.abs(crossings[0].b - route.length / 2) < .001);
  const choices = alternateWeave(crossings).choices;
  const visible = visibleIntervals(route.length, crossingCuts(crossings, choices, 3, .5));
  assert.ok(visible.some(([a, b]) => a <= 0 && b > 0), 'over passage remains visible');
  assert.ok(!visible.some(([a, b]) => a < route.length / 2 && b > route.length / 2), 'under passage is cut');
  choices[crossings[0].id] = 'b';
  const swapped = visibleIntervals(route.length, crossingCuts(crossings, choices, 3, .5));
  assert.ok(swapped.some(([a, b]) => a < route.length / 2 && b > route.length / 2));
  assert.ok(swapped.every(([a, b]) => a > 0 && b < route.length), 'seam cut wraps around both ends');
});

test('rosette crossings remain stable through size and rotation changes', () => {
  for (const reverse of [false, true]) {
    const route = makeRoute('rosette', 165, 165, .32, 0, reverse);
    assert.deepEqual(route.points[0], route.points.at(-1));
    const a = findSelfCrossings(route), b = findSelfCrossings(makeRoute('rosette', 150, 190, .32, 83, reverse));
    assert.equal(a.length, 6);
    assert.deepEqual(a.map(c => c.id), b.map(c => c.id));
    assert.equal(alternateWeave(a).conflicts, 0);
  }
});

test('overlapping and wrapped gaps form a union without duplicate sections', () => {
  assert.deepEqual(visibleIntervals(100, [{ center: 0, half: 5 }, { center: 10, half: 10 }, { center: 60, half: 5 }]), [[20, 55], [65, 95]]);
  assert.deepEqual(visibleIntervals(100, [{ center: 50, half: 60 }]), []);
  const route = makeRoute('figure-eight', 100, 100, .32, 0, false);
  const points = route.points.map(p => ({ x: p.x + 5, y: p.y + 3 }));
  const sliced = sliceGuide(route, points, [20, 40]);
  assert.deepEqual(sliced[0], atDistance(route, 20, points));
  assert.deepEqual(sliced.at(-1), atDistance(route, 40, points));
});

test('design round-trip preserves crossing choices and rejects invalid input', () => {
  const design = { ...DEFAULT_DESIGN, overrides: { 'crossing-0': 'b' as const } };
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))), design);
  for (const patch of [{ version: 2 }, { width: Infinity }, { width: 999 }, { nib: -1 }, { script: 'unknown' }, { overrides: { 'crossing-1': 'c' } }]) assert.throws(() => parseDesign({ ...design, ...patch }));
});

test('SVG and PDF export physical vector strokes with correct PDF xref offsets', () => {
  const scene = { strokes: [{ points: [{ x: 10, y: 20 }, { x: 60, y: 20 }], color: '#52677c', width: .2 }], labels: [{ point: { x: 10, y: 25 }, text: '50 mm (test)', color: '#52677c', size: 3 }] };
  const svg = sceneSvg(scene), pdf = new TextDecoder().decode(scenePdf(scene));
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /M10.000 20.000 L60.000 20.000/);
  assert.match(pdf, /\/MediaBox \[0 0 595.276 841.890\]/);
  assert.ok(!pdf.includes('/Image'));
  const offset = Number(pdf.match(/startxref\n(\d+)/)![1]);
  assert.equal(pdf.slice(offset, offset + 4), 'xref');
  for (const [index, match] of [...pdf.matchAll(/(\d{10}) 00000 n/g)].entries()) assert.ok(pdf.slice(Number(match[1])).startsWith(`${index + 1} 0 obj`));
});


import { buildWovenModel } from '../src/lib/woven/model.ts';
import { clipPassage, curvedSlant, routeFrame } from '../src/lib/woven/curved-guides.ts';
import { pageSize } from '../src/lib/woven/design.ts';

test('Copperplate uses a fixed millimetre unit in legacy files and exported geometry', () => {
  const legacy = { ...DEFAULT_DESIGN, script: 'Copperplate' as const, nib: 2.5, xNib: 4, ascNib: 6, descNib: 3 };
  const loaded = parseDesign(JSON.parse(JSON.stringify(legacy)));
  assert.equal(loaded.nib, 1);
  assert.deepEqual([loaded.xNib, loaded.ascNib, loaded.descNib], [4, 6, 3]);
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(loaded))), loaded);
  assert.deepEqual(buildWovenModel(legacy), buildWovenModel(loaded), 'even direct callers cannot change the Copperplate unit');
  assert.notDeepEqual(buildWovenModel(loaded).clean, buildWovenModel({ ...loaded, xNib: 5 }).clean);
  assert.notDeepEqual(buildWovenModel(loaded).clean, buildWovenModel({ ...loaded, ascNib: 4 }).clean);
  assert.notDeepEqual(buildWovenModel(loaded).clean, buildWovenModel({ ...loaded, descNib: 5 }).clean);
  const broadPen = { ...legacy, script: 'TexturaQuadrata' as const };
  assert.equal(parseDesign(broadPen).nib, 2.5);
  assert.notDeepEqual(buildWovenModel(broadPen).clean, buildWovenModel({ ...broadPen, nib: 1 }).clean);
});

test('old version-1 designs receive new defaults without losing dimensions or overrides', () => {
  const old = { version:1,preset:'figure-eight',width:165,height:165,loop:.32,rotation:0,reverse:false,script:'TexturaQuadrata',nib:.7,xNib:5,ascNib:2,descNib:2,start:3,gap:8,clearance:.6,fullGuides:true,annotated:true,overrides:{'crossing-0':'b'} };
  const parsed=parseDesign(old);
  assert.equal(parsed.width,165);assert.equal(parsed.overrides['crossing-0'],'b');
  assert.equal(parsed.paper,'A4');assert.equal(parsed.slantAngle,55);assert.equal(parsed.gridMode,'effective');
  assert.equal(parseDesign({...old,script:'InsularMajuscule'}).gridHorizontal,false);
  for(const patch of [{paper:'Letter'},{gridMode:'bad'},{slantAngle:0},{construction:{upper:true,lower:false,color:'url(x)'}}]) assert.throws(()=>parseDesign({...old,...patch}));
});

test('passage clipping splits slants and markers at hidden intervals including the seam', () => {
  assert.deepEqual(clipPassage([{x:0,y:0,s:0},{x:10,y:10,s:10}],[[0,4],[6,10]],10),[[{x:0,y:0},{x:4,y:4}],[{x:6,y:6},{x:10,y:10}]]);
  assert.deepEqual(clipPassage([{x:0,y:0,s:5},{x:1,y:1,s:5}],[[0,4],[6,10]],10),[]);
  assert.deepEqual(clipPassage([{x:0,y:0,s:98},{x:4,y:0,s:102}],[[1,99]],100),[[{x:0,y:0},{x:1,y:0}],[{x:3,y:0},{x:4,y:0}]]);
});

test('both presets render finite shared grid, construction and slant scenes after crossing edits', () => {
  for(const preset of ['rosette','figure-eight'] as const) for(const script of ['TexturaQuadrata','InsularMajuscule','Copperplate'] as const) {
    const design={...DEFAULT_DESIGN,preset,script,construction:{upper:true,lower:true,color:'#dc2626',upperAppearance:'x' as const,lowerAppearance:'dots' as const},secondSlant:true};
    const model=buildWovenModel(design);
    assert.ok(model.clean.strokes.length>20);
    for(const stroke of model.clean.strokes) for(const p of stroke.points) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    const changed=buildWovenModel({...design,overrides:{[model.crossings[0].id]:model.choices[model.crossings[0].id]==='a'?'b':'a'}});
    assert.notDeepEqual(changed.clean.strokes,model.clean.strokes);
    assert.ok(!sceneSvg(model.clean).includes('Start'));
    assert.ok(!new TextDecoder().decode(scenePdf(model.clean)).includes('/Image'));
  }
});

test('curved slants maintain the requested local angle through regular bends', () => {
  for(const preset of ['rosette','figure-eight'] as const) {
    const route=makeRoute(preset,165,165,.32,0,false);
    for(const anchor of [route.length*.12,route.length*.33,route.length*.7]) {
      const points=curvedSlant(route,anchor,-2,2,55);
      assert.ok(points.length>20);
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],f=routeFrame(route,(a.s+b.s)/2);
        const dx=b.x-a.x,dy=b.y-a.y;
        const angle=Math.atan2(Math.abs(dx*f.n.x+dy*f.n.y),Math.abs(dx*f.t.x+dy*f.t.y))*180/Math.PI;
        assert.ok(Math.abs(angle-55)<3,`${preset}: ${angle}`);
      }
    }
  }
});

test('paper sizes centre the shape and drive SVG and PDF dimensions in mm', () => {
  for(const paper of ['A3','A4','A5','DL','C5','C6'] as const) for(const orientation of ['portrait','landscape'] as const) {
    const design={...DEFAULT_DESIGN,paper,orientation,gridHorizontal:false,gridVertical:false};
    const model=buildWovenModel(design),page=pageSize(design);
    const xs=model.route.points.map(p=>p.x),ys=model.route.points.map(p=>p.y);
    assert.ok(Math.abs((Math.min(...xs)+Math.max(...xs))/2-page.w/2)<.01);
    assert.ok(Math.abs((Math.min(...ys)+Math.max(...ys))/2-page.h/2)<.01);
    assert.ok(sceneSvg(model.clean).includes(`width="${page.w}mm" height="${page.h}mm"`));
    assert.ok(new TextDecoder().decode(scenePdf(model.clean)).includes(`/MediaBox [0 0 ${(page.w*72/25.4).toFixed(3)} ${(page.h*72/25.4).toFixed(3)}]`));
  }
});
