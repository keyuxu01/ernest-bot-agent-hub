'use client';

import { useAuth } from '../_lib/auth';
import { Navigate } from '../_lib/navigation';
import LoginPage from '../_views/LoginPage';

const LoginRoute = () => {
  const user = useAuth();

  return user ? <Navigate replace to="/dashboard" /> : <LoginPage />;
};

export default LoginRoute;
