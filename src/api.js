const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SESSION_KEY = 'velocity-run.supabase-session';

function readSavedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}
let savedSession = readSavedSession();
let refreshInFlight = null;

export class VelocityAPIError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'VelocityAPIError';
    this.status = status;
    this.details = details;
  }
}

export const session = {
  get token() { return savedSession?.access_token || null; },
  get authenticated() {
    return Boolean(savedSession?.access_token && (!savedSession.expires_at || savedSession.expires_at * 1000 > Date.now()));
  },
  setSession(value) {
    savedSession = value?.access_token ? {
      access_token: value.access_token,
      refresh_token: value.refresh_token || savedSession?.refresh_token || null,
      expires_at: value.expires_at || (value.expires_in ? Math.floor(Date.now() / 1000) + value.expires_in : null),
      token_type: value.token_type || 'bearer',
      user: value.user || savedSession?.user || null
    } : null;
    if (savedSession) localStorage.setItem(SESSION_KEY, JSON.stringify(savedSession));
    else localStorage.removeItem(SESSION_KEY);
  },
  logout() { savedSession = null; localStorage.removeItem(SESSION_KEY); }
};

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new VelocityAPIError('Supabase is not configured for this deployment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Vercel project, then redeploy.', 0);
  }
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.msg || data.message || data.error_description || data.error || 'Supabase request failed (' + response.status + ')';
    throw new VelocityAPIError(message, response.status, data);
  }
  return data;
}

async function refreshSession() {
  if (!savedSession?.refresh_token) {
    session.logout();
    return false;
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: savedSession.refresh_token })
    });
    if (!response.ok) { session.logout(); return false; }
    session.setSession(await response.json());
    return true;
  })();
  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
}

async function supabaseRequest(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  assertConfigured();
  const headers = { apikey: SUPABASE_KEY, Accept: 'application/json' };
  const token = auth ? (session.token || SUPABASE_KEY) : SUPABASE_KEY;
  headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(SUPABASE_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit'
  });
  if (response.status === 401 && auth && retry && await refreshSession()) {
    return supabaseRequest(path, { method, body, auth, retry: false });
  }
  return parseResponse(response);
}

export async function registerAccount({ email, username, password }) {
  const result = await supabaseRequest('/auth/v1/signup', {
    method: 'POST', auth: false,
    body: { email, password, data: { username: username.trim() } }
  });
  if (result.access_token) session.setSession(result);
  return { ...result, needsEmailConfirmation: !result.access_token };
}

export async function loginAccount({ email, password }) {
  const result = await supabaseRequest('/auth/v1/token?grant_type=password', {
    method: 'POST', auth: false, body: { email, password }
  });
  session.setSession(result);
  return result;
}

export function logoutAccount() {
  const token = session.token;
  if (token && SUPABASE_URL && SUPABASE_KEY) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token }
    }).catch(() => {});
  }
  session.logout();
}

async function rpc(name, args = {}) {
  return supabaseRequest('/rest/v1/rpc/' + name, { method: 'POST', body: args });
}

export const getGarage = () => rpc('race_get_garage');
export const purchaseCar = carModelId => rpc('race_purchase_car', {
  p_car_model_id: carModelId, p_action_key: crypto.randomUUID()
});
export const upgradeCar = (playerCarId, stat) => rpc('race_upgrade_car', {
  p_player_car_id: playerCarId, p_stat: stat, p_action_key: crypto.randomUUID()
});
export const selectCar = playerCarId => rpc('race_select_car', { p_player_car_id: playerCarId });
export const submitRaceResult = result => rpc('race_record_result', {
  p_player_car_id: result.playerCarId,
  p_track_id: result.trackId,
  p_finish_position: result.finishPosition,
  p_duration_ms: result.durationMs,
  p_distance_meters: result.distanceMeters,
  p_drift_score: result.driftScore
});
