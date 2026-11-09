import * as THREE from "three";
import { TUNING as T } from "../config/tuning";

const desiredPosition = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const smoothedLook = new THREE.Vector3();
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type CameraCar = {
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  heading: number;
  speedKmh: number;
  nitroBlend: number;
  s: { topSpeed: number };
};

export function updateChaseCamera(camera: THREE.PerspectiveCamera, car: CameraCar, dt: number) {
  const speed = clamp01(car.speedKmh / car.s.topSpeed);
  const boost = clamp01(car.nitroBlend);

  // Camera stays behind the car's nose; it does not swing after every steering tap.
  const distance = T.camDist + speed * 1.35 + boost * 0.65;
  const height = T.camHeight + speed * 0.12;
  const heading = car.heading;
  desiredPosition.set(
    car.pos.x - Math.sin(heading) * distance,
    height,
    car.pos.z + Math.cos(heading) * distance
  );
  camera.position.lerp(desiredPosition, 1 - Math.exp(-dt * 4.2));

  // Look farther down the road as speed increases, keeping the car low in frame.
  desiredLook.set(
    car.pos.x + Math.sin(heading) * (3.8 + speed * 2.2),
    0.92 + speed * 0.08,
    car.pos.z - Math.cos(heading) * (5.5 + speed * 3.0)
  );
  if (smoothedLook.lengthSq() === 0) smoothedLook.copy(desiredLook);
  smoothedLook.lerp(desiredLook, 1 - Math.exp(-dt * 5.0));
  camera.lookAt(smoothedLook);

  const desiredFov = T.fovBase + speed * 7 + boost * 12;
  camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 2.4));
  camera.updateProjectionMatrix();
}
