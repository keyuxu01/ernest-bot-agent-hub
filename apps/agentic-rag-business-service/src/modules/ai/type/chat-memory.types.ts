import type { z } from 'zod';
import type { ChatMemoryClassificationSchema } from '../schemas/chat-memory-classification.zod';
import type { ChatQueryRewriteSchema } from '../schemas/chat-query-rewrite.zod';

type ChatMemoryClassification = z.infer<typeof ChatMemoryClassificationSchema>;

type LongMemoryHits = {
  user: string[];
  session: string[];
};

type RetrieveQueryPlan = {
  query: string;
  needRetrieve: boolean;
};

type ChatQueryRewriteOutput = z.infer<typeof ChatQueryRewriteSchema>;

export type {
  ChatMemoryClassification,
  ChatQueryRewriteOutput,
  LongMemoryHits,
  RetrieveQueryPlan,
};
