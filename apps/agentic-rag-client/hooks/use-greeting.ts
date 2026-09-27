'use client';

import { useQuery } from '@tanstack/react-query';
import { businessApiQuery } from '../lib/business-api-query';

/**
 * @description Load the runtime-validated greeting through the shared oRPC query options.
 * This hook performs a browser network request and reads the application QueryClient cache.
 * @returns TanStack Query state for the greeting operation.
 */
const useGreeting = () => {
  return useQuery(businessApiQuery.greeting.queryOptions());
};

export { useGreeting };
