const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jgoygfnlvgognltxtfyf.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_a584PmZ-2uU1T-nfMIdiiQ_xufAyAkn";
const SESSION_KEY = "open-world-game-session-v1";

export default class GameBackend {
  constructor() {
    this.enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
    this.session = this.readSession();
  }

  readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }

  storeSession(session) {
    if (session?.access_token && !session.expires_at && session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
    }
    this.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async authRequest(path, body) {
    if (!this.enabled) throw new Error("Game backend is not configured.");
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Authentication failed");
    if (data.access_token) this.storeSession(data);
    return data;
  }

  signUp(email, password) {
    return this.authRequest("signup", { email, password });
  }

  signIn(email, password) {
    return this.authRequest("token?grant_type=password", { email, password });
  }

  async refreshSession() {
    if (!this.session?.refresh_token) throw new Error("Your session expired. Please sign in again.");
    return this.authRequest("token?grant_type=refresh_token", {
      refresh_token: this.session.refresh_token,
    });
  }

  async ensureSession() {
    if (!this.session?.access_token) throw new Error("Please sign in first.");
    const expiresAt = Number(this.session.expires_at || 0);
    if (expiresAt && expiresAt * 1000 < Date.now() + 60000) await this.refreshSession();
    return this.session.access_token;
  }

  async gameRequest(payload) {
    if (!this.enabled) throw new Error("Game backend is not configured.");
    const token = await this.ensureSession();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/game-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Game backend request failed");
    return data;
  }

  bootstrap(displayName = "Player") {
    return this.gameRequest({ action: "bootstrap", display_name: displayName });
  }
  load() { return this.gameRequest({ action: "load" }); }
  save(checkpoint, playtimeSeconds = 0) {
    return this.gameRequest({ action: "save", checkpoint, playtime_seconds: playtimeSeconds });
  }
  addInventoryItem(itemCode, quantity = 1, actionId = crypto.randomUUID()) {
    return this.gameRequest({ action: "inventory_pickup", item_code: itemCode, quantity, action_id: actionId });
  }
  startMission(missionCode, actionId = crypto.randomUUID()) {
    return this.gameRequest({ action: "mission_start", mission_code: missionCode, action_id: actionId });
  }
  completeMission(missionCode, actionId = crypto.randomUUID()) {
    return this.gameRequest({ action: "mission_complete", mission_code: missionCode, action_id: actionId });
  }

  signOut() {
    const token = this.session?.access_token;
    this.storeSession(null);
    if (token && this.enabled) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
}
