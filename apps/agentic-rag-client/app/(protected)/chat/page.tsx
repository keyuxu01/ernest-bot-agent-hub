import { AccessGuard } from '../../_components/access-guard';
import ChatPage from '../../_views/ChatPage';

const ChatRoute = () => (
  <AccessGuard permission="search">
    <ChatPage />
  </AccessGuard>
);

export default ChatRoute;
