'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createQueryClient } from '../../lib/query-client';
import type { QueryProviderProps } from '../../types/providers';

/**
 * @description Provide one stable browser QueryClient to all interactive descendants.
 */
const QueryProvider = (props: QueryProviderProps) => {
  const { children } = props;
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export { QueryProvider };
