import * as THREE from "three";
import { TUNING as T } from "../config/tuning";

const positionTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLook = new THREE.Vector3();
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function updateChaseCamera(camera: THREE.PerspectiveCamera, car: any, dt: number, time: number) {
  const speed = clamp01(car.speedKmh / car.s.topSpeed);
  const boost = car.nitroBlend;
  const drift = Math.min(1, Math.abs(car.slipAngle || 0) * 1.8);
  const distance = T.camDist + speed * T.camDistSpeed + boost * 1.1;
  const height = T.camHeight + speed * 0.18;
  const velocityAngle = Math.atan2(car.vel.x, -car.vel.z);
  let angleDelta = velocityAngle - car.heading;
  angleDelta = Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta));
  // Keep the camera mostly behind the chassis; only a small amount of drift look-through.
  const cameraAngle = car.heading + angleDelta * (0.16 + drift * 0.08);
  positionTarget.set(
    car.pos.x - Math.sin(cameraAngle) * distance,
    height,
    car.pos.z + Math.cos(cameraAngle) * distance
  );
  camera.position.lerp(positionTarget, 1 - Math.exp(-dt * 3.6));

  lookTarget.set(
    car.pos.x + Math.sin(car.heading) * 0.8,
    0.96,
    car.pos.z - Math.cos(car.heading) * 4.2
  );
  if (smoothedLook.lengthSq() === 0) smoothedLook.copy(lookTarget);
  smoothedLook.lerp(lookTarget, 1 - Math.exp(-dt * 5.5));
  camera.lookAt(smoothedLook);

  const desiredFov = T.fovBase + speed * T.fovSpeed + boost * 12;
  camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 2.8));
  camera.updateProjectionMatrix();
}