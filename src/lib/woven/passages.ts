import type { Interval } from './geometry';

/** Isolate one visit to a crossing, including visits spanning the closed seam. */
export function visitIntervals(visits: number[], at: number, len: number, closed: boolean): Interval[] {
  const i = visits.indexOf(at);
  const left = i ? (at+visits[i-1])/2 : closed ? (at+visits[visits.length-1]-len)/2 : 0;
  const right = i+1<visits.length ? (at+visits[i+1])/2 : closed ? (at+visits[0]+len)/2 : len;
  const parts: Interval[] = [];
  if(left<0)parts.push([left+len,len]);
  parts.push([Math.max(left,0),Math.min(right,len)]);
  if(right>len)parts.push([0,right-len]);
  return parts;
}
