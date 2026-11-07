import { Suspense } from 'react';
import { AccessGuard } from '../../_components/access-guard';
import ChatPage from '../../_views/ChatPage';

const ChatRoute = () => (
  <AccessGuard permission="search">
    <Suspense fallback={<div>加载中...</div>}>
      <ChatPage />
    </Suspense>
  </AccessGuard>
);

export default ChatRoute;
