import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY_RETRY_ENABLED,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../constants/query';
import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('configures the shared browser query defaults', () => {
    const queryClient = createQueryClient();
    const queryDefaults = queryClient.getDefaultOptions().queries;

    expect(queryDefaults?.retry).toBe(DEFAULT_QUERY_RETRY_ENABLED);
    expect(queryDefaults?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS);
  });
});
