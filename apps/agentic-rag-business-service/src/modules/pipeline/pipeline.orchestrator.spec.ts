import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import type { EmbeddingService } from '../../infrastructure/embedding/embedding.service';
import type { DocumentContentRepository } from '../document/repository/document-content.repository';
import type { DocumentRepository } from '../document/repository/document.repository';
import type { ChunkingService } from './chunking.service';
import { PipelineOrchestrator } from './pipeline.orchestrator';
import type { DocumentChunk } from './type/pipeline.types';

describe('PipelineOrchestrator', () => {
  const documentRepo = { findActiveByIds: vi.fn() };
  const contentRepo = { findActiveContentById: vi.fn() };
  const chunkingService = { chunk: vi.fn() };
  const embeddingService = { embedBatch: vi.fn() };
  const vectorIndexService = {
    deleteByDocId: vi.fn(),
    indexChunks: vi.fn(),
  };

  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new PipelineOrchestrator(
      documentRepo as unknown as DocumentRepository,
      contentRepo as unknown as DocumentContentRepository,
      chunkingService as unknown as ChunkingService,
      embeddingService as unknown as EmbeddingService,
      vectorIndexService as unknown as VectorIndexService,
    );
  });

  it('ignores unsupported reindex types', async () => {
    await orchestrator.handleRagReindex('BY_CATEGORY', ['1']);
    expect(documentRepo.findActiveByIds).not.toHaveBeenCalled();
  });

  it('chunks, embeds and indexes a loaded document', async () => {
    documentRepo.findActiveByIds.mockResolvedValue([
      {
        id: '10001',
        title: '标题',
        contentId: 'cid',
        status: 1,
      },
    ]);
    contentRepo.findActiveContentById.mockResolvedValue({ content: '正文' });
    const chunks: DocumentChunk[] = [
      {
        chunkId: 'c1',
        documentId: '10001',
        documentTitle: '标题',
        content: '正文',
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
    chunkingService.chunk.mockResolvedValue(chunks);
    embeddingService.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorIndexService.deleteByDocId.mockResolvedValue(undefined);
    vectorIndexService.indexChunks.mockResolvedValue(undefined);

    await orchestrator.handleRagReindex('BY_DOC_IDS', ['10001']);

    expect(vectorIndexService.deleteByDocId).toHaveBeenCalledWith('10001');
    expect(embeddingService.embedBatch).toHaveBeenCalledWith(['正文']);
    expect(vectorIndexService.indexChunks).toHaveBeenCalledWith([
      { ...chunks[0], embedding: [0.1, 0.2] },
    ]);
  });
});
