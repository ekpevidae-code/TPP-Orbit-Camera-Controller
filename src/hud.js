const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class RaceHUD {
  constructor(root = document) {
    this.root = root;
    this.nodes = {
      speed: root.querySelector('#speed'),
      distance: root.querySelector('#distance'),
      position: root.querySelector('#position'),
      progress: root.querySelector('#progress'),
      nitroFill: root.querySelector('#nitro-fill'),
      nitroValue: root.querySelector('#nitro-value'),
      nitroSegments: [...root.querySelectorAll('.nitro-segment')],
      driftScore: root.querySelector('#drift-score'),
      driftToast: root.querySelector('#drift-toast'),
      nitroLabel: root.querySelector('#nitro-label'),
      raceState: root.querySelector('#race-state')
    };
    this.releaseHandlers = [];
  }

  render({ speed = 0, distance = 0, totalDistance = 3, position = 1, nitro = 0, nitroCapacity = 100, driftScore = 0, drifting = false, state = 'RACING' } = {}) {
    const percent = clamp(nitroCapacity > 0 ? nitro / nitroCapacity * 100 : 0, 0, 100);
    const place = clamp(Math.round(position), 1, 6);
    const suffix = place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
    if (this.nodes.speed) this.nodes.speed.textContent = String(Math.round(speed * 3.2)).padStart(3, '0');
    if (this.nodes.distance) this.nodes.distance.innerHTML = distance.toFixed(1) + ' <small>KM</small>';
    if (this.nodes.position) this.nodes.position.innerHTML = place + '<span>' + suffix + '</span><small style="font-size:9px;color:#aebbd0;margin-left:4px">/6 POS</small>';
    if (this.nodes.progress) this.nodes.progress.style.width = clamp(distance / Math.max(totalDistance, 0.01) * 100, 0, 100) + '%';
    if (this.nodes.nitroFill) this.nodes.nitroFill.style.width = percent + '%';
    if (this.nodes.nitroValue) this.nodes.nitroValue.textContent = Math.round(percent) + '%';
    this.nodes.nitroSegments.forEach((segment, index) => segment.classList.toggle('filled', percent > index * 10));
    if (this.nodes.driftScore) this.nodes.driftScore.textContent = Math.round(driftScore).toLocaleString();
    this.nodes.driftToast?.classList.toggle('show', Boolean(drifting));
    if (this.nodes.raceState && state) this.nodes.raceState.textContent = state.replaceAll('_', ' ');
  }

  bindControls({ setInput, startRace, nitro, stunt, pause }) {
    const controls = [
      ['left', 'left'], ['right', 'right'], ['brake', 'brake'], ['handbrake', 'handbrake'], ['gas', 'gas']
    ];
    const active = new Map();
    const release = (id, key, element) => {
      if (id !== undefined && active.get(key) !== id) return;
      setInput(key, false);
      element?.classList.remove('pressed');
      active.delete(key);
    };
    for (const [id, key] of controls) {
      const element = this.root.getElementById ? this.root.getElementById(id) : this.root.querySelector('#' + id);
      if (!element) continue;
      const down = event => {
        event.preventDefault();
        if (active.has(key)) return;
        active.set(key, event.pointerId);
        try { element.setPointerCapture(event.pointerId); } catch {}
        setInput(key, true);
        element.classList.add('pressed');
        if (key === 'gas') startRace();
      };
      const up = event => { event.preventDefault(); release(event.pointerId, key, element); };
      const lost = () => release(undefined, key, element);
      element.addEventListener('pointerdown', down);
      element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', up);
      element.addEventListener('lostpointercapture', lost);
      this.releaseHandlers.push(() => {
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        element.removeEventListener('lostpointercapture', lost);
      });
    }
    const keyMap = {
      ArrowUp: ['gas', true], w: ['gas', true], ArrowDown: ['brake', true], s: ['brake', true],
      ArrowLeft: ['left', true], a: ['left', true], ArrowRight: ['right', true], d: ['right', true],
      ' ': ['nitroOn', true], Shift: ['nitroOn', true], Control: ['handbrake', true], e: ['stunt', true], Escape: ['pause', true]
    };
    const down = event => {
      const action = keyMap[event.key] || keyMap[event.key.toLowerCase()];
      if (!action) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      if (event.repeat && ['nitro', 'stunt', 'pause'].includes(action[0])) return;
      const key = action[0];
      if (['gas', 'brake', 'left', 'right', 'handbrake', 'nitroOn'].includes(key)) setInput(key, true);
      else if (key === 'nitro') nitro();
      else if (key === 'stunt') stunt();
      else if (key === 'pause') pause();
      if (key === 'gas') startRace();
    };
    const up = event => {
      const action = keyMap[event.key] || keyMap[event.key.toLowerCase()];
      if (action && ['gas', 'brake', 'left', 'right', 'handbrake', 'nitroOn'].includes(action[0])) setInput(action[0], false);
    };
    const blur = () => {
      for (const key of ['gas', 'brake', 'left', 'right', 'handbrake', 'nitroOn']) setInput(key, false);
      for (const id of ['left', 'right', 'brake', 'handbrake', 'gas']) this.root.querySelector('#' + id)?.classList.remove('pressed');
      active.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.releaseHandlers.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    });
    return () => this.destroy();
  }

  destroy() {
    for (const release of this.releaseHandlers.splice(0)) release();
  }
}
