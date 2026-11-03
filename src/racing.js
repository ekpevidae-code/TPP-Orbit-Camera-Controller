import * as THREE from 'three';
import { createArcadeFX } from './arcade-systems.js';
import { GAME_STATES, VEHICLES, GameStateManager, VehiclePhysicsEngine, NitroController, AABBCollisionSystem, WaypointRacerAI, GameLoop } from './game-core.js';

const canvas = document.querySelector('#race-canvas');
const ui = {
  speed: document.querySelector('#speed'),
  distance: document.querySelector('#distance'),
  progress: document.querySelector('#progress'),
  state: document.querySelector('#race-state'),
  message: document.querySelector('#message'),
  pause: document.querySelector('#pause-layer'),
  finish: document.querySelector('#finish-layer'),
  finishTitle: document.querySelector('#finish-title'),
  finishCopy: document.querySelector('#finish-copy'),
  driftScore: document.querySelector('#drift-score'),
  driftToast: document.querySelector('#drift-toast'), nitroFill: document.querySelector('#nitro-fill'), nitroSegments: [...document.querySelectorAll('.nitro-segment')], nitroLabel: document.querySelector('#nitro-label'), garage: document.querySelector('#garage-layer')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb5c8);
scene.fog = new THREE.Fog(0x9bb5c8, 65, 230);
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.innerWidth >= 800, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.15 : 1.6));
renderer.shadowMap.enabled = window.innerWidth >= 800;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x45505a, 2.0));
const sun = new THREE.DirectionalLight(0xffedcf, 2.2);
sun.position.set(-35, 65, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const mats = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.94 }),
  line: new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.8 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x506a4a, roughness: 1 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xd9d7cf, roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.45 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x172b3b, metalness: 0.35, roughness: 0.2 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb7c2c9, metalness: 0.8, roughness: 0.24 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xf49a2f, metalness: 0.58, roughness: 0.25 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc52e26, roughness: 0.48 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.4 })
};

function box(parent, w, h, d, material, x, y, z, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 3200), mats.grass);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.14, -1400);
ground.receiveShadow = true;
scene.add(ground);

// A long closed-loop-inspired circuit, built from straight road sections and broad bends.
const road = new THREE.Group();
scene.add(road);
const roadLength = 2800;
const roadWidth = 17;
const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLength), mats.asphalt);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.set(0, 0, -roadLength / 2 + 25);
roadMesh.receiveShadow = true;
road.add(roadMesh);
for (let x of [-roadWidth / 2, roadWidth / 2]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, roadLength), mats.curb);
  edge.position.set(x, 0.055, -roadLength / 2 + 25);
  road.add(edge);
}
const dashCount = Math.ceil((roadLength - 25) / 12);
const dashInstances = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.025, 5.2), mats.line, dashCount);
const marker = new THREE.Object3D();
for (let i = 0; i < dashCount; i++) {
  marker.position.set(0, 0.025, 10 - i * 12);
  marker.updateMatrix();
  dashInstances.setMatrixAt(i, marker.matrix);
}
dashInstances.instanceMatrix.needsUpdate = true;
road.add(dashInstances);
const railCount = Math.ceil(roadLength / 22);
const railWhite = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.65, 19), new THREE.MeshStandardMaterial({color:0xe5e5e5,roughness:0.7}), railCount * 2);
const railRed = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.65, 19), new THREE.MeshStandardMaterial({color:0xb83a31,roughness:0.7}), railCount * 2);
let whiteIndex = 0;
let redIndex = 0;
for (const side of [-1, 1]) {
  for (let i = 0; i < railCount; i++) {
    marker.position.set(side * 9.15, 0.37, -i * 22);
    marker.updateMatrix();
    if (i % 2 === 0) railWhite.setMatrixAt(whiteIndex++, marker.matrix);
    else railRed.setMatrixAt(redIndex++, marker.matrix);
  }
}
railWhite.count = whiteIndex;
railRed.count = redIndex;
railWhite.instanceMatrix.needsUpdate = true;
railRed.instanceMatrix.needsUpdate = true;
road.add(railWhite, railRed);
const startLine = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, 1.5), mats.line);
startLine.rotation.x = -Math.PI / 2;
startLine.position.set(0, 0.035, 6);
road.add(startLine);

// Hills, trees and trackside details.
const hillMat = new THREE.MeshStandardMaterial({ color: 0x687e69, roughness: 1 });
const hillDummy = new THREE.Object3D();
const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), hillMat, 100);
for (let i = 0; i < 100; i++) {
  const x = (i % 2 ? 1 : -1) * (28 + Math.random() * 55);
  const z = -i * 28 + 5;
  const radius = 9 + Math.random() * 12;
  const height = 18 + Math.random() * 25;
  hillDummy.position.set(x, height / 2, z);
  hillDummy.scale.set(radius, height, radius);
  hillDummy.rotation.y = Math.random() * 2;
  hillDummy.updateMatrix();
  hills.setMatrixAt(i, hillDummy.matrix);
}
hills.instanceMatrix.needsUpdate = true;
scene.add(hills);

const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 1 });
const treeTop = new THREE.MeshStandardMaterial({ color: 0x294a37, roughness: 1 });
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6), treeTrunk, 240);
const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), treeTop, 240);
const treeDummy = new THREE.Object3D();
for (let i = 0; i < 240; i++) {
  const side = i % 2 ? 1 : -1;
  const x = side * (13 + Math.random() * 28);
  const z = 4 - i * 11.5;
  const radius = 1.35 + Math.random();
  treeDummy.position.set(x, 1.1, z);
  treeDummy.scale.set(1, 1, 1);
  treeDummy.updateMatrix();
  trunks.setMatrixAt(i, treeDummy.matrix);
  treeDummy.position.set(x, 4, z);
  treeDummy.scale.set(radius, 4.4, radius);
  treeDummy.updateMatrix();
  crowns.setMatrixAt(i, treeDummy.matrix);
}
trunks.instanceMatrix.needsUpdate = true;
crowns.instanceMatrix.needsUpdate = true;
scene.add(trunks, crowns);

// Detailed low-poly sports car with body, glass, wheels, lamps and rear wing.
function makeCar(color = 0xe64b25) {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.68, roughness: 0.24 });
  box(root, 2.05, 0.48, 4.05, bodyMat, 0, 0.72, 0);
  box(root, 1.7, 0.42, 1.85, mats.glass, 0, 1.12, -0.22);
  box(root, 1.92, 0.13, 1.0, bodyMat, 0, 1.0, 1.42);
  box(root, 1.92, 0.12, 0.75, bodyMat, 0, 1.0, -1.57);
  box(root, 1.95, 0.12, 0.16, mats.dark, 0, 0.5, 2.03);
  const headLampMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0x9ecfff, emissiveIntensity: 1.2 });
  box(root, 0.52, 0.12, 0.08, headLampMat, -0.62, 0.78, -2.05, false);
  box(root, 0.52, 0.12, 0.08, headLampMat, 0.62, 0.78, -2.05, false);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3024, emissive: 0xb20b06, emissiveIntensity: 1.1 });
  box(root, 0.58, 0.12, 0.08, tailMat, -0.62, 0.8, 2.05, false);
  box(root, 0.58, 0.12, 0.08, tailMat, 0.62, 0.8, 2.05, false);
  for (const x of [-1.03, 1.03]) {
    for (const z of [-1.28, 1.28]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.27, 18), mats.tire);
      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.285, 12), mats.rim);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);
      wheel.position.set(x, 0.48, z);
      root.add(wheel);
      if (z < 0) wheel.userData.front = true;
      (root.userData.wheels ||= []).push(wheel);
    }
  }
  const wing = box(root, 1.85, 0.09, 0.3, mats.dark, 0, 1.42, 1.8);
  box(root, 0.1, 0.4, 0.1, mats.dark, -0.65, 1.22, 1.8);
  box(root, 0.1, 0.4, 0.1, mats.dark, 0.65, 1.22, 1.8);
  root.position.y = 0;
  scene.add(root);
  return root;
}

const player = makeCar(0xf04d25);
player.speed=0;
player.position.set(0, 0, 4);
const rivals = [
  { car: makeCar(0x246acb), x: -3.4, z: -28, speed: 0.9 },
  { car: makeCar(0xe6e8e9), x: 3.3, z: -48, speed: 0.84 },
  { car: makeCar(0x242a35), x: -1.8, z: -72, speed: 0.8 }
];

rivals.forEach(r => r.car.position.set(r.x, 0, r.z));
// Civilian traffic is deliberately slower and uses the outside lanes.
const traffic=[{car:makeCar(0x68727e),x:-5.1,z:-95,speed:0.58},{car:makeCar(0xd7d1c3),x:5.0,z:-165,speed:0.62},{car:makeCar(0x314c54),x:1.7,z:-230,speed:0.55}];
traffic.forEach(t=>{t.car.scale.setScalar(0.88);t.car.position.set(t.x,0,t.z);});
// Visible launch ramps line up with the stunt checkpoints.
const ramps=[-300,-850,-1470];
ramps.forEach((z,i)=>{const ramp=new THREE.Mesh(new THREE.BoxGeometry(6.2,0.7,7),new THREE.MeshStandardMaterial({color:i===1?0x21b9d5:0xffa43b,metalness:0.35,roughness:0.3,emissive:i===1?0x063d48:0x3a1600,emissiveIntensity:0.35}));ramp.position.set(i===1?2.5:-2.3,0.42,z);ramp.rotation.x=-0.16;ramp.castShadow=true;ramp.receiveShadow=true;scene.add(ramp);});


const gameStates=new GameStateManager(GAME_STATES.MENU);
const vehiclePhysics=new VehiclePhysicsEngine(VEHICLES[0]);
const nitroSystem=new NitroController(VEHICLES[0].nitro);
const collisions=new AABBCollisionSystem();
const state = { speed: 0, steer: 0, drift: 0, nitro: 100, distance: 0, driftScore: 0, driftTime: 0, driftToastTime: 0, running: false, paused: false, finished: false, gas: false, brake: false, left: false, right: false, nitroOn: false, last: 0, shake: 0, airborne: 0, stuntSpin: 0, stuntSpinRate: 0, stuntRoll: 0, stuntDone: false, nitroTap: 0, nitroMode: 0, shockwave: 0, perfect: 0, rampIndex: 0, nearMissCooldown: 0, selectedCar: 0, upgrades: [0,0,0,0] };
const arcadeFX = createArcadeFX(scene,camera,renderer,player);
let countdownRemaining=0, crashTime=0;
const aiControllers=rivals.map((r,i)=>new WaypointRacerAI(r.car,[{x:r.x,z:-100},{x:r.x*0.65,z:-430},{x:r.x,z:-900},{x:r.x*0.8,z:-1500}],r.speed));
const unsubscribeState=gameStates.on('change',({current,previous})=>{if(ui.state)ui.state.textContent=current.replace('_',' ');document.body.dataset.gameState=current;ui.garage?.classList.toggle('hidden',current!==GAME_STATES.GARAGE);ui.pause?.classList.toggle('hidden',current!==GAME_STATES.PAUSED);if(current===GAME_STATES.GAME_OVER)ui.finish?.classList.remove('hidden');if(previous===GAME_STATES.PAUSED&&current===GAME_STATES.RACING)ui.pause?.classList.add('hidden');});
gameStates.transition(GAME_STATES.GARAGE);
const totalDistance = 3.0;
const clamp = THREE.MathUtils.clamp;
const clock = new THREE.Clock();

function resize() {
  arcadeFX.resize();
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

let audioContext=null,engineOsc=null,engineGain=null,tireOsc=null,tireGain=null;
function initAudio(){if(audioContext)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext=new AC();engineOsc=audioContext.createOscillator();engineGain=audioContext.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=55;engineGain.gain.value=0.0001;engineOsc.connect(engineGain).connect(audioContext.destination);engineOsc.start();tireOsc=audioContext.createOscillator();tireGain=audioContext.createGain();tireOsc.type='triangle';tireOsc.frequency.value=420;tireGain.gain.value=0.0001;tireOsc.connect(tireGain).connect(audioContext.destination);tireOsc.start();}
function startRace() {
  if(gameStates.current===GAME_STATES.RACING||gameStates.current===GAME_STATES.COUNTDOWN)return;
  gameStates.transition(GAME_STATES.LOADING);
  initAudio();if(audioContext?.state==='suspended')audioContext.resume();
  ui.garage?.classList.add('hidden');
  if (state.finished) resetRace();
  state.running=true;state.paused=false;ui.pause.classList.add('hidden');countdownRemaining=2.8;gameStates.transition(GAME_STATES.COUNTDOWN);ui.message.style.opacity='1';ui.message.querySelector('strong').textContent='3';ui.message.querySelector('span').textContent='GET READY';
}
function resetRace() {
  state.speed = 0; player.speed=0;nitroSystem.value=VEHICLES[state.selectedCar||0].nitro;gameStates.transition(GAME_STATES.GARAGE); state.steer = 0; state.drift = 0; state.nitro = 100; state.distance = 0; state.driftScore = 0; state.driftTime = 0; state.driftToastTime = 0; state.airborne=0;state.stuntSpin=0;state.stuntRoll=0;state.stuntDone=false;state.nitroMode=0;state.shockwave=0;state.perfect=0;state.rampIndex=0;
  state.running = false; state.paused = false; state.finished = false;
  player.position.set(0, 0, 4); player.rotation.set(0, 0, 0);
  rivals.forEach((r, i) => { r.car.position.set(r.x, 0, -28 - i * 20); r.car.rotation.set(0, 0, 0); });
  ui.finish.classList.add('hidden'); ui.pause.classList.add('hidden');
  ui.message.style.opacity = '1'; ui.message.querySelector('strong').textContent = 'READY?';
  ui.message.querySelector('span').textContent = 'Tap RACE to start your run';
  ui.state.textContent = 'READY TO RACE';
  ui.speed.textContent = '000'; ui.distance.innerHTML = '0.0 <small>KM</small>'; ui.progress.style.width = '0%';
  ui.driftScore.textContent = '0'; ui.driftToast.classList.remove('show'); ui.garage?.classList.remove('hidden');
}
function setPause(value) {
  if (!state.running && !state.paused) return;
  state.paused = value;gameStates.transition(value?GAME_STATES.PAUSED:GAME_STATES.RACING);
  ui.pause.classList.toggle('hidden', !value);
  if (value) ui.state.textContent = 'PAUSED';
  else ui.state.textContent = 'RACE IN PROGRESS';
}

function bindHold(id, key) {
  const el = document.getElementById(id);
  const down = e => { e.preventDefault(); state[key] = true; el.classList.add('pressed'); if (key === 'gas') startRace(); };
  const up = e => { e.preventDefault(); state[key] = false; el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', down);
  ['pointerup','pointercancel','pointerleave'].forEach(ev => el.addEventListener(ev, up));
}
bindHold('gas', 'gas');
bindHold('brake', 'brake');
bindHold('left', 'left');
bindHold('right', 'right');
bindHold('nitro', 'nitroOn');
const nitroButton=document.querySelector('#nitro');
nitroButton.addEventListener('pointerdown',e=>{const result=nitroSystem.tap(performance.now()/1000,state.running);state.nitro=nitroSystem.value;if(result==='SHOCKWAVE'){state.shockwave=3.1;arcadeFX.sparks();ui.nitroLabel.textContent='SHOCKWAVE';}else if(result==='PERFECT'){state.perfect=1.7;ui.nitroLabel.textContent='PERFECT';}else ui.nitroLabel.textContent='NITRO';});
document.querySelector('#stunt')?.addEventListener('pointerdown',()=>{if(state.airborne>0){state.stuntSpinRate=state.stuntSpinRate||Math.PI*5;state.stuntDone=true;}});
document.querySelector('#garage-start')?.addEventListener('click',startRace);
document.querySelectorAll('[data-car]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedCar=Number(btn.dataset.car);const colors=[0xf04d25,0x20a8d8,0xd6dce4];vehiclePhysics.setStats(VEHICLES[state.selectedCar]);nitroSystem.capacity=VEHICLES[state.selectedCar].nitro;nitroSystem.value=nitroSystem.capacity;player.traverse(o=>{if(o.isMesh&&o.material?.metalness>0.5&&o.material.color) o.material.color.setHex(colors[state.selectedCar]);});document.querySelectorAll('[data-car]').forEach(b=>b.classList.toggle('selected',b===btn));}));
document.querySelectorAll('[data-upgrade]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.upgrade);state.upgrades[i]=Math.min(3,state.upgrades[i]+1);btn.querySelector('b').textContent='+'+state.upgrades[i];const base=VEHICLES[state.selectedCar];vehiclePhysics.setStats({topSpeed:base.topSpeed+state.upgrades[0]*2.2,acceleration:base.acceleration+state.upgrades[1]*2.4,handling:base.handling+state.upgrades[2]*0.45,nitro:base.nitro+state.upgrades[3]*8});nitroSystem.capacity=vehiclePhysics.stats.nitro;nitroSystem.value=nitroSystem.capacity;}));

document.querySelector('#pause').addEventListener('click', () => setPause(!state.paused));
document.querySelector('#resume').addEventListener('click', () => setPause(false));
document.querySelector('#restart').addEventListener('click', resetRace);
document.querySelector('#again').addEventListener('click', resetRace);
document.querySelector('#nitro').addEventListener('pointerdown', () => startRace());
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { state.gas = true; startRace(); }
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') state.brake = true;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') state.left = true;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') state.right = true;
  if (e.key === ' ' || e.key.toLowerCase() === 'shift') state.nitroOn = true;
  if(e.key.toLowerCase()==='e'&&state.airborne>0){state.stuntSpinRate=state.stuntSpinRate||Math.PI*5;state.stuntDone=true;}
  if (e.key === 'Escape') setPause(!state.paused);
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') state.gas = false;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') state.brake = false;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') state.left = false;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') state.right = false;
  if (e.key === ' ' || e.key.toLowerCase() === 'shift') state.nitroOn = false;
});

function animate(dtOverride) {
  const dt=dtOverride??Math.min(clock.getDelta(),0.04);
  if(gameStates.current===GAME_STATES.COUNTDOWN){countdownRemaining-=dt;ui.message.querySelector('strong').textContent=countdownRemaining>1.8?'3':countdownRemaining>0.9?'2':countdownRemaining>0?'1':'GO!';if(countdownRemaining<=0){gameStates.transition(GAME_STATES.RACING);ui.message.style.opacity='0';}}
  if (gameStates.current===GAME_STATES.RACING && state.running && !state.paused && !state.finished) {
    const usingNitro=state.nitroOn&&nitroSystem.value>0;
    const steerInput=(state.right?1:0)-(state.left?1:0);
    state.steer=THREE.MathUtils.damp(state.steer,steerInput,vehiclePhysics.stats.handling*2.2,dt);
    const nitroState=nitroSystem.step(dt,state.nitroOn&&state.speed>12);
    state.nitro=nitroState.value;state.shockwave=nitroState.shockwave?nitroSystem.shockwaveTime:0;state.perfect=nitroState.perfect?nitroSystem.perfectTime:0;
    const nitroMultiplier=state.nitroOn&&state.nitro>0?(state.perfect>0?1.55:1.3):1;
    const physics=vehiclePhysics.step(player,{gas:state.gas,brake:state.brake,steer:state.steer},dt,{nitroMultiplier,shockwave:nitroState.shockwave,airborne:state.airborne>0});
    const drifting=physics.drifting;state.speed=physics.speed;player.speed=state.speed;
    const maxSpeed=vehiclePhysics.stats.topSpeed*(nitroState.shockwave?1.85:nitroMultiplier);
    state.drift=THREE.MathUtils.damp(state.drift,drifting?state.steer*0.45:0,drifting?1.1:5,dt);
    const speedFactor=0.35+state.speed/55;
    if (drifting) {
      nitroSystem.add((state.speed*0.012+4)*dt);state.nitro=nitroSystem.value;arcadeFX.skid();
      state.driftTime += dt;
      state.driftScore += Math.round((state.speed * 0.8 + Math.abs(state.steer) * 35) * dt);
      state.driftToastTime = 1.1;
      ui.driftToast.classList.add('show');
      ui.driftScore.textContent = state.driftScore.toLocaleString();
    } else {
      state.driftTime = 0;
      state.driftToastTime = Math.max(0, state.driftToastTime - dt);
      if (!state.driftToastTime) ui.driftToast.classList.remove('show');
    }
    player.position.x+=(physics.lateral*0.22*speedFactor+state.drift*3.4)*dt;if(collisions.guardrail(player.position.x,7.7)&&!nitroState.shockwave){player.position.x=clamp(player.position.x,-7.2,7.2);player.speed*=0.72;state.speed=player.speed;state.steer*=-0.35;crashTime=Math.max(crashTime,0.22);arcadeFX.sparks();}
    player.position.z -= state.speed * dt * 0.34;
    if(state.airborne>0){state.airborne=Math.max(0,state.airborne-dt);state.stuntSpin+=state.stuntSpinRate*dt;player.position.y=0.8+Math.sin((1.1-state.airborne)/1.1*Math.PI)*2.5;state.stuntRoll+=state.steer*dt*4.2;if(state.airborne===0){player.position.y=0;if(state.stuntDone){nitroSystem.add(28);state.nitro=nitroSystem.value;state.driftScore+=500;ui.nitroLabel.textContent='LANDING +NITRO';}state.stuntDone=false;state.stuntSpin=0;state.stuntSpinRate=0;}}
    const stuntAt=[0.42,1.18,2.05];if(state.rampIndex<stuntAt.length&&state.distance>=stuntAt[state.rampIndex]){state.airborne=1.1;state.stuntDone=false;state.stuntRoll=0;state.stuntSpin=0;state.stuntSpinRate=0;state.rampIndex++;arcadeFX.sparks();}
    player.rotation.y = state.stuntSpin - state.steer * 0.16 - state.drift * 0.18;
    player.rotation.z = (state.airborne>0?state.stuntRoll:0) - state.steer * 0.055 - state.drift * 0.09;
    player.userData.wheels.forEach(w => { w.rotation.x += state.speed * dt * 0.16; if (w.userData.front) w.rotation.y = -state.steer * 0.25; });
    state.distance += state.speed * dt / 3600 * 1.65;
    aiControllers.forEach(ai=>ai.step(dt,state.speed,player.position.x));
    state.nearMissCooldown=Math.max(0,state.nearMissCooldown-dt);
    traffic.forEach((t,i)=>{t.car.position.z+=state.speed*dt*0.34-(t.speed*11*dt);if(t.car.position.z>13)t.car.position.z=-260-Math.random()*160;t.car.position.x=t.x+Math.sin(clock.elapsedTime*0.22+i)*0.28;const gap=Math.abs(t.car.position.z-player.position.z);const laneGap=Math.abs(t.car.position.x-player.position.x);if(gap<3.2&&laneGap<2.3&&laneGap>1.15&&state.nearMissCooldown===0){nitroSystem.add(12);state.nitro=nitroSystem.value;state.nearMissCooldown=1.2;arcadeFX.sparks();ui.nitroLabel.textContent='NEAR MISS +';}});

    const collision=collisions.hit(player,traffic.map(t=>t.car));if(collision&&!nitroState.shockwave&&crashTime<=0){player.speed*=0.48;state.speed=player.speed;crashTime=0.85;collision.position.z-=7;ui.nitroLabel.textContent='CRASH!';arcadeFX.sparks();}crashTime=Math.max(0,crashTime-dt);
    camera.fov=THREE.MathUtils.damp(camera.fov,66+Math.max(0,state.speed-25)*0.42+(usingNitro?8:0)+(nitroState.shockwave?10:0),4,dt);camera.updateProjectionMatrix();
    const targetCam = new THREE.Vector3(player.position.x * 0.48, 5.4 + state.speed * 0.018, player.position.z + 10.5+state.speed*0.035);
    camera.position.lerp(targetCam, 1 - Math.pow(0.001, dt));
    camera.lookAt(player.position.x * 0.2, 0.8, player.position.z - 9);
    state.shake = nitroState.shockwave ? 0.12 : usingNitro ? 0.035 : crashTime>0 ? 0.07 : 0;
    camera.position.x += (Math.random() - 0.5) * state.shake;
    ui.speed.textContent = String(Math.round(state.speed * 3.2)).padStart(3, '0');
    ui.distance.innerHTML = state.distance.toFixed(1) + ' <small>KM</small>';
    ui.progress.style.width = Math.min(100, state.distance / totalDistance * 100) + '%';
    ui.nitroFill.style.width=state.nitro+'%';document.querySelector('#nitro-value').textContent=Math.round(state.nitro)+'%';ui.nitroSegments.forEach((s,i)=>s.classList.toggle('filled',state.nitro>(i*10)));
    const placesBehind = rivals.filter(r => r.car.position.z < player.position.z).length;
    const place = Math.min(4, placesBehind + 1);
    const suffix = place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
    document.querySelector('#position').innerHTML = place + '<span>' + suffix + '</span>';
    if (state.distance >= totalDistance) {
      state.finished=true;state.running=false;state.speed=0;gameStates.transition(GAME_STATES.GAME_OVER);
      ui.finishTitle.textContent = 'FINISH!';
      ui.finishCopy.textContent = 'You completed the 3 km sprint. Run it again and beat your time.';
      ui.finish.classList.remove('hidden');
      ui.state.textContent = 'RACE COMPLETE';
    }
  } else {
    camera.position.lerp(new THREE.Vector3(player.position.x * 0.48, 5.2, player.position.z + 10.5), 0.025);
    camera.lookAt(player.position.x * 0.2, 0.8, player.position.z - 9);
  }
  if(audioContext){engineOsc.frequency.setTargetAtTime(48+state.speed*2.2+(state.nitroOn?35:0),audioContext.currentTime,0.08);engineGain.gain.setTargetAtTime(state.running&&!state.paused?0.035:0.0001,audioContext.currentTime,0.12);tireOsc.frequency.setTargetAtTime(380+Math.abs(state.steer)*260,audioContext.currentTime,0.06);tireGain.gain.setTargetAtTime(state.running&&Math.abs(state.drift)>0.12?0.018:0.0001,audioContext.currentTime,0.08);}
  arcadeFX.render(dt,state.speed,Math.abs(state.drift)>0.08,state.nitroOn,state.shockwave>0);
}
camera.position.set(0, 5.5, 14);
camera.lookAt(0, 0.8, -8);
const gameLoop=new GameLoop(dt=>animate(dt),()=>{});
gameLoop.start();
window.addEventListener('pagehide',()=>{gameLoop.stop();unsubscribeState();},{once:true});
