let token = null;
export const setToken = (t) => { token = t; };

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-guest-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Socket.IO request/response: resolves with the ack payload or rejects with its error. */
export function emit(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected to the server.'));
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('The server took too long to answer.'));
      if (!res?.ok) return reject(new Error(res?.error ?? 'Something went wrong.'));
      resolve(res);
    });
  });
}

export const storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};
