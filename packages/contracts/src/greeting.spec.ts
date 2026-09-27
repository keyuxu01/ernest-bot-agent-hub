import { describe, expect, it } from 'vitest';
import { GreetingResponseSchema } from './greeting.js';

describe('GreetingResponseSchema', () => {
  it('accepts a valid greeting response', () => {
    expect(GreetingResponseSchema.parse({ message: 'Hello World!' })).toEqual({
      message: 'Hello World!',
    });
  });

  it.each([{ message: 42 }, {}, null])(
    'rejects invalid greeting response %#',
    payload => {
      expect(() => GreetingResponseSchema.parse(payload)).toThrow();
    },
  );
});
