import * as THREE from 'three';
import type { EnemyKind, WeaponStyle } from './contracts';

type Animation = { moving: boolean; speed: number; attack: number; attackDuration: number; dodge: number; hurt: number; dead: boolean; blocking: boolean; phase: number; time: number };
type Limb = { pivot: THREE.Group; side: number; front: boolean };

/** Original, articulated low-poly characters. All dimensions are in world metres. */
export class ActorView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private limbs: Limb[] = [];
  private rightArm?: THREE.Group;
  private leftArm?: THREE.Group;
  private sword = new THREE.Group();
  private staff = new THREE.Group();
  private ornaments: THREE.Object3D[] = [];
  private cape?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private capeBase?: Float32Array;
  private materials: THREE.MeshStandardMaterial[] = [];
  private materialEmissions: THREE.Color[] = [];
  private kind: 'player' | EnemyKind;
  private clock = 0;
  private bobBase = 0;

  constructor(kind: 'player' | EnemyKind) {
    this.kind = kind;
    this.root.add(this.body);
    this.root.name = `actor-${kind}`;
    if (kind === 'wisp') this.buildWisp();
    else if (kind === 'stalker' || kind === 'charger') this.buildBeast(kind);
    else this.buildKnight(kind);
    this.root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.materialEmissions = this.materials.map(m => m.emissive.clone());
  }

  private mat(color: number, metalness = .15, roughness = .65, glow = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: glow, emissiveIntensity: glow ? .9 : 0 });
    this.materials.push(m); return m;
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); parent.add(mesh); return mesh;
  }
  private sphere(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, detail = 1) {
    return this.mesh(new THREE.IcosahedronGeometry(1, detail), mat, parent, x,y,z,sx,sy,sz);
  }
  private cone(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, radius: number, height: number) {
    return this.mesh(new THREE.ConeGeometry(radius,height,6), mat, parent,x,y,z);
  }
  private ring(parent: THREE.Object3D, mat: THREE.Material, radius: number, tube: number, x: number, y: number, z: number) {
    return this.mesh(new THREE.TorusGeometry(radius,tube,5,32), mat,parent,x,y,z);
  }
  private buildKnight(kind: 'player' | 'sentinel' | 'boss') {
    const hero = kind === 'player', boss = kind === 'boss';
    const silver = this.mat(hero ? 0xc6d9d7 : boss ? 0x293345 : 0xb2b1a0, .72,.32);
    const edge = this.mat(hero ? 0xeedba1 : boss ? 0xb9a3d8 : 0xe7d4a3,.62,.37);
    const dark = this.mat(hero ? 0x203e4c : 0x171b31,.25,.75);
    const fabric = this.mat(hero ? 0x275f7b : boss ? 0x481f65 : 0x465e5d,.05,.96);
    const light = this.mat(hero ? 0x92f5df : boss ? 0xde7fff : 0x82e4db,.2,.22,hero ? 0x57d9c9 : boss ? 0xa633f2 : 0x39bfae);
    const skin = this.mat(0xdab690,.03,.9);
    const metal = this.mat(0xe3e9dc,.8,.22);
    const heightScale = boss ? 1.8 : hero ? 1 : 1.2;
    this.body.scale.setScalar(heightScale);
    this.bobBase = 0;

    // Torso is a tapered cuirass with overlapping plates and articulated shoulders.
    this.mesh(new THREE.CylinderGeometry(.32,.25,.62,6), silver,this.body,0,1.29,0,1,1,.68);
    this.sphere(this.body,dark,0,1.03,0,.3,.27,.22);
    this.mesh(new THREE.CylinderGeometry(.29,.3,.105,8), edge,this.body,0,1.04,0,1,1,.82);
    this.sphere(this.body,edge,0,1.42,-.22,.19,.19,.045,0);
    this.sphere(this.body,light,0,1.42,-.27,.065,.085,.04,0);
    for (const side of [-1,1]) {
      const skirt = this.mesh(new THREE.BoxGeometry(.22,.35,.07),silver,this.body,side*.2,.88,-.12);
      skirt.rotation.z = side*.16;
      this.mesh(new THREE.BoxGeometry(.025,.28,.02),edge,skirt,0,0,-.05);
      const leg = new THREE.Group(); leg.position.set(side*.16,.94,0); this.body.add(leg);
      this.sphere(leg,dark,0,-.21,0,.12,.25,.13);
      this.sphere(leg,silver,0,-.45,-.035,.135,.14,.14,0);
      this.mesh(new THREE.CylinderGeometry(.1,.12,.32,6),silver,leg,0,-.64,.015);
      this.sphere(leg,dark,0,-.85,-.065,.14,.09,.22);
      this.mesh(new THREE.BoxGeometry(.19,.045,.27),edge,leg,0,-.9,-.045);
      this.limbs.push({pivot:leg,side,front:false});

      const arm = new THREE.Group(); arm.position.set(side*.4,1.49,0); this.body.add(arm);
      this.sphere(arm,silver,0,0,0,.23,.17,.23,0);
      this.sphere(arm,edge,side*.03,.035,0,.235,.09,.24,0);
      this.mesh(new THREE.CylinderGeometry(.095,.09,.28,7),dark,arm,0,-.22,0);
      this.sphere(arm,silver,0,-.43,-.02,.115,.18,.12,0);
      this.sphere(arm,dark,0,-.64,-.025,.085,.11,.085);
      if (side === 1) this.rightArm = arm; else this.leftArm = arm;
      this.limbs.push({pivot:arm,side,front:true});
    }

    this.head.position.y = 1.73; this.body.add(this.head);
    if (hero) {
      this.sphere(this.head,skin,0,.06,-.035,.17,.205,.165);
      this.sphere(this.head,dark,0,.17,.01,.18,.15,.17);
      // Swept hood and cheeks, leaving the luminous visor readable at game scale.
      this.sphere(this.head,silver,0,.16,.03,.22,.195,.2,0);
      this.mesh(new THREE.BoxGeometry(.31,.08,.045),dark,this.head,0,.06,-.17);
      for (const side of [-1,1]) this.mesh(new THREE.BoxGeometry(.075,.028,.015),light,this.head,side*.075,.065,-.198);
      this.mesh(new THREE.BoxGeometry(.035,.26,.03),edge,this.head,0,.15,-.19);
      this.cone(this.head,edge,0,.38,.035,.04,.18).rotation.x = -.4;
    } else {
      this.sphere(this.head,silver,0,.09,0,.21,.26,.19,0);
      this.mesh(new THREE.BoxGeometry(.3,.045,.035),light,this.head,0,.11,-.175);
      this.cone(this.head,edge,0,-.12,-.04,.13,.24).rotation.z = Math.PI;
      for (const side of [-1,1]) {
        const horn = this.cone(this.head,edge,side*.22,.29,.02,boss ? .085 : .055,boss ? .6 : .3); horn.rotation.z = -side*.5;
        if (boss) this.cone(this.head,edge,side*.35,.54,.02,.045,.28).rotation.z = side*.35;
      }
    }
    this.makeCape(fabric,hero ? .85 : 1.06,hero ? 1.3 : 1.45);
    const collar = this.ring(this.body,edge,.25,.035,0,1.61,.01); collar.rotation.x = Math.PI/2; collar.scale.y=.7;

    this.rightArm!.add(this.sword); this.sword.position.set(0,-.66,-.025);
    this.mesh(new THREE.CylinderGeometry(.035,.035,.25,6),dark,this.sword,0,-.035,0);
    this.sphere(this.sword,edge,0,.12,0,.065,.05,.055,0);
    this.mesh(new THREE.BoxGeometry(.34,.055,.08),edge,this.sword,0,-.15,0);
    const bladeShape = new THREE.Shape(); bladeShape.moveTo(-.07,-.17); bladeShape.lineTo(.07,-.17); bladeShape.lineTo(.075,-.95); bladeShape.lineTo(0,-1.18); bladeShape.lineTo(-.075,-.95); bladeShape.closePath();
    const blade = this.mesh(new THREE.ExtrudeGeometry(bladeShape,{depth:.035,bevelEnabled:false}),metal,this.sword,0,0,-.02);
    if (boss) blade.scale.set(1.8,1.45,1.5);
    this.mesh(new THREE.BoxGeometry(.02,.7,.045),light,this.sword,0,-.54,0);

    this.rightArm!.add(this.staff); this.staff.position.set(0,-.57,0); this.staff.rotation.x=.15;
    this.mesh(new THREE.CylinderGeometry(.035,.045,1.9,7),dark,this.staff,0,.1,0);
    for (const y of [-.65,.45,.8]) this.mesh(new THREE.CylinderGeometry(.055,.055,.11,7),edge,this.staff,0,y,0);
    const crown=this.ring(this.staff,edge,.19,.032,0,1.02,0); crown.scale.y=1.3;
    this.sphere(this.staff,light,0,1.02,0,.115,.2,.115,0);
    this.staff.visible=false;
    if (hero) {
      const shield=this.mesh(new THREE.CylinderGeometry(.26,.22,.065,6),dark,this.leftArm!,0,-.41,-.03);shield.rotation.x=Math.PI/2;shield.scale.y=1.22;
      const rim=this.ring(this.leftArm!,edge,.23,.025,0,-.41,-.075);rim.scale.y=1.18;
      this.sphere(this.leftArm!,silver,0,-.41,-.08,.09,.12,.04,0);
      this.mesh(new THREE.CylinderGeometry(.05,.06,.85,5),dark,this.body,-.24,1.15,.28).rotation.z=-.4;
    }
    if (boss) {
      const halo=this.ring(this.body,light,.7,.023,0,2.05,.27); this.ornaments.push(halo);
      for (let i=0;i<8;i++) { const a=i*Math.PI/4; const spike=this.cone(halo,edge,Math.sin(a)*.78,Math.cos(a)*.78,0,.045,.2);spike.rotation.z=-a; }
      for (const side of [-1,1]) for(let i=0;i<3;i++){ const spike=this.cone(this.body,edge,side*(.5+i*.1),1.65-i*.035,.08,.06,.4-i*.05);spike.rotation.z=-side*(.5+i*.25); }
    }
  }

  private makeCape(material: THREE.MeshStandardMaterial, width:number,height:number) {
    material.side=THREE.DoubleSide;
    const geometry=new THREE.PlaneGeometry(width,height,8,10); const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++) { const progress=(height/2-p.getY(i))/height; p.setXYZ(i,p.getX(i)*(.5+progress*.5),p.getY(i)-height/2,.07+progress*progress*.15); }
    geometry.computeVertexNormals();this.capeBase=new Float32Array(p.array);
    this.cape=new THREE.Mesh(geometry,material);this.cape.position.set(0,1.62,.17);this.body.add(this.cape);
  }

  private buildWisp() {
    const dark=this.mat(0x243958,.5,.4),gold=this.mat(0xb6c5c9,.65,.35),glow=this.mat(0x77e9ff,.1,.2,0x36b8ff);
    this.bobBase=1.15;this.body.position.y=this.bobBase;
    this.sphere(this.body,glow,0,0,0,.28,.38,.28,0);
    this.sphere(this.body,dark,0,.08,.02,.35,.4,.22,0);
    this.sphere(this.body,glow,0,.05,-.2,.18,.16,.07,0);
    for(let i=0;i<3;i++){const g=new THREE.Group();g.rotation.z=i*Math.PI*2/3;this.body.add(g);const shard=this.cone(g,gold,0,.56,0,.15,.6);shard.rotation.z=.35;this.ornaments.push(g);}
    const r=this.ring(this.body,glow,.52,.022,0,0,0);r.rotation.x=1.1;this.ornaments.push(r);
    for(let i=0;i<4;i++){const s=this.sphere(this.body,glow,Math.sin(i*2)*.15,-.55-i*.15,Math.cos(i*2)*.1,.06-i*.009,.12,.06-i*.009,0);this.ornaments.push(s);}
    this.mesh(new THREE.CircleGeometry(.5,24),new THREE.MeshBasicMaterial({color:0x51d2f7,transparent:true,opacity:.08,depthWrite:false,side:THREE.DoubleSide}),this.root,0,.025,0).rotation.x=-Math.PI/2;
  }

  private buildBeast(kind:'stalker'|'charger') {
    const charge=kind==='charger';const fur=this.mat(charge?0x45535c:0x29434d,.2,.8),dark=this.mat(0x172e38,.2,.85),plate=this.mat(charge?0x9caba0:0x567f7b,.35,.6),ivory=this.mat(0xe1d7ad,.15,.65),glow=this.mat(charge?0xffa176:0x91efe4,.1,.3,charge?0xe95728:0x3ba99e);
    this.body.scale.setScalar(charge?1.35:1.05);
    this.sphere(this.body,fur,0,.72,.03,.4,.43,.7);
    this.sphere(this.body,plate,0,.91,-.13,.46,.34,.48,0);
    this.head.position.set(0,.78,-.64);this.body.add(this.head);
    this.sphere(this.head,fur,0,.02,0,.31,.3,.35,0);
    this.sphere(this.head,dark,0,-.1,-.28,.21,.16,.25,0);
    this.sphere(this.head,dark,0,-.07,-.48,.13,.075,.06,0);
    for(const side of [-1,1]){
      const ear=this.cone(this.head,plate,side*.22,.3,.04,.12,.3);ear.rotation.z=-side*.25;
      this.sphere(this.head,glow,side*.235,.045,-.19,.065,.045,.075,0);
      const fang=this.cone(this.head,ivory,side*.14,-.22,-.28,.035,.15);fang.rotation.z=Math.PI;
      if(charge){const horn=this.cone(this.head,ivory,side*.31,.03,-.31,.095,.6);horn.rotation.x=-1.18;horn.rotation.z=side*.28;}
      for(const front of [true,false]){
        const leg=new THREE.Group();leg.position.set(side*.29,.69,front?-.38:.46);this.body.add(leg);
        this.mesh(new THREE.CylinderGeometry(.115,.08,.34,6),fur,leg,0,-.15,0).rotation.x=front?-.2:.35;
        this.mesh(new THREE.CylinderGeometry(.065,.075,.25,6),dark,leg,0,-.43,front?.04:-.06).rotation.x=-.15;
        this.sphere(leg,dark,0,-.59,-.04,.105,.065,.16,0);
        for(let j=0;j<3;j++){const c=this.cone(leg,ivory,(j-1)*.05,-.58,-.18,.016,.09);c.rotation.x=-Math.PI/2;}
        this.limbs.push({pivot:leg,side,front});
      }
    }
    const tail=this.cone(this.body,fur,0,.83,.89,.17,.8);tail.rotation.x=1.2;this.ornaments.push(tail);
    for(let i=0;i<5;i++){const spike=this.cone(this.body,charge?ivory:plate,0,1.12,.45-i*.19,.08,.18+(4-i)*.025);spike.rotation.x=.35;}
  }

  setStyle(style:WeaponStyle) { this.sword.visible=style==='sword';this.staff.visible=style==='staff'; }

  animate(dt:number,a:Animation) {
    this.clock+=dt*(a.moving?Math.min(11,a.speed*2.1):2);
    const walk=a.moving?1:0, cycle=this.clock;
    const beast=this.kind==='stalker'||this.kind==='charger',wisp=this.kind==='wisp';
    const attack=a.attack>0?Math.sin(Math.min(1,1-a.attack/Math.max(.1,a.attackDuration))*Math.PI):0;
    for(const l of this.limbs){
      const phase=l.side*(l.front?-1:1);l.pivot.rotation.x=Math.sin(cycle+phase*Math.PI*.5)*walk*(beast?.65:.48);l.pivot.rotation.z=beast?0:l.front?l.side*.1:0;
    }
    if(this.rightArm){this.rightArm.rotation.x+=attack*2.5;this.rightArm.rotation.z-=attack*1.25;this.rightArm.rotation.y=-attack*.8;}
    if(this.leftArm){this.leftArm.rotation.x+=a.blocking?1.4:attack*.25;this.leftArm.rotation.y=a.blocking?-.8:0;}
    this.body.position.y=this.bobBase+(wisp?Math.sin(a.time*2.3)*.16:Math.abs(Math.sin(cycle))*walk*.055);
    this.body.rotation.x=a.dead?1.4:a.dodge>0?.7:beast?attack*.2:walk*.055;
    this.body.rotation.z=a.dead?1.15:Math.sin(cycle)*walk*.025;
    this.body.rotation.y=beast?0:-attack*.42;
    if(a.dead)this.body.position.y=wisp?.15:.16;
    this.head.rotation.x=beast?-attack*.5:Math.sin(a.time*1.5)*.025;
    this.head.rotation.y=walk?Math.sin(cycle)*.025:Math.sin(a.time*.6)*.08;
    if(this.cape&&this.capeBase){const p=this.cape.geometry.attributes.position;for(let i=0;i<p.count;i++){const j=i*3,fall=-this.capeBase[j+1];p.setZ(i,this.capeBase[j+2]+Math.sin(a.time*4+this.capeBase[j]*3+fall*3)*fall*.045+walk*fall*.16+attack*fall*.11);}p.needsUpdate=true;}
    for(let i=0;i<this.ornaments.length;i++){const o=this.ornaments[i];if(wisp){o.rotation.y+=dt*(i%2?-.5:.65);if(i<3)o.rotation.z+=dt*.35;}else if(this.kind==='boss'){o.rotation.z+=dt*(a.phase>1?.65:.2);}else o.rotation.z=Math.sin(a.time*3)*.15;}
    for(let i=0;i<this.materials.length;i++){const m=this.materials[i];m.emissive.copy(this.materialEmissions[i]);if(a.hurt>0){m.emissive.lerp(new THREE.Color(0xffffff),.65);m.emissiveIntensity=.7;}else m.emissiveIntensity=this.materialEmissions[i].getHex()!==0?(this.kind==='boss'&&a.phase>1?1.6:.85):0;}
  }

  dispose(){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());this.root.removeFromParent();}
}
