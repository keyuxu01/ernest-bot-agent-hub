import { HttpException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentPipelinePublisher } from '../../infrastructure/rabbitmq/document-pipeline.publisher';
import { DocumentIndexSyncService } from './document-index-sync.service';
import type { DocumentReviewService } from './document-review.service';
import { DocumentService } from './document.service';
import {
  DocumentStatus,
  type DocumentEntity,
} from './entities/document.entity';
import type { DocumentContentRepository } from './repository/document-content.repository';
import type { DocumentReviewRepository } from './repository/document-review.repository';
import type { DocumentRepository } from './repository/document.repository';
import type { DocumentLifecycleErrorCode } from './type/document-lifecycle.types';

function draftDoc(overrides: Partial<DocumentEntity> = {}): DocumentEntity {
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

/** 断言抛出带指定稳定错误码的业务异常 */
async function expectCode(
  promise: Promise<unknown>,
  code: DocumentLifecycleErrorCode,
): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getResponse()).toMatchObject({ code });
}

const documentRepo = {
  create: vi.fn(),
  findActiveById: vi.fn(),
  save: vi.fn(),
};
const contentRepo = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findActiveContentById: vi.fn(),
  softDelete: vi.fn(),
  updateContent: vi.fn(),
  updateContentSummary: vi.fn(),
};
const reviewRepo = {
  saveDeletedDocument: vi.fn(),
};
const reviewService = {
  isApprovalRequired: vi.fn(),
  submit: vi.fn(),
};
const pipelinePublisher = {
  afterPublish: vi.fn(),
  afterUnpublish: vi.fn(),
};

let service: DocumentService;

beforeEach(() => {
  vi.clearAllMocks();
  documentRepo.save.mockImplementation(async (doc: DocumentEntity) => doc);
  documentRepo.create.mockImplementation(async (input: DocumentEntity) => ({
    ...draftDoc(),
    ...input,
  }));
  contentRepo.create.mockResolvedValue({ _id: '507f1f77bcf86cd799439011' });
  contentRepo.updateContent.mockResolvedValue({ matchedCount: 1 });
  contentRepo.findActiveContentById.mockResolvedValue({ content: '正文' });
  pipelinePublisher.afterPublish.mockResolvedValue(undefined);
  pipelinePublisher.afterUnpublish.mockResolvedValue(undefined);
  reviewService.isApprovalRequired.mockReturnValue(false);

  // 索引同步用真实实现，断言最终投递到 publisher 的命令
  const indexSync = new DocumentIndexSyncService(
    contentRepo as unknown as DocumentContentRepository,
    pipelinePublisher as unknown as DocumentPipelinePublisher,
  );
  service = new DocumentService(
    documentRepo as unknown as DocumentRepository,
    contentRepo as unknown as DocumentContentRepository,
    reviewRepo as unknown as DocumentReviewRepository,
    reviewService as unknown as DocumentReviewService,
    indexSync,
  );
});

describe('DocumentService.publish（免审）', () => {
  it('publishes a draft and enqueues RAG reindex', async () => {
    documentRepo.findActiveById.mockResolvedValue(draftDoc());

    const result = await service.publish('10001');

    expect(result.status).toBe(DocumentStatus.Published);
    expect(result.content).toBe('正文');
    expect(result.publishTime).toBeInstanceOf(Date);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalledWith(
      expect.objectContaining({ id: '10001', content: '正文' }),
    );
    expect(reviewService.submit).not.toHaveBeenCalled();
  });

  it('keeps published status when the queue publish fails', async () => {
    documentRepo.findActiveById.mockResolvedValue(draftDoc());
    pipelinePublisher.afterPublish.mockRejectedValue(new Error('broker down'));

    const result = await service.publish('10001');

    expect(result.status).toBe(DocumentStatus.Published);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalled();
  });

  it('caps the search snapshot without truncating returned content', async () => {
    documentRepo.findActiveById.mockResolvedValue(draftDoc());
    contentRepo.findActiveContentById.mockResolvedValue({
      content: '文'.repeat(1001),
    });

    const result = await service.publish('10001');

    expect(result.content).toHaveLength(1001);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: '文'.repeat(1000) }),
    );
  });

  it('republishes an archived document', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Archived }),
    );

    const result = await service.publish('10001');

    expect(result.status).toBe(DocumentStatus.Published);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalled();
  });

  it('rejects documents under review', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.PendingReview }),
    );

    await expectCode(service.publish('10001'), 'DOCUMENT_UNDER_REVIEW');
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });

  it('rejects missing documents', async () => {
    documentRepo.findActiveById.mockResolvedValue(null);

    await expect(service.publish('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('DocumentService.publish（开启审核）', () => {
  beforeEach(() => {
    reviewService.isApprovalRequired.mockReturnValue(true);
  });

  it.each([
    DocumentStatus.Draft,
    DocumentStatus.Published,
    DocumentStatus.Archived,
  ])('submits status %s for review without indexing', async (status) => {
    documentRepo.findActiveById.mockResolvedValue(draftDoc({ status }));
    reviewService.submit.mockResolvedValue(
      draftDoc({ status: DocumentStatus.PendingReview }),
    );

    const result = await service.publish('10001');

    expect(reviewService.submit).toHaveBeenCalledWith('10001');
    expect(result.status).toBe(DocumentStatus.PendingReview);
    expect(result.content).toBe('正文');
    expect(documentRepo.save).not.toHaveBeenCalled();
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });
});

describe('DocumentService.create', () => {
  const dto = { title: '标题', content: '正文' };

  it('creates a draft without indexing', async () => {
    const result = await service.create(dto);

    expect(result.status).toBe(DocumentStatus.Draft);
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });

  it('indexes a document created as published when approval is off', async () => {
    const result = await service.create({
      ...dto,
      status: DocumentStatus.Published,
    });

    expect(result.publishTime).toBeInstanceOf(Date);
    expect(pipelinePublisher.afterPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: '正文' }),
    );
  });

  it('records the logged-in user as creator instead of the request body', async () => {
    const actor = {
      userId: '20001',
      username: 'alice',
      realName: null,
      email: null,
      avatar: null,
      roles: [],
      permissions: [],
    };

    // createBy 以登录用户为准；authorId 可代填
    await expect(
      service.create({ ...dto, createBy: '99999', authorId: '30001' }, actor),
    ).resolves.toMatchObject({
      createBy: '20001',
      updateBy: '20001',
      authorId: '30001',
    });
    // authorId 未传时取登录用户
    await expect(service.create(dto, actor)).resolves.toMatchObject({
      authorId: '20001',
    });
  });

  it('rejects creating as published when approval is required', async () => {
    reviewService.isApprovalRequired.mockReturnValue(true);

    await expectCode(
      service.create({ ...dto, status: DocumentStatus.Published }),
      'DOCUMENT_APPROVAL_REQUIRED',
    );
    expect(contentRepo.create).not.toHaveBeenCalled();
  });

  it.each([DocumentStatus.Archived, DocumentStatus.PendingReview])(
    'rejects creating with status %s',
    async (status) => {
      await expectCode(
        service.create({ ...dto, status }),
        'DOCUMENT_CREATE_STATUS_INVALID',
      );
      expect(contentRepo.create).not.toHaveBeenCalled();
    },
  );
});

describe('DocumentService.update', () => {
  it('rejects body edits while under review before touching storage', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.PendingReview }),
    );

    await expectCode(
      service.update('10001', { content: '新正文' }),
      'DOCUMENT_UNDER_REVIEW',
    );
    expect(contentRepo.updateContent).not.toHaveBeenCalled();
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('allows metadata edits while under review', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.PendingReview }),
    );

    const result = await service.update('10001', { tags: 'a,b' });

    expect(result.tags).toBe('a,b');
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });

  it('requires saving as draft before editing a published body under approval', async () => {
    reviewService.isApprovalRequired.mockReturnValue(true);
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Published }),
    );

    await expectCode(
      service.update('10001', { title: '新标题' }),
      'DOCUMENT_PUBLISHED_EDIT_REQUIRES_DRAFT',
    );
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it('allows unpublishing and editing in one PATCH under approval', async () => {
    reviewService.isApprovalRequired.mockReturnValue(true);
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Published }),
    );

    const result = await service.update('10001', {
      status: DocumentStatus.Draft,
      content: '新正文',
    });

    expect(result.status).toBe(DocumentStatus.Draft);
    expect(result.content).toBe('新正文');
    expect(pipelinePublisher.afterUnpublish).toHaveBeenCalledWith('10001');
    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
  });

  it('reindexes a published body edit when approval is off', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Published }),
    );

    await service.update('10001', { content: '新正文' });

    expect(pipelinePublisher.afterPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: '新正文' }),
    );
  });

  it('does not reindex a published document for metadata-only edits', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      draftDoc({ status: DocumentStatus.Published }),
    );

    await service.update('10001', { tags: 'a' });

    expect(pipelinePublisher.afterPublish).not.toHaveBeenCalled();
    expect(pipelinePublisher.afterUnpublish).not.toHaveBeenCalled();
  });

  it.each([
    [DocumentStatus.Draft, DocumentStatus.Published],
    [DocumentStatus.Published, DocumentStatus.Archived],
    [DocumentStatus.Draft, DocumentStatus.PendingReview],
  ])('rejects PATCH status %s → %s', async (from, to) => {
    documentRepo.findActiveById.mockResolvedValue(draftDoc({ status: from }));

    await expectCode(
      service.update('10001', { status: to }),
      'DOCUMENT_STATUS_CHANGE_NOT_ALLOWED',
    );
    expect(documentRepo.save).not.toHaveBeenCalled();
  });
});

describe('DocumentService.archive / saveAsDraft', () => {
  it.each([
    ['archive', DocumentStatus.Archived],
    ['saveAsDraft', DocumentStatus.Draft],
  ] as const)(
    '%s moves a published document out and unpublishes',
    async (method, target) => {
      documentRepo.findActiveById.mockResolvedValue(
        draftDoc({ status: DocumentStatus.Published }),
      );

      const result = await service[method]('10001');

      expect(result.status).toBe(target);
      expect(pipelinePublisher.afterUnpublish).toHaveBeenCalledWith('10001');
    },
  );

  it.each(['archive', 'saveAsDraft'] as const)(
    '%s rejects a non-published document',
    async (method) => {
      documentRepo.findActiveById.mockResolvedValue(draftDoc());

      await expectCode(
        service[method]('10001'),
        'DOCUMENT_TRANSITION_NOT_ALLOWED',
      );
      expect(documentRepo.save).not.toHaveBeenCalled();
      expect(pipelinePublisher.afterUnpublish).not.toHaveBeenCalled();
    },
  );
});

describe('DocumentService.remove', () => {
  it('soft deletes with pending review cancellation and requests cleanup even if publishing fails', async () => {
    const doc = draftDoc({ status: DocumentStatus.PendingReview });
    documentRepo.findActiveById.mockResolvedValue(doc);
    pipelinePublisher.afterUnpublish.mockRejectedValue(
      new Error('broker down'),
    );

    await expect(service.remove('10001')).resolves.toEqual({
      id: '10001',
      deleted: true,
    });
    expect(doc.deleted).toBe(true);
    expect(reviewRepo.saveDeletedDocument).toHaveBeenCalledWith(
      doc,
      expect.any(String),
    );
    expect(contentRepo.softDelete).toHaveBeenCalledWith(doc.contentId);
    expect(pipelinePublisher.afterUnpublish).toHaveBeenCalledWith('10001');
  });
});
