import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { ResponseValidationPlugin } from '@orpc/contract/plugins';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import type { RagBusinessGreetingResponse } from '@repo/contracts';
import { RagBusinessApiContract } from '@repo/contracts/orpc';
import { resolveApiBaseUrl } from '../utils/resolve-api-base-url';

const apiBaseUrl = resolveApiBaseUrl({
  isBrowser: typeof window !== 'undefined',
  publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  serverBaseUrl: process.env.API_BASE_URL,
});

const ragBusinessApiLink = new OpenAPILink(RagBusinessApiContract, {
  url: apiBaseUrl,
  fetch: request => fetch(request, { cache: 'no-store' }),
  plugins: [new ResponseValidationPlugin(RagBusinessApiContract)],
});

/**
 * @description Typed RagBusiness API client shared by direct calls and TanStack Query utilities.
 */
const ragBusinessApiClient: ContractRouterClient<typeof RagBusinessApiContract> =
  createORPCClient(ragBusinessApiLink);

/**
 * @description Fetch and validate the greeting returned by the RagBusiness service.
 * @returns A greeting that satisfies the shared runtime contract.
 */
const getGreeting = async (): Promise<RagBusinessGreetingResponse> => {
  return ragBusinessApiClient.greeting();
};

export { ragBusinessApiClient, getGreeting };
