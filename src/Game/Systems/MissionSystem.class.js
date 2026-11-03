import * as THREE from "three";
import Game from "../../Game.class";

export default class MissionSystem {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.code = "welcome_drive";
    this.target = new THREE.Vector3(38, 0, -38);
    this.radius = 4;
    this.rewardCash = 250;
    this.status = "available";
    this.busy = false;\n    this.startActionId = null;\n    this.completeActionId = null;
    this.createCheckpoint();
    this.createHud();
    this.render();
  }

  createCheckpoint() {
    this.marker = new THREE.Group();
    this.marker.position.copy(this.target);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.16, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x54f0c0 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.18;
    this.marker.add(ring);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.34, 2.3, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x54f0c0, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    core.position.y = 1.3;
    this.marker.add(core);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xc9fff0 })
    );
    beacon.position.y = 2.65;
    this.marker.add(beacon);
    this.scene.add(this.marker);
  }

  createHud() {
    const panel = document.createElement("section");
    panel.id = "mission-panel";
    panel.className = "mission-panel";
    panel.innerHTML = `
      <div class="mission-kicker">CITY JOB</div>
      <strong class="mission-title">FIRST DRIVE</strong>
      <p class="mission-description">Enter your starter car and reach the green checkpoint.</p>
      <p class="mission-status" aria-live="polite">Mission available</p>
      <button type="button" class="mission-start">START MISSION</button>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    this.statusNode = panel.querySelector(".mission-status");
    this.button = panel.querySelector(".mission-start");
    this.button.addEventListener("click", () => this.start());
  }

  setMessage(message, error = false) {
    this.statusNode.textContent = message;
    this.statusNode.classList.toggle("error", error);
  }

  render() {
    if (!this.panel) return;
    const descriptions = {
      available: "Enter your starter car and reach the green checkpoint.",
      active: "Drive to the glowing green checkpoint.",
      completed: "Checkpoint reached. Reward added to your wallet.",
    };
    this.panel.querySelector(".mission-description").textContent = descriptions[this.status];
    this.button.hidden = this.status !== "available";
    this.button.disabled = this.busy;
    if (this.status === "available") this.setMessage("Mission available");
    if (this.status === "active") this.setMessage("Mission active · drive to the marker");
    if (this.status === "completed") this.setMessage("Mission complete · $" + this.rewardCash.toLocaleString() + " earned");
  }

  applyPlayerMissions(missions = [], definitions = []) {
    const definition = definitions.find((item) => item.mission_code === this.code);
    if (definition) {
      this.target.fromArray(definition.config?.target || [38, 0, -38]);
      this.radius = Number(definition.config?.radius || 4);
      this.rewardCash = Number(definition.reward_cash || 0);
      this.panel.querySelector(".mission-title").textContent = definition.title || "FIRST DRIVE";
      this.panel.querySelector(".mission-description").textContent = definition.description || "Reach the checkpoint.";
      this.marker.position.copy(this.target);
    }
    const current = missions.find((item) => item.mission_code === this.code);
    if (!current) return;
    this.status = current.status === "completed" ? "completed"
      : current.status === "active" ? "active" : "available";
    if (this.status === "completed") this.marker.visible = false;
    this.render();
  }

  async start() {
    if (this.busy || this.status !== "available") return;
    if (!this.game.sessionController?.connected) {
      this.setMessage("Sign in to activate this mission and receive its cloud reward.", true);
      return;
    }
    if (!this.game.world.vehicle.isDriving) {
      this.setMessage("Enter your starter car first.", true);
      return;
    }
    this.busy = true;
    this.button.disabled = true;
    this.setMessage("Starting mission…");
    try {
      await this.game.sessionController.backend.startMission(this.code, this.startActionId || (this.startActionId = crypto.randomUUID()));\n      this.startActionId = null;
      this.status = "active";
      this.render();
    } catch (error) {
      this.setMessage(error.message || "Could not start mission.", true);
    } finally {
      this.busy = false;
      this.button.disabled = false;
    }
  }

  async complete() {
    if (this.busy || this.status !== "active") return;
    this.busy = true;
    this.setMessage("Saving mission result…");
    try {
      const result = await this.game.sessionController.backend.completeMission(this.code, this.completeActionId || (this.completeActionId = crypto.randomUUID()));\n      this.completeActionId = null;
      this.status = "completed";
      this.marker.visible = false;
      const cloud = this.game.playerCloudState || {};
      cloud.wallet = { ...(cloud.wallet || {}), cash: result.cash_balance ?? cloud.wallet?.cash ?? 0 };
      cloud.missions = (cloud.missions || []).map((mission) =>
        mission.mission_code === this.code ? { ...mission, status: "completed" } : mission
      );
      this.game.playerCloudState = cloud;
      this.render();
      this.setMessage("Mission complete · +$" + Number(result.reward_cash || 0).toLocaleString());
    } catch (error) {
      this.setMessage(error.message || "Mission reward could not be saved. Try again.", true);
    } finally {
      this.busy = false;
    }
  }

  update() {
    if (!this.marker || !this.marker.visible) return;
    this.marker.rotation.y += Math.min(this.game.time.delta || 0, 0.05) * 0.45;
    if (this.status !== "active" || this.busy) return;
    const vehicle = this.game.world.vehicle;
    if (vehicle?.isDriving && vehicle.car.position.distanceTo(this.target) <= this.radius) {
      this.complete();
    }
  }

  destroy() {
    this.panel?.remove();
    this.scene?.remove(this.marker);
  }
}
