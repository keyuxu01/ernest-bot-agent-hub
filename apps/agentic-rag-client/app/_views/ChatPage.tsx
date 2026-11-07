'use client';

import { useRef, useState } from 'react';
import { Link } from '../_lib/navigation';
import { Button, Input, Listy, Space, Typography, message } from 'antd';
import { aiApi } from '../_lib/api';
import { ApiError } from '../_lib/api-client';
import type { ChatSource } from '../_types/knowledge-hub';

interface Bubble {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  async function send(asRagOnly = false) {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      if (asRagOnly) {
        const hits = await aiApi.ragSearch(text, topK);
        const content = hits.length
          ? hits
              .map(
                (h, i) =>
                  `[${i + 1}] ${h.documentTitle}${h.heading ? ` / ${h.heading}` : ''}\n${h.content.slice(0, 180)}`,
              )
              .join('\n\n')
          : '没有召回到相关块。';
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `仅检索结果：\n\n${content}` },
        ]);
      } else {
        const res = await aiApi.chat(text, topK);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: res.answer, sources: res.sources },
        ]);
      }
      requestAnimationFrame(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      });
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-page kh-chat">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        知识问答
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        走混合检索后再生成。无召回不会调模型。当前为一次性返回，不是 SSE。
      </Typography.Paragraph>
      <div className="kh-chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`kh-bubble ${m.role}`}>
            {m.content}
            {m.sources?.length ? (
              <Listy
                items={m.sources}
                rowKey={s => `${s.documentId}-${s.index}`}
                virtual={false}
                style={{ marginTop: 8, background: '#fff', borderRadius: 8 }}
                styles={{ item: { padding: '8px 12px' } }}
                itemRender={s => (
                  <span>
                    [{s.index}]{' '}
                    <Link to={`/documents/${s.documentId}`}>{s.documentTitle}</Link>
                    {s.heading ? ` / ${s.heading}` : ''}
                    <div style={{ color: '#8c8c8c' }}>{s.excerpt}</div>
                  </span>
                )}
              />
            ) : null}
          </div>
        ))}
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          id="chat-content"
          name="chat-content"
          size="large"
          placeholder="例如：上线前如何做金丝雀验证？"
          value={input}
          disabled={loading}
          onChange={e => setInput(e.target.value)}
          onPressEnter={() => void send(false)}
        />
        <Input
          id="chat-top-k"
          name="chat-top-k"
          size="large"
          style={{ width: 80 }}
          value={topK}
          onChange={e => setTopK(Number(e.target.value) || 5)}
        />
        <Button size="large" loading={loading} onClick={() => void send(true)}>
          仅检索
        </Button>
        <Button
          type="primary"
          size="large"
          loading={loading}
          onClick={() => void send(false)}
        >
          发送
        </Button>
      </Space.Compact>
    </div>
  );
}
