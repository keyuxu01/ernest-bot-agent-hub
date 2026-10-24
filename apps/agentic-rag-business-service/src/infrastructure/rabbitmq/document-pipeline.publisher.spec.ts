import { describe, expect, it, vi } from 'vitest';
import {
  RagBusinessSearchIndexMessageV1Schema,
  type RagBusinessSearchDocument,
} from '@repo/contracts';
import { DocumentPipelinePublisher } from './document-pipeline.publisher';
import type { RabbitMqService } from './rabbitmq.service';
import {
  KG_GRAPH_EXCHANGE,
  KG_RK_BUILD_BY_IDS,
  KG_RK_DELETE,
  RAG_REINDEX_EXCHANGE,
  RAG_RK_DELETE,
  SEARCH_INDEX_EXCHANGE,
  SEARCH_RK_DELETE,
} from './constants/rabbitmq.constants';
describe('DocumentPipelinePublisher', () => {
  it('publishes all delete commands with matching ids and version', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const publisher = new DocumentPipelinePublisher({
      publish,
    } as unknown as RabbitMqService);
    await publisher.afterUnpublish('1');
    expect(publish).toHaveBeenCalledWith(
      RAG_REINDEX_EXCHANGE,
      RAG_RK_DELETE,
      expect.objectContaining({
        schemaVersion: 1,
        type: 'DELETE_BY_DOC_IDS',
        documentIds: ['1'],
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_DELETE,
      expect.objectContaining({
        schemaVersion: 1,
        type: 'DELETE',
        documentId: '1',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      KG_GRAPH_EXCHANGE,
      KG_RK_DELETE,
      expect.objectContaining({
        schemaVersion: 1,
        type: 'DELETE_BY_DOC_IDS',
        documentIds: ['1'],
      }),
    );
  });
  it('still sends a valid search snapshot if RAG publish returns false', async () => {
    const publish = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const publisher = new DocumentPipelinePublisher({
      publish,
    } as unknown as RabbitMqService);
    const document: RagBusinessSearchDocument = {
      id: '1',
      title: '标题',
      content: null,
      summary: null,
      categoryId: null,
      tags: null,
      status: 1,
      isPublic: false,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      authorId: null,
      publishTime: null,
      createdAt: null,
      updatedAt: null,
    };
    await publisher.afterPublish(document);
    // RAG + Search + KG 三条独立命令
    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledWith(
      KG_GRAPH_EXCHANGE,
      KG_RK_BUILD_BY_IDS,
      expect.objectContaining({
        schemaVersion: 1,
        type: 'BY_DOC_IDS',
        documentIds: ['1'],
      }),
    );
    expect(
      RagBusinessSearchIndexMessageV1Schema.parse(publish.mock.calls[1]![2]),
    ).toEqual(expect.objectContaining({ type: 'INDEX', document }));
  });
});
