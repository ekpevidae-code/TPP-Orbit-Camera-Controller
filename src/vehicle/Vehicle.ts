import { TUNING as T } from "../config/tuning";
const KMH = 1 / 3.6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export type VehicleInput = {
  steer: number; throttle?: number; brake?: number | boolean;
  handbrake?: boolean; nitroPressed?: boolean;
};

export class Vehicle {
  s: { topSpeed: number; accel: number; handling: number; nitroPower: number };
  pos = { x: 0, z: 0 };
  vel = { x: 0, z: 0 };
  heading = 0;
  steer = 0;
  nitro = 0.5;
  nitroActive = false;
  nitroTimer = 0;
  nitroBlend = 0;
  drifting = false;
  driftScore = 0;
  slipAngle = 0;
  speedKmh = 0;

  constructor(stats: Partial<Vehicle["s"]> = {}) {
    this.s = { topSpeed: 300, accel: 12, handling: 1, nitroPower: 1, ...stats };
  }

  addNitro(amount: number) { this.nitro = clamp(this.nitro + amount, 0, 1); }

  update(dt: number, input: VehicleInput) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vL = this.vel.x * rx + this.vel.z * rz;
    this.speedKmh = Math.max(0, vF / KMH);

    if (input.nitroPressed && !this.nitroActive && this.nitro >= T.nitroMinToUse) {
      this.nitroActive = true;
      this.nitroTimer = T.nitroDuration;
      vF += T.nitroKick;
    }
    if (this.nitroActive) {
      this.nitroTimer -= dt;
      this.nitro = Math.max(0, this.nitro - dt / T.nitroDuration);
      if (this.nitroTimer <= 0 || this.nitro <= 0) this.nitroActive = false;
    }
    this.nitroBlend = damp(this.nitroBlend, this.nitroActive ? 1 : 0, 5, dt);

    const speedRatio = clamp(vF / (this.s.topSpeed * KMH), 0, 1.2);
    const top = this.s.topSpeed * KMH * (this.nitroActive ? T.nitroTopMul : 1);
    const throttle = clamp(input.throttle ?? 1, 0, 1);
    if (vF < top) {
      const taper = clamp(1 - Math.pow(vF / top, 2), 0.08, 1);
      const boostMul = this.nitroActive ? T.nitroAccelMul : 1;
      vF += this.s.accel * boostMul * taper * throttle * dt;
    } else {
      vF = Math.max(top, vF - 5 * dt);
    }
    if (input.brake) vF = Math.max(0, vF - 32 * Number(input.brake) * dt);
    vF = Math.max(0, vF - vF * 0.018 * dt);

    // Steering ramps in and out; high-speed steering has a deliberately smaller yaw rate.
    this.steer = damp(this.steer, clamp(input.steer, -1, 1), 3.4, dt);
    const handbrake = !!input.handbrake && this.speedKmh > 55;
    this.drifting = handbrake;
    const yawAtSpeed = 0.92 - speedRatio * 0.48;
    const yawRate = this.steer * yawAtSpeed * this.s.handling * (handbrake ? 1.16 : 1);
    this.heading += yawRate * dt;

    if (handbrake) {
      // Controlled rear slip: enough angle to see a drift, never a sudden spin.
      vL += this.steer * vF * 0.12 * dt;
      vL *= Math.exp(-T.gripDrift * 0.42 * dt);
      if (this.speedKmh > 60) {
        this.addNitro(T.nitroDriftCharge * dt);
        this.driftScore += this.speedKmh * Math.abs(vL) * dt * 0.08;
      }
    } else {
      vL *= Math.exp(-7.5 * dt);
    }

    // Let the chassis gently settle toward its direction of travel after releasing steering.
    if (Math.abs(this.steer) < 0.035 && Math.abs(vF) > 2 && !handbrake) {
      const travelHeading = Math.atan2(this.vel.x, this.vel.z);
      const delta = Math.atan2(Math.sin(travelHeading - this.heading), Math.cos(travelHeading - this.heading));
      this.heading += delta * (1 - Math.exp(-dt * 2.2));
    }

    this.slipAngle = Math.atan2(Math.abs(vL), Math.max(1, Math.abs(vF)));
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = Math.cos(this.heading), nrz = -Math.sin(this.heading);
    this.vel.x = nfx * vF + nrx * vL;
    this.vel.z = nfz * vF + nrz * vL;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speedKmh = Math.max(0, vF / KMH);
  }
}
