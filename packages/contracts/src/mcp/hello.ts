import { z } from 'zod';

/**
 * @description HTTP hello payload for mcp-app-collections (not an MCP tool schema).
 */
const McpHelloResponseSchema = z.object({
  message: z.string(),
});

type McpHelloResponse = z.output<typeof McpHelloResponseSchema>;

export type { McpHelloResponse };
export { McpHelloResponseSchema };
