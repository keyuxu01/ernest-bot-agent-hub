import { GreetingResponseSchema, type GreetingResponse } from '@repo/contracts';

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:8080').replace(
  /\/$/,
  '',
);

/**
 * @description Fetch and validate the greeting returned by the business service.
 * @returns A greeting that satisfies the shared runtime contract.
 */
const getGreeting = async (): Promise<GreetingResponse> => {
  const response = await fetch(`${apiBaseUrl}/`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Business service returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();

  return GreetingResponseSchema.parse(payload);
};

export { getGreeting };
