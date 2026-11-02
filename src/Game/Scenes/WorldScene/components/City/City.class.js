import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * Streamed procedural city. Only nearby 180m districts remain active,
 * so the city can keep expanding as the player travels.
 */
export default class City {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.chunkSize = 180;
    this.viewRadius = 1;
    this.chunks = new Map();
    this.currentChunkX = NaN;
    this.currentChunkZ = NaN;

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x65765a, roughness: 1 }),
      road: new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.95 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0xaaa99f, roughness: 1 }),
      line: new THREE.MeshStandardMaterial({ color: 0xe8dfbd, roughness: 1 }),
      concrete: [
        new THREE.MeshStandardMaterial({ color: 0xaaa69c, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0x858b8d, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0xb8ad9b, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.92 }),
      ],
      glass: new THREE.MeshStandardMaterial({ color: 0x263f4a, roughness: 0.28, metalness: 0.18 }),
      shopGlass: new THREE.MeshStandardMaterial({ color: 0x41616a, roughness: 0.2, metalness: 0.12 }),
      sign: new THREE.MeshStandardMaterial({ color: 0xb58b4e, roughness: 0.7 }),
      treeTrunk: new THREE.MeshStandardMaterial({ color: 0x594331, roughness: 1 }),
      leaves: new THREE.MeshStandardMaterial({ color: 0x405d3c, roughness: 1 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0x30383b, metalness: 0.55, roughness: 0.5 }),
    };
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.cylinderGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1, 7);
    this.sphereGeometry = new THREE.SphereGeometry(1, 7, 6);
    this.update();
  }

  addBox(group, x, y, z, sx, sy, sz, material, shadow = false) {
    const mesh = new THREE.Mesh(this.boxGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  createBuilding(group, x, z, index, seed) {
    const width = 15 + ((index * 7 + seed) % 7);
    const depth = 15 + ((index * 5 + seed * 3) % 7);
    const height = 9 + ((index * 11 + seed * 7) % 25);
    const baseY = 0.12;
    const material = this.materials.concrete[(index + seed) % this.materials.concrete.length];
    this.addBox(group, x, baseY + height / 2, z, width, height, depth, material, true);
    this.addBox(group, x, baseY + height + 0.12, z, width + 0.3, 0.24, depth + 0.3, material, true);

    const floors = Math.max(2, Math.floor(height / 3.2));
    for (let floor = 0; floor < floors; floor++) {
      const y = baseY + 1.8 + floor * 3.05;
      for (const col of [-1, 0, 1]) {
        const wx = x + col * width * 0.27;
        this.addBox(group, wx, y, z + depth / 2 + 0.015, 1.25, 1.25, 0.04, this.materials.glass);
      }
    }
    if ((index + seed) % 3 !== 1) {
      this.addBox(group, x, 1.15, z + depth / 2 + 0.05, width * 0.7, 1.65, 0.07, this.materials.shopGlass);
      this.addBox(group, x, 2.25, z + depth / 2 + 0.1, width * 0.82, 0.38, 0.18, this.materials.sign);
    }
  }

  createChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (this.chunks.has(key)) return;
    const group = new THREE.Group();
    group.name = 'City District ' + key;
    group.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
    this.scene.add(group);
    const seed = Math.abs((cx * 73856093) ^ (cz * 19349663)) % 997;

    this.addBox(group, 0, -0.12, 0, 180, 0.2, 180, this.materials.grass);

    // A connected 60-metre street grid. Neighbouring chunks share the same grid.
    for (const p of [-60, 0, 60]) {
      this.addBox(group, p, 0.015, 0, 10, 0.035, 180, this.materials.road);
      this.addBox(group, 0, 0.015, p, 180, 0.035, 10, this.materials.road);
      for (const side of [-1, 1]) {
        this.addBox(group, p + side * 6.3, 0.07, 0, 2.5, 0.14, 180, this.materials.sidewalk);
        this.addBox(group, 0, 0.07, p + side * 6.3, 180, 0.14, 2.5, this.materials.sidewalk);
      }
      for (let mark = -84; mark <= 84; mark += 12) {
        this.addBox(group, p, 0.04, mark, 0.12, 0.01, 4.2, this.materials.line);
        this.addBox(group, mark, 0.04, p, 4.2, 0.01, 0.12, this.materials.line);
      }
    }

    // Buildings fill four safe blocks in each district, away from the roads.
    let index = 0;
    for (const x of [-30, 30]) {
      for (const z of [-30, 30]) {
        this.createBuilding(group, x, z, index++, seed);
      }
    }

    // Small trees mark selected sidewalks.
    for (const p of [-78, -18, 42, 78]) {
      const trunk = new THREE.Mesh(this.cylinderGeometry, this.materials.treeTrunk);
      trunk.position.set(-9.2, 1.0, p);
      trunk.scale.setScalar(0.85);
      group.add(trunk);
      const crown = new THREE.Mesh(this.sphereGeometry, this.materials.leaves);
      crown.position.set(-9.2, 2.15, p);
      crown.scale.set(0.9, 1.1, 0.9);
      group.add(crown);
    }
    this.chunks.set(key, group);
  }

  update() {
    const world = this.game.world;
    const vehicle = world && world.vehicle;
    const player = world && world.player && world.player.player;
    const focus = vehicle && vehicle.isDriving ? vehicle.car.position : player ? player.position : new THREE.Vector3();
    const cx = Math.floor(focus.x / this.chunkSize);
    const cz = Math.floor(focus.z / this.chunkSize);
    if (cx === this.currentChunkX && cz === this.currentChunkZ) return;
    this.currentChunkX = cx;
    this.currentChunkZ = cz;

    for (let x = cx - this.viewRadius; x <= cx + this.viewRadius; x++) {
      for (let z = cz - this.viewRadius; z <= cz + this.viewRadius; z++) {
        this.createChunk(x, z);
      }
    }

    for (const [key, group] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - cx) > this.viewRadius || Math.abs(z - cz) > this.viewRadius) {
        this.scene.remove(group);
        this.chunks.delete(key);
      }
    }
  }
}
