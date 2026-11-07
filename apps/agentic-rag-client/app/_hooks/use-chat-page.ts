'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { message } from 'antd';
import { aiApi } from '../_lib/api';
import { ApiError } from '../_lib/api-client';
import { useNavigate } from '../_lib/navigation';
import type { ChatBubble, ChatMessage, ChatSession } from '../_types/knowledge-hub';

/**
 * @description Manage persisted AI chat sessions, message loading, and question submission.
 * Network requests use the authenticated RagBusiness API client.
 * @returns Chat page state and actions for the session sidebar and conversation panel.
 */
const useChatPage = () => {
  const navigate = useNavigate();
  const params = useSearchParams();
  const sessionId = params.get('session') || undefined;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      const result = await aiApi.sessions();
      setSessions(result.items);
    } catch {
      // 会话列表失败不阻塞当前问答，与源实现保持一致。
    }
  }, []);

  useEffect(() => {
    aiApi
      .sessions()
      .then(result => setSessions(result.items))
      .catch(() => {
        // 会话列表失败不阻塞当前问答，与源实现保持一致。
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    aiApi
      .messages(sessionId)
      .then((rows: ChatMessage[]) => {
        if (cancelled) return;
        setMessages(
          rows.map(row => ({
            role: row.role,
            content: row.content,
            sources: row.sources,
          })),
        );
      })
      .catch(error => {
        if (cancelled) return;
        message.error(error instanceof ApiError ? error.message : '加载会话失败');
        navigate('/chat', { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, sessionId]);

  const scrollLog = () => {
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  };

  const send = async (asRagOnly = false) => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages(previous => [...previous, { role: 'user', content: text }]);
    setLoading(true);
    scrollLog();

    try {
      if (asRagOnly) {
        const hits = await aiApi.ragSearch(text, topK);
        const content = hits.length
          ? hits
              .map(
                (hit, index) =>
                  `[${index + 1}] ${hit.documentTitle}${hit.heading ? ` / ${hit.heading}` : ''}\n${hit.content.slice(0, 180)}`,
              )
              .join('\n\n')
          : '没有召回到相关块。';
        setMessages(previous => [
          ...previous,
          { role: 'assistant', content: `仅检索结果：\n\n${content}` },
        ]);
      } else {
        const result = await aiApi.chat(text, topK, sessionId);
        setMessages(previous => [
          ...previous,
          { role: 'assistant', content: result.answer, sources: result.sources },
        ]);
        if (result.sessionId && result.sessionId !== sessionId) {
          navigate(`/chat?session=${result.sessionId}`, { replace: true });
        }
        void loadSessions();
      }
      scrollLog();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    try {
      const created = await aiApi.createSession();
      setMessages([]);
      navigate(`/chat?session=${created.id}`);
      void loadSessions();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '创建失败');
    }
  };

  const removeSession = async (id: string) => {
    try {
      await aiApi.removeSession(id);
      if (sessionId === id) {
        setMessages([]);
        navigate('/chat');
      }
      void loadSessions();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  return {
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
  };
};

export { useChatPage };
