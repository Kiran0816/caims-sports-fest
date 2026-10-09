import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { setAdmin((await api.get('/auth/me')).admin); } catch { setAdmin(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = async (username, password) => { const r = await api.post('/auth/login', { username, password }); setAdmin(r.admin); return r.admin; };
  const logout = async () => { try { await api.post('/auth/logout'); } catch { /* ignore */ } setAdmin(null); };
  return <Ctx.Provider value={{ admin, ready, login, logout, refresh }}>{children}</Ctx.Provider>;
}
