import { AccessGuard } from '../../../../_components/access-guard';
import DocumentEditPage from '../../../../_views/DocumentEditPage';

const EditDocumentRoute = () => (
  <AccessGuard permission="document:edit">
    <DocumentEditPage />
  </AccessGuard>
);

export default EditDocumentRoute;
