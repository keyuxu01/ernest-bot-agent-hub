import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const es = vi.hoisted(() => ({
  cluster: { health: vi.fn() },
  indices: {
    exists: vi.fn(),
    create: vi.fn(),
    getMapping: vi.fn(),
    delete: vi.fn(),
  },
  search: vi.fn(),
  index: vi.fn(),
  delete: vi.fn(),
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
import { errors } from '@elastic/elasticsearch';
import { SearchIndexService } from './search-index.service';
import type { SearchIndexDocument } from './type/search-document.types';

const ikMapping = {
  kh_document: {
    mappings: { properties: { title: { analyzer: 'ik_max_word' } } },
  },
};
describe('SearchIndexService', () => {
  let service: SearchIndexService;
  beforeEach(() => {
    vi.resetAllMocks();
    es.cluster.health.mockResolvedValue({ status: 'green' });
    es.indices.exists.mockResolvedValue(true);
    es.indices.getMapping.mockResolvedValue(ikMapping);
    es.close.mockResolvedValue(undefined);
    service = new SearchIndexService(
      new ConfigService({ ELASTICSEARCH_NODE: 'http://localhost:9200' }),
    );
  });
  it('fails startup and closes the client when ES is unavailable', async () => {
    es.cluster.health.mockRejectedValue(new Error('unavailable'));
    await expect(service.onModuleInit()).rejects.toThrow('unavailable');
    expect(es.close).toHaveBeenCalledOnce();
  });
  it('upserts by document id and propagates write failures', async () => {
    await service.onModuleInit();
    const doc = { id: '1', title: '标题' } as SearchIndexDocument;
    await service.indexDocument(doc);
    expect(es.index).toHaveBeenCalledWith({
      index: 'kh_document',
      id: '1',
      refresh: true,
      document: { ...doc, indexedAt: expect.any(String) },
    });
    es.index.mockRejectedValue(new Error('write failed'));
    await expect(service.indexDocument(doc)).rejects.toThrow('write failed');
  });
  it('ignores delete 404 but propagates other failures', async () => {
    await service.onModuleInit();
    es.delete.mockRejectedValue(
      new errors.ResponseError({
        statusCode: 404,
        body: {},
        headers: {},
        meta: {} as never,
        warnings: null,
      }),
    );
    await expect(service.deleteDocument('1')).resolves.toBeUndefined();
    es.delete.mockRejectedValue(new Error('forbidden'));
    await expect(service.deleteDocument('1')).rejects.toThrow('forbidden');
  });

  it('keeps an existing IK index and rebuilds one created without IK', async () => {
    await service.onModuleInit();
    expect(es.indices.delete).not.toHaveBeenCalled();
    expect(es.indices.create).not.toHaveBeenCalled();

    es.indices.getMapping.mockResolvedValue({
      kh_document: { mappings: { properties: { title: { type: 'text' } } } },
    });
    await service.onModuleInit();

    expect(es.indices.delete).toHaveBeenCalledWith({ index: 'kh_document' });
    expect(es.indices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'kh_document',
        mappings: expect.objectContaining({
          properties: expect.objectContaining({
            content: {
              type: 'text',
              analyzer: 'ik_max_word',
              search_analyzer: 'ik_smart',
            },
          }),
        }),
      }),
    );
  });

  it('searches with weighted fields, filters and highlights', async () => {
    await service.onModuleInit();
    es.search.mockResolvedValue({
      hits: {
        total: { value: 1, relation: 'eq' },
        hits: [
          {
            _id: '1',
            _score: 2.5,
            _source: { id: '1', title: '安装指南', authorId: '9' },
            highlight: { content: ['先装 <em>Node</em>'] },
          },
        ],
      },
    });

    const result = await service.searchDocuments({
      keyword: ' Node ',
      page: 2,
      pageSize: 100,
      authorId: '9',
    });

    expect(es.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'kh_document',
        from: 50,
        size: 50,
        _source: { excludes: ['content'] },
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: 'Node',
                  fields: ['title^3', 'summary^2', 'content'],
                  analyzer: 'ik_smart',
                },
              },
            ],
            filter: [{ term: { authorId: '9' } }],
          },
        },
      }),
    );
    expect(result).toEqual({
      total: 1,
      page: 2,
      pageSize: 50,
      items: [
        expect.objectContaining({
          id: '1',
          title: '安装指南',
          score: 2.5,
          highlight: {
            title: [],
            summary: [],
            content: ['先装 <em>Node</em>'],
          },
        }),
      ],
    });
  });

  it('returns an empty page when the search query fails', async () => {
    await service.onModuleInit();
    es.search.mockRejectedValue(new Error('es down'));

    await expect(service.searchDocuments({ keyword: 'x' })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    });
  });
});
