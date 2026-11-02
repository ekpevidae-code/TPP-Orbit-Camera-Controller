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
    this.aimRaycaster = new THREE.Raycaster();
    this.aimRaycaster.far = 90;
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
    this.weapon.position.set(0.34, 1.12, -0.34);
    this.weapon.rotation.set(-0.04, 0, 0);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.54);
    this.weapon.add(this.muzzle);
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc35b })
    );
    this.muzzleFlash.position.copy(this.muzzle.position);
    this.muzzleFlash.visible = false;
    this.weapon.add(this.muzzleFlash);
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
    const input = this.game.inputManager;
    const setRunning = (active) => {
      if (input && input.keys) input.keys.sprint = active;
      if (this.runButton) this.runButton.classList.toggle('running', active);
    };
    if (this.runButton) {
      this.runButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (this.runButton.setPointerCapture && event.pointerId !== undefined) {
          try { this.runButton.setPointerCapture(event.pointerId); } catch (_) {}
        }
        setRunning(true);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => {
        this.runButton.addEventListener(name, () => setRunning(false));
      });
      window.addEventListener('pointerup', () => setRunning(false));
      window.addEventListener('blur', () => setRunning(false));
    }
  }

  getAimTarget(player) {
    const camera = this.game.camera && this.game.camera.cameraInstance;
    if (!camera) return player.position.clone().add(new THREE.Vector3(0, 1.3, -25).applyQuaternion(player.quaternion));
    camera.updateMatrixWorld(true);
    this.aimRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = this.aimRaycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let node = hit.object;
      let ownPlayer = false;
      while (node) { if (node === player) { ownPlayer = true; break; } node = node.parent; }
      if (!ownPlayer && hit.object !== this.muzzleFlash) return hit.point.clone();
    }
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    return this.aimRaycaster.ray.origin.clone().addScaledVector(direction, 65);
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

    // Turn the character toward the point under the screen reticle.
    const target = this.getAimTarget(player);
    const horizontal = target.clone().sub(player.position);
    horizontal.y = 0;
    if (horizontal.lengthSq() > 0.001) {
      player.rotation.y = Math.atan2(-horizontal.x, -horizontal.z);
    }

    player.updateMatrixWorld(true);
    this.weapon.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    this.muzzle.getWorldPosition(origin);
    const direction = target.clone().sub(origin).normalize();
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let end = origin.clone().addScaledVector(direction, 65);
    for (const hit of hits) {
      let node = hit.object;
      let belongsToPlayer = false;
      while (node) { if (node === player) { belongsToPlayer = true; break; } node = node.parent; }
      if (!belongsToPlayer && hit.object !== this.muzzleFlash) { end = hit.point.clone(); break; }
    }

    this.ammo -= 1;
    this.cooldown = 0.32;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(0.7 + Math.random() * 0.8);
    this.flashTime = 0.07;
    const geometry = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const material = new THREE.LineBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.95 });
    const tracer = new THREE.Line(geometry, material);
    this.scene.add(tracer);
    this.tracers.push({ line: tracer, life: 0.09 });
    this.renderHud();
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0, 0.05);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - dt);
      if (this.flashTime === 0 && this.muzzleFlash) this.muzzleFlash.visible = false;
    }
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
