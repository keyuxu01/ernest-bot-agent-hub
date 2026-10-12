import { ConfigService } from '@nestjs/config';
import type { RagBusinessSearchDocument } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const es = vi.hoisted(() => ({
  cluster: { health: vi.fn() },
  indices: { exists: vi.fn(), create: vi.fn() },
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
describe('SearchIndexService', () => {
  let service: SearchIndexService;
  beforeEach(() => {
    vi.resetAllMocks();
    es.cluster.health.mockResolvedValue({ status: 'green' });
    es.indices.exists.mockResolvedValue(true);
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
    const doc = { id: '1', title: '标题' } as RagBusinessSearchDocument;
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
});
