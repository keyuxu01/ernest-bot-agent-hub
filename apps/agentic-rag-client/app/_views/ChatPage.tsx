'use client';

import { ChatConversation } from '../_components/chat-conversation';
import { ChatSessionSidebar } from '../_components/chat-session-sidebar';
import { useChatPage } from '../_hooks/use-chat-page';
import { useNavigate } from '../_lib/navigation';

/**
 * @description Compose persisted AI chat sessions with the active conversation.
 */
const ChatPage = () => {
  const navigate = useNavigate();
  const {
    createSession,
    input,
    loading,
    logRef,
    messages,
    removeSession,
    send,
    sessionId,
    sessions,
    setInput,
    setTopK,
    topK,
  } = useChatPage();

  return (
    <div className="kh-page kh-chat-layout">
      <ChatSessionSidebar
        activeSessionId={sessionId}
        sessions={sessions}
        onCreate={() => void createSession()}
        onRemove={id => void removeSession(id)}
        onSelect={id => navigate(`/chat?session=${id}`)}
      />
      <ChatConversation
        input={input}
        loading={loading}
        logRef={logRef}
        messages={messages}
        topK={topK}
        onInputChange={setInput}
        onSend={asRagOnly => void send(asRagOnly)}
        onTopKChange={setTopK}
      />
    </div>
  );
};

export default ChatPage;
