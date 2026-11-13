import * as THREE from 'three';
interface Particle {x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number;max:number;color:THREE.Color}
interface TimedMesh {mesh:THREE.Mesh;life:number;max:number;expand:number;spin:number}
export class Effects {
  private particles:Particle[]=[];
  private timed:TimedMesh[]=[];
  private geometry=new THREE.BufferGeometry();
  private positions=new Float32Array(900*3);
  private colors=new Float32Array(900*3);
  private material=new THREE.PointsMaterial({size:.13,vertexColors:true,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  private points:THREE.Points;
  constructor(private scene:THREE.Scene) {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;scene.add(this.points);
  }
  burst(position:THREE.Vector3,color:number,count=22,power=3) {
    for(let i=0;i<count && this.particles.length<900;i++) {
      const a=Math.random()*Math.PI*2,v=power*(.3+Math.random()*.7),life=.3+Math.random()*.6;
      this.particles.push({x:position.x,y:position.y+.8,z:position.z,vx:Math.cos(a)*v,vy:1+Math.random()*power,vz:Math.sin(a)*v,life,max:life,color:new THREE.Color(color)});
    }
  }
  ring(position:THREE.Vector3,radius:number,color:number,life=.5,expand=1) {
    const mesh=new THREE.Mesh(new THREE.RingGeometry(radius*.9,radius,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,.07,position.z);this.scene.add(mesh);this.timed.push({mesh,life,max:life,expand,spin:0});
  }
  slash(position:THREE.Vector3,heading:number,color:number,big=false) {
    const inner=big?2.7:2.1, outer=big?3.5:2.8;
    const mesh=new THREE.Mesh(new THREE.RingGeometry(inner,outer,28,1,.12,2.6),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
    mesh.rotation.set(-Math.PI/2,0,heading+Math.PI/2+.12);mesh.position.copy(position);mesh.position.y+=1;
    this.scene.add(mesh);this.timed.push({mesh,life:.24,max:.24,expand:.3,spin:5});
  }
  beam(from:THREE.Vector3,to:THREE.Vector3,color:number) {
    const length=from.distanceTo(to),mesh=new THREE.Mesh(new THREE.CylinderGeometry(.11,.25,length,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,blending:THREE.AdditiveBlending}));
    mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
    this.scene.add(mesh);this.timed.push({mesh,life:.35,max:.35,expand:0,spin:0});
  }
  telegraph(position:THREE.Vector3,radius:number,color=0xff745f) {
    const group=new THREE.Group();
    const disk=new THREE.Mesh(new THREE.CircleGeometry(radius,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide}));
    const edge=new THREE.Mesh(new THREE.RingGeometry(radius-.10,radius,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));
    disk.rotation.x=edge.rotation.x=-Math.PI/2;group.add(disk,edge);group.position.set(position.x,.08,position.z);this.scene.add(group);return group;
  }
  removeMarker(marker:THREE.Group|null) {
    if(!marker) return;
    this.scene.remove(marker);marker.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}});
  }
  update(dt:number) {
    for(let i=this.particles.length-1;i>=0;i--) {
      const p=this.particles[i];p.life-=dt;
      if(p.life<=0){this.particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=7*dt;
      this.positions[i*3]=p.x;this.positions[i*3+1]=p.y;this.positions[i*3+2]=p.z;
      const fade=Math.min(1,p.life/p.max*2);this.colors[i*3]=p.color.r*fade;this.colors[i*3+1]=p.color.g*fade;this.colors[i*3+2]=p.color.b*fade;
    }
    // Refresh contiguous GPU data after particles were removed.
    this.particles.forEach((p,i)=>{this.positions[i*3]=p.x;this.positions[i*3+1]=p.y;this.positions[i*3+2]=p.z;this.colors[i*3]=p.color.r*p.life/p.max;this.colors[i*3+1]=p.color.g*p.life/p.max;this.colors[i*3+2]=p.color.b*p.life/p.max;});
    this.geometry.setDrawRange(0,this.particles.length);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;
    for(let i=this.timed.length-1;i>=0;i--) {
      const t=this.timed[i];t.life-=dt;
      if(t.life<=0){this.scene.remove(t.mesh);t.mesh.geometry.dispose();(t.mesh.material as THREE.Material).dispose();this.timed.splice(i,1);continue;}
      (t.mesh.material as THREE.MeshBasicMaterial).opacity=t.life/t.max*.85;
      const s=1+(1-t.life/t.max)*t.expand;t.mesh.scale.setScalar(s);t.mesh.rotation.z+=t.spin*dt;
    }
  }
  clear(){this.particles=[];for(const t of this.timed){this.scene.remove(t.mesh);t.mesh.geometry.dispose();(t.mesh.material as THREE.Material).dispose();}this.timed=[];this.geometry.setDrawRange(0,0);}
  dispose(){this.clear();this.scene.remove(this.points);this.geometry.dispose();this.material.dispose();}
}
