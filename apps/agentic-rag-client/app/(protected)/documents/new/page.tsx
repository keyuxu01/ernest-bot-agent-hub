import { AccessGuard } from '../../../_components/access-guard';
import DocumentEditPage from '../../../_views/DocumentEditPage';

const NewDocumentRoute = () => (
  <AccessGuard permission="document:create">
    <DocumentEditPage />
  </AccessGuard>
);

export default NewDocumentRoute;
