import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_QUERY_RETRY_ENABLED,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../constants/query';

/**
 * @description Create an isolated TanStack Query client with the browser cache defaults used by the app.
 * @returns A new QueryClient owned by one application-provider mount or one test.
 */
const createQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: DEFAULT_QUERY_RETRY_ENABLED,
        staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      },
    },
  });
};

export { createQueryClient };
