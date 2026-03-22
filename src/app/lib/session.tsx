import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@lib/supabase';

interface SessionContextValue {
  user: User | null;
  ready: boolean;
}

const SessionContext = createContext<SessionContextValue>({ user: null, ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // DIAGNOSTIC: log every localStorage key so we can see what the auth wrote
    const allKeys = Object.keys(localStorage);
    console.log('[SessionProvider] localStorage keys on mount:', allKeys);
    console.log('[SessionProvider] supabase storageKey in use:', (supabase.auth as any).storageKey ?? 'unknown');

    supabase.auth.getSession().then(({ data, error }) => {
      console.log('[SessionProvider] getSession result:', {
        hasSession: !!data?.session,
        userId: data?.session?.user?.id ?? null,
        error: error?.message ?? null,
        expiresAt: data?.session?.expires_at ?? null,
      });
      setUser(data?.session?.user ?? null);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[SessionProvider] onAuthStateChange:', event, {
        hasSession: !!session,
        userId: session?.user?.id ?? null,
      });
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ user, ready }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function useUser(): User | null {
  return useContext(SessionContext).user;
}
