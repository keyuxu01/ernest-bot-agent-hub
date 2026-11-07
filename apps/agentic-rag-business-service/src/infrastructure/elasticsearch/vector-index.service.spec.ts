import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const es = vi.hoisted(() => ({
  cluster: { health: vi.fn() },
  indices: { exists: vi.fn(), create: vi.fn() },
  search: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@elastic/elasticsearch', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@elastic/elasticsearch')>();
  return {
    ...actual,
    Client: class {
      constructor() {
        return es;
      }
    },
  };
});

import { VectorIndexService } from './vector-index.service';

const source = [
  'chunk_id',
  'document_id',
  'document_title',
  'content',
  'heading',
];

function esHits(...ids: string[]) {
  return {
    hits: {
      hits: ids.map((id, i) => ({
        _id: id,
        _score: 10 - i,
        _source: {
          chunk_id: id,
          document_id: 'd1',
          document_title: '标题',
          content: `正文${id}`,
          heading: null,
        },
      })),
    },
  };
}

describe('VectorIndexService search', () => {
  let service: VectorIndexService;

  beforeEach(async () => {
    vi.resetAllMocks();
    es.cluster.health.mockResolvedValue({ status: 'green' });
    es.indices.exists.mockResolvedValue(false);
    service = new VectorIndexService(
      new ConfigService({
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        EMBEDDING_DIMENSION: 1024,
      }),
    );
    await service.onModuleInit();
  });

  it('creates kh_chunk with IK analyzers on title and content', () => {
    const properties = es.indices.create.mock.calls[0]![0].mappings.properties;
    expect(properties.content).toEqual({
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
    });
    expect(properties.document_title).toMatchObject({
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
    });
  });

  it('runs a weighted BM25 query and maps hits', async () => {
    es.search.mockResolvedValue(esHits('a'));

    const hits = await service.keywordSearch('  灰度发布 ', 100);

    expect(es.search).toHaveBeenCalledWith({
      index: 'kh_chunk',
      size: 50,
      query: {
        multi_match: {
          query: '灰度发布',
          fields: ['document_title^2', 'content'],
          analyzer: 'ik_smart',
        },
      },
      _source: source,
    });
    expect(hits).toEqual([
      {
        chunkId: 'a',
        documentId: 'd1',
        documentTitle: '标题',
        content: '正文a',
        heading: null,
        score: 10,
      },
    ]);
    await expect(service.keywordSearch('  ')).resolves.toEqual([]);
  });

  it('runs a kNN query on embedding', async () => {
    es.search.mockResolvedValue(esHits('a'));

    await service.knnSearch([0.1, 0.2], 3);

    expect(es.search).toHaveBeenCalledWith({
      index: 'kh_chunk',
      size: 3,
      knn: {
        field: 'embedding',
        query_vector: [0.1, 0.2],
        k: 3,
        num_candidates: 50,
      },
      _source: source,
    });
  });

  it('returns [] when a search fails', async () => {
    es.search.mockRejectedValue(new Error('es down'));

    await expect(service.keywordSearch('x')).resolves.toEqual([]);
    await expect(service.knnSearch([0.1])).resolves.toEqual([]);
  });

  it('fuses both channels, or keyword only without a vector', async () => {
    es.search
      .mockResolvedValueOnce(esHits('a', 'b'))
      .mockResolvedValueOnce(esHits('b', 'c'));

    const fused = await service.searchHybrid({
      query: 'q',
      queryVector: [0.1],
      hybridTopK: 5,
    });
    expect(fused.map((h) => h.chunkId)).toEqual(['b', 'a', 'c']);

    es.search.mockClear();
    es.search.mockResolvedValue(esHits('a'));
    await service.searchHybrid({ query: 'q', queryVector: null });
    expect(es.search).toHaveBeenCalledTimes(1);
    expect(es.search.mock.calls[0]![0]).toHaveProperty('query');
  });
});
