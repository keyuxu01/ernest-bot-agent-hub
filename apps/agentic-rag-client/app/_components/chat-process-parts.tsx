import { getToolName, isToolUIPart } from 'ai';
import type { ReactNode } from 'react';
import type { ChatProcessPartsProps } from '../_types/knowledge-hub';
import { ChatRetrieveCard } from './chat-retrieve-card';
import { ChatThinkBlock } from './chat-think-block';
import { ChatWebSearchCard } from './chat-web-search-card';

/**
 * @description Render retrieval, reasoning, status, source URL, and web-search stream parts.
 */
const ChatProcessParts = (props: ChatProcessPartsProps) => {
  const { parts } = props;
  const hasRetrieve = parts.some(part => part.type === 'data-retrieve');
  const nodes: ReactNode[] = [];
  let reasoningBuffer: string[] = [];
  let reasoningStreaming = false;
  let thinkKey = 0;

  const flushReasoning = () => {
    if (!reasoningBuffer.length) return;
    nodes.push(
      <ChatThinkBlock
        key={`think-${thinkKey}`}
        text={reasoningBuffer.join('\n\n')}
        streaming={reasoningStreaming}
      />,
    );
    thinkKey += 1;
    reasoningBuffer = [];
    reasoningStreaming = false;
  };

  parts.forEach((part, index) => {
    if (part.type === 'reasoning' || part.type === 'data-think') {
      const text = 'text' in part && typeof part.text === 'string' ? part.text : '';
      if (text) reasoningBuffer.push(text);
      if ('state' in part && part.state === 'streaming') reasoningStreaming = true;
      return;
    }
    flushReasoning();
    if (
      part.type === 'step-start' ||
      part.type === 'data-session' ||
      part.type === 'data-sources' ||
      part.type === 'source-document' ||
      part.type === 'text'
    ) {
      return;
    }
    if (part.type === 'data-status') {
      if (part.data.stage === 'generate') return;
      if (part.data.stage === 'retrieve' && hasRetrieve) return;
      nodes.push(
        <div key={index} className="kh-chat-status">
          {part.data.text}
        </div>,
      );
      return;
    }
    if (part.type === 'data-retrieve') {
      nodes.push(
        <ChatRetrieveCard key={index} query={part.data.query} items={part.data.items} />,
      );
      return;
    }
    if (part.type === 'source-url') {
      nodes.push(
        <a
          key={index}
          className="kh-web-link"
          href={part.url}
          target="_blank"
          rel="noreferrer"
        >
          {part.title || part.url}
        </a>,
      );
      return;
    }
    if (isToolUIPart(part) && getToolName(part) === 'web_search') {
      nodes.push(<ChatWebSearchCard key={index} part={part} />);
    }
  });
  flushReasoning();

  return nodes;
};

export { ChatProcessParts };
