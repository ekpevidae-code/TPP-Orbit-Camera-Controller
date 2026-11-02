import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * First police AI prototype: patrol, respond to a wanted player, and search
 * when the player gets far enough away. Uses simple geometry for mobile.
 */
export default class PoliceSystem {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.wantedLevel = 0;
    this.escapeTimer = 0;
    this.flashTimer = 0;
    this.speed = 8;
    this.patrolIndex = 0;
    this.patrolPoints = [
      new THREE.Vector3(-48, 0, -48),
      new THREE.Vector3(0, 0, -48),
      new THREE.Vector3(48, 0, -48),
      new THREE.Vector3(48, 0, 0),
      new THREE.Vector3(48, 0, 48),
      new THREE.Vector3(0, 0, 48),
      new THREE.Vector3(-48, 0, 48),
      new THREE.Vector3(-48, 0, 0),
    ];

    this.car = new THREE.Group();
    this.car.name = 'Police Patrol Cruiser';
    this.car.position.copy(this.patrolPoints[0]);
    this.scene.add(this.car);
    this.buildCruiser();

    this.hud = document.getElementById('wanted-level');
    this.crimeButton = document.getElementById('crime-btn');
    if (this.crimeButton) {
      this.crimeButton.addEventListener('click', () => this.commitCrime());
    }
    this.renderWanted();
  }

  mat(color, roughness = 0.65, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  box(parent, x, y, z, sx, sy, sz, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildCruiser() {
    const white = this.mat(0xe5e8e8, 0.42, 0.18);
    const black = this.mat(0x17212a, 0.35, 0.35);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x172d3b, roughness: 0.18, metalness: 0.2,
      transparent: true, opacity: 0.92
    });
    const tire = this.mat(0x101214, 0.95);
    const red = new THREE.MeshStandardMaterial({
      color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0.1
    });
    const blue = new THREE.MeshStandardMaterial({
      color: 0x246bff, emissive: 0x064cff, emissiveIntensity: 0.1
    });

    this.box(this.car, 0, 0.68, 0, 2.15, 0.62, 4.35, white);
    this.box(this.car, 0, 1.12, -0.18, 1.82, 0.76, 2.2, white);
    this.box(this.car, 0, 1.15, -0.18, 1.68, 0.56, 2.04, glass);
    this.box(this.car, 0, 0.94, 1.0, 2.16, 0.35, 1.15, black);
    this.box(this.car, 0, 0.94, -1.0, 2.16, 0.35, 1.15, black);
    this.box(this.car, 0, 1.56, -0.12, 1.05, 0.12, 0.38, black);
    this.box(this.car, -0.42, 1.64, -0.12, 0.34, 0.15, 0.28, red);
    this.box(this.car, 0.42, 1.64, -0.12, 0.34, 0.15, 0.28, blue);

    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12);
    for (const x of [-1.08, 1.08]) {
      for (const z of [-1.38, 1.38]) {
        const wheel = new THREE.Mesh(wheelGeo, tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.42, z);
        this.car.add(wheel);
        this.wheels.push(wheel);
      }
    }
    this.redLight = red;
    this.blueLight = blue;
  }

  commitCrime() {
    this.wantedLevel = Math.min(5, this.wantedLevel + 1);
    this.escapeTimer = 0;
    this.renderWanted();
  }

  renderWanted() {
    if (!this.hud) return;
    this.hud.textContent = this.wantedLevel
      ? 'WANTED  ' + '★'.repeat(this.wantedLevel) + '☆'.repeat(5 - this.wantedLevel)
      : 'WANTED  ☆☆☆☆☆';
    this.hud.classList.toggle('active', this.wantedLevel > 0);
  }

  getTarget() {
    const world = this.game.world;
    if (world.vehicle && world.vehicle.isDriving) return world.vehicle.car.position;
    return world.player.player.position;
  }

  moveToward(destination, dt, maxSpeed) {
    const dx = destination.x - this.car.position.x;
    const dz = destination.z - this.car.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 1.8) return distance;

    const desiredYaw = Math.atan2(-dx, -dz);
    let angle = desiredYaw - this.car.rotation.y;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    this.car.rotation.y += THREE.MathUtils.clamp(angle, -2.1 * dt, 2.1 * dt);

    const alignment = Math.max(0.25, 1 - Math.abs(angle) / Math.PI);
    const velocity = Math.min(maxSpeed, distance * 1.5) * alignment;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.car.quaternion);
    this.car.position.addScaledVector(forward, velocity * dt);
    this.wheels.forEach((wheel) => { wheel.rotation.x += velocity * dt / 0.42; });
    this.car.position.x = THREE.MathUtils.clamp(this.car.position.x, -86, 86);
    this.car.position.z = THREE.MathUtils.clamp(this.car.position.z, -86, 86);
    return distance;
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0.016, 0.05);
    this.flashTimer += dt;
    const flash = Math.floor(this.flashTimer * 5) % 2 === 0;
    this.redLight.emissiveIntensity = flash ? 1.8 : 0.08;
    this.blueLight.emissiveIntensity = flash ? 0.08 : 1.8;

    const target = this.getTarget();
    if (this.wantedLevel > 0) {
      const distance = this.car.position.distanceTo(target);
      if (distance > 48) this.escapeTimer += dt;
      else this.escapeTimer = 0;

      if (this.escapeTimer >= 18) {
        this.wantedLevel = 0;
        this.escapeTimer = 0;
        this.renderWanted();
      } else {
        this.moveToward(target, dt, this.speed + this.wantedLevel * 1.4);
      }
      return;
    }

    const waypoint = this.patrolPoints[this.patrolIndex];
    if (this.moveToward(waypoint, dt, 5.2) < 3) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
    }
  }
}
