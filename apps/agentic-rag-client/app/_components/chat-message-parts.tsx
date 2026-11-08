'use client';

import { useState } from 'react';
import type { ChatMessagePartsProps } from '../_types/knowledge-hub';
import { citedSources, sourcesFromParts, textFromParts } from '../_utils/chat-message';
import { AnswerMarkdown } from './answer-markdown';
import { ChatProcessParts } from './chat-process-parts';
import { SourceCiteList } from './source-cite-list';

/**
 * @description Render one AI SDK message, including streamed process parts and final citations.
 */
const ChatMessageParts = (props: ChatMessagePartsProps) => {
  const { messageId, parts, role, showSources = true } = props;
  const sources = citedSources(sourcesFromParts(parts), textFromParts(parts));
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const texts = parts.filter(part => part.type === 'text' && part.text);

  if (role === 'user') {
    return (
      <>
        {texts.map((part, index) =>
          part.type === 'text' ? (
            <div key={index} className="kh-bubble-text">
              {part.text}
            </div>
          ) : null,
        )}
      </>
    );
  }

  return (
    <>
      <ChatProcessParts parts={parts} />
      {texts.map((part, index) =>
        part.type === 'text' ? (
          <div key={`text-${index}`} className="kh-bubble-md">
            <AnswerMarkdown
              text={part.text}
              sources={sources}
              scope={messageId}
              onCite={setActiveCite}
            />
          </div>
        ) : null,
      )}
      {showSources && sources.length ? (
        <SourceCiteList
          items={sources}
          scope={messageId}
          activeIndex={activeCite}
          onSelect={setActiveCite}
        />
      ) : null}
    </>
  );
};

export { ChatMessageParts };
