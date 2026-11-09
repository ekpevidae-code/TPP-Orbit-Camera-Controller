import { TUNING as T } from "../config/tuning";
const KMH = 1 / 3.6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
    this.s = { topSpeed: 300, accel: 22, handling: 1, nitroPower: 1, ...stats };
  }
  addNitro(amount: number) { this.nitro = clamp(this.nitro + amount, 0, 1); }

  update(dt: number, input: VehicleInput) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vL = this.vel.x * rx + this.vel.z * rz;
    this.speedKmh = Math.abs(vF) / KMH;

    if (input.nitroPressed && !this.nitroActive && this.nitro >= T.nitroMinToUse) {
      this.nitroActive = true;
      this.nitroTimer = T.nitroDuration;
      vF += T.nitroKick * this.s.nitroPower;
    }
    if (this.nitroActive) {
      this.nitroTimer -= dt;
      this.nitro = Math.max(0, this.nitro - dt / T.nitroDuration);
      if (this.nitroTimer <= 0 || this.nitro <= 0) this.nitroActive = false;
    }
    this.nitroBlend += ((this.nitroActive ? 1 : 0) - this.nitroBlend) * Math.min(1, dt * 6);

    const top = this.s.topSpeed * KMH * (this.nitroActive ? T.nitroTopMul : 1);
    const throttle = input.throttle ?? 1;
    if (vF < top) {
      const taper = clamp(1 - Math.pow(vF / top, 2), 0.05, 1);
      const mul = this.nitroActive ? T.nitroAccelMul * this.s.nitroPower : 1;
      vF += this.s.accel * mul * taper * throttle * dt;
    } else vF -= 8 * dt;
    if (input.brake) vF = Math.max(0, vF - 40 * Number(input.brake) * dt);
    vF -= vF * 0.015 * dt;

    this.steer += (input.steer - this.steer) * Math.min(1, dt * 8);
    const wantDrift = (Math.abs(this.steer) > T.driftSteerThreshold && this.speedKmh > T.driftMinKmh) ||
      (!!input.handbrake && this.speedKmh > 80);
    if (wantDrift) this.drifting = true;
    else if (Math.abs(vL) < 1.5) this.drifting = false;

    const grip = (this.drifting ? T.gripDrift : T.gripNormal) * this.s.handling;
    vL *= Math.exp(-grip * dt);
    const authority = 1.9 * this.s.handling / (1 + this.speedKmh / 180) * (this.drifting ? 1.35 : 1);
    this.heading += this.steer * authority * clamp(vF / 10, -1, 1) * dt;
    // When steering is released, progressively align the nose with the travel direction.
    if (Math.abs(this.steer) < 0.08 && Math.abs(vF) > 3) {
      const travelHeading = Math.atan2(this.vel.x, this.vel.z);
      const align = Math.atan2(Math.sin(travelHeading - this.heading), Math.cos(travelHeading - this.heading));
      this.heading += align * (1 - Math.exp(-dt * (this.drifting ? 1.1 : 3.8)));
    }

    if (this.drifting && this.speedKmh > 60) {
      this.addNitro(T.nitroDriftCharge * dt);
      this.driftScore += this.speedKmh * Math.abs(vL) * dt * 0.1;
    }
    this.slipAngle = Math.atan2(Math.abs(vL), Math.max(1, Math.abs(vF)));
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = Math.cos(this.heading), nrz = -Math.sin(this.heading);
    this.vel.x = nfx * vF + nrx * vL;
    this.vel.z = nfz * vF + nrz * vL;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }
}
