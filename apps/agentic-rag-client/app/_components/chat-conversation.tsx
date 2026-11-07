'use client';

import { Button, Empty, Input, Listy, Space, Typography } from 'antd';
import type { RefObject } from 'react';
import { Link } from '../_lib/navigation';
import type { ChatBubble } from '../_types/knowledge-hub';

type ChatConversationProps = {
  input: string;
  loading: boolean;
  logRef: RefObject<HTMLDivElement | null>;
  messages: ChatBubble[];
  topK: number;
  onInputChange: (value: string) => void;
  onSend: (asRagOnly?: boolean) => void;
  onTopKChange: (value: number) => void;
};

/**
 * @description Render current AI chat messages and question controls.
 */
const ChatConversation = (props: ChatConversationProps) => {
  const { input, loading, logRef, messages, onInputChange, onSend, onTopKChange, topK } =
    props;

  return (
    <div className="kh-chat-main">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        知识问答
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        走混合检索后再生成。无召回不会调模型。问答会写入左侧会话，「仅检索」不落库。
      </Typography.Paragraph>
      <div className="kh-chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="输入问题开始一段对话"
          />
        ) : (
          messages.map((entry, index) => (
            <div key={index} className={`kh-bubble ${entry.role}`}>
              {entry.content}
              {entry.sources?.length ? (
                <Listy
                  items={entry.sources}
                  rowKey={source => `${source.documentId}-${source.index}`}
                  virtual={false}
                  style={{ marginTop: 8, background: '#fff', borderRadius: 8 }}
                  styles={{ item: { padding: '8px 12px' } }}
                  itemRender={source => (
                    <span>
                      [{source.index}]{' '}
                      <Link to={`/documents/${source.documentId}`}>
                        {source.documentTitle}
                      </Link>
                      {source.heading ? ` / ${source.heading}` : ''}
                      <span className="kh-chat-source-excerpt">{source.excerpt}</span>
                    </span>
                  )}
                />
              ) : null}
            </div>
          ))
        )}
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
          onPressEnter={() => onSend(false)}
        />
        <Input
          id="chat-top-k"
          name="chat-top-k"
          size="large"
          style={{ width: 80 }}
          value={topK}
          onChange={event => onTopKChange(Number(event.target.value) || 5)}
        />
        <Button size="large" loading={loading} onClick={() => onSend(true)}>
          仅检索
        </Button>
        <Button
          type="primary"
          size="large"
          loading={loading}
          onClick={() => onSend(false)}
        >
          发送
        </Button>
      </Space.Compact>
    </div>
  );
};

export { ChatConversation };
