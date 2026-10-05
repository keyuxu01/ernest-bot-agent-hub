import { z } from 'zod';

/**
 * @description Greeting payload for the Agentic RAG business HTTP/oRPC API.
 */
const RagBusinessGreetingResponseSchema = z.object({
  message: z.string(),
});

type RagBusinessGreetingResponse = z.output<
  typeof RagBusinessGreetingResponseSchema
>;

export type { RagBusinessGreetingResponse };
export { RagBusinessGreetingResponseSchema };
