import * as THREE from 'three';
import Game from '../Game.class';

export default class Player {
  constructor() {
    /**
     * Game references
     */
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.inputManager = this.game.inputManager;
    this.resources = this.game.resources;
    this.time = this.game.time;
    this.modelResource = this.resources.items.playerModel;

    /**
     * Player configurations
     */
    this.speed = 1.5;
    this.sprintMultiplier = 2;
    this.rotationSpeed = 1.5;
    this.velocity = new THREE.Vector3();
    this.currentState = 'idle';
    this.isJumping = false;

    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);

    this.setModelInstance();
    this.setAnimation();

    this.debug = this.game.debug;
    this.isDebugMode = this.game.isDebugMode;
    if (this.isDebugMode) {
      this.initGUI();
    }
  }

  setModelInstance() {
    this.player = this.modelResource.scene;
    this.player.position.set(0, 0, 0);
    this.player.scale.setScalar(1);
    this.outfitMixers = [];
    this.outfitActions = [];

    // The body, hair and garments are separate GLBs but share the same
    // 53-bone MakeHuman game rig. Keep their own skin skeletons and drive
    // each outfit with the same named locomotion clips.
    ['playerHair', 'playerShirt', 'playerJeans', 'playerShoes'].forEach((assetId) => {
      const resource = this.resources.items[assetId];
      if (!resource || !resource.scene) return;
      const part = resource.scene;
      part.name = assetId;
      part.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.roughness = Math.max(child.material.roughness || 0.7, 0.55);
          }
        }
      });
      this.player.add(part);
      this.outfitMixers.push(new THREE.AnimationMixer(part));
      this.outfitActions.push({});
    });

    // Preserve the source PBR materials, normal maps and skin textures.
    this.player.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.roughness = Math.max(child.material.roughness || 0.7, 0.55);
        }
      }
    });

    this.weaponBones = {};
    ['upperarm_r', 'lowerarm_r', 'hand_r', 'upperarm_l', 'lowerarm_l', 'hand_l'].forEach((name) => {
      this.weaponBones[name] = this.player.getObjectByName(name);
    });

    this.scene.add(this.player);
  }

  setAnimation() {
    this.animation = {};
    this.animation.mixer = new THREE.AnimationMixer(this.player);
    this.animation.actions = {};

    const clipsByName = new Map(
      (this.modelResource.animations || []).map((clip) => [clip.name.toLowerCase(), clip])
    );
    const animationMap = {
      idle: 'idle',
      jump_in_place: 'jump',
      jumping_while_move_backward: 'jump',
      jumping_while_move_forward: 'jump',
      run_backward: 'walk_back',
      run_forward: 'run',
      walk_backward: 'walk_back',
      walk_forward: 'walk',
    };

    Object.entries(animationMap).forEach(([key, clipName]) => {
      const clip = clipsByName.get(clipName);
      if (!clip) return;
      this.animation.actions[key] = this.animation.mixer.clipAction(clip);
      if (key.includes('jump')) {
        this.animation.actions[key].setLoop(THREE.LoopOnce);
        this.animation.actions[key].clampWhenFinished = true;
      } else {
        this.animation.actions[key].setLoop(THREE.LoopRepeat);
      }
    });

    // Bind the same clip tracks to the matching bones in the clothing and hair rigs.
    this.outfitMixers.forEach((mixer, index) => {
      Object.entries(animationMap).forEach(([key, clipName]) => {
        const clip = clipsByName.get(clipName);
        if (clip) this.outfitActions[index][key] = mixer.clipAction(clip);
      });
    });

    this.animation.mixer.addEventListener('finished', (e) => {
      if (e.action.getClip().name.includes('jump')) {
        this.isJumping = false;
        this.inputManager.consumeJump();
      }
    });

    if (this.animation.actions.idle) {
      this.animation.actions.idle.play();
      this.outfitActions.forEach((actions) => {
        if (actions.idle) actions.idle.play();
      });
    }
  }

  changeAnimation(newState) {
    if (this.currentState === newState) return;

    const oldAction = this.animation.actions[this.currentState];
    const newAction = this.animation.actions[newState];

    if (!newAction) return;

    if (oldAction) {
      oldAction.fadeOut(0.2);
    }

    newAction.reset().fadeIn(0.2).play();
    this.outfitActions.forEach((actions) => {
      const next = actions[newState];
      if (next) {
        Object.values(actions).forEach((action) => {
          if (action.isRunning()) action.fadeOut(0.2);
        });
        next.reset().fadeIn(0.2).play();
      }
    });
    this.currentState = newState;
  }

  determineAnimationState(actions) {
    if (this.isJumping) {
      if (actions.forward) {
        return 'jumping_while_move_forward';
      } else if (actions.backward) {
        return 'jumping_while_move_backward';
      } else {
        return 'jump_in_place';
      }
    }

    if (actions.forward) {
      return actions.sprint ? 'run_forward' : 'walk_forward';
    }

    if (actions.backward) {
      return actions.sprint ? 'run_backward' : 'walk_backward';
    }

    if (actions.left || actions.right) {
      if (
        this.currentState.includes('walk') ||
        this.currentState.includes('run')
      ) {
        return this.currentState;
      }
      return 'idle';
    }

    return 'idle';
  }

  playJumpAnimation(actions) {
    if (!this.isJumping) {
      this.isJumping = true;

      const currentAction = this.animation.actions[this.currentState];
      if (currentAction) {
        currentAction.fadeOut(0.1);
      }

      let jumpState = 'jump_in_place';
      if (actions.forward) {
        jumpState = 'jumping_while_move_forward';
      } else if (actions.backward) {
        jumpState = 'jumping_while_move_backward';
      }

      if (this.animation.actions[jumpState]) {
        this.animation.actions[jumpState].reset().fadeIn(0.1).play();
        this.currentState = jumpState;
      }
    }
  }

  updateCharacterMovement(actions) {
    this.velocity.set(0, 0, 0);

    const currentSpeed = actions.sprint
      ? this.speed * this.sprintMultiplier
      : this.speed;

    if (actions.forward) {
      this.velocity.z += currentSpeed * this.time.delta;
    }
    if (actions.backward) {
      this.velocity.z -= currentSpeed * this.time.delta;
    }

    let angle = 0;
    if (actions.left && (actions.forward || actions.backward)) {
      angle = this.rotationSpeed * this.time.delta;
      this.velocity.x -= currentSpeed * this.time.delta;
    }
    if (actions.right && (actions.forward || actions.backward)) {
      angle = -this.rotationSpeed * this.time.delta;
      this.velocity.x += currentSpeed * this.time.delta;
    }

    if (actions.jump && !this.isJumping) {
      this.playJumpAnimation(actions);
    }

    const newState = this.determineAnimationState(actions);
    this.changeAnimation(newState);

    this.velocity.applyQuaternion(this.player.quaternion);
    const previousPosition = this.player.position.clone();
    this.player.position.add(this.velocity);
    this.player.rotateY(angle);

    const world = this.game.world;
    let blocked = false;
    if (world && world.vehicle && world.vehicle.car && !world.vehicle.isDriving) {
      if (this.player.position.distanceTo(world.vehicle.car.position) < 2.0) blocked = true;
    }
    if (!blocked && world && world.pedestrians) {
      for (const person of world.pedestrians.people) {
        if (this.player.position.distanceTo(person.root.position) < 0.82) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) this.player.position.copy(previousPosition);
  }

  orientArmBone(bone, childBone, targetWorld) {
    if (!bone || !childBone || !bone.parent) return;
    bone.updateMatrixWorld(true);
    childBone.updateMatrixWorld(true);
    const childWorld = new THREE.Vector3();
    const boneWorld = new THREE.Vector3();
    childBone.getWorldPosition(childWorld);
    bone.getWorldPosition(boneWorld);

    const currentAxisLocal = bone.worldToLocal(childWorld.clone()).normalize();
    const currentAxisParent = currentAxisLocal.applyQuaternion(bone.quaternion).normalize();
    const targetParent = bone.parent.worldToLocal(targetWorld.clone());
    const boneParent = bone.position.clone();
    const desiredAxisParent = targetParent.sub(boneParent).normalize();
    if (desiredAxisParent.lengthSq() < 0.001) return;

    const correction = new THREE.Quaternion().setFromUnitVectors(
      currentAxisParent,
      desiredAxisParent
    );
    bone.quaternion.premultiply(correction);
    bone.updateMatrixWorld(true);
  }

  applyWeaponAim(targetWorld) {
    if (!targetWorld || !this.weaponBones) return;
    const b = this.weaponBones;
    const playerPosition = this.player.position;
    const aimDirection = targetWorld.clone().sub(playerPosition);
    aimDirection.y = 0;
    if (aimDirection.lengthSq() < 0.001) return;
    aimDirection.normalize();

    const rightShoulder = new THREE.Vector3();
    if (b.upperarm_r) b.upperarm_r.getWorldPosition(rightShoulder);
    const rightUpperTarget = rightShoulder.clone()
      .addScaledVector(aimDirection, 0.42)
      .add(new THREE.Vector3(0, -0.08, 0));
    const rightElbowTarget = rightUpperTarget.clone()
      .addScaledVector(aimDirection, 0.32)
      .add(new THREE.Vector3(0, -0.06, 0));
    this.orientArmBone(b.upperarm_r, b.lowerarm_r, rightUpperTarget);
    this.orientArmBone(b.lowerarm_r, b.hand_r, rightElbowTarget);

    // Bring the left forearm across to support the pistol grip.
    const rightHand = new THREE.Vector3();
    if (b.hand_r) b.hand_r.getWorldPosition(rightHand);
    const leftShoulder = new THREE.Vector3();
    if (b.upperarm_l) b.upperarm_l.getWorldPosition(leftShoulder);
    const leftTarget = rightHand.clone().addScaledVector(aimDirection, 0.08);
    const leftElbowTarget = leftShoulder.clone()
      .lerp(leftTarget, 0.62)
      .add(new THREE.Vector3(0, -0.08, 0));
    this.orientArmBone(b.upperarm_l, b.lowerarm_l, leftElbowTarget);
    this.orientArmBone(b.lowerarm_l, b.hand_l, leftTarget);
  }

  update() {
    if (this.game.world && this.game.world.vehicle && this.game.world.vehicle.isDriving) {
      this.animation.mixer.update(this.time.delta);
      return;
    }
    const actions = this.inputManager.Actions;
    this.updateCharacterMovement(actions);
    this.animation.mixer.update(this.time.delta);
    this.outfitMixers.forEach((mixer) => mixer.update(this.time.delta));
  }

  initGUI() {
    this.debug.addFolder('Player (Human)').close();
    if (this.isDebugMode) {
      this.debug.add(
        this,
        'speed',
        {
          min: 0,
          max: 5,
          step: 0.1,
          label: 'Movement Speed',
        },
        'Player (Link)'
      );
      this.debug.add(
        this,
        'sprintMultiplier',
        {
          min: 1,
          max: 5,
          step: 0.1,
          label: 'Sprint Multiplier',
        },
        'Player (Link)'
      );
    }
  }
}
