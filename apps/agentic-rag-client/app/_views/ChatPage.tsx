'use client';

import { ChatConversation } from '../_components/chat-conversation';
import { ChatSessionSidebar } from '../_components/chat-session-sidebar';
import { useChatPage } from '../_hooks/use-chat-page';

/**
 * @description Compose persisted chat sessions with the streamed AI conversation.
 */
const ChatPage = () => {
  const {
    createSession,
    errorMessage,
    input,
    loading,
    logRef,
    messages,
    onLogScroll,
    removeSession,
    send,
    sessionId,
    sessions,
    setInput,
    stop,
    streaming,
    switchSession,
  } = useChatPage();

  return (
    <div className="kh-page kh-chat-layout">
      <ChatSessionSidebar
        activeSessionId={sessionId}
        busy={streaming}
        sessions={sessions}
        onCreate={() => void createSession()}
        onRemove={removeSession}
        onSelect={switchSession}
      />
      <ChatConversation
        errorMessage={errorMessage}
        input={input}
        loading={loading}
        logRef={logRef}
        messages={messages}
        streaming={streaming}
        onInputChange={setInput}
        onLogScroll={onLogScroll}
        onSend={() => void send()}
        onStop={() => void stop()}
      />
    </div>
  );
};

export default ChatPage;
