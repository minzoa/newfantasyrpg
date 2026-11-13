import * as THREE from 'three';
import { ActorView } from './actors';
import { ENEMIES, angleToward, dampAngle, horizontalDistance, withinArc, segmentDistance } from './combat';
import type { EnemySpawn } from './contracts';
import type { Effects } from './effects';

export interface EnemyContext {
  player:THREE.Vector3; dt:number; time:number; effects:Effects;
  hitPlayer:(attack:number,from:THREE.Vector3)=>void;
  fire:(from:THREE.Vector3,toward:THREE.Vector3,damage:number)=>void;
  sound:(sound:'warning'|'magic')=>void;
  constrain:(position:THREE.Vector3,radius:number)=>void;
}
type Mode='patrol'|'chase'|'windup'|'attack'|'recover'|'stagger'|'dead';
type Pattern='melee'|'bolt'|'charge'|'sweep'|'nova'|'meteors';
export class Enemy {
  readonly actor:ActorView;
  readonly config;
  readonly position:THREE.Vector3;
  readonly home:THREE.Vector3;
  hp:number;
  mode:Mode='patrol';
  timer=0;
  hurt=0;
  heading=0;
  phase=1;
  warning='';
  attackDuration=1;
  private pattern:Pattern='melee';
  private cycle=0;
  private target=new THREE.Vector3();
  private chargeDirection=new THREE.Vector3();
  private didHit=false;
  private marker:THREE.Group|null=null;
  private meteorMarkers:THREE.Group[]=[];
  private meteorPoints:THREE.Vector3[]=[];
  private wave=0;
  private waveTime=0;
  private walk=0;
  constructor(readonly spawn:EnemySpawn,private scene:THREE.Scene) {
    this.config=ENEMIES[spawn.kind];this.hp=this.config.hp;this.actor=new ActorView(spawn.kind);
    this.position=this.actor.root.position;this.position.set(spawn.x,0,spawn.z);this.home=this.position.clone();scene.add(this.actor.root);
    this.heading=(spawn.x<0?-.4:.4);this.actor.root.rotation.y=this.heading;
  }
  get dead(){return this.mode==='dead';}
  damage(amount:number,from:THREE.Vector3,effects:Effects) {
    if(this.dead) return false;
    this.hp=Math.max(0,this.hp-amount);this.hurt=.22;
    if(this.hp<=0){this.mode='dead';this.timer=1.5;this.warning='';this.clearMarkers(effects);return true;}
    if(this.spawn.kind!=='boss') {
      this.mode='stagger';this.timer=.27;this.clearMarkers(effects);
      const dir=this.position.clone().sub(from).setY(0).normalize();this.position.addScaledVector(dir,.32);
    }
    return false;
  }
  update(ctx:EnemyContext) {
    const {dt,time,player,effects}=ctx;
    this.timer=Math.max(0,this.timer-dt);this.hurt=Math.max(0,this.hurt-dt);this.walk=0;
    if(this.dead) {
      this.actor.animate(dt,{moving:false,speed:0,attack:0,attackDuration:1,dodge:0,hurt:0,dead:true,blocking:false,phase:this.phase,time});
      if(this.timer===0) this.actor.root.visible=false;
      return;
    }
    const distance=horizontalDistance(this.position,player);
    const boss=this.spawn.kind==='boss';
    if(boss&&this.hp<this.config.hp*.5&&this.phase===1) {
      this.phase=2;this.mode='recover';this.timer=1.3;this.warning='별의 심장이 깨어납니다 · 두 번째 위상';this.clearMarkers(effects);
      effects.ring(this.position,4,0xcf91ff,1.3,3);effects.burst(this.position,0xcf91ff,70,7);ctx.sound('warning');
    }
    if(this.mode==='stagger') {if(this.timer===0)this.mode='chase';}
    else if(this.mode==='windup') {
      if(this.marker) {const pulse=.94+.06*Math.sin(time*14);this.marker.scale.set(pulse,pulse,this.pattern==='charge'?pulse*7:pulse);this.marker.children.forEach(child=>{if(child instanceof THREE.Mesh)(child.material as THREE.MeshBasicMaterial).opacity=child.geometry instanceof THREE.CircleGeometry?.13+.05*Math.sin(time*12):.85;});}
      if(this.pattern==='melee'||this.pattern==='sweep')this.heading=dampAngle(this.heading,angleToward(this.position,player),2,dt);
      if(this.timer===0)this.execute(ctx);
    } else if(this.mode==='attack') {
      if(this.pattern==='charge') {
        const old=this.position.clone();this.position.addScaledVector(this.chargeDirection,17*dt);ctx.constrain(this.position,boss?1.5:.8);
        if(!this.didHit&&segmentDistance(player,old,this.position)<(boss?2.1:1.25)){ctx.hitPlayer(this.config.attack*1.3,this.position);this.didHit=true;}
        this.walk=12;
      }
      if(this.timer===0){this.mode='recover';this.timer=this.config.recovery*(this.phase===2?.7:1);this.warning='';}
    } else if(this.mode==='recover') {if(this.timer===0){this.mode='chase';this.warning='';}}
    else {
      if(distance<this.config.detect) this.mode='chase';
      if(this.mode==='chase') {
        this.heading=dampAngle(this.heading,angleToward(this.position,player),7,dt);
        const wisp=this.spawn.kind==='wisp';
        if(wisp&&distance<4.5) {this.position.addScaledVector(player.clone().sub(this.position).setY(0).normalize(),-this.config.speed*dt);this.walk=this.config.speed;if(this.timer===0){this.prepare(ctx);}}
        else if(distance<=this.config.range || (boss&&distance<15)) this.prepare(ctx);
        else {const dir=player.clone().sub(this.position).setY(0).normalize();this.position.addScaledVector(dir,this.config.speed*dt*(this.phase===2?1.2:1));this.walk=this.config.speed;}
        if(!boss&&distance>22){this.mode='patrol';}
      } else {
        const desired=this.home.clone().add(new THREE.Vector3(Math.sin(time*.35+this.spawn.x)*1.3,0,Math.cos(time*.35+this.spawn.z)*1.3));
        this.heading=dampAngle(this.heading,angleToward(this.position,desired),3,dt);
        if(horizontalDistance(this.position,desired)>.2){this.position.addScaledVector(desired.sub(this.position).normalize(),.65*dt);this.walk=.65;}
      }
      ctx.constrain(this.position,boss?1.5:.7);
    }
    if(this.wave>0) {
      const previous=this.wave;this.wave+=12*dt;this.waveTime-=dt;
      if(this.marker)this.marker.scale.setScalar(this.wave/2);
      if(!this.didHit&&distance>=previous-.7&&distance<=this.wave+.7&&player.y<1.05){ctx.hitPlayer(this.config.attack*1.2,this.position);this.didHit=true;}
      if(this.waveTime<=0){this.wave=0;this.clearMarkers(effects);}
    }
    this.actor.root.rotation.y=this.heading;
    this.actor.animate(dt,{moving:this.walk>0,speed:this.walk,attack:this.mode==='windup'?this.timer:this.mode==='attack'?Math.max(.01,this.timer):0,attackDuration:this.attackDuration,dodge:0,hurt:this.hurt,dead:false,blocking:false,phase:this.phase,time});
  }
  private prepare(ctx:EnemyContext) {
    const {effects,player}=ctx;
    this.clearMarkers(effects);this.didHit=false;this.target.copy(player);this.warning='';
    this.pattern=this.spawn.kind==='wisp'?'bolt':this.spawn.kind==='charger'?'charge':'melee';
    if(this.spawn.kind==='boss') {
      const patterns:Pattern[]=this.phase===1?['sweep','charge','nova','sweep']:['meteors','nova','charge','sweep'];
      this.pattern=patterns[this.cycle++%patterns.length];
      if(this.pattern==='sweep'&&horizontalDistance(this.position,player)>7)this.pattern='charge';
    }
    const windup=this.pattern==='meteors'?1.7:this.pattern==='nova'?1.65:this.config.windup;
    this.timer=windup*(this.phase===2?.85:1);this.attackDuration=this.timer+.35;this.mode='windup';
    if(this.pattern==='charge') {
      this.chargeDirection.copy(player).sub(this.position).setY(0).normalize();this.heading=angleToward(this.position,player);this.warning='별의 돌진 · 옆으로 회피';
      this.marker=effects.telegraph(this.position,1.2);this.marker.scale.z=7;this.marker.rotation.y=this.heading;this.marker.position.addScaledVector(this.chargeDirection,5);
    } else if(this.pattern==='meteors') {
      this.warning='낙성 · 붉은 표식에서 벗어나세요';
      this.meteorPoints=[player.clone(),player.clone().add(new THREE.Vector3(4,0,-3)),player.clone().add(new THREE.Vector3(-4,0,3))];
      this.meteorMarkers=this.meteorPoints.map(p=>effects.telegraph(p,3.2));
    } else {
      const radius=this.pattern==='nova'?2:this.pattern==='sweep'?6:this.pattern==='bolt'?1.3:this.config.range;
      this.marker=effects.telegraph(this.position,radius,this.pattern==='nova'?0xca8aff:0xff795a);
      if(this.pattern==='nova')this.warning='별빛 파동 · 점프하거나 회피하세요';
      if(this.pattern==='sweep')this.warning='수호자의 검 · 뒤로 물러나세요';
    }
    ctx.sound('warning');
  }
  private execute(ctx:EnemyContext) {
    const {effects,player}=ctx;
    this.clearMarkers(effects);this.mode='attack';this.timer=.4;
    if(this.pattern==='bolt'){ctx.fire(this.position,player,this.config.attack);ctx.sound('magic');}
    if(this.pattern==='melee'||this.pattern==='sweep') {
      const range=this.pattern==='sweep'?6.2:this.config.range+.5;
      effects.slash(this.position,this.heading,0xffaa69,this.spawn.kind==='boss');
      if(withinArc(this.position,this.heading,player,range,this.pattern==='sweep'?1.6:1.1))ctx.hitPlayer(this.config.attack*(this.pattern==='sweep'?1.2:1),this.position);
    }
    if(this.pattern==='charge'){this.timer=.67;effects.burst(this.position,0xffd786,20,3);}
    if(this.pattern==='nova') {this.wave=2;this.waveTime=1.3;this.marker=effects.telegraph(this.position,2,0xc78aff);ctx.sound('magic');}
    if(this.pattern==='meteors') {
      for(const p of this.meteorPoints){effects.beam(p.clone().setY(12),p.clone().setY(.2),0xe8b4ff);effects.ring(p,3.2,0xd792ff,.5,.3);effects.burst(p,0xe1bdff,28,5);if(horizontalDistance(player,p)<3.2)ctx.hitPlayer(this.config.attack*1.3,p);}
      this.meteorPoints=[];
    }
  }
  private clearMarkers(effects:Effects){effects.removeMarker(this.marker);this.marker=null;this.meteorMarkers.forEach(m=>effects.removeMarker(m));this.meteorMarkers=[];this.wave=0;}
  dispose(effects:Effects) {this.clearMarkers(effects);this.scene.remove(this.actor.root);this.actor.dispose();}
}
