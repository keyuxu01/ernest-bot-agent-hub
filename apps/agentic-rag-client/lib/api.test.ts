import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGreeting } from './api';

describe('getGreeting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a contract-valid response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Hello World!' }), {
          status: 200,
        }),
      ),
    );

    await expect(getGreeting()).resolves.toEqual({ message: 'Hello World!' });
  });

  it('rejects a malformed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 42 }), { status: 200 }),
        ),
    );

    await expect(getGreeting()).rejects.toThrow();
  });
});
