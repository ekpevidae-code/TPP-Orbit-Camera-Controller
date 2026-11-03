import Game from '../Game.class';

export default class UIController {
  constructor() {
    this.game = Game.getInstance();
    this.inputManager = this.game.inputManager;
    
    this.initializeCameraToggle();
    this.initializeHudExtras();
    this.initializeLandscapeMode();
    this.initializeMobileControls();
    this.initializeVirtualJoystick();
    this.initializeKeyboardVisualFeedback();
    this.updateCameraModeButtons();
  }

  initializeHudExtras() {
    this.pauseButton = document.getElementById('pause-btn');
    this.pauseMenu = document.getElementById('pause-menu');
    const resumeButton = document.getElementById('resume-btn');
    const setPaused = (paused) => {
      this.game.isPaused = paused;
      if (this.pauseMenu) {
        this.pauseMenu.classList.toggle('open', paused);
        this.pauseMenu.setAttribute('aria-hidden', paused ? 'false' : 'true');
      }
    };
    if (this.pauseButton) this.pauseButton.addEventListener('click', () => setPaused(!this.game.isPaused));
    if (resumeButton) resumeButton.addEventListener('click', () => setPaused(false));
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && !event.repeat) setPaused(!this.game.isPaused);
    });

    const bindHold = (id, keyCode) => {
      const button = document.getElementById(id);
      if (!button) return;
      let pointerId = null;
      const press = (event) => {
        event.preventDefault();
        event.stopPropagation();
        pointerId = event.pointerId;
        try { button.setPointerCapture(pointerId); } catch (_) {}
        button.classList.add('pressed');
        this.inputManager.onKeyDown({ keyCode, preventDefault() {} });
      };
      const release = (event) => {
        if (pointerId === null || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
        pointerId = null;
        button.classList.remove('pressed');
        this.inputManager.onKeyUp({ keyCode, preventDefault() {} });
      };
      button.addEventListener('pointerdown', press);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => button.addEventListener(type, release));
    };
    bindHold('jump-btn', 32);
    bindHold('gas-btn', 87);
    const brakeButton = document.getElementById('brake-btn');
    if (brakeButton) {
      let brakePointerId = null;
      const setBrake = (active) => {
        this.inputManager.keys.brake = active;
        brakeButton.classList.toggle('pressed', active);
      };
      brakeButton.addEventListener('pointerdown', (event) => {
        event.preventDefault(); event.stopPropagation();
        brakePointerId = event.pointerId;
        try { brakeButton.setPointerCapture(brakePointerId); } catch (_) {}
        setBrake(true);
      });
      const releaseBrake = (event) => {
        if (brakePointerId === null || (event.pointerId !== undefined && event.pointerId !== brakePointerId)) return;
        brakePointerId = null; setBrake(false);
      };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => brakeButton.addEventListener(type, releaseBrake));
      window.addEventListener('blur', () => { brakePointerId = null; setBrake(false); });
    }

    this.miniMap = document.getElementById('mini-map');
    this.miniMapContext = this.miniMap ? this.miniMap.getContext('2d') : null;
  }

  updateMiniMap() {
    if (!this.miniMapContext || !this.game.world || !this.game.world.player) return;
    const ctx = this.miniMapContext;
    const size = this.miniMap.width;
    const center = size / 2;
    const radius = size * 0.44;
    const player = this.game.world.vehicle && this.game.world.vehicle.isDriving
      ? this.game.world.vehicle.car : this.game.world.player.player;
    if (!player) return;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(13,25,34,.94)'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(190,215,225,.13)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(center + i * 22, 0); ctx.lineTo(center + i * 22, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, center + i * 22); ctx.lineTo(size, center + i * 22); ctx.stroke();
    }
    const drawDot = (object, color, dotSize) => {
      if (!object || !object.position) return;
      const dx = object.position.x - player.position.x;
      const dz = object.position.z - player.position.z;
      const scale = 0.72;
      const x = center + dx * scale;
      const y = center + dz * scale;
      if (Math.hypot(x - center, y - center) > radius - 4) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, dotSize, 0, Math.PI * 2); ctx.fill();
    };
    const world = this.game.world;
    if (world.traffic && Array.isArray(world.traffic.cars)) world.traffic.cars.forEach((item) => drawDot(item.car || item, '#d5dce0', 2.2));
    if (world.police) drawDot(world.police.car, '#f5c94e', 3.2);
    if (world.vehicle && !world.vehicle.isDriving) drawDot(world.vehicle.car, '#65c9a0', 3);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(center, center, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#69c8a4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(center, center, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  initializeLandscapeMode() {
    const button = document.getElementById('rotate-screen-btn');
    if (!button) return;
    button.addEventListener('click', async () => {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (_) {}
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (_) {
        // Some mobile browsers do not allow orientation locking; manual rotation still works.
      }
      button.classList.add('attempted');
    });
  }

  initializeCameraToggle() {
    this.tppModeBtn = document.getElementById('tpp-mode-btn');
    this.orbitModeBtn = document.getElementById('orbit-mode-btn');
    
    // Add click listeners for both buttons
    if (this.tppModeBtn) {
      this.tppModeBtn.addEventListener('click', () => {
        this.setCameraMode('tpp');
      });
    }
    
    if (this.orbitModeBtn) {
      this.orbitModeBtn.addEventListener('click', () => {
        this.setCameraMode('orbit');
      });
    }
    
    // Add keyboard shortcut (C key)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat) {
        this.toggleCameraMode();
      }
    });
  }

  initializeMobileControls() {
    this.mobileControls = document.getElementById('mobile-controls');
    this.controlButtons = document.querySelectorAll('.control-btn');
    
    // Track active touches for each button
    this.activeTouches = new Map();
    this.joystickTouchId = null;
    
    this.controlButtons.forEach(button => {
      const key = button.dataset.key;
      
      // Mouse events
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.handleButtonPress(key, button, true);
      });
      
      button.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.handleButtonPress(key, button, false);
      });
      
      button.addEventListener('mouseleave', (e) => {
        e.preventDefault();
        this.handleButtonPress(key, button, false);
      });
      
      // Touch events for mobile
      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        this.activeTouches.set(touch.identifier, { button, key });
        this.handleButtonPress(key, button, true);
      });
      
      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (this.activeTouches.has(touch.identifier)) {
          this.activeTouches.delete(touch.identifier);
          this.handleButtonPress(key, button, false);
        }
      });
      
      button.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (this.activeTouches.has(touch.identifier)) {
          this.activeTouches.delete(touch.identifier);
          this.handleButtonPress(key, button, false);
        }
      });
    });
    
    // Prevent context menu on long press
    this.mobileControls.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  handleButtonPress(key, button, isPressed) {
    // Update button visual state
    if (isPressed) {
      button.classList.add('pressed');
    } else {
      button.classList.remove('pressed');
    }
    
    // Simulate keyboard event for the input manager
    const keyEvent = {
      keyCode: this.getKeyCode(key),
      preventDefault: () => {}
    };
    
    if (isPressed) {
      this.inputManager.onKeyDown(keyEvent);
    } else {
      this.inputManager.onKeyUp(keyEvent);
    }
  }

  getKeyCode(key) {
    const keyCodeMap = {
      'KeyW': 87,
      'KeyA': 65,
      'KeyS': 83,
      'KeyD': 68,
      'Space': 32,
      'ShiftLeft': 16,
      'ShiftRight': 16
    };
    return keyCodeMap[key] || 0;
  }

  setCameraMode(mode) {
    if (this.game.camera.mode === mode && !this.game.camera.isTransitioning) {
      return; // Already in this mode
    }
    
    // Add transitioning animation to the target button
    const targetBtn = mode === 'tpp' ? this.tppModeBtn : this.orbitModeBtn;
    if (targetBtn) {
      targetBtn.classList.add('transitioning');
      setTimeout(() => {
        targetBtn.classList.remove('transitioning');
      }, 600);
    }
    
    this.game.camera.setMode(mode);
    this.updateCameraModeButtons();
  }

  toggleCameraMode() {
    const currentMode = this.game.camera.mode;
    const newMode = currentMode === 'tpp' ? 'orbit' : 'tpp';
    this.setCameraMode(newMode);
  }

  updateCameraModeButtons() {
    const currentMode = this.game.camera.mode;
    const isTransitioning = this.game.camera.isTransitioning;
    const targetMode = this.game.camera.targetMode;
    
    // Update button states
    if (this.tppModeBtn && this.orbitModeBtn) {
      // Remove active class from both
      this.tppModeBtn.classList.remove('active');
      this.orbitModeBtn.classList.remove('active');
      
      // Add active class to current mode (or target mode if transitioning)
      const activeMode = isTransitioning ? targetMode : currentMode;
      if (activeMode === 'tpp') {
        this.tppModeBtn.classList.add('active');
      } else {
        this.orbitModeBtn.classList.add('active');
      }
    }
  }

  update() {
    this.updateMiniMap();
    const driving = !!(this.game.world && this.game.world.vehicle && this.game.world.vehicle.isDriving);
    const jumpButton = document.getElementById('jump-btn');
    const gasButton = document.getElementById('gas-btn');
    const brakeButton = document.getElementById('brake-btn');
    if (jumpButton) jumpButton.style.display = driving ? 'none' : 'block';
    if (gasButton) gasButton.style.display = driving ? 'block' : 'none';
    if (brakeButton) brakeButton.style.display = driving ? 'block' : 'none';
    // Update camera mode buttons if transitioning
    if (this.game.camera.isTransitioning) {
      this.updateCameraModeButtons();
    }
  }

  // Show/hide mobile controls based on device
  setMobileControlsVisibility(visible) {
    if (this.mobileControls) {
      this.mobileControls.style.display = visible ? 'flex' : 'none';
    }
  }

  initializeKeyboardVisualFeedback() {
    // Map keyboard keys to button elements
    this.keyToButtonMap = new Map();
    
    // Find buttons and map them to their corresponding keys
    const btnW = document.getElementById('btn-w');
    const btnA = document.getElementById('btn-a');
    const btnS = document.getElementById('btn-s');
    const btnD = document.getElementById('btn-d');
    const btnSpace = document.getElementById('btn-space');
    const btnSprint = document.getElementById('btn-sprint');
    
    if (btnW) {
      this.keyToButtonMap.set('KeyW', btnW);
      this.keyToButtonMap.set('ArrowUp', btnW);
    }
    if (btnA) {
      this.keyToButtonMap.set('KeyA', btnA);
      this.keyToButtonMap.set('ArrowLeft', btnA);
    }
    if (btnS) {
      this.keyToButtonMap.set('KeyS', btnS);
      this.keyToButtonMap.set('ArrowDown', btnS);
    }
    if (btnD) {
      this.keyToButtonMap.set('KeyD', btnD);
      this.keyToButtonMap.set('ArrowRight', btnD);
    }
    if (btnSpace) this.keyToButtonMap.set('Space', btnSpace);
    if (btnSprint) {
      this.keyToButtonMap.set('ShiftLeft', btnSprint);
      this.keyToButtonMap.set('ShiftRight', btnSprint);
    }
    
    // Also map by keyCode for compatibility
    this.keyCodeToButtonMap = new Map();
    if (btnW) {
      this.keyCodeToButtonMap.set(87, btnW); // W
      this.keyCodeToButtonMap.set(38, btnW); // Arrow Up
    }
    if (btnA) {
      this.keyCodeToButtonMap.set(65, btnA); // A
      this.keyCodeToButtonMap.set(37, btnA); // Arrow Left
    }
    if (btnS) {
      this.keyCodeToButtonMap.set(83, btnS); // S
      this.keyCodeToButtonMap.set(40, btnS); // Arrow Down
    }
    if (btnD) {
      this.keyCodeToButtonMap.set(68, btnD); // D
      this.keyCodeToButtonMap.set(39, btnD); // Arrow Right
    }
    if (btnSpace) this.keyCodeToButtonMap.set(32, btnSpace); // Space
    if (btnSprint) this.keyCodeToButtonMap.set(16, btnSprint); // Shift
    
    // Listen for keyboard events
    window.addEventListener('keydown', (e) => {
      this.handleKeyboardVisualFeedback(e, true);
    });
    
    window.addEventListener('keyup', (e) => {
      this.handleKeyboardVisualFeedback(e, false);
    });
  }

  handleKeyboardVisualFeedback(event, isPressed) {
    // Try to find button by code first, then by keyCode
    let button = this.keyToButtonMap.get(event.code);
    if (!button) {
      button = this.keyCodeToButtonMap.get(event.keyCode);
    }
    
    if (button) {
      if (isPressed) {
        button.classList.add('pressed');
      } else {
        button.classList.remove('pressed');
      }
    }
  }

  initializeVirtualJoystick() {
    this.joystickContainer = document.getElementById('virtual-joystick');
    this.joystickKnob = document.getElementById('joystick-knob');
    if (!this.joystickContainer || !this.joystickKnob) return;

    this.joystickData = {
      active: false, centerX: 0, centerY: 0,
      currentX: 0, currentY: 0, maxDistance: 35, deadZone: 0.1
    };
    this.joystickPointerId = null;
    this.updateJoystickCenter();

    // Start anywhere on the joystick base, not only on the small center knob.
    this.joystickContainer.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = event.pointerId;
      try { this.joystickContainer.setPointerCapture(event.pointerId); } catch (_) {}
      this.startJoystick(event);
      this.moveJoystick(event);
    });
    this.joystickContainer.addEventListener('pointermove', (event) => {
      if (this.joystickData.active && event.pointerId === this.joystickPointerId) {
        event.preventDefault();
        this.moveJoystick(event);
      }
    });
    const finish = (event) => {
      if (event.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.endJoystick();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      this.joystickContainer.addEventListener(type, finish);
    });
    window.addEventListener('resize', () => this.updateJoystickCenter());
    window.addEventListener('blur', () => {
      this.joystickPointerId = null;
      this.endJoystick();
    });
    document.addEventListener('contextmenu', (event) => {
      if (this.joystickContainer.contains(event.target)) event.preventDefault();
    });
  }

  updateJoystickCenter() {
    if (!this.joystickContainer) return;
    
    const rect = this.joystickContainer.getBoundingClientRect();
    this.joystickData.centerX = rect.left + rect.width / 2;
    this.joystickData.centerY = rect.top + rect.height / 2;
  }
  
  startJoystick(pointer) {
    this.joystickData.active = true;
    this.joystickKnob.classList.add('active');
    this.updateJoystickCenter();
  }
  
  moveJoystick(pointer) {
    if (!this.joystickData.active) return;
    
    const deltaX = pointer.clientX - this.joystickData.centerX;
    const deltaY = pointer.clientY - this.joystickData.centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Limit knob movement to max distance
    let limitedX = deltaX;
    let limitedY = deltaY;
    
    if (distance > this.joystickData.maxDistance) {
      const angle = Math.atan2(deltaY, deltaX);
      limitedX = Math.cos(angle) * this.joystickData.maxDistance;
      limitedY = Math.sin(angle) * this.joystickData.maxDistance;
    }
    
    // Update knob position
    this.joystickKnob.style.transform = `translate(calc(-50% + ${limitedX}px), calc(-50% + ${limitedY}px))`;
    
    // Calculate normalized input values (-1 to 1)
    const normalizedX = limitedX / this.joystickData.maxDistance;
    const normalizedY = -limitedY / this.joystickData.maxDistance; // Invert Y for game coordinates
    
    // Apply dead zone
    const inputMagnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    
    if (inputMagnitude > this.joystickData.deadZone) {
      this.joystickData.currentX = normalizedX;
      this.joystickData.currentY = normalizedY;
      this.updateInputFromJoystick(normalizedX, normalizedY);
    } else {
      this.joystickData.currentX = 0;
      this.joystickData.currentY = 0;
      this.updateInputFromJoystick(0, 0);
    }
  }
  
  endJoystick() {
    if (!this.joystickData.active) return;
    
    this.joystickData.active = false;
    this.joystickKnob.classList.remove('active');
    
    // Reset knob position
    this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    
    // Clear input
    this.joystickData.currentX = 0;
    this.joystickData.currentY = 0;
    this.updateInputFromJoystick(0, 0);
  }
  
  updateInputFromJoystick(x, y) {
    // Convert joystick input to WASD-like input
    const threshold = 0.3;
    
    // Forward/Backward (W/S)
    if (y > threshold) {
      this.simulateKeyInput('KeyW', true);
      this.simulateKeyInput('KeyS', false);
    } else if (y < -threshold) {
      this.simulateKeyInput('KeyW', false);
      this.simulateKeyInput('KeyS', true);
    } else {
      this.simulateKeyInput('KeyW', false);
      this.simulateKeyInput('KeyS', false);
    }
    
    // Left/Right (A/D)
    if (x < -threshold) {
      this.simulateKeyInput('KeyA', true);
      this.simulateKeyInput('KeyD', false);
    } else if (x > threshold) {
      this.simulateKeyInput('KeyA', false);
      this.simulateKeyInput('KeyD', true);
    } else {
      this.simulateKeyInput('KeyA', false);
      this.simulateKeyInput('KeyD', false);
    }
  }
  
  simulateKeyInput(key, isPressed) {
    const keyEvent = {
      keyCode: this.getKeyCode(key),
      preventDefault: () => {}
    };
    
    if (isPressed) {
      this.inputManager.onKeyDown(keyEvent);
    } else {
      this.inputManager.onKeyUp(keyEvent);
    }
  }

  // Detect if device is mobile/touch
  isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
}