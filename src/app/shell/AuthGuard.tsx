// ============================================================
// AuthGuard — Authentication Route Guard (SA-013)
// ============================================================
import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '@lib/supabase';

export function AuthGuard() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    // Primary check: getSession() reads from localStorage synchronously.
    // If there's a session it will be here immediately.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data?.session?.user ? 'authenticated' : 'unauthenticated');
    }).catch(() => {
      if (!cancelled) setStatus('unauthenticated');
    });

    // Secondary: keep status in sync with auth state changes (logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-main">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // Use window.location.href so we leave the SPA entirely and land on the
    // real index.html. The landing-segment.js will NOT redirect because the
    // session is gone. landing-app.js will show the login modal via ?login=1.
    window.location.href = '/?login=1';
    return (
      <div className="flex items-center justify-center h-screen bg-bg-main">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

export default AuthGuard;
