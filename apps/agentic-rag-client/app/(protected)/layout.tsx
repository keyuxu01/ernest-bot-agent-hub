import type { ReactNode } from 'react';
import { AccessGuard } from '../_components/access-guard';
import { AppLayout } from '../_components/app-layout';

const ProtectedLayout = ({ children }: { children: ReactNode }) => {
  return (
    <AccessGuard>
      <AppLayout>{children}</AppLayout>
    </AccessGuard>
  );
};

export default ProtectedLayout;
