import { describe, expect, it } from 'vitest';
import { LOCAL_BUSINESS_API_BASE_URL } from '../constants/api';
import { resolveApiBaseUrl } from './resolve-api-base-url';

describe('resolveApiBaseUrl', () => {
  it('uses the public API origin in the browser without a same-origin rewrite', () => {
    const apiBaseUrl = resolveApiBaseUrl({
      isBrowser: true,
      publicBaseUrl: 'https://api.example.com/',
      serverBaseUrl: 'http://business-service.internal:9020',
    });

    expect(apiBaseUrl).toBe('https://api.example.com');
  });

  it('prefers the private service origin on the server', () => {
    const apiBaseUrl = resolveApiBaseUrl({
      isBrowser: false,
      publicBaseUrl: 'https://api.example.com',
      serverBaseUrl: 'http://business-service.internal:9020/',
    });

    expect(apiBaseUrl).toBe('http://business-service.internal:9020');
  });

  it('uses the direct local business-service origin by default', () => {
    expect(resolveApiBaseUrl({ isBrowser: true })).toBe(LOCAL_BUSINESS_API_BASE_URL);
  });
});
