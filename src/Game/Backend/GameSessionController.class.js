import GameBackend from "./GameBackend.class";

export default class GameSessionController {
  constructor(game) {
    this.game = game;
    this.backend = new GameBackend();
    this.connected = false;
    this.busy = false;
    this.playtimeSeconds = 0;
    this.saveTimer = null;
    this.createPanel();

    if (!this.backend.enabled) {
      this.setStatus("Cloud services are not configured. Guest mode is available.");
      return;
    }
    if (this.backend.session?.access_token) {
      this.connectExistingSession();
    } else {
      this.setStatus("Sign in to save your world and progress across devices.");
    }

    this.saveTimer = window.setInterval(() => {
      if (this.connected && !this.game.isPaused) this.saveNow(true);
    }, 45000);
    window.addEventListener("pagehide", () => {
      if (this.connected) this.saveNow(true);
    });
  }

  createPanel() {
    const panel = document.createElement("section");
    panel.id = "game-account-panel";
    panel.className = "game-account-panel";
    panel.innerHTML = `
      <div class="game-account-head">
        <div><span class="game-account-kicker">PLAYER ACCOUNT</span><strong class="game-account-title">Cloud Save</strong></div>
        <button type="button" class="game-account-close" aria-label="Continue as guest">×</button>
      </div>
      <p class="game-account-status" aria-live="polite"></p>
      <form class="game-account-form">
        <input class="game-account-email" type="email" autocomplete="email" placeholder="Email address" required />
        <input class="game-account-password" type="password" autocomplete="current-password" placeholder="Password (at least 6 characters)" minlength="6" required />
        <div class="game-account-actions">
          <button type="submit" class="game-account-login">SIGN IN</button>
          <button type="button" class="game-account-signup">CREATE ACCOUNT</button>
        </div>
      </form>
      <div class="game-account-connected" hidden>
        <button type="button" class="game-account-save">SAVE NOW</button>
        <button type="button" class="game-account-logout">SIGN OUT</button>
      </div>
      <div class="game-account-foot">Guest play remains available. Never share your password.</div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    this.statusNode = panel.querySelector(".game-account-status");
    this.form = panel.querySelector(".game-account-form");
    this.emailInput = panel.querySelector(".game-account-email");
    this.passwordInput = panel.querySelector(".game-account-password");
    this.connectedActions = panel.querySelector(".game-account-connected");
    this.walletNode = document.createElement("div");
    this.walletNode.id = "wallet-hud";
    this.walletNode.hidden = true;
    document.body.appendChild(this.walletNode);

    panel.querySelector(".game-account-head").addEventListener("click", () => panel.classList.toggle("collapsed"));
    panel.querySelector(".game-account-close").addEventListener("click", (event) => { event.stopPropagation(); panel.classList.add("collapsed"); });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.signIn();
    });
    panel.querySelector(".game-account-signup").addEventListener("click", () => this.signUp());
    panel.querySelector(".game-account-save").addEventListener("click", () => this.saveNow(false));
    panel.querySelector(".game-account-logout").addEventListener("click", () => this.signOut());
  }

  tick(delta) {
    if (this.connected && Number.isFinite(delta)) this.playtimeSeconds += Math.max(0, Math.min(delta, 0.1));
  }

  setStatus(message, error = false) {
    if (!this.statusNode) return;
    this.statusNode.textContent = message;
    this.statusNode.classList.toggle("error", error);
  }

  setBusy(value) {
    this.busy = value;
    this.panel.querySelectorAll("button,input").forEach((element) => { element.disabled = value; });
  }

  async signUp() {
    if (this.busy) return;
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    if (!email || password.length < 6) {
      this.setStatus("Enter a valid email and a password with at least 6 characters.", true);
      return;
    }
    this.setBusy(true);
    try {
      const result = await this.backend.signUp(email, password);
      if (!result.access_token) {
        this.setStatus("Account created. Check your email to confirm it, then sign in.");
      } else {
        await this.finishConnection();
      }
    } catch (error) {
      this.setStatus(error.message || "Could not create account.", true);
    } finally {
      this.setBusy(false);
    }
  }

  async signIn() {
    if (this.busy) return;
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    if (!email || !password) {
      this.setStatus("Enter your email and password.", true);
      return;
    }
    this.setBusy(true);
    try {
      await this.backend.signIn(email, password);
      await this.finishConnection();
    } catch (error) {
      this.setStatus(error.message || "Sign-in failed.", true);
    } finally {
      this.setBusy(false);
    }
  }

  async connectExistingSession() {
    this.setBusy(true);
    try {
      await this.finishConnection();
    } catch (error) {
      this.backend.signOut();
      this.setStatus(error.message || "Session expired. Please sign in again.", true);
    } finally {
      this.setBusy(false);
    }
  }

  async finishConnection() {
    this.setStatus("Connecting your player profile…");
    await this.backend.bootstrap("Player");
    const state = await this.backend.load();
    this.applyLoadedState(state);
    this.game.world?.missions?.applyPlayerMissions(state.missions || [], state.mission_definitions || []);
    this.playtimeSeconds = Math.max(0, Number(state.save?.playtime_seconds || 0));
    this.connected = true;
    this.renderWallet(state.wallet);
    this.form.hidden = true;
    this.connectedActions.hidden = false;
    this.panel.classList.add("connected", "collapsed");
    const name = state.profile?.display_name || "Player";
    this.setStatus("Cloud save connected · " + name);
    this.game.playerCloudState = state;
  }

  applyLoadedState(state) {
    const checkpoint = state.save?.checkpoint || {};
    const player = this.game.world?.player?.player;
    const vehicle = this.game.world?.vehicle;
    if (player && Array.isArray(checkpoint.playerPosition) && checkpoint.playerPosition.length === 3) {
      player.position.set(...checkpoint.playerPosition);
    }
    if (player && Number.isFinite(checkpoint.playerRotationY)) player.rotation.y = checkpoint.playerRotationY;
    if (vehicle?.car && Array.isArray(checkpoint.vehiclePosition) && checkpoint.vehiclePosition.length === 3) {
      vehicle.car.position.set(...checkpoint.vehiclePosition);
    }
    if (vehicle?.car && Number.isFinite(checkpoint.vehicleRotationY)) vehicle.car.rotation.y = checkpoint.vehicleRotationY;
    if (vehicle && typeof checkpoint.isDriving === "boolean") {
      vehicle.isDriving = checkpoint.isDriving;
      if (player) player.visible = !checkpoint.isDriving;
      vehicle.updatePrompt();
    }

    if (vehicle) {
      vehicle.isOwned = (state.vehicles || []).some((entry) => entry.vehicle_code === vehicle.vehicleCode);
      vehicle.car.visible = vehicle.isOwned;
      vehicle.updatePrompt();
    }
    const combat = this.game.world?.combat;
    if (combat) {
      if (Number.isInteger(checkpoint.ammo)) combat.ammo = Math.max(0, Math.min(combat.magazineSize, checkpoint.ammo));
      if (Number.isInteger(checkpoint.reserveAmmo)) combat.reserveAmmo = Math.max(0, Math.min(999, checkpoint.reserveAmmo));
      combat.renderHud();
    }
    const wanted = state.stats?.wanted_level;
    if (Number.isInteger(wanted) && this.game.world?.police) {
      this.game.world.police.wantedLevel = Math.max(0, Math.min(5, wanted));
      this.game.world.police.renderWanted();
    }
  }

  renderWallet(wallet = {}) {
    if (!this.walletNode) return;
    this.walletNode.hidden = false;
    this.walletNode.textContent = "CASH  $" + Number(wallet.cash || 0).toLocaleString();
  }

  buildCheckpoint() {
    const player = this.game.world?.player?.player;
    const vehicle = this.game.world?.vehicle;
    const combat = this.game.world?.combat;
    return {
      version: 1,
      playerPosition: player ? [player.position.x, player.position.y, player.position.z] : [0, 0, 0],
      playerRotationY: player?.rotation.y || 0,
      vehiclePosition: vehicle?.car ? [vehicle.car.position.x, vehicle.car.position.y, vehicle.car.position.z] : [0, 0, 0],
      vehicleRotationY: vehicle?.car?.rotation.y || 0,
      isDriving: Boolean(vehicle?.isDriving),
      ammo: combat?.ammo ?? 12,
      reserveAmmo: combat?.reserveAmmo ?? 60,
    };
  }

  async saveNow(silent = false) {
    if (!this.connected || this.busy) return;
    this.busy = true;
    try {
      await this.backend.save(this.buildCheckpoint(), this.playtimeSeconds);
      if (!silent) this.setStatus("Your game progress has been saved.");
    } catch (error) {
      if (!silent) this.setStatus(error.message || "Cloud save failed.", true);
    } finally {
      this.busy = false;
    }
  }

  async signOut() {
    if (this.connected) await this.saveNow(true);
    this.backend.signOut();
    this.connected = false;
    this.form.hidden = false;
    this.connectedActions.hidden = true;
    this.panel.classList.remove("connected");
    this.panel.classList.remove("collapsed");
    this.setStatus("Signed out. You can continue as a guest or sign in again.");
  }

  destroy() {
    if (this.saveTimer) window.clearInterval(this.saveTimer);
    this.panel?.remove();
    this.walletNode?.remove();
  }
}
