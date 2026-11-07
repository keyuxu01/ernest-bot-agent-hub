import { AccessGuard } from '../../_components/access-guard';
import GraphPage from '../../_views/GraphPage';

const GraphRoute = () => (
  <AccessGuard permission="search">
    <GraphPage />
  </AccessGuard>
);

export default GraphRoute;
