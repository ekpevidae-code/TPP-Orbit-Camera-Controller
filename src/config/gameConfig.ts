export const GAME_CONFIG = {
  vehicle: {
    mass: 1320,
    maxSpeedKmh: 318,
    acceleration: 26,
    reverseAcceleration: 12,
    brakeForce: 42,
    steeringRate: 2.05,
    lateralGrip: 8.4,
    driftGrip: 2.1,
    driftSteeringMultiplier: 1.35,
    drag: 0.012,
    rollingResistance: 0.42
  },
  nitro: {
    duration: 3,
    accelerationMultiplier: 2.2,
    topSpeedMultiplier: 1.25,
    instantKick: 6,
    driftChargePerSecond: 0.12,
    perfectWindow: 0.16,
    shockwaveThreshold: 0.98
  },
  camera: {
    baseFov: 62,
    speedFov: 10,
    nitroFov: 22,
    baseDistance: 6.5,
    maxDistance: 9,
    height: 2.55
  },
  graphics: {
    maxPixelRatio: 2,
    targetFps: 60,
    qualityTestSeconds: 2.5
  },
  track: {
    width: 18,
    segmentLength: 38,
    visibleSegments: 18
  }
} as const;

export type QualityLevel = "LOW" | "MEDIUM" | "HIGH";
