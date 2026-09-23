'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types/auth';

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  refetchUser: () => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/auth/me');
      
      if (!response.ok) {
        setUser(null);
        return;
      }
      
      const data = await response.json();
      // The API returns { user: { id, email, role } }
      setUser(data.user);
    } catch (err) {
      console.error('Error fetching user:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  /**
   * What happens when the session really has ended.
   *
   * The server renews a session that is merely idle (middleware and
   * `verifyAuth` both do it), so a 401 now means one thing: the refresh token
   * is gone too, after seven days. Until this existed nothing said so — every
   * screen just showed "Failed to load…" and every role-gated button quietly
   * vanished, and the only way out was a manual reload.
   *
   * It is patched onto `window.fetch` rather than added to a shared helper
   * because there are around 150 `fetch(` call sites; this covers all of them
   * at once, and the cleanup puts the original back.
   */
  useEffect(() => {
    const original = window.fetch;
    let leaving = false;

    window.fetch = async (input, init) => {
      const response = await original(input, init);

      if (response.status === 401 && !leaving) {
        const href =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(href, window.location.origin);

        // Our own API only. A wrong password on /api/auth/login is a 401 the
        // login form has to keep handling itself, and redirecting while already
        // on /login would loop.
        const isOurApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
        const isAuthCall = url.pathname.startsWith('/api/auth/');
        const onLoginPage = window.location.pathname.startsWith('/login');

        if (isOurApi && !isAuthCall && !onLoginPage) {
          leaving = true;
          setUser(null);
          const from = window.location.pathname + window.location.search;
          window.location.assign(`/login?from=${encodeURIComponent(from)}&reason=expired`);
        }
      }

      return response;
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  /**
   * A tab left open overnight comes back with a stale `user`, which turns every
   * `role === 'ADMIN'` check false and hides controls the person still has.
   * Asking again when the tab is focused costs one request and repairs it.
   */
  useEffect(() => {
    const onFocus = () => { void fetchUser(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, error, refetchUser: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
