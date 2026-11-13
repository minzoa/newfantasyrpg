import * as THREE from 'three';
import { ActorView } from './actors';
import { WorldView } from './world';
import { Input } from './input';
import { GameAudio } from './audio';
import { Effects } from './effects';
import { Enemy } from './enemies';
import { GameUI } from './ui';
import { ZONES } from './zones';
import { angleToward, dampAngle, horizontalDistance, withinArc, segmentDistance } from './combat';
import { ITEMS, newGame, calculateStats, addXp, addItem, equipItem, unequipItem, discardItem, buyItem, usePotion, investTalent, damageAmount, awardEnemy, openChest, activateRune, claimSideQuest, objective, saveGame, loadGame, hasSave, loadSettings, saveSettings } from './domain';
import type { GameState, Screen, UiAction, UiSnapshot, ZoneId, WorldObject, Slot, Settings } from './contracts';

interface Projectile {mesh:THREE.Mesh; velocity:THREE.Vector3; life:number; damage:number; hostile:boolean; pierce:boolean; hit:Set<string>}
interface Attack {kind:'basic'|'q'|'r';remaining:number;duration:number;fired:boolean;combo:number}

export class Game {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(48,1,.1,220);
  private world:WorldView;
  private player:ActorView;
  private input:Input;
  private audio:GameAudio;
  private effects:Effects;
  private ui:GameUI;
  private state:GameState=newGame();
  private screen:Screen='title';
  private settingsBack:Screen='title';
  private zone:ZoneId='haven';
  private enemies:Enemy[]=[];
  private projectiles:Projectile[]=[];
  private position:THREE.Vector3;
  private heading=0;
  private yaw=0;
  private pitch=.62;
  private distance=18;
  private cameraTarget=new THREE.Vector3();
  private cameraInitialized=false;
  private attack:Attack|null=null;
  private attackBuffer=0;
  private combo=0;
  private comboWindow=0;
  private dodge=0;
  private invulnerable=0;
  private hurt=0;
  private jumpVelocity=0;
  private dashDirection=new THREE.Vector3();
  private cooldowns={q:0,r:0,dash:0,guard:0};
  private blocking=false;
  private notice='';
  private noticeId=0;
  private noticeTime=0;
  private locationBanner=0;
  private dialogue='';
  private interact:WorldObject|null=null;
  private elapsed=0;
  private uiClock=0;
  private saveClock=0;
  private footstep=0;
  private shake=0;
  private endingTimer=0;
  private rematch=false;
  private sessionStarted=false;
  private lastFrame=0;
  private frameId=0;
  private disposed=false;
  private contextLost=false;
  private contextScreen:Screen='title';
  private abort=new AbortController();
  private raycaster=new THREE.Raycaster();
  private ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private aimedPoint=new THREE.Vector3();

  constructor(private canvas:HTMLCanvasElement,uiRoot:HTMLElement) {
    this.state.settings=loadSettings();
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.world=new WorldView(this.scene);this.effects=new Effects(this.scene);this.player=new ActorView('player');this.scene.add(this.player.root);this.position=this.player.root.position;
    this.audio=new GameAudio(this.state.settings);
    this.input=new Input(canvas,()=>{if(this.screen==='play')this.setScreen('pause');});
    this.ui=new GameUI(uiRoot,(action,value)=>this.onAction(action,value));
    this.world.load('haven',this.state);this.position.set(0,0,7);this.player.root.visible=false;
    window.addEventListener('resize',()=>this.resize(),{signal:this.abort.signal});
    window.addEventListener('beforeunload',()=>{if(this.sessionStarted)this.save(false);},{signal:this.abort.signal});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.contextScreen=this.screen;if(this.sessionStarted)this.setScreen('pause');this.notify('그래픽 연결이 중단되었습니다. 복구를 기다려 주세요.');},{signal:this.abort.signal});
    canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;if(this.sessionStarted)this.loadZone(this.zone);else this.world.load('haven',this.state);this.setScreen(this.contextScreen==='play'?'pause':this.contextScreen);this.notify('그래픽 연결이 복구되었습니다. 계속하기를 눌러 주세요.');},{signal:this.abort.signal});
    this.resize();this.applySettings();this.refreshUI();this.frameId=requestAnimationFrame(this.frame);
  }
  private resize() {
    this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth,window.innerHeight);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,this.state.settings.quality==='high'?1.65:1));
  }
  private applySettings() {this.audio.apply(this.state.settings);this.renderer.shadowMap.enabled=this.state.settings.quality==='high';this.resize();}
  private setScreen(screen:Screen) {
    this.screen=screen;this.input.clear();this.blocking=false;
    if(screen!=='play'&&document.pointerLockElement)document.exitPointerLock();
    this.refreshUI();
  }
  private notify(message:string) {this.notice=message;this.noticeTime=4.5;this.noticeId++;this.refreshUI();}
  private save(show=true) {if(!this.sessionStarted)return true;const ok=saveGame(this.state);if(show||!ok)this.notify(ok?'별의 기록이 저장되었습니다.':'저장 공간에 접근할 수 없습니다. 브라우저의 저장 권한을 확인하세요.');return ok;}
  private start(fresh:boolean) {
    this.sessionStarted=true;
    const settings=this.state.settings;
    this.state=fresh?newGame():loadGame()??newGame();this.state.settings=settings;
    this.attack=null;this.dodge=0;this.invulnerable=0;this.hurt=0;this.endingTimer=0;this.jumpVelocity=0;this.rematch=false;
    this.cooldowns={q:0,r:0,dash:0,guard:0};this.combo=0;this.comboWindow=0;
    if(this.state.player.hp<=0){const stats=calculateStats(this.state);this.state.player.hp=stats.maxHp;this.state.player.mana=stats.maxMana;}
    this.player.root.visible=true;this.loadZone(this.state.world.checkpoint);this.setScreen('play');this.audio.start();
    if(fresh)this.notify('하늘에서 마지막 별이 떨어졌다. 기록자 엘리아에게 다가가 E를 누르세요.');
    else this.notify('별의 기록을 불러왔습니다. 마지막 성소에서 여정을 이어갑니다.');
    this.save(false);
  }
  private loadZone(zone:ZoneId) {
    this.enemies.forEach(e=>e.dispose(this.effects));this.enemies=[];this.clearProjectiles();this.effects.clear();
    this.zone=zone;this.world.load(zone,this.state);
    if(zone!=='rift')this.rematch=false;
    const data=ZONES[zone];this.position.set(data.spawn.x,0,data.spawn.z);this.heading=0;this.player.root.rotation.set(0,0,0);this.player.setStyle(calculateStats(this.state).style);
    this.yaw=0;this.cameraInitialized=false;this.locationBanner=4;this.jumpVelocity=0;this.attack=null;this.dodge=0;this.hurt=0;this.interact=null;this.blocking=false;this.input.clear();
    if(!this.state.world.visited.includes(zone))this.state.world.visited.push(zone);
    this.state.world.checkpoint=zone;
    this.enemies=data.enemies.filter(spawn=>!this.state.world.defeated.includes(spawn.id)||(this.rematch&&spawn.id==='b1')).map(spawn=>new Enemy(spawn,this.scene));
    this.audio.setZone(zone);
    this.saveClock=0;
  }
  private onAction(action:UiAction,value?:string) {
    this.audio.start();this.audio.play('menu');
    switch(action) {
      case 'new':this.start(true);break;
      case 'continue':this.start(false);break;
      case 'resume':this.setScreen('play');break;
      case 'pause':this.setScreen('pause');break;
      case 'close':this.setScreen(this.screen==='settings'?this.settingsBack:'play');break;
      case 'title':
        if(this.sessionStarted)this.save(false);this.sessionStarted=false;this.setScreen('title');this.player.root.visible=false;
        this.enemies.forEach(e=>e.dispose(this.effects));this.enemies=[];this.clearProjectiles();this.effects.clear();this.world.load('haven',this.state);this.audio.setZone('haven');break;
      case 'inventory':this.setScreen('inventory');break;
      case 'quests':this.setScreen('quests');break;
      case 'settings':this.settingsBack=this.screen==='title'?'title':'pause';this.setScreen('settings');break;
      case 'shop':this.setScreen('shop');break;
      case 'accept':
        if(!this.state.quest.accepted){this.state.quest.accepted=true;this.notify('별의 부름을 수락했습니다. 북쪽 아치 너머 숲으로 향하세요.');this.save(false);}this.setScreen('play');break;
      case 'claim':if(value&&claimSideQuest(this.state,value)){this.notify('의뢰 보상을 받았습니다.');this.audio.play('loot');this.save(false);}else this.notify('아직 의뢰의 목표를 달성하지 못했습니다.');break;
      case 'equip':if(value&&equipItem(this.state,value)){this.player.setStyle(calculateStats(this.state).style);this.audio.play('loot');this.save(false);}break;
      case 'unequip':if(value&&['weapon','armor','charm'].includes(value)&&unequipItem(this.state,value as Slot)){this.player.setStyle(calculateStats(this.state).style);this.save(false);}break;
      case 'discard':if(value&&discardItem(this.state,value)){this.notify('아이템을 정리했습니다.');this.save(false);}break;
      case 'sort':this.state.player.inventory.sort((a,b)=>ITEMS[a].kind.localeCompare(ITEMS[b].kind)||ITEMS[a].name.localeCompare(ITEMS[b].name));this.save(false);break;
      case 'potion':this.drinkPotion();break;
      case 'buy':if(value&&buyItem(this.state,value)){this.notify('구매했습니다. 가방에서 확인하세요.');this.audio.play('loot');this.save(false);}else this.notify('골드가 부족하거나 이미 소유한 장비입니다.');break;
      case 'talent':if((value==='power'||value==='spirit')&&investTalent(this.state,value)){this.notify(value==='power'?'검성의 길 · 공격력이 증가했습니다.':'별의 길 · 마나와 생존력이 증가했습니다.');this.audio.play('level');this.save(false);}break;
      case 'retry':{
        const stats=calculateStats(this.state);this.state.player.hp=stats.maxHp;this.state.player.mana=stats.maxMana;this.state.player.gold=Math.max(0,this.state.player.gold-Math.min(20,Math.floor(this.state.player.gold*.05)));
        this.invulnerable=2;this.endingTimer=0;this.loadZone(this.state.world.checkpoint);this.setScreen('play');this.save(false);break;
      }
      case 'restart-boss':
        this.rematch=true;this.state.player.hp=calculateStats(this.state).maxHp;this.state.player.mana=calculateStats(this.state).maxMana;this.endingTimer=0;this.loadZone('rift');this.setScreen('play');this.notify('수호자의 기억에 도전합니다. 첫 처치 보상은 다시 지급되지 않습니다.');this.save(false);break;
      case 'save':this.save();break;
      case 'setting':if(value)this.setSetting(value);break;
      case 'fullscreen':
        if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen().catch(()=>this.notify('이 브라우저에서는 전체 화면을 사용할 수 없습니다.'));break;
    }
    this.refreshUI();
  }
  private setSetting(value:string) {
    const [key,raw]=value.split(':');const settings=this.state.settings;
    if(key==='music'||key==='ambience'||key==='effects')settings[key]=Math.max(0,Math.min(1,Number(raw)||0));
    if(key==='sensitivity')settings.sensitivity=Math.max(.3,Math.min(2,Number(raw)||1));
    if(key==='quality'&&(raw==='low'||raw==='high'))settings.quality=raw;
    if(key==='shake')settings.shake=raw==='true';
    this.applySettings();if(!saveSettings(settings))this.notify('설정을 저장할 수 없습니다. 현재 세션에는 적용됩니다.');
    if(this.screen!=='title'&&this.settingsBack!=='title')this.save(false);
  }
  private drinkPotion() {
    if(usePotion(this.state)){this.audio.play('loot');this.effects.burst(this.position,0x8fffc6,30,2);this.notify('회복 물약 · 생명력과 마나를 회복했습니다.');this.save(false);}
    else this.notify(this.state.player.potions<=0?'회복 물약이 없습니다. 상인에게 구입하세요.':'이미 생명력과 마나가 가득합니다.');
  }
  private nearestObject() {
    let nearest:WorldObject|null=null,distance=3.1;
    for(const object of ZONES[this.zone].objects) {
      if(object.kind==='chest'&&this.state.world.openedChests.includes(object.id))continue;
      if(object.kind==='shard'&&((this.zone==='forest'&&this.state.quest.forestShard)||(this.zone==='temple'&&this.state.quest.templeShard)))continue;
      const d=horizontalDistance(this.position,object);if(d<distance){nearest=object;distance=d;}
    }
    return nearest;
  }
  private interactWithObject() {
    const object=this.nearestObject();if(!object)return;
    if(object.kind==='npc') {
      this.dialogue=this.state.quest.bossDefeated?'별의 핵이 다시 뛰고 있어요. 이제 숲에도, 오래된 신전에도 당신의 빛이 남을 거예요. 고마워요, 별의 계승자.':this.state.quest.templeShard?'두 파편이 하나의 길을 가리켜요. 균열 속 아르켄은 세계를 지키려다 별의 힘에 잠식되었어요. 그에게 마지막 안식을 선물해 주세요.':this.state.quest.forestShard?'숲의 별이 당신을 알아보았군요. 신전의 비문을 기억하세요. 해가 뜨고, 별이 길을 열며, 달이 잠든다.':this.state.quest.accepted?'북쪽 아치 너머 에메랄드 숲으로 가세요. 변이한 짐승 셋을 쓰러뜨리면 숲의 파편이 반응할 거예요. 작은 빛도 길을 잃지 않아요.':'별의 핵이 흩어진 뒤, 숲의 생명들이 길을 잃었어요. 당신에게 반응하는 그 빛… 파편을 되돌릴 수 있겠군요. 숲과 신전의 별을 모아, 균열 속 수호자를 깨워 주세요.';
      this.setScreen('dialogue');
    } else if(object.kind==='shop')this.setScreen('shop');
    else if(object.kind==='portal'&&object.target) {
      const to=object.target;
      if(to==='forest'&&!this.state.quest.accepted){this.notify('먼저 기록자 엘리아에게 별의 부름을 수락하세요.');return;}
      if(to==='temple'&&!this.state.quest.forestShard){this.notify('숲의 별 파편이 이 길을 열어 줍니다.');return;}
      if(to==='rift'&&!this.state.quest.templeShard){this.notify('신전의 세 룬을 깨우고 두 번째 파편을 모으세요.');return;}
      this.audio.play('magic');this.loadZone(to);this.save(false);
    } else if(object.kind==='rest') {
      if(this.enemies.some(e=>!e.dead&&horizontalDistance(e.position,this.position)<9)){this.notify('가까운 적이 성소의 빛을 흔들고 있습니다. 먼저 안전을 확보하세요.');return;}
      const stats=calculateStats(this.state);this.state.player.hp=stats.maxHp;this.state.player.mana=stats.maxMana;this.state.world.checkpoint=this.zone;this.effects.ring(this.position,2,0x8cffe1,1,2);this.audio.play('level');this.save();
    } else if(object.kind==='chest') {
      if(openChest(this.state,object.id)){this.effects.burst(new THREE.Vector3(object.x,0,object.z),0xffdc82,50,3);this.audio.play('loot');this.notify('보물 발견 · 골드와 새로운 유산을 획득했습니다. [I] 가방');this.save(false);}
    } else if(object.kind==='shard') {
      if(this.zone==='forest') {
        if(this.state.quest.forestKills<3){this.notify(`숲의 오염을 정화하세요 · 적 처치 ${this.state.quest.forestKills}/3`);return;}
        if(this.state.quest.forestShard)return;this.state.quest.forestShard=true;addItem(this.state,'forest-shard');addXp(this.state,90);this.state.player.gold+=35;
      } else {
        if(this.state.quest.runes.length<3){this.notify('세 석판이 잠들어 있습니다. 비문: 해 → 별 → 달');return;}
        if(this.state.quest.templeShard)return;this.state.quest.templeShard=true;addItem(this.state,'temple-shard');addXp(this.state,120);this.state.player.gold+=60;
      }
      this.effects.burst(new THREE.Vector3(object.x,1,object.z),0x9affef,70,5);this.audio.play('level');this.notify('별의 파편 획득 · 새로운 길이 열렸습니다.');this.save(false);
    } else if(object.kind==='rune'&&object.rune!==undefined) {
      const result=activateRune(this.state,object.rune);this.audio.play(result==='reset'?'warning':'magic');
      this.effects.ring(new THREE.Vector3(object.x,0,object.z),1.7,result==='reset'?0xff967a:0xffe7a4,.8,1);
      this.notify(result==='complete'?'세 별의 문양이 연결되었습니다. 제단에서 신전의 파편을 얻으세요.':result==='reset'?'빛이 흩어졌습니다. 비문의 순서를 떠올리세요: 해 → 별 → 달':`룬 공명 ${this.state.quest.runes.length}/3 · 다음 석판을 찾으세요.`);this.save(false);
    }
  }
  private aim() {
    // Soft lock prioritizes the nearest target in front, without hitting behind the player.
    const stats=calculateStats(this.state),range=stats.style==='staff'?17:5;
    const nearest=this.enemies.filter(e=>!e.dead&&withinArc(this.position,this.heading,e.position,range,1.5)).sort((a,b)=>horizontalDistance(a.position,this.position)-horizontalDistance(b.position,this.position))[0];
    if(nearest){this.heading=angleToward(this.position,nearest.position);return;}
    if(this.input.pointerUsed&&!document.pointerLockElement) {
      this.raycaster.setFromCamera(new THREE.Vector2(this.input.pointerX/window.innerWidth*2-1,-this.input.pointerY/window.innerHeight*2+1),this.camera);
      if(this.raycaster.ray.intersectPlane(this.ground,this.aimedPoint)&&horizontalDistance(this.position,this.aimedPoint)>.5)this.heading=angleToward(this.position,this.aimedPoint);
    }
  }
  private beginAttack(kind:Attack['kind']) {
    if(this.attack||this.dodge>0||this.hurt>.18||this.blocking)return;
    const stats=calculateStats(this.state);
    if(kind==='q'&&(this.cooldowns.q>0||this.state.player.mana<18)){if(this.cooldowns.q<=0)this.notify('별빛 폭발에는 마나 18이 필요합니다.');return;}
    if(kind==='r'&&this.state.player.level<3){this.notify('별의 창은 레벨 3에 해금됩니다.');return;}
    if(kind==='r'&&(this.cooldowns.r>0||this.state.player.mana<30)){if(this.cooldowns.r<=0)this.notify('별의 창에는 마나 30이 필요합니다.');return;}
    if(kind==='basic'&&stats.style==='staff'&&this.state.player.mana<4)return;
    this.aim();
    if(kind==='basic'){this.combo=this.comboWindow>0?(this.combo+1)%3:0;this.comboWindow=1.2;if(stats.style==='staff')this.state.player.mana-=4;}
    if(kind==='q'){this.state.player.mana-=18;this.cooldowns.q=5.5;this.audio.play('magic');this.effects.ring(this.position,.8,0x96ffdc,.4,3);}
    if(kind==='r'){this.state.player.mana-=30;this.cooldowns.r=11;this.audio.play('lance');this.effects.burst(this.position,0xe6bbff,28,2);}
    const duration=kind==='q'?.65:kind==='r'?.85:stats.style==='staff'?.66:[.44,.48,.64][this.combo];
    this.attack={kind,remaining:duration,duration,fired:false,combo:this.combo};
    this.attackBuffer=0;
  }
  private resolveAttack(attack:Attack) {
    const stats=calculateStats(this.state);
    const facing=new THREE.Vector3(-Math.sin(this.heading),0,-Math.cos(this.heading));
    if(attack.kind==='basic') {
      this.audio.play('swing');
      if(stats.style==='staff') {this.spawnProjectile(this.position.clone().add(new THREE.Vector3(0,1.3,0)).addScaledVector(facing,.8),facing,stats.attack*1.2,false,false);}
      else {
        this.effects.slash(this.position,this.heading,attack.combo===2?0xffdfa0:0xc9ffef,attack.combo===2);
        for(const enemy of this.enemies)if(!enemy.dead&&withinArc(this.position,this.heading,enemy.position,3.3+(enemy.spawn.kind==='boss'?1:0),1.2))this.hitEnemy(enemy,stats.attack*[1,1.12,1.65][attack.combo]);
      }
    } else if(attack.kind==='q') {
      this.effects.ring(this.position,1.5,0x7cffe1,.65,3.2);this.effects.ring(this.position,1.1,0xe7fff7,.4,4);this.effects.burst(this.position,0x82ffdf,65,6);
      for(const enemy of this.enemies)if(!enemy.dead&&horizontalDistance(this.position,enemy.position)<5.7)this.hitEnemy(enemy,stats.attack*2.05);
    } else {
      const from=this.position.clone().setY(1.25);const to=from.clone().addScaledVector(facing,19);
      this.effects.beam(from,to,0xd1b0ff);this.effects.ring(this.position,1.5,0xd5b5ff,.5,1.5);
      for(const enemy of this.enemies)if(!enemy.dead&&segmentDistance(enemy.position,from,to)<1.35)this.hitEnemy(enemy,stats.attack*3.6);
    }
  }
  private hitEnemy(enemy:Enemy,raw:number) {
    if(enemy.dead)return;
    const stats=calculateStats(this.state),critical=Math.random()<stats.crit;
    const damage=damageAmount(raw*(critical?1.65:1),enemy.config.defense);
    const killed=enemy.damage(damage,this.position,this.effects);
    this.effects.burst(enemy.position,critical?0xffe4a1:0xd0fff0,critical?30:16,3);this.audio.play('hit');this.shake=Math.max(this.shake,critical?.12:.05);
    this.float(`${critical?'✦ ':''}${damage}`,enemy.position,critical?'#ffe1a1':'#fff5dc');
    if(killed) {
      const reward=awardEnemy(this.state,enemy.spawn.id,enemy.spawn.kind,this.zone);
      if(reward){this.float(`+${reward.xp} XP`,enemy.position.clone().add(new THREE.Vector3(0,1,0)),'#a2f8d7');this.audio.play('loot');if(reward.levelUp){this.effects.ring(this.position,1,0xffdf8a,1,4);this.audio.play('level');this.notify(`LEVEL ${this.state.player.level} · 별의 힘이 깨어납니다. [I]에서 특성을 선택하세요.`);}this.save(false);}
      if(enemy.spawn.kind==='boss') {this.state.quest.bossDefeated=true;this.endingTimer=3;this.effects.burst(enemy.position,0xffedb1,140,9);this.effects.ring(enemy.position,3,0xffe8ae,2,5);this.audio.play('win');this.notify('별의 핵이 복원되었습니다. 아르켄은 마침내 검을 내려놓습니다.');this.save(false);}
    }
  }
  private hitPlayer(raw:number,from:THREE.Vector3) {
    if(this.invulnerable>0||this.screen!=='play'||this.state.player.hp<=0||this.endingTimer>0)return;
    const stats=calculateStats(this.state);
    const guarded=this.blocking&&this.state.player.mana>=6&&withinArc(this.position,this.heading,from,50,1.4);
    const damage=damageAmount(raw,stats.defense,guarded);
    if(guarded){this.state.player.mana=Math.max(0,this.state.player.mana-6);this.effects.ring(this.position,.9,0xb1dfff,.25,.4);this.audio.play('hit');}
    else {this.hurt=.28;this.attack=null;this.audio.play('hurt');this.shake=.18;this.position.addScaledVector(this.position.clone().sub(from).setY(0).normalize(),.45);this.world.constrain(this.position,.65);}
    this.state.player.hp=Math.max(0,this.state.player.hp-damage);this.invulnerable=.4;this.float(guarded?`방어 −${damage}`:`−${damage}`,this.position,'#ffac9d');
    if(this.state.player.hp<=0){this.state.stats.deaths++;this.audio.play('death');this.save(false);this.setScreen('death');}
  }
  private spawnProjectile(from:THREE.Vector3,direction:THREE.Vector3,damage:number,hostile:boolean,pierce:boolean) {
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(hostile?.23:.18,1),new THREE.MeshBasicMaterial({color:hostile?0xffa181:0x9dffe6}));
    mesh.position.copy(from);const trail=new THREE.Mesh(new THREE.ConeGeometry(.12,.9,6),new THREE.MeshBasicMaterial({color:hostile?0xff715b:0x75e5d6,transparent:true,opacity:.4}));trail.rotation.x=Math.PI/2;trail.position.z=.45;mesh.add(trail);mesh.rotation.y=angleToward(from,from.clone().add(direction));this.scene.add(mesh);
    this.projectiles.push({mesh,velocity:direction.clone().normalize().multiplyScalar(hostile?8:22),life:hostile?3:1,damage,hostile,pierce,hit:new Set()});
  }
  private updateProjectiles(dt:number) {
    for(let i=this.projectiles.length-1;i>=0;i--) {
      const p=this.projectiles[i],old=p.mesh.position.clone();p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);
      if(p.hostile){if(segmentDistance(this.position,old,p.mesh.position)<.7&&Math.abs(this.position.y+.9-p.mesh.position.y)<1.4){this.hitPlayer(p.damage,old);p.life=0;}}
      else for(const enemy of this.enemies){if(!enemy.dead&&!p.hit.has(enemy.spawn.id)&&segmentDistance(enemy.position,old,p.mesh.position)<(enemy.spawn.kind==='boss'?1.5:.9)){this.hitEnemy(enemy,p.damage);p.hit.add(enemy.spawn.id);if(!p.pierce){p.life=0;break;}}}
      if(p.life<=0){this.disposeProjectile(p);this.projectiles.splice(i,1);}
    }
  }
  private disposeProjectile(p:Projectile){this.scene.remove(p.mesh);p.mesh.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}});}
  private clearProjectiles(){this.projectiles.forEach(p=>this.disposeProjectile(p));this.projectiles=[];}
  private float(text:string,position:THREE.Vector3,color:string) {const projected=position.clone().add(new THREE.Vector3(0,2.5,0)).project(this.camera);this.ui.floating(text,(projected.x*.5+.5)*window.innerWidth,(-projected.y*.5+.5)*window.innerHeight,color);}
  private updatePlayer(dt:number) {
    const stats=calculateStats(this.state);
    for(const key of Object.keys(this.cooldowns) as (keyof typeof this.cooldowns)[])this.cooldowns[key]=Math.max(0,this.cooldowns[key]-dt);
    this.invulnerable=Math.max(0,this.invulnerable-dt);this.hurt=Math.max(0,this.hurt-dt);this.comboWindow=Math.max(0,this.comboWindow-dt);this.attackBuffer=Math.max(0,this.attackBuffer-dt);
    this.state.player.mana=Math.min(stats.maxMana,this.state.player.mana+dt*(this.blocking?1:7+this.state.player.talents.spirit));
    this.blocking=this.input.guard&&!this.attack&&this.dodge<=0&&this.state.player.mana>0;
    const movement=new THREE.Vector3((this.input.keys.has('KeyD')?1:0)-(this.input.keys.has('KeyA')?1:0),0,(this.input.keys.has('KeyS')?1:0)-(this.input.keys.has('KeyW')?1:0));
    if(movement.lengthSq()>0)movement.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),this.yaw);
    if(this.input.take('ShiftLeft')||this.input.take('ShiftRight')) {
      if(this.cooldowns.dash===0&&this.state.player.mana>=8){this.attack=null;this.blocking=false;this.dodge=.3;this.invulnerable=.32;this.cooldowns.dash=1.4;this.state.player.mana-=8;this.dashDirection.copy(movement.lengthSq()?movement:new THREE.Vector3(-Math.sin(this.heading),0,-Math.cos(this.heading)));this.effects.burst(this.position,0x9fefff,20,2);this.audio.play('dash');}
    }
    if(this.input.take('Space')&&this.position.y<.03&&this.dodge<=0)this.jumpVelocity=7;
    if(this.position.y>0||this.jumpVelocity>0){this.jumpVelocity-=19*dt;this.position.y=Math.max(0,this.position.y+this.jumpVelocity*dt);if(this.position.y===0)this.jumpVelocity=0;}
    if(this.input.take('KeyQ'))this.beginAttack('q');
    if(this.input.take('KeyR'))this.beginAttack('r');
    if(this.input.take('Attack'))this.attackBuffer=.25;
    if((this.input.attack||this.attackBuffer>0)&&!this.attack)this.beginAttack('basic');
    if(this.attack) {
      this.attack.remaining-=dt;
      if(!this.attack.fired&&this.attack.remaining<=this.attack.duration*.53){this.attack.fired=true;this.resolveAttack(this.attack);}
      if(this.attack.remaining<=0)this.attack=null;
    }
    const speed=this.dodge>0?18:this.blocking?2.3:this.attack?2.8:this.hurt>0?1.8:6;
    if(this.dodge>0){this.position.addScaledVector(this.dashDirection,speed*dt);this.dodge=Math.max(0,this.dodge-dt);}
    else if(movement.lengthSq()>0){this.position.addScaledVector(movement,speed*dt);if(!this.attack)this.heading=dampAngle(this.heading,Math.atan2(-movement.x,-movement.z),16,dt);}
    this.world.constrain(this.position,.65);
    for(const enemy of this.enemies)if(!enemy.dead){const distance=horizontalDistance(this.position,enemy.position),min=enemy.spawn.kind==='boss'?1.6:1.0;if(distance<min&&distance>.01&&this.dodge<=0)this.position.addScaledVector(this.position.clone().sub(enemy.position).setY(0).normalize(),min-distance);}
    this.world.constrain(this.position,.65);this.player.root.rotation.y=this.heading;
    this.player.animate(dt,{moving:movement.lengthSq()>0,speed,attack:this.attack?.remaining??0,attackDuration:this.attack?.duration??1,dodge:this.dodge,hurt:this.hurt,dead:false,blocking:this.blocking,phase:1,time:this.elapsed});
    if(movement.lengthSq()>0&&this.position.y<.05){this.footstep+=dt;if(this.footstep>.36){this.audio.play('step');this.footstep=0;}}
    this.interact=this.nearestObject();
    if(this.input.take('KeyE')&&!this.attack&&this.dodge<=0)this.interactWithObject();
    if(this.input.take('Digit1'))this.drinkPotion();
  }
  private handleMenus() {
    if(this.input.take('Escape')){if(this.screen==='play')this.setScreen('pause');else if(this.screen==='pause')this.setScreen('play');else if(['inventory','quests','dialogue','shop','settings'].includes(this.screen))this.onAction('close');}
    if(this.input.take('KeyI')&&['play','inventory'].includes(this.screen))this.setScreen(this.screen==='inventory'?'play':'inventory');
    if(this.input.take('KeyJ')&&['play','quests'].includes(this.screen))this.setScreen(this.screen==='quests'?'play':'quests');
    if(this.input.take('KeyV')&&this.screen==='play')this.input.toggleLock();
  }
  private updateCamera(dt:number) {
    if(this.screen==='title'||(this.screen==='settings'&&this.settingsBack==='title')) {
      const angle=this.elapsed*.025;this.camera.position.set(30*Math.cos(angle)+4,22,32+Math.sin(angle)*8);this.camera.lookAt(0,2,-4);return;
    }
    if(this.screen==='play'){this.yaw-=this.input.deltaX*.004*this.state.settings.sensitivity;this.pitch=Math.max(.32,Math.min(1,this.pitch+this.input.deltaY*.003));this.distance=Math.max(11,Math.min(25,this.distance+this.input.zoom));}
    const desiredTarget=this.position.clone().setY(1.1);
    if(!this.cameraInitialized){this.cameraTarget.copy(desiredTarget);this.cameraInitialized=true;}else this.cameraTarget.lerp(desiredTarget,1-Math.exp(-10*dt));
    const offset=new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);
    this.camera.position.copy(this.cameraTarget).add(offset);
    if(this.shake>0&&this.state.settings.shake)this.camera.position.add(new THREE.Vector3((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake,0));
    this.camera.lookAt(this.cameraTarget);this.shake=Math.max(0,this.shake-dt);
  }
  private snapshot():UiSnapshot {
    const boss=this.enemies.find(e=>e.spawn.kind==='boss'&&!e.dead);
    const enemyViews=this.enemies.filter(e=>!e.dead).map(enemy=>{const p=enemy.position.clone().add(new THREE.Vector3(0,enemy.spawn.kind==='boss'?4.5:2.8,0)).project(this.camera);return {id:enemy.spawn.id,kind:enemy.spawn.kind,hp:enemy.hp,maxHp:enemy.config.hp,x:enemy.position.x,z:enemy.position.z,screenX:(p.x*.5+.5)*window.innerWidth,screenY:(-p.y*.5+.5)*window.innerHeight};});
    const tutorial=!this.state.quest.accepted?'W A S D 이동 · 엘리아에게 다가가 E로 대화':this.zone==='haven'?'북쪽 아치에서 E · 에메랄드 숲으로':this.state.stats.kills<1?'좌클릭 연속 공격 · Shift 회피 · 우클릭 방어 · Q 별빛 폭발':this.state.player.level<3?'I 장비 및 성장 · 1 회복 물약 · 마우스 휠 버튼 드래그 시점 · V 마우스 잠금':'';
    return {screen:this.screen,state:this.state,stats:calculateStats(this.state),zone:this.zone,zoneName:ZONES[this.zone].name,objective:objective(this.state),player:{x:this.position.x,z:this.position.z},heading:this.heading,enemies:enemyViews,objects:ZONES[this.zone].objects,interact:this.interact?.label??null,cooldowns:{...this.cooldowns},blocking:this.blocking,notice:this.noticeTime>0?this.notice:'',noticeId:this.noticeId,saveAvailable:hasSave(),tutorial,dialogue:this.dialogue,boss:boss?{hp:boss.hp,maxHp:boss.config.hp,phase:boss.phase,warning:boss.warning}:null,locationBanner:this.locationBanner,elapsed:this.elapsed};
  }
  private refreshUI(){if(this.ui)this.ui.render(this.snapshot());}
  private frame=(timestamp:number)=>{
    if(this.disposed)return;
    const dt=Math.min(.04,Math.max(0,(timestamp-(this.lastFrame||timestamp))/1000));this.lastFrame=timestamp;
    this.elapsed+=dt;this.handleMenus();this.audio.update();
    if(this.screen==='play') {
      this.state.stats.playTime+=dt;this.updatePlayer(dt);
      if(this.screen==='play')for(const enemy of this.enemies)enemy.update({player:this.position,dt,time:this.elapsed,effects:this.effects,hitPlayer:(raw,from)=>this.hitPlayer(raw,from),fire:(from,to,damage)=>this.spawnProjectile(from.clone().setY(1.3),to.clone().sub(from).setY(0).normalize(),damage,true,false),sound:sound=>this.audio.play(sound),constrain:(position,radius)=>this.world.constrain(position,radius)});
      if(this.screen==='play')this.updateProjectiles(dt);
      this.effects.update(dt);this.world.update(dt,this.elapsed,this.state);this.locationBanner=Math.max(0,this.locationBanner-dt);this.noticeTime=Math.max(0,this.noticeTime-dt);
      this.saveClock+=dt;if(this.saveClock>20){this.saveClock=0;this.save(false);}
      if(this.endingTimer>0){this.endingTimer-=dt;if(this.endingTimer<=0)this.setScreen('ending');}
    } else if(this.screen==='title')this.world.update(dt,this.elapsed,this.state);
    else if(this.screen==='death')this.player.animate(dt,{moving:false,speed:0,attack:0,attackDuration:1,dodge:0,hurt:0,dead:true,blocking:false,phase:1,time:this.elapsed});
    this.updateCamera(dt);this.input.flush();
    this.uiClock+=dt;if(this.uiClock>.08){this.uiClock=0;this.refreshUI();}
    if(!this.contextLost)this.renderer.render(this.scene,this.camera);
    this.frameId=requestAnimationFrame(this.frame);
  };
  /** Development-only browser fixtures. Never exposed by the production entry point. */
  testing() {
    return {
      snapshot:()=>JSON.parse(JSON.stringify(this.snapshot())) as UiSnapshot,
      action:(action:UiAction,value?:string)=>this.onAction(action,value),
      position:(x:number,z:number,heading=0)=>{this.position.set(x,0,z);this.heading=heading;this.cameraInitialized=false;},
      attack:(kind:Attack['kind'])=>this.beginAttack(kind),
      interact:()=>this.interactWithObject(),
      input:(code:string,down:boolean)=>{if(down)this.input.keys.add(code);else this.input.keys.delete(code);},
      face:(heading:number)=>{this.heading=heading;},
      metrics:()=>({drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,projectiles:this.projectiles.length,playerY:this.position.y,enemyModes:this.enemies.map(e=>({id:e.spawn.id,mode:e.mode,hp:e.hp}))})
    };
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frameId);this.abort.abort();this.input.dispose();this.enemies.forEach(e=>e.dispose(this.effects));this.clearProjectiles();this.player.dispose();this.effects.dispose();this.world.dispose();this.ui.dispose();this.audio.dispose();this.renderer.dispose();}
}
