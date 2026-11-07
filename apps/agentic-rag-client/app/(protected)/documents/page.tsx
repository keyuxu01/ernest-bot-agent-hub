import { AccessGuard } from '../../_components/access-guard';
import DocumentsPage from '../../_views/DocumentsPage';

const DocumentsRoute = () => (
  <AccessGuard permission="document:list">
    <DocumentsPage />
  </AccessGuard>
);

export default DocumentsRoute;
