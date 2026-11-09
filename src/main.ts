import * as THREE from "three";
import { GAME_CONFIG, type QualityLevel } from "./config/gameConfig";
import { Vehicle } from "./vehicle/Vehicle";
import { updateChaseCamera } from "./core/chaseCamera";
import "./style.css";

type DriveMode = "TOUCHDRIVE" | "MANUAL";
type InputState = { steer: number; throttle: number; brake: boolean; drift: boolean; nitro: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  canvas: $("game-canvas") as HTMLCanvasElement, boot: $("boot-screen"), error: $("error-screen"),
  speed: $("speed"), nitroFill: $("nitro-fill"), nitroPercent: $("nitro-percent"),
  debug: $("debug-panel"), fps: $("debug-fps"), dSpeed: $("debug-speed"), slip: $("debug-slip"),
  drift: $("debug-drift"), dNitro: $("debug-nitro"), quality: $("debug-quality"), errors: $("debug-errors"),
  driftScore: $("drift-score"), boostFlash: $("boost-flash"), driveState: $("drive-state"),
  boostLabel: $("boost-label")
};

const runtimeErrors: string[] = [];
function reportError(error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  runtimeErrors.push(message.slice(0, 700));
  ui.errors.textContent = runtimeErrors.slice(-4).join("\n\n");
  ui.error.hidden = false;
  ui.error.textContent = "RACE SYSTEM WARNING\n" + runtimeErrors.slice(-2).join("\n\n");
}
window.addEventListener("error", e => reportError(e.error || e.message));
window.addEventListener("unhandledrejection", e => reportError(e.reason));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8b9aa9);
scene.fog = new THREE.FogExp2(0x8794a1, 0.0065);
const camera = new THREE.PerspectiveCamera(GAME_CONFIG.camera.baseFov, innerWidth / innerHeight, 0.1, 650);
camera.position.set(0, 4, 10);
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

scene.add(new THREE.HemisphereLight(0xc9e6ff, 0x252b38, 2.0));
const sun = new THREE.DirectionalLight(0xffe0bb, 3.2);
sun.position.set(-24, 38, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
scene.add(sun);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x252b34, roughness: 0.32, metalness: 0.22 });
const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e6d8, roughness: 0.7, emissive: 0x33302a });
const barrierMat = new THREE.MeshStandardMaterial({ color: 0x9da9b4, metalness: 0.72, roughness: 0.28 });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x263b35, roughness: 0.94 });
const road = new THREE.Mesh(new THREE.PlaneGeometry(20, 1400), roadMat);
road.rotation.x = -Math.PI / 2; road.position.z = -600; road.receiveShadow = true; scene.add(road);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.position.z = -500; scene.add(ground);

const dashGroup = new THREE.Group(); scene.add(dashGroup);
for (let z = 25; z > -1300; z -= 22) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 8), lineMat);
  dash.position.set(0, 0.025, z); dashGroup.add(dash);
}
const edgeGroup = new THREE.Group(); scene.add(edgeGroup);
for (const x of [-9.55, 9.55]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 1400), barrierMat);
  rail.position.set(x, 0.48, -600); rail.castShadow = true; rail.receiveShadow = true; edgeGroup.add(rail);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 1400), new THREE.MeshStandardMaterial({ color: 0xc64e45 }));
  curb.position.set(x * 0.985, 0.1, -600); edgeGroup.add(curb);
}
const roadside = new THREE.Group(); scene.add(roadside);
const buildingMats = [0x344453, 0x59616c, 0x4a555e, 0x273849, 0x77716b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 }));
for (let i = 0; i < 130; i++) {
  const side = i % 2 ? 1 : -1;
  const z = 18 - Math.floor(i / 2) * 20;
  const h = 5 + ((i * 17) % 19);
  const w = 4 + ((i * 7) % 7);
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7 + (i % 4) * 2), buildingMats[i % buildingMats.length]);
  b.position.set(side * (17 + (i % 5) * 4), h / 2 - 0.1, z);
  b.castShadow = i % 3 === 0; roadside.add(b);
  const windowMat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0x8fc9dc : 0xffc77d });
  for (let row = 0; row < Math.min(4, Math.floor(h / 4)); row++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.08), windowMat);
    win.position.set(b.position.x - side * (w * 0.24), 1.8 + row * 2.6, z + 3.56);
    roadside.add(win);
  }
}
const poles = new THREE.Group(); scene.add(poles);
for (let z = 18; z > -800; z -= 42) for (const side of [-1, 1]) {
  const pole = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7, 8), barrierMat);
  stem.position.y = 3.5; pole.add(stem);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.12), barrierMat);
  arm.position.set(-side * 0.9, 6.7, 0); pole.add(arm);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.13, 0.32), new THREE.MeshBasicMaterial({ color: 0xffe3ae }));
  lamp.position.set(-side * 1.7, 6.58, 0); pole.add(lamp);
  pole.position.set(side * 11.4, 0, z); poles.add(pole);
}

function makeCar() {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0879a7, metalness: 0.82, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x10151b, metalness: 0.62, roughness: 0.32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x142b39, metalness: 0.35, roughness: 0.08, transmission: 0.12, transparent: true, opacity: 0.88, clearcoat: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: 0.93 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xaeb9c4, metalness: 0.9, roughness: 0.22 });
  const led = new THREE.MeshBasicMaterial({ color: 0x9deaff });
  const red = new THREE.MeshBasicMaterial({ color: 0xff263e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.56, 4.25, 4, 2, 8), paint);
  body.position.y = 0.78; body.castShadow = true; car.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.02, 1.45, 4), paint);
  nose.rotation.x = Math.PI / 2; nose.scale.set(1, 0.46, 1.5); nose.position.set(0, 0.7, -2.3); car.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.67, 1.95), glass);
  cabin.position.set(0, 1.28, -0.22); cabin.castShadow = true; car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.28), paint);
  roof.position.set(0, 1.66, -0.22); car.add(roof);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.09, 0.65), dark);
  splitter.position.set(0, 0.43, -2.15); car.add(splitter);
  const spoiler = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.42), dark);
  wing.position.y = 1.65; spoiler.add(wing);
  for (const x of [-0.63, 0.63]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.12), rim);
    support.position.set(x, 1.45, 1.58); spoiler.add(support);
  }
  car.add(spoiler);
  const wheels: { pivot: THREE.Group; spin: THREE.Group }[] = [];
  for (const x of [-1.03, 1.03]) for (const z of [-1.38, 1.42]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.55, z); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 24), rubber);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire);
    const wheelFace = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.335, 20), rim);
    wheelFace.rotation.z = Math.PI / 2; spin.add(wheelFace);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 16), dark);
    hub.rotation.z = Math.PI / 2; spin.add(hub);
    wheels.push({ pivot, spin });
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.06), led);
  head.position.set(-0.65, 0.85, -2.12); car.add(head);
  const head2 = head.clone(); head2.position.x = 0.65; car.add(head2);
  for (const x of [-0.65, 0.65]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.07), red);
    tail.position.set(x, 0.86, 2.14); car.add(tail);
  }
  const exhausts: THREE.Mesh[] = [];
  for (const x of [-0.48, 0.48]) {
    const ex = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.65, 12), new THREE.MeshBasicMaterial({ color: 0x33aaff, transparent: true, opacity: 0.0 }));
    ex.rotation.x = Math.PI / 2; ex.position.set(x, 0.58, 2.5); car.add(ex); exhausts.push(ex);
  }
  car.userData.wheels = wheels;
  car.userData.exhausts = exhausts;
  return car;
}
const car = makeCar(); car.position.set(0, 0, 1.5); scene.add(car);

const particleGroup = new THREE.Group(); scene.add(particleGroup);
type Particle = { mesh: THREE.Mesh; life: number; max: number; vx: number; vy: number; vz: number };
const particles: Particle[] = [];
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xb9c4cd, transparent: true, opacity: 0.28, depthWrite: false });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffbd72, transparent: true, opacity: 0.95 });
function emitParticle(kind: "smoke" | "spark", position: THREE.Vector3) {
  if (particles.length > 90) return;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(kind === "smoke" ? 0.18 : 0.055, 6, 5), kind === "smoke" ? smokeMat : sparkMat);
  mesh.position.copy(position); particleGroup.add(mesh);
  particles.push({ mesh, life: kind === "smoke" ? 0.8 : 0.22, max: kind === "smoke" ? 0.8 : 0.22, vx: (Math.random() - 0.5) * 1.4, vy: kind === "smoke" ? 0.8 : Math.random() * 2, vz: 1 + Math.random() * 2 });
}
const skidGroup = new THREE.Group(); scene.add(skidGroup);
const skidMat = new THREE.MeshBasicMaterial({ color: 0x10151a, transparent: true, opacity: 0.62, depthWrite: false });
let skidTimer = 0;
let speed = 0, slipAngle = 0, nitro = 0.5, nitroTime = 0, driftTime = 0, driftPoints = 0, driftActive = false, perfectArmed = false;
const vehicle = new Vehicle({ topSpeed: 300, accel: 22, handling: 1, nitroPower: 1 });
let nitroPending = false, previousBoost = false;
let mode: DriveMode = "TOUCHDRIVE";
let quality: QualityLevel = "MEDIUM";
let elapsed = 0;
const input: InputState = { steer: 0, throttle: 0, brake: false, drift: false, nitro: false };
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0, fpsValue = 0;
let shake = 0;
const audio = (() => {
  let ctx: AudioContext | null = null, osc: OscillatorNode | null = null, gain: GainNode | null = null;
  function start() {
    if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
    ctx = new AudioContext(); osc = ctx.createOscillator(); gain = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.value = 48; gain.gain.value = 0.0001;
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
  }
  return {
    start,
    update(s: number, boost: boolean) {
      if (!ctx || !osc || !gain) return;
      osc.frequency.setTargetAtTime(42 + s * 0.58 + (boost ? 34 : 0), ctx.currentTime, 0.08);
      gain.gain.setTargetAtTime(0.012 + Math.min(s / 320, 1) * 0.025, ctx.currentTime, 0.12);
    },
    burst() {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(190, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.38);
      g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.42);
    }
  };
})();
function startNitro() {
  if (vehicle.nitro < 0.25 || vehicle.nitroActive) return;
  nitroPending = true;
}
function update(dt: number) {
  elapsed += dt;
  const steer = input.steer;
  const throttle = mode === "TOUCHDRIVE" ? 1 : input.throttle;
  const wasBoosting = vehicle.nitroActive;
  vehicle.update(dt, {
    steer,
    throttle,
    brake: input.brake ? 1 : 0,
    handbrake: input.drift,
    nitroPressed: nitroPending
  });
  nitroPending = false;
  speed = vehicle.speedKmh;
  nitro = vehicle.nitro;
  nitroTime = vehicle.nitroTimer;
  driftActive = vehicle.drifting;
  slipAngle = vehicle.slipAngle * 180 / Math.PI;
  const boost = vehicle.nitroActive;
  const speedNorm = THREE.MathUtils.clamp(speed / vehicle.s.topSpeed, 0, 1.25);

  if (boost && !wasBoosting) {
    shake = Math.max(shake, 0.35);
    audio.burst();
    ui.boostLabel.textContent = "NITRO SYSTEM";
    ui.boostFlash.classList.add("active", "normal");
    window.setTimeout(() => ui.boostFlash.classList.remove("active", "normal"), 420);
  }
  if (!boost && wasBoosting) ui.boostLabel.textContent = "NITRO SYSTEM";

  if (driftActive && speed > 60) {
    driftTime += dt;
    driftPoints = vehicle.driftScore;
    if (Math.random() < 0.75) {
      for (const x of [-0.76, 0.76]) emitParticle("smoke", car.localToWorld(new THREE.Vector3(x, 0.28, 1.35)));
    }
    skidTimer += dt;
    if (skidTimer > 0.065) {
      skidTimer = 0;
      const p = car.localToWorld(new THREE.Vector3(-0.78, 0.03, 1.3));
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.9), skidMat);
      mark.position.copy(p); mark.rotation.y = car.rotation.y; skidGroup.add(mark);
      if (skidGroup.children.length > 100) skidGroup.remove(skidGroup.children[0]);
    }
  } else {
    if (driftTime > 0.25) {
      speed += Math.min(9, driftTime * 1.4);
      ui.driftScore.textContent = Math.round(driftPoints) + " DRIFT";
      ui.driftScore.classList.add("show");
      window.setTimeout(() => ui.driftScore.classList.remove("show"), 900);
    }
    driftTime = 0;
  }

  if (nitro >= 0.98) perfectArmed = true;
  if (boost && Math.random() < 0.8) {
    const exhausts = car.userData.exhausts as THREE.Mesh[];
    exhausts.forEach(ex => { (ex.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.random() * 0.25; });
  } else {
    (car.userData.exhausts as THREE.Mesh[]).forEach(ex => (ex.material as THREE.MeshBasicMaterial).opacity = 0);
  }

  car.position.x = THREE.MathUtils.clamp(vehicle.pos.x, -7.7, 7.7);
  car.position.y = Math.sin(elapsed * 18) * Math.min(speedNorm, 0.8) * 0.025 + (driftActive ? 0.035 : 0);
  car.rotation.y = -vehicle.heading;
  car.rotation.z = THREE.MathUtils.damp(car.rotation.z, -steer * speedNorm * 0.09, 5, dt);
  const wheels = car.userData.wheels as { pivot: THREE.Group; spin: THREE.Group }[];
  wheels.forEach((w, i) => {
    w.spin.rotation.x -= speed * dt * 0.004;
    if (i < 2) w.pivot.rotation.y = -steer * 0.42;
  });

  if (boost) shake = Math.max(shake, 0.08);
  shake = Math.max(0, shake - dt * 0.55);
  const cameraCar = {
    pos: { x: car.position.x, z: car.position.z },
    vel: { x: vehicle.vel.x, z: -vehicle.vel.z },
    heading: vehicle.heading,
    speedKmh: vehicle.speedKmh,
    nitroBlend: vehicle.nitroBlend,
    s: vehicle.s
  };
  updateChaseCamera(camera, cameraCar, dt, elapsed);
  camera.position.x += (Math.random() - 0.5) * shake;
  camera.position.y += (Math.random() - 0.5) * shake;
  roadside.position.z = (elapsed * speed * 0.075) % 20;
  poles.position.z = (elapsed * speed * 0.075) % 42;
  dashGroup.position.z = (elapsed * speed * 0.075) % 22;

  particles.forEach((p, i) => {
    p.life -= dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
    p.mesh.scale.multiplyScalar(1 + dt * 1.3);
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.max) * (p.max > 0.5 ? 0.28 : 0.95);
    if (p.life <= 0) { particleGroup.remove(p.mesh); p.mesh.geometry.dispose(); particles.splice(i, 1); }
  });
  audio.update(speed, boost);
  ui.speed.textContent = Math.round(speed).toString().padStart(3, "0");
  ui.nitroFill.style.width = (nitro * 100) + "%";
  ui.nitroPercent.textContent = Math.round(nitro * 100).toString().padStart(3, "0") + "%";
  ui.dSpeed.textContent = Math.round(speed) + " km/h";
  ui.slip.textContent = slipAngle.toFixed(1) + "°";
  ui.drift.textContent = driftActive ? "ACTIVE" : "OFF";
  ui.drift.style.color = driftActive ? "#ffbb62" : "#9ba9b6";
  ui.dNitro.textContent = Math.round(nitro * 100) + "%";
}


// --- Runtime boot: input wiring, resize handling and the render loop ---
function setMode(next: DriveMode) {
  mode = next;
  document.body.dataset.driveMode = next;
  $("mode-touch").classList.toggle("active", next === "TOUCHDRIVE");
  $("mode-manual").classList.toggle("active", next === "MANUAL");
  ui.driveState.textContent = next + " ACTIVE";
  if (next === "TOUCHDRIVE") input.throttle = 0;
}
$("mode-touch").addEventListener("click", () => setMode("TOUCHDRIVE"));
$("mode-manual").addEventListener("click", () => setMode("MANUAL"));

function bindHold(id: string, down: () => void, up: () => void) {
  const el = $(id);
  const release = (event?: Event) => {
    if (event) event.preventDefault();
    up();
    el.classList.remove("pressed");
  };
  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try { (el as HTMLButtonElement).setPointerCapture(event.pointerId); } catch {}
    down();
    el.classList.add("pressed");
    audio.start();
  });
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("contextmenu", event => event.preventDefault());
}
bindHold("steer-left", () => { input.steer = -1; }, () => { if (input.steer < 0) input.steer = 0; });
bindHold("steer-right", () => { input.steer = 1; }, () => { if (input.steer > 0) input.steer = 0; });
bindHold("drift-button", () => { input.drift = true; }, () => { input.drift = false; });
bindHold("brake-button", () => { input.brake = true; }, () => { input.brake = false; });
bindHold("gas-button", () => { input.throttle = 1; }, () => { input.throttle = 0; });
$("nitro-button").addEventListener("pointerdown", event => {
  event.preventDefault();
  audio.start();
  startNitro();
  $("nitro-button").classList.add("pressed");
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
  $("nitro-button").addEventListener(name, () => $("nitro-button").classList.remove("pressed"));
}

$("debug-toggle").addEventListener("click", () => { ui.debug.hidden = !ui.debug.hidden; });
$("debug-close").addEventListener("click", () => { ui.debug.hidden = true; });

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
}
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("orientationchange", () => window.setTimeout(resize, 120), { passive: true });
document.addEventListener("visibilitychange", () => { clock.getDelta(); });

function animate() {
  try {
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsValue = Math.round(fpsFrames / fpsTime);
      ui.fps.textContent = String(fpsValue);
      if (fpsValue < 28) quality = "LOW";
      else if (fpsValue < 48) quality = "MEDIUM";
      else quality = "HIGH";
      ui.quality.textContent = quality;
      fpsFrames = 0;
      fpsTime = 0;
    }
    if (!bootFinished) {
      bootFinished = true;
      ui.boot.classList.add("done");
      window.setTimeout(() => { ui.boot.hidden = true; }, 550);
    }
  } catch (error) {
    reportError(error);
    renderer.setAnimationLoop(null);
  }
}
let bootFinished = false;
resize();
setMode("TOUCHDRIVE");
renderer.setAnimationLoop(animate);
