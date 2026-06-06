import { apiFetch } from '@/lib/api'
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
      const response = await apiFetch('/api/auth/me');
      
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

  return (
    <UserContext.Provider value={{ user, loading, error, refetchUser: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
