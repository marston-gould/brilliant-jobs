// ============================================================
// SessionContext — Single source of truth for auth session
// ============================================================
// AuthGuard establishes the session once and provides it via
// context. All pages/hooks read from here instead of calling
// getUser() independently on mount.
// ============================================================

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@lib/supabase';

interface SessionContextValue {
  user: User | null;
  ready: boolean; // true once session check completes
}

const SessionContext = createContext<SessionContextValue>({ user: null, ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Get session from localStorage — synchronous read, no network call if not expired
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null);
      setReady(true);
    });

    // Keep in sync with auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

// Convenience hook — returns user, waits for ready
export function useUser(): User | null {
  return useContext(SessionContext).user;
}
