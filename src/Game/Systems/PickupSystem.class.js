import * as THREE from "three";
import Game from "../Game.class";

export default class PickupSystem {
  constructor() {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.pickups = [];
    this.nearby = null;
    this.busy = false;
    this.createPickup("pistol_ammo", 30, new THREE.Vector3(-3, 0, 10));
    this.createPickup("pistol_ammo", 30, new THREE.Vector3(-18, 0, -8));
    this.createButton();
  }

  createPickup(itemCode, quantity, position) {
    const root = new THREE.Group();
    root.position.copy(position);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 0.16, 12),
      new THREE.MeshBasicMaterial({ color: 0x1d4b43 })
    );
    base.position.y = 0.1;
    root.add(base);
    const capsule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.58, 10),
      new THREE.MeshBasicMaterial({ color: 0x76f0c1 })
    );
    capsule.position.y = 0.52;
    root.add(capsule);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.055, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xb4ffe4 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.2;
    root.add(glow);
    this.scene.add(root);
    this.pickups.push({
      pendingActionId: null,
      itemCode,
      quantity,
      root,
      available: true,
      respawn: 0,
      pendingActionId: null,
    });
  }

  createButton() {
    const panel = document.createElement("div");
    panel.id = "pickup-panel";
    panel.className = "pickup-panel";
    panel.innerHTML = `
      <p class="pickup-status">ITEM NEARBY</p>
      <button type="button" class="pickup-action">PICK UP AMMO +30</button>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    this.statusNode = panel.querySelector(".pickup-status");
    this.button = panel.querySelector(".pickup-action");
    this.button.addEventListener("click", () => this.collect());
    this.panel.hidden = true;
  }

  setStatus(message, error = false) {
    this.statusNode.textContent = message;
    this.statusNode.classList.toggle("error", error);
  }

  async collect() {
    if (!this.nearby || this.busy) return;
    const session = this.game.sessionController;
    if (!session?.connected) {
      this.setStatus("Sign in to collect and save inventory.", true);
      return;
    }
    this.busy = true;
    this.button.disabled = true;
    this.setStatus("Adding ammunition to your inventory…");
    try {
      const pickup = this.nearby;
      const result = await session.backend.addInventoryItem(
        pickup.itemCode,
        pickup.quantity,
        pickup.pendingActionId || (pickup.pendingActionId = crypto.randomUUID())
      );
      const added = Math.max(0, Number(result.added_quantity || 0));
      if (added > 0) {
        const combat = this.game.world.combat;
        combat.reserveAmmo = Math.min(240, combat.reserveAmmo + added);
        combat.renderHud();
        const cloud = this.game.playerCloudState || {};
        const inventory = [...(cloud.inventory || [])];
        const existing = inventory.find((item) => item.item_code === pickup.itemCode);
        if (existing) existing.quantity = result.quantity;
        else inventory.push({ item_code: pickup.itemCode, quantity: result.quantity });
        cloud.inventory = inventory;
        this.game.playerCloudState = cloud;
        pickup.pendingActionId = null;
        pickup.pendingActionId = null;
        pickup.available = false;
        pickup.root.visible = false;
        pickup.respawn = 45;
        this.setStatus("+" + added + " ammunition added to inventory.");
      } else {
        pickup.pendingActionId = null;
        this.setStatus("Your ammunition stack is already full.", true);
      }
    } catch (error) {
      this.setStatus(error.message || "Pickup failed. Try again.", true);
    } finally {
      this.busy = false;
      this.button.disabled = false;
    }
  }

  update() {
    const dt = Math.min(this.game.time.delta || 0.016, 0.05);
    const world = this.game.world;
    const player = world?.player?.player;
    if (!player) return;
    let closest = null;
    let closestDistance = 2.7;
    for (const pickup of this.pickups) {
      if (!pickup.available) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) {
          pickup.available = true;
          pickup.root.visible = true;
        }
        continue;
      }
      pickup.root.rotation.y += dt * 0.55;
      pickup.root.position.y = 0.08 + Math.sin(this.game.time.elapsedTime * 2.1) * 0.09;
      const distance = player.position.distanceTo(pickup.root.position);
      if (!world.vehicle.isDriving && distance < closestDistance) {
        closest = pickup;
        closestDistance = distance;
      }
    }
    this.nearby = closest;
    this.panel.hidden = !closest;
    if (closest && !this.busy) this.setStatus("AMMO PICKUP · +" + closest.quantity);
  }

  destroy() {
    this.panel?.remove();
    this.pickups.forEach((pickup) => this.scene.remove(pickup.root));
  }
}
