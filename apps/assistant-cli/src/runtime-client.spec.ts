import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_URL, resolveRuntimeBaseUrl } from './runtime-client';

describe('resolveRuntimeBaseUrl', () => {
  it('defaults to localhost:9030', () => {
    const previous = process.env.ASSISTANT_RUNTIME_URL;
    delete process.env.ASSISTANT_RUNTIME_URL;
    expect(resolveRuntimeBaseUrl()).toBe(DEFAULT_RUNTIME_URL);
    if (previous === undefined) {
      delete process.env.ASSISTANT_RUNTIME_URL;
    } else {
      process.env.ASSISTANT_RUNTIME_URL = previous;
    }
  });

  it('strips trailing slash from override', () => {
    expect(resolveRuntimeBaseUrl('https://127.0.0.1:9030/')).toBe(
      'https://127.0.0.1:9030',
    );
  });

  it('accepts cleartext localhost during development', () => {
    expect(resolveRuntimeBaseUrl('http://127.0.0.1:9030')).toBe('http://127.0.0.1:9030');
  });

  it('rejects non-loopback cleartext before making a request', () => {
    expect(() => resolveRuntimeBaseUrl('http://192.168.1.10:9030')).toThrow(
      'must use HTTPS',
    );
  });

  it('rejects cleartext localhost in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => resolveRuntimeBaseUrl('http://localhost:9030')).toThrow(
        'must use HTTPS',
      );
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
