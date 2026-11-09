import * as THREE from 'three';
import { createArcadeFX } from './arcade-systems.js';
import { GAME_STATES, VEHICLES, GameStateManager, NitroController, AABBCollisionSystem, WaypointRacerAI, GameLoop } from './game-core.js';
import { RaceHUD } from './hud.js';
import { ArcadeVehicleController } from './game.js';
import { session, registerAccount, loginAccount, logoutAccount, getGarage, purchaseCar, upgradeCar, selectCar } from './api.js';

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.innerWidth >= 800, powerPreference: 'high-performance', stencil: false, depth: true });
const mobileDevice = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileDevice ? 0.85 : 1.35));
renderer.shadowMap.enabled = !mobileDevice && window.innerWidth >= 800;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x45505a, 2.0));
const sun = new THREE.DirectionalLight(0xffedcf, 2.2);
sun.position.set(-35, 65, 28);
sun.castShadow = !mobileDevice;
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
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.72, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x10151b, metalness: 0.55, roughness: 0.34 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0c1c2a, metalness: 0.35, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.94 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8c4cd, metalness: 0.9, roughness: 0.18 });
  const headLampMat = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, emissive: 0x9edfff, emissiveIntensity: 2.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3024, emissive: 0xd20d08, emissiveIntensity: 2.1 });

  // Sculpted, beveled shell: a wide planted sill, raised wheel shoulders and a low nose.
  const shell = new THREE.Shape();
  shell.moveTo(-0.92, 0.43); shell.quadraticCurveTo(-1.12, 0.48, -1.12, 0.68);
  shell.lineTo(-1.02, 0.91); shell.quadraticCurveTo(-0.94, 1.02, -0.72, 1.04);
  shell.lineTo(0.72, 1.04); shell.quadraticCurveTo(0.98, 1.0, 1.04, 0.84);
  shell.lineTo(1.12, 0.65); shell.quadraticCurveTo(1.1, 0.48, 0.91, 0.43);
  shell.closePath();
  const shellGeo = new THREE.ExtrudeGeometry(shell, { depth: 3.85, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.11, bevelThickness: 0.09, curveSegments: 8 });
  shellGeo.translate(0, 0, -1.92);
  const shellMesh = new THREE.Mesh(shellGeo, bodyMat);
  shellMesh.castShadow = true; shellMesh.receiveShadow = true; root.add(shellMesh);

  // Low, tapered canopy with separate dark glazing and metallic window surrounds.
  const canopy = new THREE.Shape();
  canopy.moveTo(-0.76, 0.98); canopy.lineTo(-0.61, 1.47);
  canopy.quadraticCurveTo(-0.5, 1.59, -0.34, 1.6);
  canopy.lineTo(0.42, 1.6); canopy.quadraticCurveTo(0.64, 1.56, 0.7, 1.39);
  canopy.lineTo(0.83, 1.0); canopy.closePath();
  const canopyGeo = new THREE.ExtrudeGeometry(canopy, { depth: 1.82, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.045, bevelThickness: 0.045 });
  canopyGeo.translate(0, 0, -0.88);
  const canopyMesh = new THREE.Mesh(canopyGeo, carbon); canopyMesh.castShadow = true; root.add(canopyMesh);
  // Panoramic windscreen and rear glass, set as sloped dark panels.
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.035, 0.62), glassMat);
  windscreen.position.set(0, 1.42, -0.78); windscreen.rotation.x = -0.48; root.add(windscreen);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.035, 0.52), glassMat);
  rearGlass.position.set(0, 1.42, 0.77); rearGlass.rotation.x = 0.48; root.add(rearGlass);
  for (const side of [-1, 1]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.38, 1.12), glassMat);
    sideGlass.position.set(side * 0.69, 1.37, 0.02); sideGlass.rotation.z = side * -0.08; root.add(sideGlass);
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bodyMat);
    mirror.scale.set(1.15, 0.65, 0.8); mirror.position.set(side * 1.02, 1.13, -0.72); root.add(mirror);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 2.35), carbon);
    sill.position.set(side * 1.02, 0.48, 0.02); root.add(sill);
  }

  // Front splitter, rear diffuser, sculpted bumpers and side aero blades.
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.09, 0.36), carbon);
  splitter.position.set(0, 0.43, -1.96); root.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.13, 0.34), carbon);
  diffuser.position.set(0, 0.4, 1.91); root.add(diffuser);
  for (const x of [-0.62, 0.62]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.08), carbon);
    intake.position.set(x, 0.65, -1.91); root.add(intake);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.075, 0.045), headLampMat);
    lamp.position.set(x, 0.86, -1.99); root.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.085, 0.05), tailMat);
    tail.position.set(x, 0.86, 1.94); root.add(tail);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 12), chrome);
    exhaust.rotation.x = Math.PI / 2; exhaust.position.set(x * 0.72, 0.49, 2.03); root.add(exhaust);
  }

  const wheels = [];
  for (const x of [-1.04, 1.04]) {
    for (const z of [-1.22, 1.22]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.29, 24), mats.tire);
      tire.rotation.z = Math.PI / 2; wheel.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.305, 16), chrome);
      rim.rotation.z = Math.PI / 2; wheel.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.315, 12), carbon);
      hub.rotation.z = Math.PI / 2; wheel.add(hub);
      for (let spoke = 0; spoke < 5; spoke++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.39, 0.045), chrome);
        bar.position.set(x > 0 ? 0.16 : -0.16, 0, 0); bar.rotation.x = spoke * Math.PI / 5; wheel.add(bar);
      }
      wheel.position.set(x, 0.48, z); root.add(wheel);
      if (z < 0) wheel.userData.front = true;
      wheels.push(wheel);
    }
  }
  // Rear wing on two uprights, plus roofline and hood accents.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.09, 0.34), carbon);
  wing.position.set(0, 1.43, 1.76); root.add(wing);
  for (const x of [-0.68, 0.68]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.08), chrome);
    support.position.set(x, 1.25, 1.73); root.add(support);
  }
  const hoodLine = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 1.02), chrome);
  hoodLine.position.set(0, 1.055, -1.25); root.add(hoodLine);
  root.userData.wheels = wheels;
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
  { car: makeCar(0x242a35), x: -1.8, z: -72, speed: 0.8 },
  { car: makeCar(0xc23e42), x: 5.1, z: -96, speed: 0.82 },
  { car: makeCar(0x7b8793), x: -5.0, z: -120, speed: 0.78 }
];

rivals.forEach(r => r.car.position.set(r.x, 0, r.z));
// Civilian traffic is deliberately slower and uses the outside lanes.
const traffic=[{car:makeCar(0x68727e),x:-5.1,z:-95,speed:0.58},{car:makeCar(0xd7d1c3),x:5.0,z:-165,speed:0.62},{car:makeCar(0x314c54),x:1.7,z:-230,speed:0.55}];
traffic.forEach(t=>{t.car.scale.setScalar(0.88);t.car.position.set(t.x,0,t.z);});
// Visible launch ramps line up with the stunt checkpoints.
const ramps=[-300,-850,-1470];
ramps.forEach((z,i)=>{const ramp=new THREE.Mesh(new THREE.BoxGeometry(6.2,0.7,7),new THREE.MeshStandardMaterial({color:i===1?0x21b9d5:0xffa43b,metalness:0.35,roughness:0.3,emissive:i===1?0x063d48:0x3a1600,emissiveIntensity:0.35}));ramp.position.set(i===1?2.5:-2.3,0.42,z);ramp.rotation.x=-0.16;ramp.castShadow=true;ramp.receiveShadow=true;scene.add(ramp);});


const gameStates=new GameStateManager(GAME_STATES.MENU);
const vehiclePhysics=new ArcadeVehicleController(VEHICLES[0]);
const nitroSystem=new NitroController(VEHICLES[0].nitro);
const collisions=new AABBCollisionSystem();
const state = { serverPlayerCarId: null, serverCarModelId: 'falcon-gt', speed: 0, steer: 0, drift: 0, nitro: 100, distance: 0, driftScore: 0, driftTime: 0, driftToastTime: 0, running: false, paused: false, finished: false, gas: false, brake: false, left: false, right: false, nitroOn: false, last: 0, shake: 0, airborne: 0, stuntSpin: 0, stuntSpinRate: 0, stuntRoll: 0, stuntDone: false, nitroTap: 0, nitroMode: 0, shockwave: 0, perfect: 0, rampIndex: 0, nearMissCooldown: 0, selectedCar: 0, upgrades: [0,0,0,0] };
const hud = new RaceHUD();
const arcadeFX = createArcadeFX(scene,camera,renderer,player);
let countdownRemaining=0, crashTime=0;
const aiControllers=rivals.map((r,i)=>new WaypointRacerAI(r.car,[{x:r.x,z:-100},{x:r.x*0.65,z:-430},{x:r.x,z:-900},{x:r.x*0.8,z:-1500}],r.speed));
const unsubscribeState=gameStates.on('change',({current,previous})=>{if(ui.state)ui.state.textContent=current.replace('_',' ');document.body.dataset.gameState=current;ui.garage?.classList.toggle('hidden',current!==GAME_STATES.GARAGE);ui.pause?.classList.toggle('hidden',current!==GAME_STATES.PAUSED);if(current===GAME_STATES.GAME_OVER)ui.finish?.classList.remove('hidden');if(previous===GAME_STATES.PAUSED&&current===GAME_STATES.RACING)ui.pause?.classList.add('hidden');});
gameStates.transition(GAME_STATES.GARAGE);
const totalDistance = 3.0;
const clamp = THREE.MathUtils.clamp;
const clock = new THREE.Clock();

let mobileSlowFrames = 0;
let mobileFastFrames = 0;
let mobilePixelRatio = Math.min(window.devicePixelRatio || 1, mobileDevice ? 0.85 : 1.35);

function adaptMobileQuality(frameDt) {
  if (!mobileDevice || !Number.isFinite(frameDt) || frameDt <= 0) return;
  if (frameDt > 0.029) {
    mobileSlowFrames++;
    mobileFastFrames = 0;
  } else if (frameDt < 0.019) {
    mobileFastFrames++;
    mobileSlowFrames = 0;
  } else {
    mobileSlowFrames = Math.max(0, mobileSlowFrames - 1);
    mobileFastFrames = 0;
  }

  let nextRatio = mobilePixelRatio;
  if (mobileSlowFrames >= 36) {
    nextRatio = Math.max(0.6, mobilePixelRatio - 0.08);
    mobileSlowFrames = 0;
  } else if (mobileFastFrames >= 360) {
    nextRatio = Math.min(Math.min(window.devicePixelRatio || 1, 0.85), mobilePixelRatio + 0.04);
    mobileFastFrames = 0;
  }
  if (Math.abs(nextRatio - mobilePixelRatio) >= 0.03) {
    mobilePixelRatio = nextRatio;
    renderer.setPixelRatio(mobilePixelRatio);
    renderer.setSize(Math.max(1, canvas.clientWidth || window.innerWidth), Math.max(1, canvas.clientHeight || window.innerHeight), false);
  }
}

function resize() {
  arcadeFX.resize();
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  camera.aspect = w / h;
  camera.fov = Math.min(74, Math.max(58, 62 + (h / w - 1) * 7));
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize, { passive: true });
window.visualViewport?.addEventListener('resize', resize, { passive: true });
const gameResizeObserver = new ResizeObserver(resize);
gameResizeObserver.observe(document.querySelector('#game'));
resize();

let audioContext=null,engineOsc=null,engineGain=null,tireOsc=null,tireGain=null;
function initAudio(){if(audioContext)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext=new AC();engineOsc=audioContext.createOscillator();engineGain=audioContext.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=55;engineGain.gain.value=0.0001;engineOsc.connect(engineGain).connect(audioContext.destination);engineOsc.start();tireOsc=audioContext.createOscillator();tireGain=audioContext.createGain();tireOsc.type='triangle';tireOsc.frequency.value=420;tireGain.gain.value=0.0001;tireOsc.connect(tireGain).connect(audioContext.destination);tireOsc.start();}
function startRace() {
  if(gameStates.current===GAME_STATES.RACING||gameStates.current===GAME_STATES.COUNTDOWN)return;
  // Reset a completed race before entering LOADING; otherwise resetRace()
  // would move the state back to GARAGE and make COUNTDOWN an invalid transition.
  if (state.finished) resetRace();
  if (!gameStates.transition(GAME_STATES.LOADING)) return;
  initAudio();if(audioContext?.state==='suspended')audioContext.resume();
  ui.garage?.classList.add('hidden');
  state.running=true;state.paused=false;ui.pause.classList.add('hidden');countdownRemaining=2.8;gameStates.transition(GAME_STATES.COUNTDOWN);ui.message.style.opacity='1';ui.message.querySelector('strong').textContent='3';ui.message.querySelector('span').textContent='GET READY';
}
function resetRace() {
  state.speed = 0; player.speed=0;nitroSystem.reset(VEHICLES[state.selectedCar||0].nitro);gameStates.transition(GAME_STATES.GARAGE); state.steer = 0; state.drift = 0; state.nitro = nitroSystem.value; state.distance = 0; state.driftScore = 0; state.driftTime = 0; state.driftToastTime = 0; state.airborne=0;state.stuntSpin=0;state.stuntRoll=0;state.stuntDone=false;state.nitroMode=0;state.shockwave=0;state.perfect=0;state.rampIndex=0;
  state.running = false; state.paused = false; state.finished = false; state.gas=false;state.brake=false;state.left=false;state.right=false;state.nitroOn=false;nitroButton.classList.remove('pressed');
  player.position.set(0, 0, 4); player.rotation.set(0, 0, 0);
  vehiclePhysics.reset();
  rivals.forEach((r, i) => { r.car.position.set(r.x, 0, -28 - i * 20); r.car.rotation.set(0, 0, 0); });
  aiControllers.forEach(ai=>{ai.index=0;});
  traffic.forEach((t,i)=>{t.car.position.set(t.x,0,[-95,-165,-230][i]??(-95-i*70));t.car.rotation.set(0,0,0);});
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

// Nitro is tap-to-toggle on touchscreens so a short tap still delivers a usable boost.
const nitroButton=document.querySelector('#nitro');
function activateNitro(){const result=nitroSystem.tap(performance.now()/1000,gameStates.current===GAME_STATES.RACING);state.nitro=nitroSystem.value;if(result==='UNAVAILABLE'){ui.nitroLabel.textContent='RACE FIRST';return;}if(result==='SHOCKWAVE'){state.nitroOn=true;state.shockwave=3.6;arcadeFX.sparks();ui.nitroLabel.textContent='SHOCKWAVE';}else if(result==='PERFECT'){state.nitroOn=true;state.perfect=2.0;ui.nitroLabel.textContent='PERFECT';}else{state.nitroOn=!state.nitroOn;ui.nitroLabel.textContent=state.nitroOn?'NITRO ON':'NITRO';}nitroButton.classList.toggle('pressed',state.nitroOn);}
nitroButton.addEventListener('pointerdown',e=>{e.preventDefault();activateNitro();});
document.querySelector('#stunt')?.addEventListener('pointerdown',()=>{if(state.airborne>0){state.stuntSpinRate=state.stuntSpinRate||Math.PI*5;state.stuntDone=true;}});
document.querySelector('#garage-start')?.addEventListener('click',startRace);
function renderGarageStats(){const v=VEHICLES[state.selectedCar];const stats={topSpeed:v.topSpeed+state.upgrades[0]*2.2,acceleration:v.acceleration+state.upgrades[1]*2.4,handling:(v.handling+state.upgrades[2]*0.45)*10,nitro:v.nitro+state.upgrades[3]*8};for(const [key,value] of Object.entries(stats)){const el=document.querySelector('[data-stat="'+key+'"]');if(el){el.querySelector('strong').textContent=Math.round(value);el.querySelector('i b').style.width=Math.min(100,value/(key==='topSpeed'?70:key==='acceleration'?40:key==='handling'?75:120)*100)+'%';}}}
document.querySelectorAll('[data-car]').forEach(btn=>btn.addEventListener('click',async()=>{try{const index=Number(btn.dataset.car);const modelId=['falcon-gt','vortex-r','apex-rs'][index];if(session.authenticated){let data=await getGarage();let owned=data.cars.find(car=>car.carModelId===modelId);if(!owned){const purchase=await purchaseCar(modelId);owned=purchase.playerCar;}const selection=await selectCar(owned.id);state.serverPlayerCarId=selection.playerCar.id;state.serverCarModelId=modelId;await refreshOnlineGarage();}state.selectedCar=index;state.upgrades=[0,0,0,0];const colors=[0xf04d25,0x20a8d8,0xd6dce4];vehiclePhysics.setStats(VEHICLES[index]);nitroSystem.reset(VEHICLES[index].nitro);player.traverse(o=>{if(o.isMesh&&o.material?.metalness>0.5&&o.material.color)o.material.color.setHex(colors[index]);});document.querySelectorAll('[data-car]').forEach(b=>b.classList.toggle('selected',b===btn));renderGarageStats();}catch(error){setAccountMessage(error.message,true);}}));
renderGarageStats();

const accountForm=document.querySelector('#account-form');
const accountFeedback=document.querySelector('#account-feedback');
const accountWallet=document.querySelector('#account-wallet');
const accountLogout=document.querySelector('#account-logout');
const setAccountMessage=(message,isError=false)=>{if(accountFeedback){accountFeedback.textContent=message;accountFeedback.style.color=isError?'#ff9b91':'#b7c5d8';}};
async function refreshOnlineGarage(){
  if(!session.authenticated)return;
  const data=await getGarage();
  accountWallet.textContent='CREDITS: '+Number(data.wallet?.credits||0).toLocaleString();
  accountLogout.classList.remove('hidden');
  const selected=data.cars.find(car=>car.isSelected)||data.cars[0];
  if(selected){
    state.serverPlayerCarId=selected.id;state.serverCarModelId=selected.carModelId;
    const index=['falcon-gt','vortex-r','apex-rs'].indexOf(selected.carModelId);
    if(index>=0){
      state.selectedCar=index;
      state.upgrades=[selected.topSpeedLevel,selected.accelerationLevel,selected.handlingLevel,selected.nitroLevel];
      const base=VEHICLES[index];
      vehiclePhysics.setStats({topSpeed:base.topSpeed+state.upgrades[0]*2.2,acceleration:base.acceleration+state.upgrades[1]*2.4,handling:base.handling+state.upgrades[2]*0.45,nitro:base.nitro+state.upgrades[3]*8});
      nitroSystem.reset(vehiclePhysics.stats.nitro);
      document.querySelectorAll('[data-car]').forEach(button=>button.classList.toggle('selected',Number(button.dataset.car)===index));
      document.querySelectorAll('[data-upgrade]').forEach(button=>button.querySelector('b').textContent='+'+state.upgrades[Number(button.dataset.upgrade)]);
      renderGarageStats();
    }
  }
  setAccountMessage('Garage synced securely with your account.');
}
accountForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    await loginAccount({email:document.querySelector('#account-email').value,password:document.querySelector('#account-password').value});
    await refreshOnlineGarage();
  }catch(error){setAccountMessage(error.message,true);}
});
document.querySelector('#account-register')?.addEventListener('click',async()=>{
  try{
    const registration=await registerAccount({email:document.querySelector('#account-email').value,username:document.querySelector('#account-username').value,password:document.querySelector('#account-password').value});
    if(registration.needsEmailConfirmation){setAccountMessage('Check your email and confirm the account, then sign in here.');return;}
    await refreshOnlineGarage();
    setAccountMessage('Account created. Your starter garage and wallet are ready.');
  }catch(error){setAccountMessage(error.message,true);}
});
accountLogout?.addEventListener('click',()=>{logoutAccount();state.serverPlayerCarId=null;accountWallet.textContent='Signed out';accountLogout.classList.add('hidden');setAccountMessage('Signed out. Local practice remains available.');});
if(session.authenticated)refreshOnlineGarage().catch(error=>{logoutAccount();setAccountMessage(error.message,true);});

document.querySelectorAll('[data-upgrade]').forEach(btn=>btn.addEventListener('click',async()=>{try{const i=Number(btn.dataset.upgrade);if(session.authenticated){if(!state.serverPlayerCarId)throw new Error('Select an owned car first.');const stat=['topSpeed','acceleration','handling','nitro'][i];const result=await upgradeCar(state.serverPlayerCarId,stat);state.upgrades=[result.playerCar.topSpeedLevel,result.playerCar.accelerationLevel,result.playerCar.handlingLevel,result.playerCar.nitroLevel];await refreshOnlineGarage();}else{state.upgrades[i]=Math.min(3,state.upgrades[i]+1);}btn.querySelector('b').textContent='+'+state.upgrades[i];const base=VEHICLES[state.selectedCar];vehiclePhysics.setStats({topSpeed:base.topSpeed+state.upgrades[0]*2.2,acceleration:base.acceleration+state.upgrades[1]*2.4,handling:base.handling+state.upgrades[2]*0.45,nitro:base.nitro+state.upgrades[3]*8});nitroSystem.reset(vehiclePhysics.stats.nitro);renderGarageStats();}catch(error){setAccountMessage(error.message,true);}}));

document.querySelector('#pause').addEventListener('click', () => setPause(!state.paused));
document.querySelector('#resume').addEventListener('click', () => setPause(false));
document.querySelector('#restart').addEventListener('click', resetRace);
document.querySelector('#again').addEventListener('click', resetRace);

hud.bindControls({
  setInput:(key,value)=>{state[key]=value;},
  startRace,
  nitro:activateNitro,
  stunt:()=>{if(state.airborne>0){state.stuntSpinRate=state.stuntSpinRate||Math.PI*5;state.stuntDone=true;}},
  pause:()=>setPause(!state.paused)
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
    const nitroMultiplier=nitroState.shockwave?3.15:(state.nitroOn&&state.nitro>0?(state.perfect>0?2.75:2.35):1);
    const physics=vehiclePhysics.step(player,{gas:state.gas,brake:state.brake,steer:state.steer},dt,{nitroMultiplier,shockwave:nitroState.shockwave,airborne:state.airborne>0});
    const drifting=physics.drifting;state.speed=physics.speed;player.speed=state.speed;
    const maxSpeed=vehiclePhysics.stats.topSpeed*nitroMultiplier;
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
    player.position.z -= state.speed * dt * 0.46;
    if(state.airborne>0){state.airborne=Math.max(0,state.airborne-dt);state.stuntSpin+=state.stuntSpinRate*dt;player.position.y=0.8+Math.sin((1.1-state.airborne)/1.1*Math.PI)*2.5;state.stuntRoll+=state.steer*dt*4.2;if(state.airborne===0){player.position.y=0;if(state.stuntDone){nitroSystem.add(28);state.nitro=nitroSystem.value;state.driftScore+=500;ui.nitroLabel.textContent='LANDING +NITRO';}state.stuntDone=false;state.stuntSpin=0;state.stuntSpinRate=0;}}
    const stuntAt=[0.42,1.18,2.05];if(state.rampIndex<stuntAt.length&&state.distance>=stuntAt[state.rampIndex]){state.airborne=1.1;state.stuntDone=false;state.stuntRoll=0;state.stuntSpin=0;state.stuntSpinRate=0;state.rampIndex++;arcadeFX.sparks();}
    player.rotation.y = state.stuntSpin - state.steer * 0.16 - state.drift * 0.18;
    player.rotation.z = (state.airborne>0?state.stuntRoll:0) - state.steer * 0.055 - state.drift * 0.09;
    player.userData.wheels.forEach(w => { w.rotation.x += state.speed * dt * 0.16; if (w.userData.front) w.rotation.y = -state.steer * 0.25; });
    state.distance += state.speed * dt / 3600 * 1.65;
    aiControllers.forEach(ai=>ai.step(dt,state.speed,player.position.x));
    state.nearMissCooldown=Math.max(0,state.nearMissCooldown-dt);
    traffic.forEach((t,i)=>{t.car.position.z+=state.speed*dt*0.46-(t.speed*11*dt);if(t.car.position.z>13)t.car.position.z=-260-Math.random()*160;t.car.position.x=t.x+Math.sin(clock.elapsedTime*0.22+i)*0.28;const gap=Math.abs(t.car.position.z-player.position.z);const laneGap=Math.abs(t.car.position.x-player.position.x);if(gap<3.2&&laneGap<2.3&&laneGap>1.15&&state.nearMissCooldown===0){nitroSystem.add(12);state.nitro=nitroSystem.value;state.nearMissCooldown=1.2;arcadeFX.sparks();ui.nitroLabel.textContent='NEAR MISS +';}});

    const collision=collisions.hit(player,[...traffic.map(t=>t.car),...rivals.map(r=>r.car)]);if(collision&&!nitroState.shockwave&&crashTime<=0){player.speed*=0.48;state.speed=player.speed;crashTime=0.85;collision.position.z-=7;ui.nitroLabel.textContent='CRASH!';arcadeFX.sparks();}crashTime=Math.max(0,crashTime-dt);
    camera.fov=THREE.MathUtils.damp(camera.fov,66+Math.max(0,state.speed-25)*0.42+((usingNitro||nitroState.shockwave)?10:0)+(nitroState.shockwave?7:0),5.5,dt);camera.updateProjectionMatrix();
    const targetCam = new THREE.Vector3(player.position.x * 0.48, 5.4 + state.speed * 0.018, player.position.z + 10.5+state.speed*0.035);
    camera.position.lerp(targetCam, 1 - Math.pow(0.001, dt));
    camera.lookAt(player.position.x * 0.2, 0.8, player.position.z - 9);
    state.shake = nitroState.shockwave ? 0.12 : usingNitro ? 0.035 : crashTime>0 ? 0.07 : 0;
    camera.position.x += (Math.random() - 0.5) * state.shake;
    const placesBehind = rivals.filter(r => r.car.position.z < player.position.z).length;
    const place = Math.min(6, placesBehind + 1);
    hud.render({speed:state.speed,distance:state.distance,totalDistance,position:place,nitro:state.nitro,nitroCapacity:nitroSystem.capacity,driftScore:state.driftScore,drifting:state.driftTime>0,state:gameStates.current});
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
  if(state.nitro<=0){state.nitroOn=false;nitroButton.classList.remove('pressed');}if(audioContext){engineOsc.frequency.setTargetAtTime(48+state.speed*2.2+(state.nitroOn?35:0),audioContext.currentTime,0.08);engineGain.gain.setTargetAtTime(state.running&&!state.paused?0.035:0.0001,audioContext.currentTime,0.12);tireOsc.frequency.setTargetAtTime(380+Math.abs(state.steer)*260,audioContext.currentTime,0.06);tireGain.gain.setTargetAtTime(state.running&&Math.abs(state.drift)>0.12?0.018:0.0001,audioContext.currentTime,0.08);}
}
camera.position.set(0, 5.5, 14);
camera.lookAt(0, 0.8, -8);
const gameLoop=new GameLoop(
  dt=>animate(dt),
  frameDt=>{adaptMobileQuality(frameDt);arcadeFX.render(frameDt,state.speed,Math.abs(state.drift)>0.08,state.nitroOn,state.shockwave>0);}
);
gameLoop.start();
window.addEventListener('pagehide',()=>{gameLoop.stop();unsubscribeState();hud.destroy();gameResizeObserver.disconnect();},{once:true});
