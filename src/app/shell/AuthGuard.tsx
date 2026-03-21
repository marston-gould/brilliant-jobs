import { Outlet } from 'react-router-dom';

export function AuthGuard() {
  return <Outlet />;
}

export default AuthGuard;
