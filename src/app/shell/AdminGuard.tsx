// ============================================================
// AdminGuard — Role-Based Route Guard (SA-013)
// ============================================================
// Wraps admin routes. Redirects non-admin users to /app/feed.
// During dual-mode: checks window.BJ for admin role.
// Post-migration: uses UserProvider exclusively.
// ============================================================

import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useUser } from '@providers';

export function AdminGuard() {
  const userProvider = useUser();
  const [status, setStatus] = useState<'loading' | 'admin' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;
    userProvider.getCurrentUser().then((user) => {
      if (cancelled) return;
      setStatus(user?.role === 'admin' ? 'admin' : 'denied');
    }).catch(() => {
      if (!cancelled) setStatus('denied');
    });
    return () => { cancelled = true; };
  }, [userProvider]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'denied') {
    return <Navigate to="/app/feed" replace />;
  }

  return <Outlet />;
}

export default AdminGuard;
