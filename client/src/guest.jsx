import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError, api, setToken, storage } from './api.js';

const KEY = 'dicebound.guest';
const GuestContext = createContext(null);
export const useGuest = () => useContext(GuestContext);

async function createGuest(name) {
  const guest = await api('/guest', { method: 'POST', body: { name } });
  storage.set(KEY, guest);
  setToken(guest.token);
  return guest;
}

export function GuestProvider({ children }) {
  const [guest, setGuest] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);

  const bootstrap = useCallback(async () => {
    setError(null);
    try {
      const saved = storage.get(KEY);
      if (saved?.token) {
        setToken(saved.token);
        try {
          const me = await api('/me');
          const merged = { ...saved, ...me };
          storage.set(KEY, merged);
          return setGuest(merged);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 401)) throw err;
        }
      }
      setGuest(await createGuest(saved?.name));
    } catch {
      setError('The tavern is unreachable. Is the server running?');
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (!guest?.token) return undefined;
    const s = io({ auth: { token: guest.token } });
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('connect_error', (err) => {
      setOnline(false);
      if (err.message === 'unauthorised') createGuest(guest.name).then(setGuest);
    });
    setSocket(s);
    return () => { s.close(); };
  }, [guest?.token]);

  const rename = useCallback(async (name) => {
    const me = await api('/me', { method: 'PATCH', body: { name } });
    setGuest((g) => {
      const next = { ...g, ...me };
      storage.set(KEY, next);
      return next;
    });
  }, []);

  return (
    <GuestContext.Provider value={{ guest, socket, online, rename, error, retry: bootstrap }}>
      {children}
    </GuestContext.Provider>
  );
}
