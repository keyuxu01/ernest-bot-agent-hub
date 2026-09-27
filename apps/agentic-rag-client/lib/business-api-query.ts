import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { businessApiClient } from './api';

/**
 * @description Contract-derived TanStack Query utilities backed by the existing business API client.
 */
const businessApiQuery = createTanstackQueryUtils(businessApiClient);

export { businessApiQuery };
