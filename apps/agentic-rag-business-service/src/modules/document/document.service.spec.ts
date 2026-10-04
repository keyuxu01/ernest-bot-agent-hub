import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentPipelinePublisher } from '../../infrastructure/rabbitmq/document-pipeline.publisher';
import { DocumentService } from './document.service';
import { DocumentStatus, type DocumentEntity } from './entities/document.entity';
import type { DocumentContentRepository } from './repository/document-content.repository';
import type { DocumentRepository } from './repository/document.repository';

function draftDoc(
  overrides: Partial<DocumentEntity> = {},
): DocumentEntity {
  return {
    id: '10001',
    title: '草稿',
    contentId: '507f1f77bcf86cd799439011',
    status: DocumentStatus.Draft,
    wordCount: 1,
    isPublic: false,
    deleted: false,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    favouriteCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DocumentEntity;
}

describe('DocumentService.publish', () => {
  const documentRepo = {
    findActiveById: vi.fn(),
    save: vi.fn(),
  };
  const contentRepo = {
    findActiveContentById: vi.fn(),
  };
  const pipelinePublisher = {
    afterPublish: vi.fn(),
  };

  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService(
      documentRepo as unknown as DocumentRepository,
      contentRepo as unknown as DocumentContentRepository,
      pipelinePublisher as unknown as DocumentPipelinePublisher,
    );
  });

  it('publishes a draft and enqueues RAG reindex', async () => {
    const doc = draftDoc();
    documentRepo.findActiveById.mockResolvedValue(doc);
    documentRepo.save.mockImplementation(async (saved: DocumentEntity) => saved);
    contentRepo.findActiveContentById.mockResolvedValue({ content: '正文' });
    pipelinePublisher.afterPublish.mockResolvedValue(undefined);

    const result = await service.publish('10001');

    expect(result.status).toBe(DocumentStatus.Published);
    expect(result.content).toBe('正文');
    expect(result.publishTime).toBeInstanceOf(Date);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalledWith('10001');
  });

  it('keeps published status when the queue publish fails', async () => {
    const doc = draftDoc();
    documentRepo.findActiveById.mockResolvedValue(doc);
    documentRepo.save.mockImplementation(async (saved: DocumentEntity) => saved);
    contentRepo.findActiveContentById.mockResolvedValue({ content: '' });
    pipelinePublisher.afterPublish.mockRejectedValue(new Error('broker down'));

    const result = await service.publish('10001');

    expect(result.status).toBe(DocumentStatus.Published);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalled();
  });

  it('rejects archived documents', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Archived }),
    );

    await expect(service.publish('10001')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });

  it('rejects missing documents', async () => {
    documentRepo.findActiveById.mockResolvedValue(null);

    await expect(service.publish('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
