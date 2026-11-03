import * as THREE from 'three';

export const GAME_STATES=Object.freeze({MENU:'MENU',GARAGE:'GARAGE',LOADING:'LOADING',COUNTDOWN:'COUNTDOWN',RACING:'RACING',PAUSED:'PAUSED',GAME_OVER:'GAME_OVER'});
const TRANSITIONS={
 MENU:['GARAGE','LOADING'],GARAGE:['MENU','LOADING'],LOADING:['COUNTDOWN','GARAGE'],COUNTDOWN:['RACING','GARAGE'],RACING:['PAUSED','GAME_OVER'],PAUSED:['RACING','GARAGE','GAME_OVER'],GAME_OVER:['GARAGE','LOADING']
};
export class GameStateManager{
 constructor(initial=GAME_STATES.MENU){this.current=initial;this.listeners=new Map();this.history=[initial];}
 on(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);return()=>this.listeners.get(event)?.delete(fn);}
 emit(event,payload){for(const fn of this.listeners.get(event)||[])fn(payload);}
 can(next){return TRANSITIONS[this.current]?.includes(next)??false;}
 transition(next,meta={}){if(next===this.current)return true;if(!this.can(next))return false;const previous=this.current;this.current=next;this.history.push(next);this.emit('change',{previous,current:next,meta});this.emit(next,{previous,meta});return true;}
}
export const VEHICLES=[
 {id:'falcon-gt',name:'Falcon GT',topSpeed:54,acceleration:26,handling:5.5,nitro:100,unlocked:true,color:0xf04d25},
 {id:'vortex-r',name:'Vortex R',topSpeed:57,acceleration:30,handling:5.2,nitro:92,unlocked:true,color:0x20a8d8},
 {id:'apex-rs',name:'Apex RS',topSpeed:62,acceleration:24,handling:4.8,nitro:110,unlocked:true,color:0xd6dce4}
];
export class VehiclePhysicsEngine{
 constructor(stats={}){this.setStats(stats);this.longitudinal=0;this.lateral=0;this.yaw=0;}
 setStats(s={}){this.stats={topSpeed:s.topSpeed??54,acceleration:s.acceleration??26,handling:s.handling??5.5,nitro:s.nitro??100};}
 step(car,input,dt,{nitroMultiplier=1,shockwave=false,airborne=false}={}){
  const speed=car.speed??0,gas=input.gas?1:0,brake=input.brake?1:0,steer=THREE.MathUtils.clamp(input.steer??0,-1,1);
  const power=this.stats.acceleration*(0.68+0.32*Math.min(1,speed/this.stats.topSpeed));
  const drag=0.014*speed+0.00034*speed*speed;
  const targetCap=this.stats.topSpeed*(shockwave?1.85:nitroMultiplier);
  const acceleration=gas*power-brake*42-drag-(gas?0:4.2);
  car.speed=THREE.MathUtils.clamp(speed+acceleration*dt,0,targetCap);
  const drifting=!!(brake&&Math.abs(steer)>0.15&&speed>12&&!airborne);
  const lateralGrip=drifting?1.1:5.8+this.stats.handling*0.42;
  this.lateral=THREE.MathUtils.damp(this.lateral,steer*car.speed*(drifting?0.22:0.105),lateralGrip,dt);
  this.yaw=THREE.MathUtils.damp(this.yaw,steer*this.stats.handling*(0.35+car.speed/this.stats.topSpeed),this.stats.handling*2.2,dt);
  return {drifting,lateral:this.lateral,yaw:this.yaw,speed:car.speed,drag};
 }
}
export class NitroController{
 constructor(capacity=100){this.capacity=capacity;this.value=capacity;this.mode='READY';this.lastTap=-Infinity;this.shockwaveTime=0;this.perfectTime=0;}
 add(amount){this.value=THREE.MathUtils.clamp(this.value+amount,0,this.capacity);}
 tap(now,active){const gap=now-this.lastTap;let result='STANDARD';
  if(this.value>=this.capacity-0.001&&gap<0.36){this.value=0;this.mode='SHOCKWAVE';this.shockwaveTime=3.1;result='SHOCKWAVE';}
  else if(this.value>=68&&this.value<=90&&gap<0.42){this.value=Math.max(0,this.value-34);this.mode='PERFECT';this.perfectTime=1.7;result='PERFECT';}
  else if(this.value>0){this.mode='STANDARD';result='STANDARD';}
  this.lastTap=now;return result;
 }
 step(dt,using){if(using)this.value=Math.max(0,this.value-(this.mode==='PERFECT'?19:28)*dt);if(this.shockwaveTime>0)this.shockwaveTime=Math.max(0,this.shockwaveTime-dt);if(this.perfectTime>0)this.perfectTime=Math.max(0,this.perfectTime-dt);if(!this.shockwaveTime&&!this.perfectTime&&this.value<=0)this.mode='EMPTY';return {value:this.value,shockwave:this.shockwaveTime>0,perfect:this.perfectTime>0};}
}
export class AABBCollisionSystem{
 constructor(){this.playerBox=new THREE.Box3();this.otherBox=new THREE.Box3();this.playerSize=new THREE.Vector3(2.2,1.5,4.2);this.otherSize=new THREE.Vector3(2.1,1.5,4.0);}
 hit(player,others){this.playerBox.setFromCenterAndSize(player.position.clone().add(new THREE.Vector3(0,0.75,0)),this.playerSize);for(const other of others){this.otherBox.setFromCenterAndSize(other.position.clone().add(new THREE.Vector3(0,0.75,0)),this.otherSize);if(this.playerBox.intersectsBox(this.otherBox))return other;}return null;}
 guardrail(x,halfWidth=8.3){return Math.abs(x)>halfWidth;}
}
export class TrafficManager{
 constructor(spawn){this.spawn=spawn;this.items=[];this.lanes=[-5.3,-1.8,1.8,5.3];this.timer=0;}
 add(car,lane,speed){const item={car,lane,speed,near:false};this.items.push(item);return item;}
 step(dt,playerSpeed,playerZ){for(const t of this.items){t.car.position.z+=playerSpeed*0.34*dt-t.speed*dt;if(t.car.position.z>playerZ+14){t.lane=this.lanes[Math.floor(Math.random()*this.lanes.length)];t.car.position.x=t.lane;t.car.position.z=playerZ-170-Math.random()*180;t.near=false;}}}
}
export class WaypointRacerAI{
 constructor(car,waypoints=[],skill=0.86){this.car=car;this.waypoints=waypoints;this.skill=skill;this.index=0;this.speed=skill;}
 step(dt,playerSpeed,playerX){const target=this.waypoints[this.index]??{x:this.car.position.x,z:this.car.position.z-90};if(Math.abs(this.car.position.z-target.z)<18)this.index=(this.index+1)%Math.max(1,this.waypoints.length);const laneTarget=target.x+(Math.abs(playerX-target.x)<2.2?(this.car.position.x<playerX?-1.4:1.4):0);this.car.position.x=THREE.MathUtils.damp(this.car.position.x,laneTarget,1.8,dt);this.car.position.z+=playerSpeed*0.34*dt-this.skill*12*dt;if(this.car.position.z>15)this.car.position.z-=2800;return this.car.position;}
}
export class GameLoop{
 constructor(update,render){this.update=update;this.render=render;this.last=0;this.accumulator=0;this.fixed=1/60;this.frame=0;this.running=false;this.bound=this.tick.bind(this);}
 start(){if(!this.running){this.running=true;this.last=0;requestAnimationFrame(this.bound);}}
 stop(){this.running=false;}
 tick(now){if(!this.running)return;requestAnimationFrame(this.bound);const frameDt=this.last?Math.min((now-this.last)/1000,0.05):0;this.last=now;this.accumulator+=frameDt;let steps=0;while(this.accumulator>=this.fixed&&steps<3){this.update(this.fixed);this.accumulator-=this.fixed;steps++;}this.render(frameDt,this.accumulator/this.fixed);this.frame++;}
}
