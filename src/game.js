import * as THREE from 'three';

/**
 * Arcade handling model. Called by GameLoop at a fixed 60 Hz timestep.
 * Longitudinal speed and lateral velocity use game metres/second.
 */
export class ArcadeVehicleController {
  constructor(stats = {}) {
    this.setStats(stats);
    this.reset();
  }

  setStats(stats = {}) {
    this.stats = {
      topSpeed: Math.max(1, Number(stats.topSpeed ?? 54)),
      acceleration: Math.max(1, Number(stats.acceleration ?? 26)),
      handling: THREE.MathUtils.clamp(Number(stats.handling ?? 5.5), 1, 12),
      nitro: Math.max(1, Number(stats.nitro ?? 100)),
      weight: THREE.MathUtils.clamp(Number(stats.weight ?? 1), 0.65, 1.6),
      nitroPower: Math.max(0.5, Number(stats.nitroPower ?? 1))
    };
  }

  step(car, input = {}, dt, options = {}) {
    const delta = THREE.MathUtils.clamp(Number(dt) || 0, 0, 1 / 30);
    const speed = Math.max(0, Number(car.speed) || 0);
    const gas = input.gas ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const steer = THREE.MathUtils.clamp(Number(input.steer) || 0, -1, 1);
    const handbrake = input.handbrake ? 1 : 0;
    const boost = Math.max(1, Number(options.nitroMultiplier) || 1);
    const nitroActive = boost > 1.01 && !options.airborne;
    const shockwave = Boolean(options.shockwave);

    // Torque is strongest off the line and fades progressively towards V-max.
    const speedRatio = THREE.MathUtils.clamp(speed / this.stats.topSpeed, 0, 1.15);
    const torqueCurve = 1.72 - 0.78 * Math.min(speedRatio, 1);
    const engineForce = this.stats.acceleration * torqueCurve / this.stats.weight;
    const aeroDrag = 0.006 * speed + 0.00015 * speed * speed;
    const rollingResistance = gas ? 0.22 : 1.8;
    const serviceBrake = brake && !handbrake ? 43 : 0;
    const handbrakeDrag = handbrake ? 16 : 0;
    const nitroForce = nitroActive ? (gas ? 46 : 25) * (boost - 1) * this.stats.nitroPower : 0;

    let nextSpeed = speed + (gas * engineForce + nitroForce - serviceBrake - handbrakeDrag - aeroDrag - rollingResistance) * delta;
    const topSpeedCap = this.stats.topSpeed * (nitroActive ? boost : 1);

    // The boost has an unmistakable launch impulse as soon as the player taps it.
    if (nitroActive && !this.nitroWasActive) {
      const launchKick = this.stats.topSpeed * (shockwave ? 0.48 : 0.30) * this.stats.nitroPower;
      nextSpeed = Math.max(nextSpeed, speed + launchKick);
    }
    this.nitroWasActive = nitroActive;
    car.speed = THREE.MathUtils.clamp(nextSpeed, 0, topSpeedCap);

    const speedNow = car.speed;
    const steeringAuthority = 1 - 0.48 * THREE.MathUtils.clamp(speedNow / (this.stats.topSpeed * 1.25), 0, 1);
    const steeringAngle = steer * (0.22 + this.stats.handling * 0.035) * steeringAuthority;
    const deliberateDrift = Math.abs(steer) > 0.52 && speedNow > 14;
    const drifting = Boolean(!options.airborne && speedNow > 11 && (handbrake || (brake && Math.abs(steer) > 0.15) || deliberateDrift));

    // Grip falls during a slide; lateral velocity builds and then eases out naturally.
    const grip = drifting ? (handbrake ? 0.72 : 1.35) : 5.4 + this.stats.handling * 0.55;
    const lateralTarget = steer * speedNow * (drifting ? 0.34 : 0.075);
    this.lateral = THREE.MathUtils.damp(this.lateral, lateralTarget, grip, delta);
    const yawTarget = THREE.MathUtils.clamp(
      steeringAngle * (0.72 + speedNow / this.stats.topSpeed * 0.34) + (drifting ? steer * 0.16 : 0),
      -0.58,
      0.58
    );
    this.yaw = THREE.MathUtils.damp(this.yaw, yawTarget, drifting ? 3.2 : 6.5, delta);

    const distance = speedNow * delta;
    this.totalDistance += distance;
    if (drifting) this.driftDistance += distance;
    return {
      drifting,
      lateral: this.lateral,
      yaw: this.yaw,
      steeringAngle,
      speed: speedNow,
      drag: aeroDrag,
      distance,
      driftDistance: this.driftDistance,
      topSpeedCap,
      nitroActive
    };
  }

  reset() {
    this.lateral = 0;
    this.yaw = 0;
    this.driftDistance = 0;
    this.totalDistance = 0;
    this.nitroWasActive = false;
  }
}
