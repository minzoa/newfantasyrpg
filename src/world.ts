import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameState, WorldObject, ZoneId } from './contracts';
import { ZONES } from './zones';

type AnimatedProp = { kind: string; root: THREE.Group; core?: THREE.Object3D; secondary?: THREE.Object3D; id: string; index?: number; baseY?: number };
type Palette = { grass:number; grassLight:number; stone:number; stoneLight:number; bark:number; leaf:number; leafLight:number; sky:number; fog:number; accent:number; path:number };
const PALETTES:Record<ZoneId,Palette>={
  haven:{grass:0x6a9b68,grassLight:0x9db579,stone:0x888c7a,stoneLight:0xd5cdb2,bark:0x605d46,leaf:0x347b64,leafLight:0x78aa77,sky:0xb3d7cf,fog:0xbcdad4,accent:0x6de3ce,path:0xd4c7a0},
  forest:{grass:0x507f5b,grassLight:0x8caa65,stone:0x697b6b,stoneLight:0xb6bf9f,bark:0x565243,leaf:0x236957,leafLight:0x649570,sky:0xa7cec5,fog:0xa6cbc0,accent:0x75dfba,path:0xb3b28a},
  temple:{grass:0x86956b,grassLight:0xb8bd81,stone:0x99927e,stoneLight:0xddd3b5,bark:0x69644f,leaf:0x5e8266,leafLight:0x94a77b,sky:0xc4d7cb,fog:0xcbdccf,accent:0xffd785,path:0xc9bd9b},
  rift:{grass:0x596578,grassLight:0x7d8394,stone:0x585c75,stoneLight:0x9296b0,bark:0x535467,leaf:0x696582,leafLight:0x9090a2,sky:0x839bb6,fog:0x899eb5,accent:0xc5a0ff,path:0x9994a4},
};

/** A handcrafted procedural floating-island environment, with no downloaded assets. */
export class WorldView {
  private scene:THREE.Scene;
  private root=new THREE.Group();
  private zone:ZoneId='haven';
  private palette=PALETTES.haven;
  private random=()=>.5;
  private obstacles:{x:number;z:number;r:number}[]=[];
  private props:AnimatedProp[]=[];
  private motes?:THREE.Points;
  private moteOrigins?:Float32Array;
  private ring?:THREE.Group;
  private waterMaterials:THREE.MeshStandardMaterial[]=[];
  private resources=new Set<THREE.Material>();
  private geometries=new Set<THREE.BufferGeometry>();
  private sun?:THREE.DirectionalLight;

  constructor(scene:THREE.Scene){this.scene=scene;scene.add(this.root);}
  private seeded(seed:number){let a=seed|0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  private mat(color:number,roughness=.9,metalness=.02,emissive=0){const m=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:emissive?.65:0,flatShading:true});this.resources.add(m);return m;}
  private basic(color:number,opacity=1){const m=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide});this.resources.add(m);return m;}
  private mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D=this.root,x=0,y=0,z=0,sx=1,sy=1,sz=1){this.geometries.add(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  private rock(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,detail=0){return this.mesh(new THREE.IcosahedronGeometry(1,detail),m,parent,x,y,z,sx,sy,sz);}
  private box(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){return this.mesh(new THREE.BoxGeometry(w,h,d),m,parent,x,y,z);}
  private cylinder(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,top:number,bottom:number,height:number,sides=12){return this.mesh(new THREE.CylinderGeometry(top,bottom,height,sides),m,parent,x,y,z);}
  private torus(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,r:number,tube:number){return this.mesh(new THREE.TorusGeometry(r,tube,5,64),m,parent,x,y,z);}
  private groundRing(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,r:number,tube:number){const o=this.torus(parent,m,x,y,z,r,tube);o.rotation.x=-Math.PI/2;return o;}

  load(zone:ZoneId,state:GameState){
    this.clear();this.zone=zone;this.palette=PALETTES[zone];this.random=this.seeded(613+['haven','forest','temple','rift'].indexOf(zone)*217);this.root=new THREE.Group();this.root.name=`world-${zone}`;this.scene.add(this.root);
    const p=this.palette,night=zone==='rift';this.scene.background=new THREE.Color(p.sky);this.scene.fog=new THREE.Fog(p.fog,48,160);
    const hemi=new THREE.HemisphereLight(night?0xbed5ff:0xe6f1dd,night?0x444365:0x506c47,night?2.1:2.5);this.root.add(hemi);
    this.sun=new THREE.DirectionalLight(night?0xc5d0ff:0xffefd0,night?2.5:3.2);this.sun.position.set(-26,42,19);this.sun.castShadow=true;this.sun.shadow.mapSize.set(state.settings.quality==='low'?1024:2048,state.settings.quality==='low'?1024:2048);Object.assign(this.sun.shadow.camera,{left:-34,right:34,top:34,bottom:-34,near:.5,far:120});this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.0002;this.sun.shadow.radius=3;this.root.add(this.sun);
    const fill=new THREE.DirectionalLight(night?0xa47aef:0xa6dcd4,night?1.3:.85);fill.position.set(20,12,-25);this.root.add(fill);
    this.makeLand();this.makePaths();this.makeArchitecture();this.makeVegetation(state.settings.quality==='low');this.makeDistantIslands();this.batchStaticGeometry();
    for(const object of ZONES[zone].objects)this.makeObject(object);
    this.makeMotes();this.update(0,0,state);
  }

  private makeLand(){
    const p=this.palette,r=ZONES[this.zone].radius;
    const cliff=this.mat(p.stone),cliffDark=this.mat(new THREE.Color(p.stone).multiplyScalar(.73).getHex()),earth=this.mat(0x727b5f);
    this.cylinder(this.root,cliff,0,-3.2,0,r*.98,r*.78,6,48);
    this.cylinder(this.root,cliffDark,0,-7.1,0,r*.79,r*.36,4.8,15).rotation.y=.12;
    this.cylinder(this.root,cliffDark,0,-11.5,0,r*.38,0,6,11);
    this.cylinder(this.root,earth,0,-.51,0,r,r*.99,.9,64);
    const groundMaterial=this.mat(0xffffff);groundMaterial.vertexColors=true;
    const base=new THREE.PlaneGeometry(r*2,r*2,64,64);base.rotateX(-Math.PI/2);const points=base.attributes.position;const colors:number[]=[],indices:number[]=[];
    const dark=new THREE.Color(p.grass),light=new THREE.Color(p.grassLight),c=new THREE.Color();
    for(let i=0;i<points.count;i++){const x=points.getX(i),z=points.getZ(i);const variation=.16+this.random()*.19+(Math.sin(x*.2)+Math.cos(z*.18))*.08;c.copy(dark).lerp(light,variation);colors.push(c.r,c.g,c.b);}
    const old=base.index!;for(let i=0;i<old.count;i+=3){const a=old.getX(i),b=old.getX(i+1),cidx=old.getX(i+2);if([a,b,cidx].every(j=>Math.hypot(points.getX(j),points.getZ(j))<=r))indices.push(a,b,cidx);}
    base.setIndex(indices);base.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.mesh(base,groundMaterial);
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2,sz=1.2+this.random()*2.6;const o=this.rock(this.root,i%3?cliff:cliffDark,Math.sin(a)*(r-.7),-1.4-this.random()*2.5,Math.cos(a)*(r-.7),sz,1.8+this.random()*3,sz*.8);o.rotation.set(this.random()*.2,a,this.random()*.2);}
    const water=this.mat(this.zone==='rift'?0xaba4e8:0x89d4ce,.2,.25,0x367873);water.transparent=true;water.opacity=.74;water.depthWrite=false;water.side=THREE.DoubleSide;this.waterMaterials.push(water);
    for(const angle of [-1.9,.8,2.7]){const x=Math.sin(angle)*(r-1),z=Math.cos(angle)*(r-1);const fall=new THREE.Group();fall.position.set(x,-1,z);fall.rotation.y=angle;this.root.add(fall);for(let i=0;i<3;i++){const plane=this.mesh(new THREE.PlaneGeometry(1.2-i*.25,15+i*2),water,fall,(i-1)*.52,-7.3-i,.2-i*.08);plane.rotation.x=-.035;plane.castShadow=false;}this.groundRing(this.root,this.basic(0xd1f5e3,.45),x,.025,z,.7,.07);}
  }

  private makePaths(){
    const r=ZONES[this.zone].radius,p=this.palette,path=this.mat(0xffffff);path.vertexColors=true;
    const makeStrip=(ax:number,az:number,bx:number,bz:number,width:number)=>{const length=Math.hypot(bx-ax,bz-az),segments=Math.max(2,Math.ceil(length/1.3)),dx=(bx-ax)/length,dz=(bz-az)/length;const vertices:number[]=[],colors:number[]=[],idx:number[]=[];for(let i=0;i<=segments;i++){const t=i/segments,x=ax+(bx-ax)*t,z=az+(bz-az)*t;for(const side of [-1,1]){const w=width*(.85+this.random()*.22);vertices.push(x+dz*w*.5*side,.018+this.random()*.004,z-dx*w*.5*side);const c=new THREE.Color(p.path).multiplyScalar(.94+this.random()*.1);colors.push(c.r,c.g,c.b);}if(i<segments){const n=i*2;idx.push(n,n+2,n+1,n+1,n+2,n+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();this.mesh(g,path);};
    if(this.zone==='rift'){
      this.cylinder(this.root,this.mat(p.stoneLight),0,.025,-2,16,16,.09,64);
      const etching=this.mat(0xd0c6d0,.7,.25);for(const radius of [5.5,12,14.7])this.groundRing(this.root,etching,0,.085,-2,radius,.034);
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const stone=this.box(this.root,this.mat(i%2?0x777b91:0x85899b),Math.sin(a)*13,.09,-2+Math.cos(a)*13,.5,.05,2.7);stone.rotation.y=a;}
    }
    makeStrip(0,r-1,0,-r+1,this.zone==='haven'?3.8:3.1);
    for(const o of ZONES[this.zone].objects){if(Math.abs(o.x)>2)makeStrip(0,o.z*.8,o.x,o.z,1.8);}
    if(this.zone==='haven'){
      const stone=this.mat(p.stoneLight);this.cylinder(this.root,stone,0,.04,-2,3.5,3.5,.1,32);
      const edge=this.mat(0xb7ad8c);this.groundRing(this.root,edge,0,.11,-2,3.15,.04);this.groundRing(this.root,edge,0,.11,-2,2.65,.025);
    }
    const stepping=this.mat(p.stoneLight);for(let i=0;i<25;i++){const z=(this.random()-.5)*(r*1.65);const x=(this.random()-.5)*2.2;const tile=this.box(this.root,stepping,x,.035,z,.25+this.random()*.45,.055,.22+this.random()*.35);tile.rotation.y=this.random()*.5;}
  }

  private makeArchitecture(){
    const p=this.palette,stone=this.mat(p.stoneLight),shade=this.mat(p.stone),gold=this.mat(0xcbb879,.5,.5),cyan=this.mat(p.accent,.4,.3,p.accent);
    const column=(x:number,z:number,height:number,broken=false)=>{
      const g=new THREE.Group();g.position.set(x,0,z);this.root.add(g);this.box(g,stone,0,.16,0,1.45,.32,1.45);this.box(g,shade,0,.39,0,1.15,.16,1.15);
      this.cylinder(g,stone,0,height*.5+.4,0,.43,.52,height,8);this.cylinder(g,shade,0,.67,0,.57,.57,.17,8);
      if(!broken){this.cylinder(g,gold,0,height+.37,0,.49,.49,.1,8);this.box(g,stone,0,height+.59,0,1.15,.34,1.15);}else this.rock(g,shade,.12,height+.4,0,.4,.24,.45);
      this.obstacles.push({x,z,r:.7});return g;
    };
    if(this.zone==='haven'){
      // Open colonnade frames the sanctuary without blocking the route to the forest.
      for(const side of [-1,1]){column(side*4.7,-13,5.8);column(side*8,-10,3.3,true);const beam=this.box(this.root,stone,side*3.2,6.45,-13,4.1,.45,1.15);beam.rotation.z=-side*.07;this.box(this.root,gold,side*3.2,6.72,-13,4.15,.08,1.16);}
      const crest=this.torus(this.root,gold,0,7.1,-13,1.25,.075);crest.rotation.z=.3;
      this.rock(this.root,cyan,0,7.1,-13,.35,.65,.25);
      for(const side of [-1,1]){const g=new THREE.Group();g.position.set(side*9.5,0,-4);this.root.add(g);this.box(g,stone,0,.7,0,1.7,1.4,2.5);this.box(g,shade,0,1.44,0,1.9,.16,2.7);this.cylinder(g,stone,0,1.8,0,.48,.65,.6,8);this.rock(g,cyan,0,2.25,0,.2,.42,.2);}
      // Low ruined wall sections and a distant memorial spire.
      for(let i=0;i<6;i++){this.box(this.root,i%2?shade:stone,-15+i*.85,.55,-11, .8,1.1+(i%3)*.15,1.3);}
      column(-15,-14,4,true);this.makeBanner(5.5,-9.8,4.3,0x477f80);this.makeBanner(-5.5,-9.8,4.3,0x477f80);
      this.makeMarket(9,4);
    }else if(this.zone==='forest'){
      column(-3.8,-17,4.6,true);column(3.8,-17,5.4);this.box(this.root,stone,1.4,6,-17,6,.45,1.1).rotation.z=.11;
      for(let i=0;i<5;i++){const x=-15+i*.9,z=5-i*.35;this.box(this.root,i%2?stone:shade,x,.6,z,.85,1.1+(i%2)*.5,1.1);}
      const fallen=column(14,-6,3.5);fallen.rotation.z=1.3;fallen.position.y=.45;this.obstacles.pop();
      this.makeBanner(-5,-15,3.2,0x8ca18c);
    }else if(this.zone==='temple'){
      for(const side of [-1,1])for(let i=0;i<4;i++){const h=i===1?3.2:6.2;column(side*8.3,11-i*7,h,i===1);if(i===0||i===3)this.box(this.root,stone,side*10.5,h+.9,11-i*7,5.4,.6,1.3);}
      for(const side of [-1,1]){column(side*4.3,-18,7);this.box(this.root,stone,side*2.8,7.9,-18,3.6,.5,1.5).rotation.z=-side*.11;this.box(this.root,gold,side*2.8,8.2,-18,3.7,.1,1.55).rotation.z=-side*.11;}
      const celestial=this.torus(this.root,gold,0,8.6,-18,1.7,.09);celestial.rotation.x=.12;this.rock(this.root,cyan,0,8.6,-18,.34,.5,.34);
      for(const side of [-1,1]){this.makeBanner(side*9.1,8,5.7,0x697d83);this.makeBanner(side*9.1,-12,5.7,0x697d83);}
      for(let i=0;i<9;i++){const a=this.random()*Math.PI*2;const x=Math.sin(a)*20,z=Math.cos(a)*20;const block=this.box(this.root,shade,x,.5,z,1.3,1,2.4);block.rotation.set(.1,this.random()*6,.1);}
    }else{
      for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const x=Math.sin(a)*18,z=-2+Math.cos(a)*18;column(x,z,i%3===0?3.2:5.7,true);this.rock(this.root,cyan,x,7+(i%3),z,.17,.6,.17);}
      this.ring=new THREE.Group();this.ring.position.set(0,7,-17);this.root.add(this.ring);this.torus(this.ring,gold,0,0,0,5.4,.08);this.torus(this.ring,cyan,0,0,.02,4.9,.035);this.torus(this.ring,shade,0,0,-.1,5.8,.15);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;const shard=this.rock(this.ring,stone,Math.sin(a)*5.5,Math.cos(a)*5.5,0,.22,.75,.3);shard.rotation.z=-a;}
      const disc=this.mesh(new THREE.CircleGeometry(4.7,64),this.basic(0xa08ac8,.07),this.ring);disc.castShadow=false;
    }
    // Ruin rubble catches low sunlight and adds a sense of age to the masonry.
    const debris=new THREE.IcosahedronGeometry(1,0);this.geometries.add(debris);const rubble=new THREE.InstancedMesh(debris,shade,42);const dummy=new THREE.Object3D();for(let i=0;i<42;i++){const a=this.random()*Math.PI*2,rad=12+this.random()*8;dummy.position.set(Math.sin(a)*rad,.15,Math.cos(a)*rad);dummy.rotation.set(this.random(),this.random()*6,this.random());dummy.scale.set(.15+this.random()*.55,.15+this.random()*.45,.18+this.random()*.4);dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix);}rubble.castShadow=true;rubble.receiveShadow=true;this.root.add(rubble);
  }

  private makeBanner(x:number,z:number,height:number,color:number){const pole=this.mat(0x80775c,.6,.3),cloth=this.mat(color);cloth.side=THREE.DoubleSide;this.cylinder(this.root,pole,x,height/2,z,.035,.045,height,6);this.box(this.root,pole,x+.55,height-.15,z,1.2,.055,.06);const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.95,0);shape.lineTo(.95,-1.65);shape.lineTo(.47,-1.95);shape.lineTo(0,-1.65);shape.closePath();const g=new THREE.ShapeGeometry(shape);this.mesh(g,cloth,this.root,x+.07,height-.2,z);const gold=this.mat(0xc6b589,.6,.3);const emblem=this.torus(this.root,gold,x+.54,height-.8,z-.015,.18,.02);emblem.scale.y=1.2;this.rock(this.root,gold,x+.54,height-.8,z-.02,.065,.12,.02);}

  private makeMarket(x:number,z:number){const wood=this.mat(0x7a6950),cloth=this.mat(0xc3a779),dark=this.mat(0x476d6c);cloth.side=THREE.DoubleSide;const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=-.25;this.root.add(g);for(const side of [-1,1])this.cylinder(g,wood,side*1.4,1.4,0,.055,.075,2.8,6);this.box(g,wood,0,2.7,0,3,.09,.1);const awning=this.mesh(new THREE.PlaneGeometry(3.2,2.3),cloth,g,0,2.4,.6);awning.rotation.x=-1.1;for(let i=0;i<6;i++){this.box(g,i%2?dark:cloth,-1.32+i*.53,2.1,1.63,.52,.35,.04);}this.box(g,wood,0,.85,.65,2.6,.14,.95);for(const side of [-1,1])this.box(g,wood,side*.95,.42,.65,.1,.84,.7);const fruits=this.mat(0xb3744e);for(let i=0;i<9;i++)this.rock(g,fruits,-.7+this.random()*1.4,1.02,.45+this.random()*.4,.12);for(const side of [-1,1]){this.cylinder(g,wood,side*1.4,.4,1.4,.36,.33,.8,10);this.groundRing(g,dark,side*1.4,.65,1.4,.35,.035);this.groundRing(g,dark,side*1.4,.17,1.4,.33,.035);}}

  private isClear(x:number,z:number,padding=0){
    const objects=ZONES[this.zone].objects;if(Math.abs(x)<3+padding)return false;
    if(objects.some(o=>Math.hypot(x-o.x,z-o.z)<2.4+padding))return false;
    for(const o of objects){if(Math.abs(o.x)<2)continue;const ax=0,az=o.z*.8,bx=o.x,bz=o.z;const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(z-az)*(bz-az))/((bx-ax)**2+(bz-az)**2)));if(Math.hypot(x-(ax+(bx-ax)*t),z-(az+(bz-az)*t))<1.3+padding)return false;}
    return true;
  }

  private makeVegetation(low:boolean){
    const p=this.palette,r=ZONES[this.zone].radius;const bark=this.mat(p.bark),leaf=this.mat(p.leaf),light=this.mat(p.leafLight),deep=this.mat(new THREE.Color(p.leaf).multiplyScalar(.76).getHex());
    const count=this.zone==='forest'?34:this.zone==='haven'?20:this.zone==='temple'?11:0;
    for(let i=0;i<count;i++){
      let x=0,z=0;const blocksVista=(tx:number,tz:number)=>this.zone==='haven'&&tz>1&&tx>-4&&tx<15;
      for(let attempt=0;attempt<30;attempt++){const a=this.random()*Math.PI*2,rad=r*(.52+this.random()*.43);x=Math.sin(a)*rad;z=Math.cos(a)*rad;if(this.isClear(x,z,1.2)&&!blocksVista(x,z)&&!this.obstacles.some(o=>Math.hypot(o.x-x,o.z-z)<2.3))break;}
      if(!this.isClear(x,z,1.2)||blocksVista(x,z))continue;const h=4+this.random()*3.5,scale=.8+this.random()*.5;this.makeTree(x,z,h,scale,bark,leaf,light,deep);this.obstacles.push({x,z,r:.5*scale});
    }
    const bushGeometry=new THREE.IcosahedronGeometry(1,1);this.geometries.add(bushGeometry);const bushCount=this.zone==='rift'?30:80;const bushes=new THREE.InstancedMesh(bushGeometry,leaf,bushCount);const dummy=new THREE.Object3D();for(let i=0;i<bushCount;i++){let x=0,z=0;for(let n=0;n<30;n++){x=(this.random()-.5)*r*1.9;z=(this.random()-.5)*r*1.9;if(Math.hypot(x,z)<r-1&&this.isClear(x,z,.1))break;}dummy.position.set(x,.25,z);dummy.scale.set(.45+this.random()*.6,.3+this.random()*.4,.45+this.random()*.55);dummy.rotation.set(0,this.random()*6,0);dummy.updateMatrix();bushes.setMatrixAt(i,dummy.matrix);}bushes.castShadow=true;this.root.add(bushes);
    // One instanced draw call for a field of individually tilted grass blades.
    const grassGeometry=new THREE.BufferGeometry();const verts:number[]=[];for(let i=0;i<3;i++){const angle=i*Math.PI/3,dx=Math.cos(angle)*.09,dz=Math.sin(angle)*.09;verts.push(-dx,0,-dz,dx,0,dz,.05*Math.cos(angle),.42+i*.05,.05*Math.sin(angle));}grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));grassGeometry.computeVertexNormals();this.geometries.add(grassGeometry);
    const grassMaterial=this.mat(p.grassLight);grassMaterial.side=THREE.DoubleSide;const grassCount=low?1400:3200;const grass=new THREE.InstancedMesh(grassGeometry,grassMaterial,grassCount);const color=new THREE.Color();let actual=0;
    for(let i=0;i<grassCount*3&&actual<grassCount;i++){const x=(this.random()-.5)*r*2,z=(this.random()-.5)*r*2;if(Math.hypot(x,z)>r-.4||!this.isClear(x,z,-.3)||(this.zone==='rift'&&Math.hypot(x,z+2)<16))continue;dummy.position.set(x,.025,z);dummy.rotation.set(0,this.random()*Math.PI*2,0);const s=.55+this.random()*.9;dummy.scale.set(s,s,s);dummy.updateMatrix();grass.setMatrixAt(actual,dummy.matrix);color.set(p.grassLight).lerp(new THREE.Color(p.grass),this.random()*.8);grass.setColorAt(actual,color);actual++;}grass.count=actual;grass.receiveShadow=true;this.root.add(grass);
    const flowerGeometry=new THREE.IcosahedronGeometry(.075,0);this.geometries.add(flowerGeometry);const flowers=new THREE.InstancedMesh(flowerGeometry,this.mat(0xffffff),low?260:560);actual=0;
    for(let i=0;i<flowers.instanceMatrix.count*8&&actual<flowers.instanceMatrix.count;i++){const x=(this.random()-.5)*r*1.95,z=(this.random()-.5)*r*1.95;if(Math.hypot(x,z)>r-1||!this.isClear(x,z,-.2)||(this.zone==='rift'&&Math.hypot(x,z+2)<17))continue;dummy.position.set(x,.22+this.random()*.17,z);dummy.scale.set(1,.55,1);dummy.rotation.set(0,this.random()*6,0);dummy.updateMatrix();flowers.setMatrixAt(actual,dummy.matrix);flowers.setColorAt(actual,new THREE.Color([0xf8edd0,0xf6d783,0xc1d8ed,0xd39b95][actual%4]));actual++;}flowers.count=actual;this.root.add(flowers);
    if(this.zone==='forest'){const cap=this.mat(0xc17d66),stem=this.mat(0xd4c6a1);for(let i=0;i<22;i++){const a=this.random()*6.28,rad=10+this.random()*12,x=Math.sin(a)*rad,z=Math.cos(a)*rad;if(!this.isClear(x,z))continue;this.cylinder(this.root,stem,x,.16,z,.055,.08,.3,5);this.mesh(new THREE.SphereGeometry(.19,8,4,0,Math.PI*2,0,Math.PI/2),cap,this.root,x,.31,z,1,.65,1);}}
  }

  private makeTree(x:number,z:number,height:number,scale:number,bark:THREE.Material,leaf:THREE.Material,light:THREE.Material,deep:THREE.Material){
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);g.rotation.y=this.random()*6;this.root.add(g);const trunk=this.cylinder(g,bark,0,height*.38,0,.16,.42,height*.76,7);trunk.rotation.z=(this.random()-.5)*.08;
    for(let j=0;j<4;j++){const angle=j*Math.PI/2+.35;const branch=this.cylinder(g,bark,Math.sin(angle)*.5,height*.62,Math.cos(angle)*.5,.07,.18,height*.4,5);branch.rotation.z=Math.cos(angle)*.55;branch.rotation.x=Math.sin(angle)*.55;const root=this.cylinder(g,bark,Math.sin(angle)*.33,.18,Math.cos(angle)*.33,.18,.28,.9,5);root.rotation.z=Math.cos(angle)*1;root.rotation.x=Math.sin(angle)*1;}
    this.rock(g,deep,0,height*.75,0,2.1,height*.25,1.8,1);
    for(let j=0;j<5;j++){const a=j/5*Math.PI*2;this.rock(g,j%2?leaf:light,Math.sin(a)*1.15,height*.85+(j%2)*.3,Math.cos(a)*1.1,1.4,height*.23,1.35,1);}
    this.rock(g,light,-.3,height*1.05,.1,1.7,height*.22,1.55,1);
  }

  private makeDistantIslands(){
    const p=this.palette,stone=this.mat(p.stone),grass=this.mat(p.grass),pale=this.mat(p.stoneLight),cloud=this.basic(this.zone==='rift'?0xc1cee0:0xe8eee2,.6);
    for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2,rad=54+this.random()*37,size=3+this.random()*6,x=Math.sin(a)*rad,z=Math.cos(a)*rad,y=-5+this.random()*16;
      this.cylinder(this.root,stone,x,y-2,z,size,size*.5,4,9);this.cylinder(this.root,stone,x,y-5,z,size*.52,0,4,7);this.cylinder(this.root,grass,x,y+.05,z,size,size,.3,12);
      if(i%2===0){for(const side of [-1,1])this.cylinder(this.root,pale,x+side*size*.4,y+2,z,.3,.4,4,6);this.box(this.root,pale,x,y+4,z,size*1.1,.5,.8);}
      for(let j=0;j<4;j++){const cl=this.rock(this.root,cloud,x+(j-1.5)*size,y-5,z+4,size*1.3,size*.24,size*.6,1);cl.castShadow=false;cl.receiveShadow=false;}
    }
    // A distant orbital monument creates a recognisable silhouette above every region.
    const celestial=new THREE.Group();celestial.position.set(-12,27,-85);celestial.rotation.set(.22,0,-.32);this.root.add(celestial);const ringMaterial=this.basic(this.zone==='rift'?0xdbd0f1:0xf2e3bb,.68);this.torus(celestial,ringMaterial,0,0,0,20,.16);this.torus(celestial,ringMaterial,0,0,.05,19.2,.035);
    const moon=this.mesh(new THREE.SphereGeometry(6,32,24),this.basic(this.zone==='rift'?0xd8dded:0xf4edcf),this.root,13,37,-105);moon.castShadow=false;
    for(let i=0;i<12;i++){const a=i*Math.PI/6;const c=this.box(celestial,ringMaterial,Math.sin(a)*20,Math.cos(a)*20,0,.45,1.2,.25);c.rotation.z=-a;}
  }

  private batchStaticGeometry(){
    // Trees and masonry share materials: merge their static pieces to keep draw calls low.
    this.root.updateMatrixWorld(true);
    const groups=new Map<string,{material:THREE.Material;objects:THREE.Mesh[]}>();
    this.root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||Array.isArray(object.material)||object.material.transparent)return;
      for(let parent:THREE.Object3D|null=object;parent;parent=parent.parent)if(parent===this.ring)return;
      const key=object.material.uuid+':'+Object.keys(object.geometry.attributes).sort().join(',')+':'+object.castShadow+':'+object.receiveShadow;
      if(!groups.has(key))groups.set(key,{material:object.material,objects:[]});groups.get(key)!.objects.push(object);
    });
    for(const {material,objects} of groups.values()){
      if(objects.length<3)continue;
      const geometries=objects.map(object=>{const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);return geometry;});
      const merged=mergeGeometries(geometries,false);geometries.forEach(geometry=>geometry.dispose());if(!merged)continue;
      const mesh=this.mesh(merged,material);mesh.castShadow=objects[0].castShadow;mesh.receiveShadow=objects[0].receiveShadow;objects.forEach(object=>object.removeFromParent());
    }
  }

  private makeObject(o:WorldObject){
    const p=this.palette,g=new THREE.Group();g.name=o.id;g.position.set(o.x,0,o.z);this.root.add(g);const stone=this.mat(p.stoneLight),dark=this.mat(p.stone),gold=this.mat(0xcfb676,.5,.5),glow=this.mat(p.accent,.3,.2,p.accent);
    const animated:AnimatedProp={kind:o.kind,root:g,id:o.id,index:o.rune};
    if(o.kind==='portal'){
      const hue=o.target==='rift'?0xbca2f1:o.target==='temple'?0xe4ca8a:0x8fd9c1;const magic=this.mat(hue,.3,.3,hue);
      this.cylinder(g,stone,0,.1,0,1.9,2.05,.2,24);this.cylinder(g,dark,0,.23,0,1.62,1.75,.13,24);
      const arch=new THREE.Group();arch.position.y=2.1;g.add(arch);this.torus(arch,stone,0,0,0,1.8,.25);this.torus(arch,gold,0,0,-.16,1.58,.045);this.torus(arch,magic,0,0,-.11,1.48,.022);
      const portal=this.mesh(new THREE.CircleGeometry(1.45,48),this.basic(hue,.12),arch,0,0,.02);portal.castShadow=false;
      const inner=new THREE.Group();arch.add(inner);for(let i=0;i<8;i++){const a=i*Math.PI/4;const s=this.rock(inner,magic,Math.sin(a)*1.57,Math.cos(a)*1.57,-.22,.055,.13,.04);s.rotation.z=-a;}animated.core=inner;
      for(const side of [-1,1]){this.box(g,stone,side*1.72,.72,0,.7,1.1,.9);this.box(g,gold,side*1.72,1.25,0,.76,.1,.96);}
      const crown=this.rock(g,stone,0,4.05,0,.35,.5,.3);crown.rotation.z=Math.PI/4;this.rock(g,magic,0,4.05,-.28,.09,.19,.03);
    }else if(o.kind==='rest'){
      this.cylinder(g,dark,0,.1,0,1.5,1.65,.2,16);this.cylinder(g,stone,0,.28,0,1.25,1.45,.2,16);
      this.groundRing(g,stone,0,.5,0,1.08,.18);const water=this.mat(0x6fd3c6,.15,.45,0x3e8d86);this.waterMaterials.push(water);this.cylinder(g,water,0,.4,0,1.05,1.05,.02,32);
      this.cylinder(g,gold,0,.58,0,.25,.4,.35,8);const crystal=this.rock(g,glow,0,1.36,0,.25,.65,.25);animated.core=crystal;animated.baseY=1.36;
      const orbit=this.torus(g,gold,0,1.35,0,.55,.025);orbit.rotation.x=.9;animated.secondary=orbit;
      for(let i=0;i<4;i++){const a=i*Math.PI/2;this.rock(g,glow,Math.sin(a)*1.08,.7,Math.cos(a)*1.08,.075,.2,.075);}
      const light=new THREE.PointLight(p.accent,2,5);light.position.y=1.3;g.add(light);
    }else if(o.kind==='chest'){
      const wood=this.mat(0x74604a),iron=this.mat(0x6c7976,.4,.5);this.box(g,wood,0,.38,0,1.1,.62,.72);for(const side of [-1,1])this.box(g,gold,side*.41,.39,0,.075,.64,.76);
      const lid=new THREE.Group();lid.position.set(0,.67,.36);g.add(lid);this.box(lid,wood,0,.09,-.36,1.13,.2,.74);for(const side of [-1,1])this.box(lid,gold,side*.41,.1,-.36,.08,.23,.76);animated.core=lid;
      this.box(g,iron,0,.4,-.385,.2,.25,.045);this.rock(g,glow,0,.43,-.42,.045,.065,.02);
      const aura=this.groundRing(g,this.basic(0xe7d09a,.38),0,.035,0,1,.018);animated.secondary=aura;
    }else if(o.kind==='shard'){
      this.cylinder(g,stone,0,.16,0,.75,.95,.32,8);this.cylinder(g,gold,0,.39,0,.5,.65,.14,8);
      const shard=new THREE.Group();shard.position.y=1.35;g.add(shard);this.rock(shard,glow,0,0,0,.28,.65,.28);this.rock(shard,gold,.42,-.22,.04,.075,.2,.08).rotation.z=-.5;this.rock(shard,gold,-.32,.22,0,.065,.18,.065).rotation.z=.5;const ring=this.torus(shard,gold,0,0,0,.7,.023);ring.rotation.x=.8;animated.core=shard;animated.baseY=1.35;
      const ray=this.mesh(new THREE.CylinderGeometry(.2,.75,4,32,1,true),this.basic(p.accent,.045),g,0,2.2,0);ray.castShadow=false;animated.secondary=ray;
    }else if(o.kind==='rune'){
      this.cylinder(g,dark,0,.13,0,.94,1.1,.26,8);const stele=this.box(g,stone,0,1,0,1.05,1.65,.4);stele.rotation.z=.04;this.rock(g,stone,0,1.85,0,.52,.32,.25);
      const rune=new THREE.Group();rune.position.set(0,1.14,.235);g.add(rune);const runeMaterial=this.mat(0x899c95,.5,.2);animated.core=rune;
      if(o.rune===0){this.torus(rune,runeMaterial,0,0,0,.21,.035);for(let i=0;i<8;i++){const a=i*Math.PI/4;const r=this.box(rune,runeMaterial,Math.sin(a)*.34,Math.cos(a)*.34,0,.035,.12,.025);r.rotation.z=-a;}}
      else if(o.rune===1){for(let i=0;i<4;i++){const a=i*Math.PI/2;const ray=this.rock(rune,runeMaterial,Math.sin(a)*.14,Math.cos(a)*.14,0,.07,.22,.025);ray.rotation.z=-a;}this.rock(rune,runeMaterial,0,0,0,.1,.1,.035);}
      else{const crescent=new THREE.Mesh(new THREE.TorusGeometry(.28,.05,5,30,Math.PI*1.45),runeMaterial);this.geometries.add(crescent.geometry);crescent.rotation.z=-Math.PI*.72;rune.add(crescent);this.rock(rune,runeMaterial,.1,.01,0,.055,.09,.025);}
      this.groundRing(g,this.basic(p.accent,.25),0,.02,0,1.2,.025);
    }else{
      const robe=this.mat(o.kind==='npc'?0x557f7e:0x84694f),cloth=this.mat(o.kind==='npc'?0xc5c6ad:0xb69b72),skin=this.mat(0xc9ad88),hair=this.mat(o.kind==='npc'?0xd8d6bc:0x514c40),boots=this.mat(0x4a544c);
      for(const side of [-1,1])this.rock(g,boots,side*.14,.12,-.05,.13,.14,.2);
      this.cylinder(g,robe,0,.76,0,.24,.4,1.1,8);this.cylinder(g,cloth,0,1.36,0,.27,.3,.3,8);this.rock(g,skin,0,1.69,0,.19,.24,.18,1);this.rock(g,hair,0,1.81,.045,.2,.16,.18,1);
      for(const side of [-1,1]){const arm=this.cylinder(g,robe,side*.32,1.13,0,.09,.1,.57,6);arm.rotation.z=side*.2;this.rock(g,skin,side*.38,.85,-.03,.08,.11,.08);}
      this.box(g,gold,0,1,-.27,.11,.12,.035);
      if(o.kind==='npc'){const staff=this.cylinder(g,dark,.55,1,0,.035,.04,2.05,6);staff.rotation.z=-.08;this.rock(g,glow,.47,2.11,0,.105,.2,.105);this.mesh(new THREE.ConeGeometry(.26,.42,7),cloth,g,0,2.03,.02).rotation.z=-.12;}
      else{this.mesh(new THREE.ConeGeometry(.31,.28,8),robe,g,0,1.97,0);this.cylinder(g,robe,0,1.85,0,.35,.35,.04,8);this.rock(g,cloth,0,1.13,.27,.26,.35,.18);}
      const marker=this.rock(g,this.basic(o.kind==='npc'?0xe9d49b:0xb2dfd0),0,2.6,0,.075,.14,.075);animated.core=marker;animated.baseY=2.6;
    }
    this.props.push(animated);
  }

  private makeMotes(){const positions:number[]=[];const colors:number[]=[];const r=ZONES[this.zone].radius;for(let i=0;i<130;i++){positions.push((this.random()-.5)*r*1.9,.4+this.random()*6,(this.random()-.5)*r*1.9);const c=new THREE.Color(i%3?0xe1edd4:this.palette.accent);colors.push(c.r,c.g,c.b);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.geometries.add(g);const m=new THREE.PointsMaterial({size:.055,vertexColors:true,transparent:true,opacity:.65,depthWrite:false,sizeAttenuation:true});this.resources.add(m);this.motes=new THREE.Points(g,m);this.moteOrigins=new Float32Array(positions);this.root.add(this.motes);}

  update(dt:number,time:number,state:GameState){
    for(const prop of this.props){const core=prop.core;
      if(prop.kind==='chest'){const opened=state.world.openedChests.includes(prop.id);if(core)core.rotation.x=opened?1.35:0;if(prop.secondary)prop.secondary.visible=!opened;}
      else if(prop.kind==='shard'){const collected=prop.id==='forest-shard'?state.quest.forestShard:state.quest.templeShard;if(core){core.visible=!collected;core.position.y=(prop.baseY||1.3)+Math.sin(time*1.7)*.15;core.rotation.y=time*.5;}if(prop.secondary)prop.secondary.visible=!collected;}
      else if(prop.kind==='rune'){const solved=state.quest.runes.includes(prop.index!);core?.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.color.set(solved?this.palette.accent:0x7e938c);m.emissive.set(solved?this.palette.accent:0x000000);m.emissiveIntensity=solved?1.1:0;}});}
      else if(prop.kind==='portal'){if(core)core.rotation.z=time*.12;}
      else if(core){core.position.y=(prop.baseY||1.3)+Math.sin(time*1.7+prop.root.position.x)*.085;core.rotation.y=time*.55;}
      if(prop.kind==='rest'&&prop.secondary){prop.secondary.rotation.y=time*.4;prop.secondary.rotation.z=Math.sin(time*.6)*.3;}
    }
    if(this.ring)this.ring.rotation.z+=dt*.025;
    if(this.motes&&this.moteOrigins){const p=this.motes.geometry.attributes.position;for(let i=0;i<p.count;i++){p.setX(i,this.moteOrigins[i*3]+Math.sin(time*.18+i)*.5);p.setY(i,this.moteOrigins[i*3+1]+Math.sin(time*.4+i*2)*.3);p.setZ(i,this.moteOrigins[i*3+2]+Math.cos(time*.17+i)*.45);}p.needsUpdate=true;}
    for(const m of this.waterMaterials)m.emissiveIntensity=.5+Math.sin(time*.8)*.08;
  }
  groundHeight(_x:number,_z:number){return 0;}
  constrain(position:THREE.Vector3,radius=.35){const bound=ZONES[this.zone].radius-.8-radius;const length=Math.hypot(position.x,position.z);if(length>bound){position.x*=bound/length;position.z*=bound/length;}for(const o of this.obstacles){const dx=position.x-o.x,dz=position.z-o.z,d=Math.hypot(dx,dz),r=o.r+radius;if(d<r&&d>.0001){position.x=o.x+dx/d*r;position.z=o.z+dz/d*r;}}position.y=Math.max(position.y,this.groundHeight(position.x,position.z));}
  private clear(){this.root.removeFromParent();this.geometries.forEach(g=>g.dispose());this.resources.forEach(m=>m.dispose());this.sun?.shadow.map?.dispose();this.geometries.clear();this.resources.clear();this.obstacles=[];this.props=[];this.waterMaterials=[];this.motes=undefined;this.moteOrigins=undefined;this.ring=undefined;this.sun=undefined;}
  dispose(){this.clear();}
}
