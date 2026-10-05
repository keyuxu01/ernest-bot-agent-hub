import { afterEach, describe, expect, it, vi } from 'vitest';
import { ragBusinessApiQuery } from './rag-business-api-query';
import { createQueryClient } from './query-client';

const createJsonResponse = (body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

describe('ragBusinessApiQuery greeting integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a contract-valid response through generated query options', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createJsonResponse({ message: 'Hello World!' })),
    );
    const queryClient = createQueryClient();

    await expect(
      queryClient.fetchQuery(ragBusinessApiQuery.greeting.queryOptions()),
    ).resolves.toEqual({ message: 'Hello World!' });
  });

  it('rejects a malformed RagBusiness response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createJsonResponse({ message: 42 })),
    );
    const queryClient = createQueryClient();

    await expect(
      queryClient.fetchQuery(ragBusinessApiQuery.greeting.queryOptions()),
    ).rejects.toThrow();
  });

  it('rejects when the RagBusiness service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
    const queryClient = createQueryClient();

    await expect(
      queryClient.fetchQuery(ragBusinessApiQuery.greeting.queryOptions()),
    ).rejects.toThrow('unavailable');
  });

  it('invalidates greeting data with the generated operation key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createJsonResponse({ message: 'Hello World!' })),
    );
    const queryClient = createQueryClient();
    const greetingQueryKey = ragBusinessApiQuery.greeting.queryKey();

    await queryClient.fetchQuery(ragBusinessApiQuery.greeting.queryOptions());
    await queryClient.invalidateQueries({
      queryKey: ragBusinessApiQuery.greeting.key({ type: 'query' }),
    });

    expect(queryClient.getQueryState(greetingQueryKey)?.isInvalidated).toBe(true);
  });

  it('reuses fresh cached data without issuing a second request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'Hello World!' }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = createQueryClient();
    const greetingQueryOptions = ragBusinessApiQuery.greeting.queryOptions();

    const firstGreeting = await queryClient.fetchQuery(greetingQueryOptions);
    const secondGreeting = await queryClient.fetchQuery(greetingQueryOptions);

    expect(firstGreeting).toEqual(secondGreeting);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
