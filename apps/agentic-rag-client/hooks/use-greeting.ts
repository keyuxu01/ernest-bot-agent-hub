'use client';

import { useQuery } from '@tanstack/react-query';
import { ragBusinessApiQuery } from '../lib/rag-business-api-query';

/**
 * @description Load the runtime-validated greeting through the shared oRPC query options.
 * This hook performs a browser network request and reads the application QueryClient cache.
 * @returns TanStack Query state for the greeting operation.
 */
const useGreeting = () => {
  return useQuery(ragBusinessApiQuery.greeting.queryOptions());
};

export { useGreeting };
