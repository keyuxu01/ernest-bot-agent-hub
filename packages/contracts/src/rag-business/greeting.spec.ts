import { describe, expect, it } from 'vitest';
import { RagBusinessGreetingResponseSchema } from './greeting';

describe('RagBusinessGreetingResponseSchema', () => {
  it('accepts a message payload', () => {
    expect(
      RagBusinessGreetingResponseSchema.parse({ message: 'Hello World!' }),
    ).toEqual({
      message: 'Hello World!',
    });
  });

  it('rejects non-object payloads', () => {
    for (const payload of [null, undefined, 'hello', 1]) {
      expect(() => RagBusinessGreetingResponseSchema.parse(payload)).toThrow();
    }
  });
});
