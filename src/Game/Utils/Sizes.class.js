import EventEmitter from './EventEmitter.class';

export default class Sizes extends EventEmitter {
  getPixelRatioLimit() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    return isTouch ? 1.25 : 1.5;
  }

  constructor() {
    super();
    /**
     * Sizes configurations
     */
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, this.getPixelRatioLimit());

    let timeOut = null;

    window.addEventListener('resize', () => {
      // Resize event
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.pixelRatio = Math.min(window.devicePixelRatio, this.getPixelRatioLimit());
      this.trigger('resize');

      // Throttled resize
      if (timeOut) {
        clearTimeout(timeOut);
      }
      timeOut = setTimeout(() => {
        this.trigger('throttledResize');
      }, 400);
    });
  }
}
