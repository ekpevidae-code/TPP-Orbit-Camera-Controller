export default class InputManager {
  constructor(game) {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
      interact: false,
      brake: false,
    };
    this.mapping = {
      87: 'forward',
      83: 'backward',
      65: 'left',
      68: 'right',
      32: 'jump',
      16: 'sprint',
      69: 'interact', // E: enter or exit vehicle
      38: 'forward',
      40: 'backward',
      37: 'left',
      39: 'right',
    };
    this.game = game;
  }

  initialize() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  onKeyDown(e) {
    this.onKey(e, true);
  }

  onKeyUp(e) {
    this.onKey(e, false);
  }

  onKey(e, bool) {
    const mapped = this.mapping[e.keyCode];
    if (mapped) {
      e.preventDefault();
      this.keys[mapped] = bool;
    }
  }

  consumeJump() {
    this.keys.jump = false;
  }

  get Actions() {
    return this.keys;
  }
}
