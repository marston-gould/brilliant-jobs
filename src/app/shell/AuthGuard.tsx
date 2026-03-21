// AuthGuard — Authentication Route Guard
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '@lib/supabase';

export function AuthGuard() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let cancelled = false;

    // onAuthStateChange fires INITIAL_SESSION immediately on mount.
    // This is the ONLY reliable way to read session state after a cross-page
    // login — getSession() can race with the write from the landing page client.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      }
      if (event === 'SIGNED_OUT') {
        setStatus('unauthenticated');
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
    return (
      <div className="flex items-center justify-center h-screen bg-bg-main">
        <div className="text-center space-y-3">
          <p className="text-text-dim text-sm">Please log in to continue.</p>
          <a href="/" className="inline-block px-4 py-2 bg-accent text-white text-sm rounded-lg">Go to Login</a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default AuthGuard;
