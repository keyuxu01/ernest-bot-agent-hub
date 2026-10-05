import { describe, expect, it } from 'vitest';
import { McpHelloResponseSchema } from './hello';

describe('McpHelloResponseSchema', () => {
  it('accepts a message payload', () => {
    expect(
      McpHelloResponseSchema.parse({
        message: 'Hello from mcp-app-collections!',
      }),
    ).toEqual({ message: 'Hello from mcp-app-collections!' });
  });
});
