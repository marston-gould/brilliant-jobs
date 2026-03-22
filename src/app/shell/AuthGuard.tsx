// AuthGuard — waits for session, renders app or login link
import { Outlet } from 'react-router-dom';
import { SessionProvider, useSession } from '@lib/session';

function Guard() {
  const { user, ready } = useSession();

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-main">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
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

export function AuthGuard() {
  return (
    <SessionProvider>
      <Guard />
    </SessionProvider>
  );
}

export default AuthGuard;
