import type { UIMessage } from 'ai';
import type { ChatSource } from './ai-chat.types';

type RagBusinessAiStreamMessage = UIMessage<
  unknown,
  {
    status: { stage: string; text: string };
    think: { text: string };
    sources: ChatSource[];
    retrieve: {
      query: string;
      items: Array<{
        index: number;
        documentId: string;
        documentTitle: string;
        heading: string | null;
      }>;
    };
    session: { sessionId: string };
  }
>;

export type { RagBusinessAiStreamMessage };
