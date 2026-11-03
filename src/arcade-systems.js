import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function createArcadeFX(scene,camera,renderer,player){
  const mobile=matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const composer=mobile?null:new EffectComposer(renderer);
  if(composer)composer.addPass(new RenderPass(scene,camera));
  const bloom=composer?new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.48,0.42,0.88):null;
  if(composer)composer.addPass(bloom);
  const blur=new ShaderPass({
    uniforms:{tDiffuse:{value:null},amount:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform sampler2D tDiffuse;uniform float amount;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv)*0.32;c+=texture2D(tDiffuse,vUv+vec2(amount,0.0))*0.24;c+=texture2D(tDiffuse,vUv-vec2(amount,0.0))*0.24;c+=texture2D(tDiffuse,vUv+vec2(amount*2.0,0.0))*0.10;c+=texture2D(tDiffuse,vUv-vec2(amount*2.0,0.0))*0.10;gl_FragColor=c;}'
  });
  if(composer)composer.addPass(blur);
  const particles=[],skidMarks=[];
  let lastSkid=0,lastSmoke=0,lastSparks=0;
  const maxParticles=mobile?36:110;
  const skidGeometry=new THREE.PlaneGeometry(0.22,2.3);
  const geo=new THREE.SphereGeometry(0.12,5,5);
  const smokeMat=new THREE.MeshBasicMaterial({color:0xb9c2ca,transparent:true,opacity:0.45,depthWrite:false});
  const sparkMat=new THREE.MeshBasicMaterial({color:0xffc45b,transparent:true,opacity:1});
  const skidMat=new THREE.MeshBasicMaterial({color:0x111318,transparent:true,opacity:0.55,depthWrite:false});
  function burst(kind,count,origin){
    count=mobile?Math.min(count,kind==='spark'?7:2):count;
    for(let i=0;i<count&&particles.length<maxParticles;i++){
      const mesh=new THREE.Mesh(geo,kind==='smoke'?smokeMat:sparkMat);
      mesh.position.copy(origin);mesh.position.x+=(Math.random()-.5)*0.7;mesh.position.y+=Math.random()*0.35;mesh.position.z+=(Math.random()-.5)*0.7;
      const life=kind==='smoke'?0.65+Math.random()*0.65:0.18+Math.random()*0.22;
      particles.push({mesh,kind,life,max:life,v:new THREE.Vector3((Math.random()-.5)*(kind==='smoke'?1.5:8),kind==='smoke'?0.5+Math.random():Math.random()*5,(Math.random()-.5)*(kind==='smoke'?1.5:8))});
      scene.add(mesh);
    }
  }
  function smoke(){for(const x of [-0.85,0.85])burst('smoke',2,new THREE.Vector3(player.position.x+x,0.45,player.position.z+1.25));}
  function sparks(){const now=performance.now();if(now-lastSparks<(mobile?220:90))return;lastSparks=now;burst('spark',mobile?7:14,new THREE.Vector3(player.position.x,0.55,player.position.z));}
  function skid(){const now=performance.now();if(now-lastSkid<(mobile?145:70))return;lastSkid=now;for(const x of [-0.82,0.82]){const m=new THREE.Mesh(skidGeometry,skidMat);m.rotation.x=-Math.PI/2;m.rotation.z=player.rotation.y*0.7;m.position.set(player.position.x+x,0.018,player.position.z+1.2);scene.add(m);skidMarks.push(m);if(skidMarks.length>(mobile?28:100))scene.remove(skidMarks.shift());}}
  function render(dt,speed,drifting,nitro,shockwave){
    if(drifting&&performance.now()-lastSmoke>(mobile?180:75)){lastSmoke=performance.now();smoke();}
    if(shockwave&&Math.random()<(mobile?0.12:0.55))sparks();
    if(composer){bloom.strength=shockwave?1.25:(nitro?0.82:0.48);blur.uniforms.amount.value=Math.min(0.004,Math.max(0,speed-35)*0.00009);}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.v,dt);p.v.y-=p.kind==='smoke'?0.15:9*dt;const k=Math.max(0,p.life/p.max);p.mesh.scale.setScalar(p.kind==='smoke'?1+(1-k)*2:k*0.9);p.mesh.material.opacity=(p.kind==='smoke'?0.42:1)*k;if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
    if(composer)composer.render();else renderer.render(scene,camera);
  }
  return {smoke,sparks,skid,render,resize(){if(composer)composer.setSize(innerWidth,innerHeight);}};
}