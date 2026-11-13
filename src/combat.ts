import type { EnemyKind, Vec2 } from './contracts';

export const ENEMIES: Record<EnemyKind, {name:string; hp:number; attack:number; defense:number; speed:number; detect:number; range:number; windup:number; recovery:number}> = {
  stalker: {name:'가시늑대',hp:72,attack:17,defense:2,speed:3.4,detect:10,range:2.1,windup:0.75,recovery:1.2},
  wisp: {name:'길 잃은 별불',hp:60,attack:19,defense:1,speed:2.5,detect:13,range:9,windup:1.1,recovery:1.9},
  charger: {name:'수정뿔 짐승',hp:125,attack:27,defense:5,speed:2.6,detect:12,range:8,windup:1.2,recovery:1.8},
  sentinel: {name:'황금빛 파수꾼',hp:155,attack:28,defense:8,speed:2.2,detect:10,range:2.8,windup:0.95,recovery:1.5},
  boss: {name:'무너진 별의 수호자 · 아르켄',hp:1300,attack:35,defense:9,speed:2.5,detect:27,range:5.4,windup:1.3,recovery:1.7}
};
export const horizontalDistance = (a:Vec2,b:Vec2) => Math.hypot(a.x-b.x,a.z-b.z);
export function withinArc(origin:Vec2, heading:number, target:Vec2, range:number, halfArc:number) {
  const dx=target.x-origin.x,dz=target.z-origin.z;
  const distance=Math.hypot(dx,dz);
  if(distance>range) return false;
  if(distance<0.01) return true;
  return (-Math.sin(heading)*dx-Math.cos(heading)*dz)/distance >= Math.cos(halfArc);
}
export function segmentDistance(point:Vec2,from:Vec2,to:Vec2) {
  const dx=to.x-from.x,dz=to.z-from.z, length=dx*dx+dz*dz;
  const t=length===0?0:Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.z-from.z)*dz)/length));
  return Math.hypot(point.x-(from.x+t*dx),point.z-(from.z+t*dz));
}
export function angleToward(from:Vec2,to:Vec2) {return Math.atan2(from.x-to.x,from.z-to.z);}
export function dampAngle(current:number,target:number,rate:number,dt:number) {return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-rate*dt));}
