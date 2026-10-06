import { z } from 'zod';

/**
 * @description Ping payload from assistant-runtime-service.
 */
const AssistantRuntimePingResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('assistant-runtime-service'),
  message: z.string().min(1),
  mcpCollectionsUrl: z.string().url().nullable(),
  correlationId: z.string().min(1).max(128),
  version: z.string().min(1),
  buildId: z.string().min(1),
});

type AssistantRuntimePingResponse = z.output<
  typeof AssistantRuntimePingResponseSchema
>;

export type { AssistantRuntimePingResponse };
export { AssistantRuntimePingResponseSchema };
