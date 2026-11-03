const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
    this.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async authRequest(path, body) {
    if (!this.enabled) throw new Error("Game backend is not configured. Add the VITE_SUPABASE settings.");
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

  async signUp(email, password) {
    return this.authRequest("signup", { email, password });
  }

  async signIn(email, password) {
    return this.authRequest("token?grant_type=password", { email, password });
  }

  async refreshSession() {
    if (!this.session?.refresh_token) throw new Error("Please sign in again.");
    const data = await this.authRequest("token?grant_type=refresh_token", {
      refresh_token: this.session.refresh_token,
    });
    return data;
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

  load() {
    return this.gameRequest({ action: "load" });
  }

  save(checkpoint, playtimeSeconds = 0) {
    return this.gameRequest({
      action: "save",
      checkpoint,
      playtime_seconds: playtimeSeconds,
    });
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
