import { AccessGuard } from '../../_components/access-guard';
import ProfilePage from '../../_views/ProfilePage';

const ProfileRoute = () => (
  <AccessGuard permission="profile">
    <ProfilePage />
  </AccessGuard>
);

export default ProfileRoute;
