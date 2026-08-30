import type { GreetingResponse } from '@repo/types';

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:8080').replace(
  /\/$/,
  '',
);

export async function getGreeting(): Promise<GreetingResponse> {
  const response = await fetch(`${apiBaseUrl}/`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Business service returned HTTP ${response.status}`);
  }

  return response.json();
}
