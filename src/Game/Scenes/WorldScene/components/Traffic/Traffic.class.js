import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * Simple ambient traffic for the starter district.
 * Cars follow the marked main roads and wrap around the district.
 */
export default class Traffic {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.cars = [];
    this.bodyGeometry = new THREE.BoxGeometry(1.85, 0.62, 3.7);
    this.cabinGeometry = new THREE.BoxGeometry(1.5, 0.7, 1.8);
    this.glassGeometry = new THREE.BoxGeometry(1.38, 0.48, 1.62);
    this.wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
    this.wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1c, roughness: 0.9 });
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x253c48, roughness: 0.2, metalness: 0.2 });

    this.addCar(-2.2, -72, 1, 0x9b3730, 6.2, Math.PI);
    this.addCar(2.2, 72, -1, 0xc3c6c5, 7.1, 0);
    this.addCar(-72, 2.2, 1, 0x315b83, 5.7, -Math.PI / 2);
    this.addCar(72, -2.2, -1, 0xb18a42, 6.5, Math.PI / 2);
  }

  addCar(x, z, direction, color, speed, rotation) {
    const car = new THREE.Group();
    car.position.set(x, 0, z);
    car.rotation.y = rotation;

    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.25 });
    const body = new THREE.Mesh(this.bodyGeometry, paint);
    body.position.y = 0.58;
    body.castShadow = true;
    car.add(body);

    const cabin = new THREE.Mesh(this.cabinGeometry, paint);
    cabin.position.set(0, 1.12, -0.15);
    cabin.castShadow = true;
    car.add(cabin);

    const glass = new THREE.Mesh(this.glassGeometry, this.glassMaterial);
    glass.position.set(0, 1.16, -0.15);
    car.add(glass);

    for (const wx of [-0.94, 0.94]) {
      for (const wz of [-1.15, 1.15]) {
        const wheel = new THREE.Mesh(this.wheelGeometry, this.wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.37, wz);
        car.add(wheel);
      }
    }

    this.scene.add(car);
    this.cars.push({ car, direction, speed, axis: Math.abs(rotation) === Math.PI / 2 ? 'x' : 'z' });
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0, 0.05);
    this.cars.forEach(({ car, direction, speed, axis }) => {
      if (axis === 'z') {
        car.position.z += direction * speed * dt;
        if (car.position.z > 88) car.position.z = -88;
        if (car.position.z < -88) car.position.z = 88;
      } else {
        car.position.x += direction * speed * dt;
        if (car.position.x > 88) car.position.x = -88;
        if (car.position.x < -88) car.position.x = 88;
      }
    });
  }
}
