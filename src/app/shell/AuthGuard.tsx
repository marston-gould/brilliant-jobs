// ============================================================
// AuthGuard — Authentication Route Guard (SA-013)
// ============================================================
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '@lib/supabase';

export function AuthGuard() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let cancelled = false;

    // Static import — supabase client already in bundle, no dynamic import
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data?.session?.user ? 'authenticated' : 'unauthenticated');
    }).catch(() => {
      if (!cancelled) setStatus('unauthenticated');
    });

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-dim">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    window.location.href = '/';
    return null;
  }

  return <Outlet />;
}

export default AuthGuard;
