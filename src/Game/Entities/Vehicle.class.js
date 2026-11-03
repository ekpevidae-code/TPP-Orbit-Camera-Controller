import * as THREE from 'three';
import Game from '../Game.class';

/**
 * Lightweight arcade vehicle for the starter city.
 * Uses shared primitive geometry and no external assets, so it loads quickly on mobile.
 */
export default class Vehicle {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.inputManager = this.game.inputManager;
    this.car = new THREE.Group();
    this.car.name = 'Player Vehicle';
    this.car.position.set(2.8, 0, 3.5);
    this.car.rotation.y = Math.PI;
    this.scene.add(this.car);

    this.vehicleCode = 'starter_sedan';
    this.isOwned = true; // Guest sessions may drive the local starter car.
    this.isDriving = false;
    this.speed = 0;
    this.maxSpeed = 24;
    this.reverseSpeed = 9;
    this.acceleration = 13;
    this.brakePower = 22;
    this.turnSpeed = 1.65;
    this.interactionDistance = 4.8;
    this.previousInteract = false;

    this.wheels = [];
    this.buildCar();
    this.createPrompt();
  }

  material(color, roughness = 0.65, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  addBox(parent, x, y, z, sx, sy, sz, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildCar() {
    const paint = this.material(0x253b50, 0.28, 0.55);
    const dark = this.material(0x15191d, 0.82);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x263d4b, roughness: 0.16, metalness: 0.25,
      transparent: true, opacity: 0.88
    });
    const trim = this.material(0x777f83, 0.32, 0.7);
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff1c7, emissive: 0xffd88a, emissiveIntensity: 0.45 });
    const rearLamp = new THREE.MeshStandardMaterial({ color: 0x8d1717, emissive: 0x5b0808, emissiveIntensity: 0.35 });

    // Vehicle faces toward -Z, matching the character's forward direction.
    this.addBox(this.car, 0, 0.66, 0, 2.05, 0.62, 4.25, paint);
    this.addBox(this.car, 0, 1.05, -0.18, 1.72, 0.66, 2.05, paint);
    this.addBox(this.car, 0, 1.13, -0.2, 1.58, 0.48, 1.86, glass);
    this.addBox(this.car, 0, 1.42, -0.18, 1.48, 0.08, 1.78, dark);
    this.addBox(this.car, 0, 0.99, -2.02, 1.72, 0.12, 0.18, trim);
    this.addBox(this.car, 0, 0.99, 2.02, 1.72, 0.12, 0.18, trim);
    this.addBox(this.car, -0.72, 0.74, -2.12, 0.32, 0.2, 0.08, lamp);
    this.addBox(this.car, 0.72, 0.74, -2.12, 0.32, 0.2, 0.08, lamp);
    this.addBox(this.car, -0.72, 0.74, 2.12, 0.32, 0.2, 0.08, rearLamp);
    this.addBox(this.car, 0.72, 0.74, 2.12, 0.32, 0.2, 0.08, rearLamp);

    const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 16);
    const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.292, 12);
    for (const x of [-1.03, 1.03]) {
      for (const z of [-1.38, 1.38]) {
        const wheel = new THREE.Group();
        wheel.position.set(x, 0.43, z);
        const tire = new THREE.Mesh(wheelGeometry, dark);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wheel.add(tire);
        const rim = new THREE.Mesh(rimGeometry, trim);
        rim.rotation.z = Math.PI / 2;
        wheel.add(rim);
        this.car.add(wheel);
        this.wheels.push(wheel);
      }
    }
  }

  createPrompt() {
    this.prompt = document.getElementById('vehicle-btn');
    if (this.prompt) {
      this.prompt.addEventListener('click', () => this.toggleDriving());
    }
    this.updatePrompt();
  }

  updatePrompt() {
    if (!this.prompt) return;
    this.prompt.style.display = this.isOwned ? 'block' : 'none';
    this.prompt.textContent = this.isDriving ? 'EXIT CAR' : 'ENTER CAR';
    this.prompt.classList.toggle('driving', this.isDriving);
  }

  toggleDriving() {
    if (!this.isOwned) return;
    const player = this.game.world && this.game.world.player && this.game.world.player.player;
    if (!player) return;

    if (this.isDriving) {
      this.isDriving = false;
      player.visible = true;
      player.position.copy(this.car.position);
      const side = new THREE.Vector3(1.8, 0, 0).applyQuaternion(this.car.quaternion);
      player.position.add(side);
      player.rotation.copy(this.car.rotation);
      this.speed = 0;
      this.inputManager.keys.forward = false;
      this.inputManager.keys.backward = false;
      this.inputManager.keys.left = false;
      this.inputManager.keys.right = false;
    } else {
      if (player.position.distanceTo(this.car.position) > this.interactionDistance) return;
      this.isDriving = true;
      player.visible = false;
      player.position.copy(this.car.position);
      this.speed = 0;
    }
    this.updatePrompt();
  }

  canOccupy(position) {
    const world = this.game.world;
    if (world && world.city && world.city.isBuildingBlocked(position, 2.15)) return false;
    if (world && world.traffic) {
      for (const item of world.traffic.cars) {
        if (item.car.position.distanceTo(position) < 3.15) return false;
      }
    }
    if (world && world.pedestrians) {
      for (const person of world.pedestrians.people) {
        if (person.root.position.distanceTo(position) < 2.15) return false;
      }
    }
    if (world && world.player && world.player.player && world.player.player.visible) {
      if (world.player.player.position.distanceTo(position) < 2.05) return false;
    }
    return true;
  }

  update() {
    if (!this.isOwned) return;
    const player = this.game.world && this.game.world.player && this.game.world.player.player;
    if (!player) return;

    const actions = this.inputManager.Actions;
    const interactPressed = !!actions.interact;
    if (interactPressed && !this.previousInteract) {
      if (this.isDriving || player.position.distanceTo(this.car.position) <= this.interactionDistance) {
        this.toggleDriving();
      }
    }
    this.previousInteract = interactPressed;

    if (!this.isDriving) {
      const near = player.position.distanceTo(this.car.position) <= this.interactionDistance;
      if (this.prompt) {
        this.prompt.classList.toggle('available', near);
        this.prompt.style.opacity = near ? '1' : '0.72';
      }
      return;
    }

    const dt = Math.min(this.game.time.delta || 0, 0.05);
    if (actions.brake) {
      // Dedicated brake smoothly reduces forward or reverse speed to zero.
      if (this.speed > 0) this.speed = Math.max(0, this.speed - this.brakePower * dt);
      else this.speed = Math.min(0, this.speed + this.brakePower * dt);
    } else if (actions.forward) {
      this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * dt);
    } else if (actions.backward) {
      this.speed = Math.max(-this.reverseSpeed, this.speed - this.acceleration * dt);
    } else {
      this.speed *= Math.exp(-1.7 * dt);
    }

    if (Math.abs(this.speed) > 0.15) {
      const steering = (actions.left ? 1 : 0) - (actions.right ? 1 : 0);
      const steeringFactor = Math.min(1, Math.abs(this.speed) / 5);
      this.car.rotation.y += steering * this.turnSpeed * steeringFactor * dt * (this.speed >= 0 ? 1 : -1);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.car.quaternion);
      const movement = forward.clone().multiplyScalar(this.speed * dt);
      const next = this.car.position.clone().add(movement);
      if (this.canOccupy(next)) {
        this.car.position.copy(next);
      } else {
        // Try sliding along one axis so a glancing impact does not freeze steering.
        const slideX = this.car.position.clone();
        slideX.x += movement.x;
        const slideZ = this.car.position.clone();
        slideZ.z += movement.z;
        if (Math.abs(movement.x) > Math.abs(movement.z) && this.canOccupy(slideX)) {
          this.car.position.copy(slideX);
        } else if (this.canOccupy(slideZ)) {
          this.car.position.copy(slideZ);
        } else if (this.canOccupy(slideX)) {
          this.car.position.copy(slideX);
        } else {
          this.speed = 0;
        }
      }
      this.wheels.forEach((wheel) => { wheel.rotation.x += this.speed * dt / 0.43; });
    }

    player.position.copy(this.car.position);
    player.rotation.copy(this.car.rotation);
  }
}
