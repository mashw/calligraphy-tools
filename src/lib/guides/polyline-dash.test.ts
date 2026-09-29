import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's TypeScript runner requires the explicit extension.
import { CRICUT_PRIMARY_GUIDE_DASH_MM, CRICUT_PRIMARY_GUIDE_GAP_MM, cricutGuidePathSegments } from './polyline-dash.ts';

type Point={x:number;y:number};
const length=(points:Point[])=>points.slice(1).reduce((total,point,index)=>total+Math.hypot(point.x-points[index].x,point.y-points[index].y),0);

test('Cricut primary lines use separated 6 mm / 4 mm physical geometry',()=>{
  const line=[{x:0,y:0},{x:26,y:0}];
  for(const kind of ['waist','base'] as const){
    const segments=cricutGuidePathSegments(kind,line,true);
    assert.deepEqual(segments.map(length),[6,6,6]);
    assert.deepEqual(segments.map(segment=>segment[0].x),[0,10,20]);
  }
  assert.equal(CRICUT_PRIMARY_GUIDE_DASH_MM,6);
  assert.equal(CRICUT_PRIMARY_GUIDE_GAP_MM,4);
});

test('ascender, descender, and disabled primary dashing remain continuous',()=>{
  const line=[{x:0,y:0},{x:26,y:0}];
  assert.deepEqual(cricutGuidePathSegments('asc',line,true),[line]);
  assert.deepEqual(cricutGuidePathSegments('desc',line,true),[line]);
  assert.deepEqual(cricutGuidePathSegments('waist',line,false),[line]);
  assert.deepEqual(cricutGuidePathSegments('base',line,false),[line]);
});

test('curved primary-line dashes follow polyline distance without changing coordinates',()=>{
  const curved=[{x:0,y:0},{x:6,y:0},{x:6,y:10},{x:10,y:10}];
  const snapshot=structuredClone(curved);
  const segments=cricutGuidePathSegments('base',curved,true);
  assert.deepEqual(segments.map(length),[6,6]);
  assert.deepEqual(segments[1],[{x:6,y:4},{x:6,y:10}]);
  assert.deepEqual(curved,snapshot);
});

test('non-primary geometry is returned untouched for construction-grid consumers',()=>{
  const subdivision=[{x:1,y:2},{x:4,y:8}];
  assert.strictEqual(cricutGuidePathSegments('asc',subdivision,true)[0],subdivision);
});
