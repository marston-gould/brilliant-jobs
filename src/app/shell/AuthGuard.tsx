// ============================================================
// AuthGuard — Authentication Route Guard (SA-013)
// ============================================================
// All /app/* routes require authentication.
// Unauthenticated users are redirected to the landing page.
// ============================================================

import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useUser } from '@providers';

export function AuthGuard() {
  const userProvider = useUser();
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let cancelled = false;
    console.log('[AuthGuard] Starting auth check...');
    userProvider.getCurrentUser().then((user) => {
      console.log('[AuthGuard] getCurrentUser resolved:', user ? 'authenticated' : 'no user');
      if (cancelled) return;
      setStatus(user ? 'authenticated' : 'unauthenticated');
    }).catch((err) => {
      console.error('[AuthGuard] getCurrentUser error:', err);
      if (!cancelled) setStatus('unauthenticated');
    });

    const unsub = userProvider.onAuthChange((user) => {
      if (!cancelled) {
        setStatus(user ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [userProvider]);

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
    // Redirect to landing page for login
    window.location.href = '/';
    return null;
  }

  return <Outlet />;
}

export default AuthGuard;
