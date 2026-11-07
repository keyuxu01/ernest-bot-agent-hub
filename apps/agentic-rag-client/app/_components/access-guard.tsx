'use client';

import type { ReactNode } from 'react';
import { useAuth, useHydrated } from '../_lib/auth';
import { Navigate } from '../_lib/navigation';
import { can, isAdmin, isReviewer } from '../_utils/knowledge-hub';

type AccessGuardProps = {
  children: ReactNode;
  permission?: string;
  role?: 'admin' | 'reviewer';
};

/**
 * @description Enforce migrated client-side permission and role checks for an App Router page.
 */
const AccessGuard = (props: AccessGuardProps) => {
  const { children, permission, role } = props;
  const isHydrated = useHydrated();
  const user = useAuth();

  if (!isHydrated) return null;
  if (!user) return <Navigate replace to="/login" />;
  if (permission && !can(user, permission)) return <Navigate replace to="/dashboard" />;
  if (role === 'admin' && !isAdmin(user)) return <Navigate replace to="/dashboard" />;
  if (role === 'reviewer' && !isReviewer(user))
    return <Navigate replace to="/dashboard" />;

  return children;
};

export { AccessGuard };
