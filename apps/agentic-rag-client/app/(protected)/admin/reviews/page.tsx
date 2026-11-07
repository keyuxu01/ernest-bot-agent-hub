import { AccessGuard } from '../../../_components/access-guard';
import ReviewsPage from '../../../_views/admin/ReviewsPage';

const ReviewsRoute = () => (
  <AccessGuard role="reviewer">
    <ReviewsPage />
  </AccessGuard>
);

export default ReviewsRoute;
