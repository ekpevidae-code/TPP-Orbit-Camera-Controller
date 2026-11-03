const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'velocity-run.access-token';
export class VelocityAPIError extends Error {
  constructor(message, status, details) { super(message); this.name = 'VelocityAPIError'; this.status = status; this.details = details; }
}
export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) { if (value) localStorage.setItem(TOKEN_KEY, value); else localStorage.removeItem(TOKEN_KEY); },
  get authenticated() { return Boolean(this.token); },
  logout() { this.token = null; }
};
async function request(path, { method = 'GET', body, auth = true, idempotencyKey } = {}) {
  if (!API_BASE) throw new VelocityAPIError('Account services are not configured. Set VITE_API_URL to the deployed Velocity Run API address.', 0);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers.Authorization = 'Bearer ' + session.token;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit' });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) session.logout(); throw new VelocityAPIError(data?.error || 'Request failed (' + response.status + ')', response.status, data?.details); }
  return data;
}
export async function registerAccount(input) { const result = await request('/api/auth/register', { method: 'POST', body: input, auth: false }); session.token = result.accessToken; return result; }
export async function loginAccount(input) { const result = await request('/api/auth/login', { method: 'POST', body: input, auth: false }); session.token = result.accessToken; return result; }
export const logoutAccount = () => session.logout();
export const getGarage = () => request('/api/garage');
export const purchaseCar = carModelId => request('/api/garage/purchase', { method: 'POST', body: { carModelId }, idempotencyKey: crypto.randomUUID() });
export const upgradeCar = (playerCarId, stat) => request('/api/garage/upgrade', { method: 'POST', body: { playerCarId, stat }, idempotencyKey: crypto.randomUUID() });
export const selectCar = playerCarId => request('/api/garage/select', { method: 'POST', body: { playerCarId } });
export const submitRaceResult = result => request('/api/races/results', { method: 'POST', body: result, idempotencyKey: crypto.randomUUID() });
