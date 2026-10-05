import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { ragBusinessApiClient } from './api';

/**
 * @description Contract-derived TanStack Query utilities backed by the RagBusiness API client.
 */
const ragBusinessApiQuery = createTanstackQueryUtils(ragBusinessApiClient);

export { ragBusinessApiQuery };
