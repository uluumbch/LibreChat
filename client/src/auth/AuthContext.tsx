import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@hermes/shared';
import { apiRequest, setAccessToken, setOnUnauthorized } from '~/api/client';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  status: Status;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { token: string };
    return data.token;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const applyToken = useCallback((value: string | null) => {
    setTokenState(value);
    setAccessToken(value);
  }, []);

  const clear = useCallback(() => {
    applyToken(null);
    setUserState(null);
    setStatus('unauthenticated');
  }, [applyToken]);

  // Bootstrap an existing session from the refresh cookie.
  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await refreshToken();
      if (!active) {
        return;
      }
      if (!fresh) {
        clear();
        return;
      }
      applyToken(fresh);
      try {
        const me = await apiRequest<User>('GET', '/api/auth/me');
        if (!active) {
          return;
        }
        setUserState(me);
        setStatus('authenticated');
      } catch {
        if (active) {
          clear();
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [applyToken, clear]);

  useEffect(() => {
    setOnUnauthorized(() => clear());
    return () => setOnUnauthorized(null);
  }, [clear]);

  // Keep the access token fresh so long-lived SSE requests don't 401 mid-stream.
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const interval = setInterval(
      () => {
        void (async () => {
          const fresh = await refreshToken();
          if (fresh) {
            applyToken(fresh);
          }
        })();
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [status, applyToken]);

  const login = useCallback(
    async (input: LoginRequest) => {
      const data = await apiRequest<AuthResponse>('POST', '/api/auth/login', input);
      applyToken(data.token);
      setUserState(data.user);
      setStatus('authenticated');
    },
    [applyToken],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const data = await apiRequest<AuthResponse>('POST', '/api/auth/register', input);
      applyToken(data.token);
      setUserState(data.user);
      setStatus('authenticated');
    },
    [applyToken],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch {
      // ignore network/logout errors
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, status, login, register, logout, setUser: setUserState }),
    [user, token, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
