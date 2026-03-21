import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '@lib/supabase';

export function AuthGuard() {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      }
    });

    // Fallback: if onAuthStateChange hasn't fired after 3s, check directly
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setStatus(data?.session?.user ? 'authenticated' : 'unauthenticated');
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
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
