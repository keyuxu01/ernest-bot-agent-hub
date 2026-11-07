import { AccessGuard } from '../../_components/access-guard';
import SearchPage from '../../_views/SearchPage';

const SearchRoute = () => (
  <AccessGuard permission="search">
    <SearchPage />
  </AccessGuard>
);

export default SearchRoute;
