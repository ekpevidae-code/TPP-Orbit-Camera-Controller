import * as THREE from 'three';

/**
 * Fixed-step arcade vehicle model. Speed is measured in game metres/second;
 * the display conversion to km/h is handled by RaceHUD.
 */
export class ArcadeVehicleController {
  constructor(stats = {}) {
    this.setStats(stats);
    this.lateral = 0;
    this.yaw = 0;
    this.driftDistance = 0;
    this.totalDistance = 0;
  }

  setStats(stats = {}) {
    this.stats = {
      topSpeed: Math.max(1, Number(stats.topSpeed ?? 54)),
      acceleration: Math.max(1, Number(stats.acceleration ?? 26)),
      handling: THREE.MathUtils.clamp(Number(stats.handling ?? 5.5), 1, 12),
      nitro: Math.max(1, Number(stats.nitro ?? 100))
    };
  }

  step(car, input, dt, { nitroMultiplier = 1, shockwave = false, airborne = false } = {}) {
    const delta = THREE.MathUtils.clamp(Number(dt) || 0, 0, 1 / 20);
    const speed = Math.max(0, Number(car.speed) || 0);
    const gas = input.gas ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const steer = THREE.MathUtils.clamp(Number(input.steer) || 0, -1, 1);
    const boost = shockwave ? 2.05 : Math.max(1, Number(nitroMultiplier) || 1);
    const speedRatio = THREE.MathUtils.clamp(speed / this.stats.topSpeed, 0, 1.2);
    const engineForce = this.stats.acceleration * 1.42 * (0.9 + 0.5 * speedRatio);
    const aerodynamicDrag = 0.006 * speed + 0.00012 * speed * speed;
    const rollingResistance = gas ? 0 : 2.0;
    const acceleration = gas * engineForce * boost + (gas && boost > 1 ? 16 * (boost - 1) : 0) - brake * 58 - aerodynamicDrag - rollingResistance;
    const topSpeedCap = this.stats.topSpeed * boost;
    car.speed = THREE.MathUtils.clamp(speed + acceleration * delta, 0, topSpeedCap);

    const drifting = Boolean(brake && Math.abs(steer) > 0.15 && car.speed > 12 && !airborne);
    const grip = drifting ? 1.1 : 5.8 + this.stats.handling * 0.42;
    this.lateral = THREE.MathUtils.damp(this.lateral, steer * car.speed * (drifting ? 0.22 : 0.105), grip, delta);
    this.yaw = THREE.MathUtils.damp(this.yaw, steer * this.stats.handling * (0.35 + car.speed / this.stats.topSpeed), this.stats.handling * 2.2, delta);
    const distance = car.speed * delta;
    this.totalDistance += distance;
    if (drifting) this.driftDistance += distance;
    return { drifting, lateral: this.lateral, yaw: this.yaw, speed: car.speed, drag: aerodynamicDrag, distance, driftDistance: this.driftDistance, topSpeedCap };
  }

  reset() {
    this.lateral = 0;
    this.yaw = 0;
    this.driftDistance = 0;
    this.totalDistance = 0;
  }
}
