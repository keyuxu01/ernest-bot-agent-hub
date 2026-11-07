import { AccessGuard } from '../../../_components/access-guard';
import TeamsPage from '../../../_views/admin/TeamsPage';

const TeamsRoute = () => (
  <AccessGuard role="admin">
    <TeamsPage />
  </AccessGuard>
);

export default TeamsRoute;
