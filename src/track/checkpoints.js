/**
 * Ordered checkpoint and recovery helpers for sprint and circuit races.
 * Track-space coordinates are independent of the rendering and vehicle systems.
 */
export class CheckpointSystem {
  constructor(checkpoints = []) {
    this.checkpoints = checkpoints.map((checkpoint, index) => ({
      id: checkpoint.id ?? index + 1,
      z: Number(checkpoint.z),
      label: checkpoint.label ?? `CHECKPOINT ${index + 1}`
    })).sort((a, b) => b.z - a.z);
    this.reset();
  }

  reset() {
    this.nextIndex = 0;
    this.lastZ = null;
    this.completed = false;
    this.lastEvent = null;
  }

  update(z) {
    const currentZ = Number(z);
    if (!Number.isFinite(currentZ)) return null;
    const previousZ = this.lastZ;
    this.lastZ = currentZ;
    if (previousZ === null || this.completed) return null;

    const checkpoint = this.checkpoints[this.nextIndex];
    if (!checkpoint) {
      this.completed = true;
      return null;
    }

    // The current sprint runs in the negative-Z direction. A checkpoint only
    // counts when the car crosses its plane in the correct direction.
    const crossedForward = previousZ > checkpoint.z && currentZ <= checkpoint.z;
    if (!crossedForward) return null;

    this.nextIndex += 1;
    this.lastEvent = {
      checkpoint,
      index: this.nextIndex,
      total: this.checkpoints.length,
      complete: this.nextIndex >= this.checkpoints.length
    };
    if (this.lastEvent.complete) this.completed = true;
    return this.lastEvent;
  }

  get progress() {
    return this.checkpoints.length
      ? this.nextIndex / this.checkpoints.length
      : 1;
  }
}

/** Keeps the car inside the safe road corridor and applies an arcade penalty. */
export function resolveTrackBoundary(offset, halfRoadWidth, margin = 0.8) {
  const safeLimit = Math.max(0.5, halfRoadWidth - margin);
  const value = Number(offset) || 0;
  if (Math.abs(value) <= safeLimit) {
    return { offset: value, offRoad: false, severity: 0 };
  }
  const clamped = Math.sign(value) * safeLimit;
  const overshoot = Math.abs(value) - safeLimit;
  return {
    offset: clamped,
    offRoad: true,
    severity: Math.min(1, 0.35 + overshoot / Math.max(1, margin * 3))
  };
}
