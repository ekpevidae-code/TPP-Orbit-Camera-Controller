import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * Lightweight procedural starter city.
 * Shared geometries/materials keep draw calls and memory reasonable on mobile.
 */
export default class City {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.group = new THREE.Group();
    this.group.name = 'Starter City';
    this.scene.add(this.group);

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x65765a, roughness: 1 }),
      road: new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.95 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0xaaa99f, roughness: 1 }),
      curb: new THREE.MeshStandardMaterial({ color: 0x777a78, roughness: 1 }),
      line: new THREE.MeshStandardMaterial({ color: 0xe8dfbd, roughness: 1 }),
      concrete: [
        new THREE.MeshStandardMaterial({ color: 0xaaa69c, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0x858b8d, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0xb8ad9b, roughness: 0.92 }),
        new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.92 }),
      ],
      glass: new THREE.MeshStandardMaterial({
        color: 0x263f4a, roughness: 0.28, metalness: 0.18,
        emissive: 0x101d24, emissiveIntensity: 0.25
      }),
      shopGlass: new THREE.MeshStandardMaterial({
        color: 0x41616a, roughness: 0.2, metalness: 0.12
      }),
      sign: new THREE.MeshStandardMaterial({ color: 0xb58b4e, roughness: 0.7 }),
      treeTrunk: new THREE.MeshStandardMaterial({ color: 0x594331, roughness: 1 }),
      leaves: new THREE.MeshStandardMaterial({ color: 0x405d3c, roughness: 1 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0x30383b, metalness: 0.55, roughness: 0.5 }),
    };

    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.cylinder = new THREE.CylinderGeometry(0.12, 0.16, 1, 7);
    this.sphere = new THREE.SphereGeometry(1, 7, 6);

    this.createGround();
    this.createRoadNetwork();
    this.createBlocks();
    this.createStreetFurniture();
  }

  addBox(x, y, z, sx, sy, sz, material, castShadow = false) {
    const mesh = new THREE.Mesh(this.box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  createGround() {
    this.addBox(0, -0.12, 0, 190, 0.2, 190, this.materials.grass);
  }

  createRoadNetwork() {
    const roadWidth = 12;
    // Two main roads meet at the player spawn point.
    this.addBox(0, 0.015, 0, roadWidth, 0.035, 180, this.materials.road);
    this.addBox(0, 0.018, 0, 180, 0.04, roadWidth, this.materials.road);

    // Sidewalk strips alongside the main north/south road.
    [-1, 1].forEach((side) => {
      const x = side * (roadWidth / 2 + 1.4);
      this.addBox(x, 0.07, 0, 2.8, 0.14, 180, this.materials.sidewalk);
      this.addBox(side * (roadWidth / 2 + 2.85), 0.13, 0, 0.18, 0.22, 180, this.materials.curb);
    });

    // Sidewalk strips alongside the cross street.
    [-1, 1].forEach((side) => {
      const z = side * (roadWidth / 2 + 1.4);
      this.addBox(0, 0.07, z, 180, 0.14, 2.8, this.materials.sidewalk);
      this.addBox(0, 0.13, side * (roadWidth / 2 + 2.85), 180, 0.22, 0.18, this.materials.curb);
    });

    // Broken center markings.
    for (let p = -84; p <= 84; p += 9) {
      this.addBox(0, 0.045, p, 0.16, 0.012, 4.2, this.materials.line);
      this.addBox(p, 0.048, 0, 4.2, 0.012, 0.16, this.materials.line);
    }

    // A few smaller connecting streets in the visible starter district.
    [-48, 48].forEach((p) => {
      this.addBox(p, 0.012, 0, 8, 0.03, 180, this.materials.road);
      this.addBox(0, 0.012, p, 180, 0.03, 8, this.materials.road);
      for (let n = -84; n <= 84; n += 12) {
        this.addBox(p, 0.04, n, 0.12, 0.01, 4, this.materials.line);
        this.addBox(n, 0.04, p, 4, 0.01, 0.12, this.materials.line);
      }
    });
  }

  createBuilding(x, z, width, depth, height, index) {
    const material = this.materials.concrete[index % this.materials.concrete.length];
    const baseY = 0.16;
    this.addBox(x, baseY + height / 2, z, width, height, depth, material, true);

    // Flat roof lip and a small rooftop service room.
    this.addBox(x, baseY + height + 0.12, z, width + 0.35, 0.24, depth + 0.35, material, true);
    if (height > 9) {
      this.addBox(x + width * 0.18, baseY + height + 0.85, z, width * 0.32, 1.3, depth * 0.3, this.materials.curb);
    }

    const floors = Math.max(1, Math.floor(height / 3.1));
    const columns = Math.max(2, Math.floor(width / 2.3));
    const windowW = Math.min(1.05, width / (columns + 1) * 0.48);
    const windowH = 1.15;

    // Windows on the two street-facing facades.
    for (let floor = 0; floor < floors; floor++) {
      for (let col = 0; col < columns; col++) {
        const wx = x - width / 2 + ((col + 1) * width) / (columns + 1);
        const wy = baseY + 1.65 + floor * 3.05;
        this.addBox(wx, wy, z + depth / 2 + 0.012, windowW, windowH, 0.035, this.materials.glass);
        this.addBox(x + width / 2 + 0.012, wy, z - depth / 2 + ((col + 1) * depth) / (columns + 1), 0.035, windowH, Math.min(1.0, depth / (columns + 1) * 0.48), this.materials.glass);
      }
    }

    // Ground-floor shopfront with a canopy/sign on selected buildings.
    if (index % 3 !== 1) {
      this.addBox(x, baseY + 1.25, z + depth / 2 + 0.045, width * 0.68, 1.8, 0.06, this.materials.shopGlass);
      this.addBox(x, baseY + 2.45, z + depth / 2 + 0.1, width * 0.82, 0.42, 0.2, this.materials.sign);
    }
  }

  createBlocks() {
    const lots = [
      [-23, -23], [23, -23], [-23, 23], [23, 23],
      [-68, -23], [68, -23], [-68, 23], [68, 23],
      [-23, -68], [23, -68], [-23, 68], [23, 68],
      [-68, -68], [68, -68], [-68, 68], [68, 68],
    ];

    lots.forEach(([x, z], index) => {
      const width = 10 + ((index * 7) % 5);
      const depth = 10 + ((index * 3) % 5);
      const height = 8 + ((index * 5) % 15);
      this.createBuilding(x, z, width, depth, height, index);
    });
  }

  createTree(x, z, scale = 1) {
    const trunk = new THREE.Mesh(this.cylinder, this.materials.treeTrunk);
    trunk.position.set(x, 1.1 * scale, z);
    trunk.scale.setScalar(scale);
    trunk.castShadow = true;
    this.group.add(trunk);

    const crown = new THREE.Mesh(this.sphere, this.materials.leaves);
    crown.position.set(x, 2.35 * scale, z);
    crown.scale.set(1.05 * scale, 1.25 * scale, 1.05 * scale);
    crown.castShadow = true;
    this.group.add(crown);
  }

  createStreetFurniture() {
    // Trees and street lamps follow the sidewalks without blocking the road.
    for (let p = -78; p <= 78; p += 26) {
      if (Math.abs(p) < 18) continue;
      [-1, 1].forEach((side) => {
        this.createTree(side * 9.4, p, 0.8);
        this.createTree(p, side * 9.4, 0.8);

        const lampX = side * 9.8;
        const pole = new THREE.Mesh(this.cylinder, this.materials.lamp);
        pole.position.set(lampX, 2.1, p + 7);
        pole.scale.set(0.45, 4.2, 0.45);
        this.group.add(pole);
        this.addBox(lampX + side * 0.7, 4.15, p + 7, 1.5, 0.16, 0.35, this.materials.lamp);
      });
    }
  }
}
