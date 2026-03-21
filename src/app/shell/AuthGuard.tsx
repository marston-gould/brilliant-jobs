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

    // Check session — onAuthStateChange fires INITIAL_SESSION on load
    // which is the most reliable signal after signInWithPassword
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      }
    });

    // Also do a direct getSession() as fallback in case onAuthStateChange
    // already fired before we subscribed
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data?.session?.user) {
        setStatus('authenticated');
      }
      // Don't set unauthenticated here — let onAuthStateChange handle it
      // to avoid race with SIGNED_IN event
    }).catch(() => {});

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
    // Don't use window.location — causes redirect loop with landing-segment.js
    // Show inline message with link instead
    return (
      <div className="flex items-center justify-center h-screen bg-bg-main">
        <div className="text-center">
          <p className="text-text-dim text-sm mb-3">Session expired or not logged in.</p>
          <a href="/" className="text-accent text-sm underline">Go to login</a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default AuthGuard;
