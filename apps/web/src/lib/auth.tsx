// Signed-in state and passkey ceremonies.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  register: (registrationToken?: string) => Promise<void>;
  addPasskey: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

type Options<T> = { challengeId: string; options: T };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ signedIn: boolean; user: User | null }>('/auth/me');
      setUser(me.user);
    } catch {
      // Offline at startup: keep whatever we had.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Starts the /auth/me fetch; state updates happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const registerWith = useCallback(
    async (registrationToken?: string) => {
      const opts = await api.post<Options<Parameters<typeof startRegistration>[0]['optionsJSON']>>(
        '/auth/register/options',
        { registrationToken },
      );
      const response = await startRegistration({ optionsJSON: opts.options });
      await api.post('/auth/register/verify', {
        challengeId: opts.challengeId,
        response,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        registrationToken,
      });
      await refresh();
    },
    [refresh],
  );

  const login = useCallback(async () => {
    const opts =
      await api.post<Options<Parameters<typeof startAuthentication>[0]['optionsJSON']>>(
        '/auth/login/options',
      );
    const response = await startAuthentication({ optionsJSON: opts.options });
    await api.post('/auth/login/verify', { challengeId: opts.challengeId, response });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refresh,
        register: registerWith,
        addPasskey: () => registerWith(),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
