import EventEmitter from './EventEmitter.class';

export default class Time extends EventEmitter {
  constructor() {
    super();

    /**
     * Time configurations
     */
    this.start = Date.now();
    this.current = this.start;
    this.elapsedTime = 0;
    this.delta = 34;

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }

  animate() {
    const currentTime = Date.now();
    // Prevent long frames or mobile tab-resume pauses from causing physics and camera jumps.
    this.delta = Math.min((currentTime - this.current) / 1000, 0.05);
    this.current = currentTime;
    this.elapsedTime = (this.current - this.start) / 1000;

    this.trigger('animate');

    window.requestAnimationFrame(() => {
      this.animate();
    });
  }
}
