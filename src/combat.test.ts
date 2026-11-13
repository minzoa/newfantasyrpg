import { describe,it,expect } from 'vitest';
import { withinArc,segmentDistance,dampAngle } from './combat';
describe('spatial combat',()=>{
  it('hits only in the actual forward arc and range',()=>{
    expect(withinArc({x:0,z:0},0,{x:0,z:-3},3.2,1)).toBe(true);
    expect(withinArc({x:0,z:0},0,{x:0,z:2},3.2,1)).toBe(false);
    expect(withinArc({x:0,z:0},0,{x:0,z:-4},3.2,1)).toBe(false);
    expect(withinArc({x:0,z:0},Math.PI/2,{x:-2,z:0},3.2,1)).toBe(true);
  });
  it('swept projectiles cannot tunnel past targets between frames',()=>{
    expect(segmentDistance({x:0.3,z:-5},{x:0,z:0},{x:0,z:-10})).toBeCloseTo(0.3);
    expect(segmentDistance({x:0,z:-15},{x:0,z:0},{x:0,z:-10})).toBe(5);
    expect(segmentDistance({x:3,z:4},{x:0,z:0},{x:0,z:0})).toBe(5);
  });
  it('rotation takes the short path across the angle boundary',()=>{
    const result=dampAngle(Math.PI-.05,-Math.PI+.05,10,.1);
    expect(result).toBeGreaterThan(Math.PI-.05);
    expect(result).toBeLessThan(Math.PI+.05);
  });
});
