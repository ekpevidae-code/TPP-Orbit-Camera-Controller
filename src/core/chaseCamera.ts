import * as THREE from "three";
import { TUNING as T } from "../config/tuning";
const target = new THREE.Vector3();
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function updateChaseCamera(camera: THREE.PerspectiveCamera, car: any, dt: number, time: number) {
  const sp = clamp01(car.speedKmh / car.s.topSpeed);
  const nb = car.nitroBlend;
  const dist = T.camDist + sp * T.camDistSpeed + nb * T.camDistNitro;
  const height = T.camHeight - sp * 0.4;
  const velAngle = Math.atan2(car.vel.x, car.vel.z);
  let diff = velAngle - car.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const camAngle = car.heading + diff * 0.5;
  target.set(car.pos.x - Math.sin(camAngle) * dist, height, car.pos.z - Math.cos(camAngle) * dist);
  camera.position.lerp(target, 1 - Math.exp(-dt * 6));
  const shake = nb * 0.12 + sp * 0.02;
  camera.position.x += Math.sin(time * 90) * shake;
  camera.position.y += Math.cos(time * 77) * shake;
  camera.lookAt(car.pos.x, 1, car.pos.z);
  camera.fov = T.fovBase + sp * T.fovSpeed + nb * T.fovNitro;
  camera.updateProjectionMatrix();
}
