import * as THREE from 'three';
import Game from '../../../../Game.class';

/** First-person-feeling third-person pistol prototype with mobile fire/reload controls. */
export default class CombatSystem {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.magazineSize = 12;
    this.ammo = 12;
    this.reserveAmmo = 60;
    this.cooldown = 0;
    this.reloadTime = 0;
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 65;
    this.createWeapon();
    this.createHud();
    this.createRunControl();
  }

  createWeapon() {
    const player = this.game.world && this.game.world.player && this.game.world.player.player;
    if (!player) return;
    this.weapon = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x242a30, metalness: 0.82, roughness: 0.28 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x29211b, roughness: 0.92 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.62), metal);
    barrel.position.set(0, 0.02, -0.2);
    this.weapon.add(barrel);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.43), metal);
    slide.position.set(0, 0.12, -0.16);
    this.weapon.add(slide);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.18), grip);
    handle.position.set(0, -0.12, 0.04);
    handle.rotation.x = -0.18;
    this.weapon.add(handle);
    this.weapon.position.set(0.34, 1.02, -0.35);
    this.weapon.rotation.x = -0.08;
    player.add(this.weapon);
  }

  createHud() {
    this.fireButton = document.getElementById('fire-btn');
    this.reloadButton = document.getElementById('reload-btn');
    this.ammoHud = document.getElementById('ammo-hud');
    if (this.fireButton) this.fireButton.addEventListener('click', () => this.fire());
    if (this.reloadButton) this.reloadButton.addEventListener('click', () => this.reload());
    this.renderHud();
  }

  createRunControl() {
    this.runButton = document.getElementById('run-btn');
    const input = this.game.world && this.game.world.player && this.game.world.player.inputManager;
    const setRunning = (active) => { if (input && input.Actions) input.Actions.sprint = active; };
    if (this.runButton) {
      this.runButton.addEventListener('pointerdown', (event) => { event.preventDefault(); setRunning(true); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => this.runButton.addEventListener(eventName, () => setRunning(false)));
    }
  }

  renderHud() {
    if (this.ammoHud) this.ammoHud.textContent = 'PISTOL  ' + this.ammo + ' / ' + this.reserveAmmo + (this.reloadTime > 0 ? '  RELOADING' : '');
  }

  reload() {
    if (this.reloadTime > 0 || this.ammo >= this.magazineSize || this.reserveAmmo <= 0) return;
    this.reloadTime = 1.15;
    this.renderHud();
  }

  fire() {
    const world = this.game.world;
    const player = world && world.player && world.player.player;
    if (!player || !player.visible || (world.vehicle && world.vehicle.isDriving) || this.reloadTime > 0 || this.cooldown > 0) return;
    if (this.ammo <= 0) { this.reload(); return; }
    this.ammo -= 1;
    this.cooldown = 0.28;
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.28, 0));
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion).normalize();
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let end = origin.clone().add(direction.clone().multiplyScalar(65));
    for (const hit of hits) {
      let node = hit.object;
      let belongsToPlayer = false;
      while (node) { if (node === player) { belongsToPlayer = true; break; } node = node.parent; }
      if (!belongsToPlayer) { end = hit.point.clone(); break; }
    }
    const points = [origin.clone(), end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.95 });
    const tracer = new THREE.Line(geometry, material);
    this.scene.add(tracer);
    this.tracers.push({ line: tracer, life: 0.075 });
    this.renderHud();
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0, 0.05);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadTime > 0) {
      this.reloadTime = Math.max(0, this.reloadTime - dt);
      if (this.reloadTime === 0) {
        const needed = this.magazineSize - this.ammo;
        const loaded = Math.min(needed, this.reserveAmmo);
        this.ammo += loaded;
        this.reserveAmmo -= loaded;
      }
      this.renderHud();
    }
    this.tracers = this.tracers.filter((item) => {
      item.life -= dt;
      if (item.life <= 0) {
        this.scene.remove(item.line);
        item.line.geometry.dispose();
        item.line.material.dispose();
        return false;
      }
      return true;
    });
    const driving = this.game.world && this.game.world.vehicle && this.game.world.vehicle.isDriving;
    if (this.fireButton) this.fireButton.style.display = driving ? 'none' : 'block';
    if (this.reloadButton) this.reloadButton.style.display = driving ? 'none' : 'block';
    if (this.ammoHud) this.ammoHud.style.display = driving ? 'none' : 'block';
    if (this.runButton) this.runButton.style.display = driving ? 'none' : 'block';
  }
}
