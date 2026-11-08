'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty } from 'antd';
import type { MouseEvent } from 'react';
import type { ChatSessionSidebarProps } from '../_types/knowledge-hub';
import { formatTime } from '../_utils/knowledge-hub';

/**
 * @description Render persisted AI chat sessions and disable session changes while streaming.
 */
const ChatSessionSidebar = (props: ChatSessionSidebarProps) => {
  const { activeSessionId, busy, onCreate, onRemove, onSelect, sessions } = props;

  const handleRemove = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    onRemove(id);
  };

  return (
    <aside className="kh-chat-sessions">
      <Button
        type="primary"
        icon={<PlusOutlined />}
        block
        disabled={busy}
        onClick={onCreate}
      >
        新对话
      </Button>
      <div className="kh-chat-session-list">
        {sessions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`kh-chat-session-item${activeSessionId === session.id ? ' active' : ''}${busy ? ' disabled' : ''}`}
              onClick={() => onSelect(session.id)}
            >
              <div className="kh-chat-session-title">{session.title}</div>
              <div className="kh-chat-session-meta">
                <span>{formatTime(session.updatedAt)}</span>
                <Button
                  type="text"
                  size="small"
                  aria-label={`删除会话：${session.title}`}
                  icon={<DeleteOutlined />}
                  onClick={event => handleRemove(event, session.id)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};

export { ChatSessionSidebar };
