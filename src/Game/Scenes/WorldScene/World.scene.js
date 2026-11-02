import Game from '../../Game.class';
import DebugFloor from './components/DebugFloor/DebugFloor.class';
import Lighting from './components/Lighting/Lighting.class';
import City from './components/City/City.class';
import Player from '../../Entities/Player.class';
import Vehicle from '../../Entities/Vehicle.class';
import Traffic from './components/Traffic/Traffic.class';
import * as THREE from 'three';

export default class World {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.scene.fog = new THREE.FogExp2('#96a9ae', 0.008);

    this.debugFloor = new DebugFloor();
    this.city = new City();
    this.player = new Player();
    this.vehicle = new Vehicle();
    this.traffic = new Traffic();
    this.lighting = new Lighting({ helperEnabled: false });
  }

  update() {
    this.player.update();
    this.vehicle.update();
    this.traffic.update();
    this.lighting.update();
  }
}
