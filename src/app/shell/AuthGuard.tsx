import { Outlet } from 'react-router-dom';

// AuthGuard: render the app. Session is verified per-provider call.
// Removing the session gate here — it was causing "Please log in" loops
// because supabase.auth.getSession() initializes asynchronously and
// returned null before reading localStorage, blocking all access.
export function AuthGuard() {
  return <Outlet />;
}

export default AuthGuard;
