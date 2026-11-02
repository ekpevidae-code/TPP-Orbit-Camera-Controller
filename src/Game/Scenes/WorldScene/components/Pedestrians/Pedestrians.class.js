import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * Lightweight sidewalk pedestrians with simple procedural walking animation.
 * Kept deliberately low-poly so the starter city remains mobile-friendly.
 */
export default class Pedestrians {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.group = new THREE.Group();
    this.group.name = 'City Pedestrians';
    this.scene.add(this.group);

    this.shared = {
      skin: new THREE.MeshStandardMaterial({ color: 0x9b684b, roughness: 0.9 }),
      darkSkin: new THREE.MeshStandardMaterial({ color: 0x674331, roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x252b32, roughness: 0.95 }),
      shoes: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9 }),
      shirts: [
        new THREE.MeshStandardMaterial({ color: 0x315c72, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: 0x8b4938, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: 0x65734b, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: 0xaaa18d, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: 0x493f62, roughness: 0.9 }),
      ],
    };

    this.bodyGeometry = new THREE.BoxGeometry(0.48, 0.72, 0.27);
    this.headGeometry = new THREE.SphereGeometry(0.19, 10, 8);
    this.limbGeometry = new THREE.CylinderGeometry(0.075, 0.085, 0.72, 7);
    this.armGeometry = new THREE.CylinderGeometry(0.055, 0.065, 0.62, 7);
    this.shoeGeometry = new THREE.BoxGeometry(0.16, 0.11, 0.27);

    this.people = [];
    const routes = [
      { axis: 'z', fixed: 7.35, start: -38, end: 38, speed: 1.05 },
      { axis: 'z', fixed: -7.35, start: -34, end: 34, speed: -0.9 },
      { axis: 'z', fixed: 7.85, start: -22, end: 48, speed: -0.82 },
      { axis: 'z', fixed: -7.85, start: -48, end: 22, speed: 0.95 },
      { axis: 'x', fixed: 7.35, start: -38, end: 38, speed: -0.88 },
      { axis: 'x', fixed: -7.35, start: -34, end: 34, speed: 1.0 },
      { axis: 'x', fixed: 7.85, start: -22, end: 48, speed: 0.78 },
      { axis: 'x', fixed: -7.85, start: -48, end: 22, speed: -0.92 },
    ];

    routes.forEach((route, index) => this.createPerson(route, index));
  }

  createPerson(route, index) {
    const root = new THREE.Group();
    const skin = index % 3 === 0 ? this.shared.darkSkin : this.shared.skin;
    const shirt = this.shared.shirts[index % this.shared.shirts.length];

    const torso = new THREE.Mesh(this.bodyGeometry, shirt);
    torso.position.y = 1.18;
    torso.castShadow = true;
    root.add(torso);

    const head = new THREE.Mesh(this.headGeometry, skin);
    head.position.set(0, 1.72, 0.015);
    head.castShadow = true;
    root.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.195, 8, 6),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0x171514 : 0x30231d, roughness: 1 })
    );
    hair.position.set(0, 1.81, -0.025);
    hair.scale.set(1, 0.55, 1);
    root.add(hair);

    const legs = [];
    const arms = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.82, 0);
      const legMesh = new THREE.Mesh(this.limbGeometry, this.shared.pants);
      legMesh.position.y = -0.34;
      legMesh.castShadow = true;
      leg.add(legMesh);
      const shoe = new THREE.Mesh(this.shoeGeometry, this.shared.shoes);
      shoe.position.set(0, -0.68, 0.07);
      leg.add(shoe);
      root.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.29, 1.43, 0);
      const armMesh = new THREE.Mesh(this.armGeometry, skin);
      armMesh.position.y = -0.29;
      armMesh.castShadow = true;
      arm.add(armMesh);
      root.add(arm);
      arms.push(arm);
    });

    this.group.add(root);
    const position = route.start + (route.end - route.start) * ((index % 4) / 4);
    if (route.axis === 'z') root.position.set(route.fixed, 0.08, position);
    else root.position.set(position, 0.08, route.fixed);

    this.people.push({
      root, route, position, legs, arms,
      phase: index * 1.7,
      direction: Math.sign(route.speed),
    });
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0.016, 0.05);
    this.people.forEach((person) => {
      const { route } = person;
      person.position += route.speed * dt;

      if (person.position > route.end) person.position = route.start;
      if (person.position < route.start) person.position = route.end;

      if (route.axis === 'z') {
        person.root.position.z = person.position;
        person.root.position.x = route.fixed;
        person.root.rotation.y = route.speed > 0 ? 0 : Math.PI;
      } else {
        person.root.position.x = person.position;
        person.root.position.z = route.fixed;
        person.root.rotation.y = route.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      person.phase += dt * 7.5;
      const swing = Math.sin(person.phase) * 0.48;
      person.legs[0].rotation.x = swing;
      person.legs[1].rotation.x = -swing;
      person.arms[0].rotation.x = -swing * 0.72;
      person.arms[1].rotation.x = swing * 0.72;
    });
  }
}
