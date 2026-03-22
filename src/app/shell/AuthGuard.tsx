import { Outlet } from 'react-router-dom';
import { SessionProvider } from '@lib/session';

// AuthGuard wraps the app in SessionProvider so pages can access the session.
// It NEVER blocks rendering — pages always load. SessionProvider populates
// user asynchronously after reading localStorage.
export function AuthGuard() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

export default AuthGuard;
