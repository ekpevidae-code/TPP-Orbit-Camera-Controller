import * as THREE from 'three';
import Game from '../Game.class';
import PerformanceMonitor from '../Utils/PerformanceMonitor';

export default class Renderer {
  constructor() {
    /**
     * Game references
     */
    this.game = Game.getInstance();
    this.canvas = this.game.canvas;
    this.sizes = this.game.sizes;
    this.scene = this.game.scene;
    this.camera = this.game.camera;
    this.renderer = this.game.renderer;
    this.isDebugMode = this.game.isDebugMode;
    this.debug = this.game.debug;

    this.isMobileDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    this.setRendererInstance();
    // Keep diagnostics off the normal HUD; enable them with ?mode=debug.
    if (this.isMobileDevice && this.isDebugMode) this.createMobileDiagnostics();

    if (this.isDebugMode) {
      this.initGUI();
    }
  }

  setRendererInstance() {
    this.toneMappingOptions = {
      NoToneMapping: THREE.NoToneMapping,
      LinearToneMapping: THREE.LinearToneMapping,
      ReinhardToneMapping: THREE.ReinhardToneMapping,
      CineonToneMapping: THREE.CineonToneMapping,
      ACESFilmicToneMapping: THREE.ACESFilmicToneMapping,
      AgXToneMapping: THREE.AgXToneMapping,
      NeutralToneMapping: THREE.NeutralToneMapping,
    };

    this.mobileDprMax = this.isMobileDevice ? Math.min(this.sizes.pixelRatio, 1.25) : this.sizes.pixelRatio;
    this.mobileDprMin = 0.7;
    this.adaptiveDpr = this.isMobileDevice ? Math.min(this.mobileDprMax, 1.0) : this.sizes.pixelRatio;
    this.lastFrameTimestamp = performance.now();
    this.lastScaleCheck = this.lastFrameTimestamp;
    this.frameSampleCount = 0;
    this.frameSampleTotal = 0;

    this.rendererInstance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Avoid expensive MSAA on touch devices.
      antialias: !this.isMobileDevice,
    });

    this.rendererInstance.toneMapping = THREE.NeutralToneMapping;
    this.rendererInstance.toneMappingExposure = 1.75;
    // Disable real-time shadow maps on phones until measured hardware can sustain them.
    this.rendererInstance.shadowMap.enabled = !this.isMobileDevice;
    this.rendererInstance.shadowMap.type = THREE.PCFShadowMap;
    this.rendererInstance.setSize(this.sizes.width, this.sizes.height);
    this.rendererInstance.setPixelRatio(this.adaptiveDpr);

    if (this.isDebugMode) {
      this.setUpPerformanceMonitor();
    }
  }

  setUpPerformanceMonitor() {
    this.perf = new PerformanceMonitor(this.rendererInstance);
  }

  createMobileDiagnostics() {
    this.diagnosticPanel = document.createElement('div');
    Object.assign(this.diagnosticPanel.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      zIndex: '99999',
      padding: '6px 8px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.72)',
      color: '#fff',
      font: '11px/1.45 monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
    });
    this.diagnosticPanel.textContent = 'GAME DIAGNOSTICS
Starting frame monitor…';
    document.body.appendChild(this.diagnosticPanel);

    this.diagnosticFrames = 0;
    this.diagnosticLastTime = performance.now();
    this.diagnosticFps = 0;
    this.diagnosticLost = false;

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.diagnosticLost = true;
      this.diagnosticPanel.textContent = 'WEBGL CONTEXT LOST
The phone graphics system stopped the game.';
    });

    window.addEventListener('error', (event) => {
      if (this.diagnosticPanel) {
        this.diagnosticPanel.textContent = 'JAVASCRIPT ERROR
' + String(event.message || 'Unknown error').slice(0, 140);
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      if (this.diagnosticPanel) {
        this.diagnosticPanel.textContent = 'ASYNC ERROR
' + String(event.reason || 'Unknown rejection').slice(0, 140);
      }
    });
  }

  updateMobileDiagnostics() {
    if (!this.diagnosticPanel || this.diagnosticLost) return;
    this.diagnosticFrames += 1;
    const now = performance.now();
    const elapsed = now - this.diagnosticLastTime;
    if (elapsed < 1000) return;

    this.diagnosticFps = Math.round((this.diagnosticFrames * 1000) / elapsed);
    this.diagnosticFrames = 0;
    this.diagnosticLastTime = now;

    const info = this.rendererInstance.info;
    const heap = performance.memory
      ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB'
      : 'not exposed';
    this.diagnosticPanel.textContent = [
      'GAME DIAGNOSTICS',
      'FPS: ' + this.diagnosticFps,
      'Draw calls: ' + info.render.calls,
      'Triangles: ' + info.render.triangles,
      'Geometries: ' + info.memory.geometries,
      'Textures: ' + info.memory.textures,
      'JS heap: ' + heap,
      'Shadows: ' + (this.rendererInstance.shadowMap.enabled ? 'ON' : 'OFF'),
      'Render scale: ' + this.rendererInstance.getPixelRatio().toFixed(2),
    ].join('
');
  }

  resize() {
    this.rendererInstance.setSize(this.sizes.width, this.sizes.height);
    this.rendererInstance.setPixelRatio(this.isMobileDevice ? Math.min(this.sizes.pixelRatio, 1.25) : this.sizes.pixelRatio);
  }

  update() {
    if (this.isDebugMode) {
      this.perf.beginFrame();
    }

    this.rendererInstance.render(this.scene, this.camera.cameraInstance);
    this.updateMobileDiagnostics();

    if (this.isDebugMode) {
      this.perf.endFrame();
    }
  }

  initGUI() {
    this.debug.add(
      this.rendererInstance,
      'toneMapping',
      {
        options: this.toneMappingOptions,
        label: 'Tone Mapping',
        onChange: (toneMappingType) => {
          this.rendererInstance.toneMapping = toneMappingType;
        },
      },
      'Renderer'
    );
  }
}
