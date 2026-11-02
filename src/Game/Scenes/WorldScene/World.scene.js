import Game from '../../Game.class';
import DebugFloor from './components/DebugFloor/DebugFloor.class';
import Lighting from './components/Lighting/Lighting.class';
import City from './components/City/City.class';
import Player from '../../Entities/Player.class';
import * as THREE from 'three';

export default class World {
  constructor() {
    /**
     * Game references
     */
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    // Keep the district visible beyond the immediate camera surroundings.
    this.scene.fog = new THREE.FogExp2('#96a9ae', 0.008);

    /**
     * World configurations
     */
    this.debugFloor = new DebugFloor();
    this.city = new City();
    this.player = new Player();
    this.lighting = new Lighting({ helperEnabled: false });
  }

  update() {
    this.player.update();
    this.lighting.update();
  }
}
