import { AccessGuard } from '../../../_components/access-guard';
import RolesPage from '../../../_views/admin/RolesPage';

const RolesRoute = () => (
  <AccessGuard role="admin">
    <RolesPage />
  </AccessGuard>
);

export default RolesRoute;
