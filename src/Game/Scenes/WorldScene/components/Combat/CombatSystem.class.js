import * as THREE from 'three';
import Game from '../../../../Game.class';

/**
 * Third-person weapon controls.
 * The reticle chooses the target; the shot always starts at the character's muzzle.
 */
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
    this.raycaster.far = 90;
    this.aimRaycaster = new THREE.Raycaster();
    this.aimRaycaster.far = 90;
    this.triggerHeld = false;
    this.aiming = false;
    this.runPointerId = null;
    this.firePointerId = null;
    this.flashTime = 0;
    this.createWeapon();
    this.createHud();
    this.createRunControl();
  }

  getPlayer() {
    return this.game.world && this.game.world.player && this.game.world.player.player;
  }

  createWeapon() {
    const player = this.getPlayer();
    if (!player) return;

    this.weapon = new THREE.Group();
    this.weapon.name = 'Pistol attached to the protagonist right hand';
    const metal = new THREE.MeshStandardMaterial({
      color: 0x20272d, metalness: 0.82, roughness: 0.28,
    });
    const grip = new THREE.MeshStandardMaterial({ color: 0x29211b, roughness: 0.88 });

    // The character faces +Z. The barrel and muzzle therefore point forward (+Z),
    // rather than backwards behind the character.
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.48), metal);
    barrel.position.set(0, 0.045, 0.22);
    this.weapon.add(barrel);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.39), metal);
    slide.position.set(0, 0.115, 0.18);
    this.weapon.add(slide);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.27, 0.16), grip);
    handle.position.set(0, -0.105, -0.015);
    handle.rotation.x = 0.12;
    this.weapon.add(handle);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.05), metal);
    sight.position.set(0, 0.19, 0.18);
    this.weapon.add(sight);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.045, 0.49);
    this.weapon.add(this.muzzle);
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc35b })
    );
    this.muzzleFlash.position.copy(this.muzzle.position);
    this.muzzleFlash.visible = false;
    this.weapon.add(this.muzzleFlash);

    // Attach to the actual right-hand bone, not the character's body root.
    const hand = player.getObjectByName('hand_r');
    this.weaponHand = hand || player;
    this.weaponHand.add(this.weapon);
    if (hand) {
      this.weapon.position.set(0, -0.015, 0.055);
      this.weapon.rotation.set(0, 0, 0);
    } else {
      // Safe fallback while a replacement rig is still loading or being checked.
      this.weapon.position.set(-0.45, 1.02, 0.2);
      this.weapon.rotation.set(0, 0, 0);
    }
    this.weapon.visible = true;
    player.updateMatrixWorld(true);
  }
  createHud() {
    this.fireButton = document.getElementById('fire-btn');
    this.reloadButton = document.getElementById('reload-btn');
    this.ammoHud = document.getElementById('ammo-hud');
    this.reticle = document.getElementById('aim-reticle');

    if (this.fireButton) {
      // Pointer events support touch, mouse and stylus without click-delay issues.
      this.fireButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.firePointerId = event.pointerId;
        try { this.fireButton.setPointerCapture(event.pointerId); } catch (_) {}
        this.triggerHeld = true;
        this.aiming = true;
        this.fire();
        this.fireButton.classList.add('pressed');
      });
      const releaseFire = (event) => {
        if (this.firePointerId !== null && event.pointerId !== this.firePointerId) return;
        this.firePointerId = null;
        this.triggerHeld = false;
        this.aiming = false;
        this.fireButton.classList.remove('pressed');
      };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
        this.fireButton.addEventListener(type, releaseFire);
      });
    }
    if (this.reloadButton) {
      this.reloadButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.reload();
      });
    }
    this.renderHud();
  }

  createRunControl() {
    this.runButton = document.getElementById('run-btn');
    const input = this.game.inputManager;
    const setRunning = (active) => {
      if (input && input.keys) input.keys.sprint = active;
      if (this.runButton) {
        this.runButton.classList.toggle('running', active);
        this.runButton.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    };
    this.setRunning = setRunning;

    if (!this.runButton) return;
    this.runButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.runPointerId = event.pointerId;
      try { this.runButton.setPointerCapture(event.pointerId); } catch (_) {}
      setRunning(true);
    });
    const releaseRun = (event) => {
      // Do not let the joystick's second finger release the RUN button.
      if (this.runPointerId === null || (event.pointerId !== undefined && event.pointerId !== this.runPointerId)) return;
      this.runPointerId = null;
      setRunning(false);
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      this.runButton.addEventListener(type, releaseRun);
    });
    window.addEventListener('blur', () => {
      this.runPointerId = null;
      setRunning(false);
      this.triggerHeld = false;
      this.aiming = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.runPointerId = null;
        setRunning(false);
        this.triggerHeld = false;
        this.aiming = false;
      }
    });
  }

  isPlayerObject(object, player) {
    let node = object;
    while (node) {
      if (node === player) return true;
      node = node.parent;
    }
    return false;
  }

  getAimHit(player) {
    const camera = this.game.camera && this.game.camera.cameraInstance;
    const peopleGroup = this.game.world && this.game.world.pedestrians && this.game.world.pedestrians.group;
    if (!camera || !peopleGroup) return null;
    camera.updateMatrixWorld(true);
    this.aimRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    // Only test the small pedestrian target group. Never raycast the entire streamed city.
    const hits = this.aimRaycaster.intersectObjects(peopleGroup.children, true);
    return hits[0] || null;
  }

  getAimTarget(player) {
    const hit = this.getAimHit(player);
    if (hit) return hit.point.clone();
    const camera = this.game.camera.cameraInstance;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    return camera.position.clone().addScaledVector(direction, 55);
  }

  renderHud() {
    if (this.ammoHud) {
      this.ammoHud.textContent = 'PISTOL  ' + this.ammo + ' / ' + this.reserveAmmo +
        (this.reloadTime > 0 ? '  RELOADING' : '');
    }
  }

  reload() {
    if (this.reloadTime > 0 || this.ammo >= this.magazineSize || this.reserveAmmo <= 0) return;
    this.reloadTime = 1.15;
    this.renderHud();
  }

  aimCharacterAtTarget(player, target) {
    const horizontal = target.clone().sub(player.position);
    horizontal.y = 0;
    if (horizontal.lengthSq() > 0.001) {
      // The replacement human rig's forward direction is +Z.
      const desiredYaw = Math.atan2(horizontal.x, horizontal.z);
      player.rotation.y = desiredYaw;
    }
    // Keep the weapon aligned with the character's forward direction.
    player.updateMatrixWorld(true);
    if (this.weapon) this.weapon.updateMatrixWorld(true);
  }

  fire() {
    const world = this.game.world;
    const player = this.getPlayer();
    if (!player || !player.visible || (world.vehicle && world.vehicle.isDriving) ||
        this.reloadTime > 0 || this.cooldown > 0) return;
    if (this.ammo <= 0) { this.reload(); return; }

    const target = this.getAimTarget(player);
    this.aimCharacterAtTarget(player, target);
    const origin = new THREE.Vector3();
    this.muzzle.getWorldPosition(origin);
    const direction = target.clone().sub(origin).normalize();
    this.raycaster.set(origin, direction);

    // The target scan is deliberately limited to pedestrians to avoid expensive city-wide raycasts.
    const peopleGroup = world.pedestrians && world.pedestrians.group;
    const hits = peopleGroup ? this.raycaster.intersectObjects(peopleGroup.children, true) : [];
    const hit = hits[0] || null;
    const end = hit ? hit.point.clone() : target.clone();

    this.ammo -= 1;
    this.cooldown = 0.34;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(0.75 + Math.random() * 0.65);
    this.flashTime = 0.075;

    const geometry = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const material = new THREE.LineBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.95 });
    const tracer = new THREE.Line(geometry, material);
    this.scene.add(tracer);
    this.tracers.push({ line: tracer, life: 0.085 });

    if (hit && world.pedestrians && typeof world.pedestrians.damagePerson === 'function') {
      let node = hit.object;
      while (node && !node.userData.isPedestrianRoot) node = node.parent;
      if (node) {
        world.pedestrians.damagePerson(node, 34);
        if (world.police && typeof world.police.commitCrime === 'function') world.police.commitCrime();
      }
    }
    this.renderHud();
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0, 0.05);
    const player = this.getPlayer();
    if (this.aiming && player && this.game.world && this.game.world.player) {
      const aimTarget = this.getAimTarget(player);
      this.aimCharacterAtTarget(player, aimTarget);
      if (typeof this.game.world.player.applyWeaponAim === 'function') {
        this.game.world.player.applyWeaponAim(aimTarget);
      }
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.triggerHeld && this.cooldown <= 0 && this.reloadTime <= 0) this.fire();

    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - dt);
      if (this.flashTime === 0 && this.muzzleFlash) this.muzzleFlash.visible = false;
    }
    if (this.reloadTime > 0) {
      this.reloadTime = Math.max(0, this.reloadTime - dt);
      if (this.reloadTime === 0) {
        const loaded = Math.min(this.magazineSize - this.ammo, this.reserveAmmo);
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
    if (driving && this.setRunning) this.setRunning(false);
  }
}
