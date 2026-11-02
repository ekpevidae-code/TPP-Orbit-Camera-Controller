import Game from './Game/Game.class';
import ResourceLoader from './Game/Utils/ResourceLoader.class';
import ASSETS from './assetSources.js';

const progressBar = document.getElementById('bar');
const progress = document.getElementById('progress');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
let startupPanel = null;
let startupErrors = [];

if (isTouchDevice) {
  startupPanel = document.createElement('div');
  Object.assign(startupPanel.style, {
    position: 'fixed',
    left: '8px',
    top: '8px',
    zIndex: '100000',
    maxWidth: 'min(92vw, 360px)',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'rgba(0,0,0,0.82)',
    color: '#fff',
    font: '12px/1.45 monospace',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
  });
  startupPanel.textContent = 'GAME STARTUP\\nPreparing assets…';
  document.body.appendChild(startupPanel);

  window.addEventListener('error', (event) => {
    startupPanel.textContent = 'STARTUP JAVASCRIPT ERROR\\n' + String(event.message || 'Unknown error').slice(0, 220);
  });
  window.addEventListener('unhandledrejection', (event) => {
    startupPanel.textContent = 'STARTUP ASYNC ERROR\\n' + String(event.reason || 'Unknown rejection').slice(0, 220);
  });
}

let startupTimedOut = false;
const startupTimer = setTimeout(() => {
  startupTimedOut = true;
  if (startupPanel) {
    startupPanel.textContent = 'ASSET LOADING TIMEOUT\\nThe game has not finished loading after 45 seconds.\\n' + startupPanel.textContent;
  }
}, 45000);

const resources = new ResourceLoader(ASSETS);

// Debug mode is enabled only when URL has ?mode=debug
const isDebugMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mode') === 'debug';

resources.on('progress', ({ id, itemsLoaded, itemsTotal, percent }) => {
  progressBar.style.width = `${percent.toFixed(1)}%`;

  if (isDebugMode) {
    console.log(
      `Loaded asset: "${id}" (${itemsLoaded}/${itemsTotal} — ${percent.toFixed(
        1
      )}%)`
    );
  }
  if (startupPanel && !startupTimedOut) {
    startupPanel.textContent = 'LOADING GAME ASSETS\\n' + id + '\\n' + itemsLoaded + '/' + itemsTotal + ' (' + percent.toFixed(0) + '%)';
  }
});

resources.on('error', ({ id, url, itemsLoaded, itemsTotal }) => {
  console.error(
    `❌ Failed to load item named "${id}" at "${url}" (${itemsLoaded}/${itemsTotal} so far)`
  );
  startupErrors.push(id + ': ' + url);
  if (startupPanel) {
    startupPanel.textContent = 'ASSET LOAD ERROR\\n' + startupErrors.slice(-3).join('\\n') + '\\nLoaded: ' + itemsLoaded + '/' + itemsTotal;
  }
});

resources.on('loaded', () => {
  clearTimeout(startupTimer);
  if (startupPanel) {
    startupPanel.textContent = 'ASSETS LOADED\\nStarting 3D engine…';
  }
  if (isDebugMode) {
    if (Object.keys(resources.items).length) {
      console.log('✅ All assets are loaded. Initializing game…!');
    } else {
      console.log('☑️ No asset to load. Initializing game…!');
    }
  }

  try {
    new Game(document.getElementById('three'), resources, isDebugMode);
  } catch (error) {
    console.error('Game initialization failed:', error);
    if (startupPanel) startupPanel.textContent = 'GAME INITIALIZATION ERROR\\n' + String(error && error.stack || error).slice(0, 500);
    throw error;
  }

  if (startupPanel) {
    startupPanel.textContent = 'GAME INITIALIZED\\nStarting live diagnostics…';
    setTimeout(() => startupPanel && startupPanel.remove(), 1200);
  }
  progressBar.style.display = 'none';
  progress.style.display = 'none';

  const ccAttribution = document.getElementById('CC-attribution');
  const cameraControls = document.getElementById('camera-controls');
  const mobileControls = document.getElementById('mobile-controls');

  if (ccAttribution) {
    ccAttribution.classList.add('visible');
  }
  if (cameraControls) {
    cameraControls.classList.add('visible');
  }
  if (mobileControls) {
    mobileControls.classList.add('visible');
  }
});
