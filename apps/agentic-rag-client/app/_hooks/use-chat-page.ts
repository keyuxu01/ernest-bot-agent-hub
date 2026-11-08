'use client';

import { useChat } from '@ai-sdk/react';
import { App, message } from 'antd';
import { DefaultChatTransport } from 'ai';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_ID, CHAT_STREAM_PATH } from '../../constants/chat';
import { resolveApiBaseUrl } from '../../utils/resolve-api-base-url';
import { aiApi } from '../_lib/api';
import { ApiError } from '../_lib/api-client';
import { getAccessToken } from '../_lib/auth';
import { useNavigate } from '../_lib/navigation';
import type { ChatMessage, ChatSession, KhUIMessage } from '../_types/knowledge-hub';
import { historyToUIMessages } from '../_utils/chat-message';

/**
 * @description Manage AI SDK streaming, persisted chat sessions, history loading, and scroll pinning.
 * Network requests use the authenticated RagBusiness APIs and `/api/ai/chat/stream` transport.
 * @returns Chat page state and actions for session and conversation components.
 */
const useChatPage = () => {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const params = useSearchParams();
  const sessionId = params.get('session') || undefined;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(sessionId);
  const loadedSessionRef = useRef<string | undefined>(undefined);
  const pinBottomRef = useRef(true);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const loadSessions = useCallback(async () => {
    try {
      const result = await aiApi.sessions();
      setSessions(result.items);
    } catch {
      // 会话列表失败不阻塞当前问答，与源实现保持一致。
    }
  }, []);

  const streamApiBaseUrl = useMemo(
    () =>
      resolveApiBaseUrl({
        isBrowser: true,
        publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
      }),
    [],
  );
  const transport = useMemo(
    () =>
      new DefaultChatTransport<KhUIMessage>({
        api: `${streamApiBaseUrl}${CHAT_STREAM_PATH}`,
        headers: () => {
          const token = getAccessToken();
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return headers;
        },
      }),
    [streamApiBaseUrl],
  );
  const { error, messages, sendMessage, setMessages, status, stop } =
    useChat<KhUIMessage>({
      id: CHAT_ID,
      transport,
      onData: part => {
        if (part.type !== 'data-session') return;
        const nextId = part.data.sessionId;
        if (!nextId || nextId === sessionIdRef.current) return;
        loadedSessionRef.current = nextId;
        window.history.replaceState(window.history.state, '', `/chat?session=${nextId}`);
      },
      onFinish: () => {
        void loadSessions();
      },
      onError: streamError => {
        message.error(streamError.message || '请求失败');
      },
    });

  const streaming = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    aiApi
      .sessions()
      .then(result => setSessions(result.items))
      .catch(() => {
        // 会话列表失败不阻塞当前问答，与源实现保持一致。
      });
  }, []);

  useEffect(() => {
    if (streaming) return;
    if (!sessionId) {
      if (loadedSessionRef.current) {
        loadedSessionRef.current = undefined;
        queueMicrotask(() => setMessages([]));
      }
      return;
    }
    if (loadedSessionRef.current === sessionId) return;
    let cancelled = false;

    aiApi
      .messages(sessionId)
      .then((rows: ChatMessage[]) => {
        if (cancelled) return;
        loadedSessionRef.current = sessionId;
        setMessages(historyToUIMessages(rows));
      })
      .catch(historyError => {
        if (cancelled) return;
        loadedSessionRef.current = undefined;
        message.error(
          historyError instanceof ApiError ? historyError.message : '加载会话失败',
        );
        navigate('/chat', { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, sessionId, setMessages, streaming]);

  useEffect(() => {
    if (!pinBottomRef.current) return;
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }, [messages, status]);

  const onLogScroll = () => {
    const element = logRef.current;
    if (!element) return;
    pinBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    pinBottomRef.current = true;
    await sendMessage({ text }, { body: { sessionId } });
  };

  const switchSession = (id?: string) => {
    if (streaming) {
      message.warning('请等待当前回答结束再切换会话');
      return;
    }
    if (!id) {
      loadedSessionRef.current = undefined;
      setMessages([]);
    }
    navigate(id ? `/chat?session=${id}` : '/chat');
  };

  const createSession = async () => {
    if (streaming) {
      message.warning('请等待当前回答结束再开新对话');
      return;
    }
    try {
      const created = await aiApi.createSession();
      loadedSessionRef.current = created.id;
      setMessages([]);
      navigate(`/chat?session=${created.id}`);
      void loadSessions();
    } catch (createError) {
      message.error(createError instanceof ApiError ? createError.message : '创建失败');
    }
  };

  const removeSession = (id: string) => {
    if (streaming) {
      message.warning('请等待当前回答结束再删除');
      return;
    }
    modal.confirm({
      title: '确定删除对话？',
      content: '删除后，聊天记录将不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      centered: true,
      onOk: async () => {
        try {
          await aiApi.removeSession(id);
          if (sessionId === id) switchSession();
          void loadSessions();
        } catch (removeError) {
          message.error(
            removeError instanceof ApiError ? removeError.message : '删除失败',
          );
          throw removeError;
        }
      },
    });
  };

  return {
    createSession,
    errorMessage: error?.message,
    input,
    loading: streaming,
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
  };
};

export { useChatPage };
