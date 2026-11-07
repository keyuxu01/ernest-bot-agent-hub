import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChunkHit } from '../../infrastructure/elasticsearch/type/chunk-hit.types';
import type { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import type { EmbeddingService } from '../../infrastructure/embedding/embedding.service';
import type { RerankerService } from '../../infrastructure/rerank/reranker.service';
import { HybridRetrievalService } from './hybrid-retrieval.service';

function hit(chunkId: string, score: number): ChunkHit {
  return {
    chunkId,
    documentId: '1',
    documentTitle: 't',
    content: 'c',
    heading: null,
    score,
  };
}

const embedding = { embed: vi.fn() };
const vectorIndex = { searchHybrid: vi.fn() };
const reranker = { rerank: vi.fn() };

let service: HybridRetrievalService;

beforeEach(() => {
  vi.clearAllMocks();
  embedding.embed.mockResolvedValue([0.1, 0.2]);
  service = new HybridRetrievalService(
    new ConfigService({ RAG_HYBRID_TOP_K: '30', RAG_RRF_C: '40' }),
    embedding as unknown as EmbeddingService,
    vectorIndex as unknown as VectorIndexService,
    reranker as unknown as RerankerService,
  );
});

describe('HybridRetrievalService.retrieve', () => {
  it('passes config to hybrid search and returns reranked top-k', async () => {
    const fused = [hit('a', 0.03), hit('b', 0.02), hit('c', 0.01)];
    vectorIndex.searchHybrid.mockResolvedValue(fused);
    reranker.rerank.mockResolvedValue([hit('c', 0.9), hit('a', 0.5)]);

    const result = await service.retrieve('问题', 1);

    expect(vectorIndex.searchHybrid).toHaveBeenCalledWith({
      query: '问题',
      queryVector: [0.1, 0.2],
      hybridTopK: 30,
      rrfC: 40,
    });
    expect(reranker.rerank).toHaveBeenCalledWith('问题', fused, 1);
    expect(result).toEqual([hit('c', 0.9)]);
  });

  it('falls back to RRF order when rerank is unavailable', async () => {
    vectorIndex.searchHybrid.mockResolvedValue([
      hit('a', 0.03),
      hit('b', 0.02),
    ]);
    reranker.rerank.mockResolvedValue(null);

    await expect(service.retrieve('问题', 1)).resolves.toEqual([
      hit('a', 0.03),
    ]);
  });

  it('searches by keyword only when embedding fails', async () => {
    embedding.embed.mockRejectedValue(new Error('dashscope down'));
    vectorIndex.searchHybrid.mockResolvedValue([]);

    await expect(service.retrieve('问题')).resolves.toEqual([]);
    expect(vectorIndex.searchHybrid).toHaveBeenCalledWith(
      expect.objectContaining({ queryVector: null }),
    );
    expect(reranker.rerank).not.toHaveBeenCalled();
  });
});
