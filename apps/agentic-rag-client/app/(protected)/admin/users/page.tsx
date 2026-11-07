import { AccessGuard } from '../../../_components/access-guard';
import UsersPage from '../../../_views/admin/UsersPage';

const UsersRoute = () => (
  <AccessGuard role="admin">
    <UsersPage />
  </AccessGuard>
);

export default UsersRoute;
