import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { ResponseValidationPlugin } from '@orpc/contract/plugins';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import type { GreetingResponse } from '@repo/contracts';
import { BusinessApiContract } from '@repo/contracts/orpc';
import { resolveApiBaseUrl } from '../utils/resolve-api-base-url';

const apiBaseUrl = resolveApiBaseUrl({
  isBrowser: typeof window !== 'undefined',
  publicBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  serverBaseUrl: process.env.API_BASE_URL,
});

const businessApiLink = new OpenAPILink(BusinessApiContract, {
  url: apiBaseUrl,
  fetch: request => fetch(request, { cache: 'no-store' }),
  plugins: [new ResponseValidationPlugin(BusinessApiContract)],
});

/**
 * @description Typed business API client shared by direct calls and TanStack Query utilities.
 */
const businessApiClient: ContractRouterClient<typeof BusinessApiContract> =
  createORPCClient(businessApiLink);

/**
 * @description Fetch and validate the greeting returned by the business service.
 * @returns A greeting that satisfies the shared runtime contract.
 */
const getGreeting = async (): Promise<GreetingResponse> => {
  return businessApiClient.greeting();
};

export { businessApiClient, getGreeting };
