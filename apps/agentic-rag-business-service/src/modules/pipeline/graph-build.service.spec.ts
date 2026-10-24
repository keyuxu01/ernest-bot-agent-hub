import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
import type { ChunkingService } from './chunking.service';
import { GraphBuildService } from './graph-build.service';
import type { KgExtractionService } from './kg-extraction.service';
import type { PipelineDocument } from './type/pipeline.types';

describe('GraphBuildService', () => {
  const chunkingService = { chunk: vi.fn() };
  const extractionService = { extract: vi.fn() };
  const graphStore = {
    deleteByDocId: vi.fn(),
    upsertDocument: vi.fn(),
    upsertChunk: vi.fn(),
    writeExtraction: vi.fn(),
  };
  const doc: PipelineDocument = {
    id: '10001',
    title: '差旅制度',
    content: '正文',
    status: 1,
  };

  let service: GraphBuildService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GraphBuildService(
      chunkingService as unknown as ChunkingService,
      extractionService as unknown as KgExtractionService,
      graphStore as unknown as GraphStoreService,
    );
  });

  it('skips empty documents without touching Neo4j', async () => {
    await expect(
      service.buildForDocument({ ...doc, content: '  ' }),
    ).resolves.toBe(0);
    expect(graphStore.deleteByDocId).not.toHaveBeenCalled();
  });

  it('clears old graph first, then writes each chunk with its extraction', async () => {
    chunkingService.chunk.mockResolvedValue([
      {
        chunkId: 'c0',
        documentId: '10001',
        documentTitle: '差旅制度',
        content: '块0',
        heading: '总则',
        chunkIndex: 0,
        totalChunks: 2,
      },
      {
        chunkId: 'c1',
        documentId: '10001',
        documentTitle: '差旅制度',
        content: '块1',
        heading: null,
        chunkIndex: 1,
        totalChunks: 2,
      },
    ]);
    const entity = {
      name: '财务部',
      type: 'ORGANIZATION',
      description: '',
      aliases: [],
    };
    extractionService.extract
      .mockResolvedValueOnce({ entities: [entity], relations: [] })
      // 第二块 LLM 超时：只落块节点，不阻断
      .mockRejectedValueOnce(new Error('timeout'));
    graphStore.writeExtraction.mockImplementation(
      async (input: { entities: unknown[] }) => input.entities.length,
    );

    await expect(service.buildForDocument(doc)).resolves.toBe(1);

    // 顺序：先清 → 文档节点 → 块节点 → 抽取结果
    const order = (fn: { mock: { invocationCallOrder: number[] } }, i = 0) =>
      fn.mock.invocationCallOrder[i]!;
    expect(order(graphStore.deleteByDocId)).toBeLessThan(
      order(graphStore.upsertDocument),
    );
    expect(order(graphStore.upsertDocument)).toBeLessThan(
      order(graphStore.upsertChunk),
    );
    expect(order(graphStore.upsertChunk)).toBeLessThan(
      order(graphStore.writeExtraction),
    );
    expect(graphStore.upsertDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: '10001', title: '差旅制度', status: 1 }),
    );
    expect(graphStore.upsertChunk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chunkId: 'c1',
        documentId: '10001',
        chunkIndex: 1,
      }),
    );
    expect(graphStore.writeExtraction).toHaveBeenNthCalledWith(1, {
      chunkId: 'c0',
      entities: [entity],
      relations: [],
    });
    expect(graphStore.writeExtraction).toHaveBeenNthCalledWith(2, {
      chunkId: 'c1',
      entities: [],
      relations: [],
    });
  });

  it('propagates Neo4j write failures to the orchestrator', async () => {
    chunkingService.chunk.mockResolvedValue([
      {
        chunkId: 'c0',
        documentId: '10001',
        documentTitle: '差旅制度',
        content: '块0',
        chunkIndex: 0,
        totalChunks: 1,
      },
    ]);
    extractionService.extract.mockResolvedValue({
      entities: [],
      relations: [],
    });
    graphStore.writeExtraction.mockRejectedValue(
      new Error('ServiceUnavailable'),
    );

    await expect(service.buildForDocument(doc)).rejects.toThrow(
      'ServiceUnavailable',
    );
  });
});
