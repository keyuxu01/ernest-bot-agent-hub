'use client';

import { Button, Empty, Input, Space, Typography } from 'antd';
import type { ChatConversationProps } from '../_types/knowledge-hub';
import { ChatMessageParts } from './chat-message-parts';

/**
 * @description Render streamed AI chat messages, process events, and question controls.
 */
const ChatConversation = (props: ChatConversationProps) => {
  const {
    errorMessage,
    input,
    loading,
    logRef,
    messages,
    onInputChange,
    onLogScroll,
    onSend,
    onStop,
    streaming,
  } = props;

  return (
    <div className="kh-chat-main">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        知识问答
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        只会检索你有权限的文档（公开、所在团队、自己写的）。流式回答会展示检索、思考与联网搜索过程，并写入左侧会话。
      </Typography.Paragraph>
      <div className="kh-chat-log" ref={logRef} onScroll={onLogScroll}>
        {messages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="输入问题开始一段对话"
          />
        ) : (
          messages.map((entry, index) => {
            const liveAssistant =
              streaming && entry.role === 'assistant' && index === messages.length - 1;
            return (
              <div key={entry.id} className={`kh-bubble ${entry.role}`}>
                <ChatMessageParts
                  messageId={entry.id}
                  parts={entry.parts}
                  role={entry.role}
                  showSources={!liveAssistant}
                />
              </div>
            );
          })
        )}
        {errorMessage ? <div className="kh-chat-error">{errorMessage}</div> : null}
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          id="chat-content"
          name="chat-content"
          size="large"
          placeholder="例如：上线前如何做金丝雀验证？"
          value={input}
          disabled={loading}
          onChange={event => onInputChange(event.target.value)}
          onPressEnter={onSend}
        />
        {streaming ? (
          <Button size="large" onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button type="primary" size="large" onClick={onSend}>
            发送
          </Button>
        )}
      </Space.Compact>
    </div>
  );
};

export { ChatConversation };
