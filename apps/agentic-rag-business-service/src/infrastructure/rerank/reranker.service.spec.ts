import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChunkHit } from '../elasticsearch/type/chunk-hit.types';
import { RerankerService } from './reranker.service';

function hit(chunkId: string, content = '正文'): ChunkHit {
  return {
    chunkId,
    documentId: '1',
    documentTitle: '标题',
    content,
    heading: '章节',
    score: 0.01,
  };
}

const fetchMock = vi.fn();

function service(env: Record<string, unknown> = {}) {
  return new RerankerService(
    new ConfigService({
      QWEN_LLM_API_KEY: 'sk-test',
      QWEN_RERANK_MODEL_NAME: 'qwen3-rerank',
      QWEN_RERANK_URL: 'https://example.com/rerank',
      ...env,
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RerankerService', () => {
  it('posts query and documents to DashScope and reorders by relevance', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 5, relevance_score: 0.8 },
            { index: 0, relevance_score: 0.2 },
          ],
        },
      }),
    });

    const result = await service().rerank(
      '问题',
      [hit('a'), hit('b', 'x'.repeat(3000))],
      5,
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.com/rerank');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'qwen3-rerank',
      input: { query: '问题' },
      parameters: { return_documents: false, top_n: 2 },
    });
    expect(body.input.documents[0]).toBe('标题\n章节\n正文');
    expect(body.input.documents[1]).toHaveLength(2003);
    // 越界下标 5 丢弃
    expect(result).toEqual([
      { ...hit('b', 'x'.repeat(3000)), score: 0.9 },
      { ...hit('a'), score: 0.2 },
    ]);
  });

  it.each([
    ['an HTTP error', { ok: false, status: 401, json: async () => ({}) }],
    ['empty results', { ok: true, json: async () => ({ output: {} }) }],
  ])('returns null on %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response);

    await expect(service().rerank('问题', [hit('a')], 3)).resolves.toBeNull();
  });

  it('returns null when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(service().rerank('问题', [hit('a')], 3)).resolves.toBeNull();
  });

  it('fails at construction without the rerank URL', () => {
    expect(() => service({ QWEN_RERANK_URL: undefined })).toThrow();
  });

  it('returns [] for no candidates without calling the API', async () => {
    await expect(service().rerank('问题', [], 3)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
