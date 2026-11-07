import { AccessGuard } from '../../../_components/access-guard';
import DocumentDetailPage from '../../../_views/DocumentDetailPage';

const DocumentDetailRoute = () => (
  <AccessGuard permission="document:list">
    <DocumentDetailPage />
  </AccessGuard>
);

export default DocumentDetailRoute;
