import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentIndexSyncService } from './document-index-sync.service';
import { DocumentReviewService } from './document-review.service';
import {
  DocumentReviewResult,
  type DocumentReviewEntity,
} from './entities/document-review.entity';
import {
  DocumentStatus,
  type DocumentEntity,
} from './entities/document.entity';
import type { DocumentReviewRepository } from './repository/document-review.repository';
import type { DocumentRepository } from './repository/document.repository';
import type { DocumentLifecycleErrorCode } from './type/document-lifecycle.types';
import type { AuthUser } from '../user/type/user.types';

function doc(status: DocumentStatus): DocumentEntity {
  return {
    id: '10001',
    title: '标题',
    contentId: '507f1f77bcf86cd799439011',
    status,
    deleted: false,
  } as DocumentEntity;
}

function pendingReview(
  overrides: Partial<DocumentReviewEntity> = {},
): DocumentReviewEntity {
  return {
    id: '90001',
    documentId: '10001',
    beforeStatus: DocumentStatus.Draft,
    reviewResult: null,
    createdAt: new Date(),
    ...overrides,
  } as DocumentReviewEntity;
}

async function expectCode(
  promise: Promise<unknown>,
  code: DocumentLifecycleErrorCode,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toMatchObject({ code });
}

const reviewer: AuthUser = {
  userId: '20001',
  username: 'reviewer',
  realName: '审核员张三',
  email: null,
  avatar: null,
  roles: ['ROLE_REVIEWER'],
  permissions: [],
  teamIds: [],
};

const documentRepo = { findActiveById: vi.fn() };
const reviewRepo = {
  close: vi.fn(),
  countPending: vi.fn(),
  createPending: vi.fn(),
  findById: vi.fn(),
  findHistory: vi.fn(),
  findPage: vi.fn(),
  findPendingByDocumentId: vi.fn(),
};
const indexSync = { publish: vi.fn(), unpublish: vi.fn() };
const config = { get: vi.fn() };

let service: DocumentReviewService;

beforeEach(() => {
  vi.clearAllMocks();
  reviewRepo.createPending.mockResolvedValue(true);
  reviewRepo.close.mockResolvedValue(true);
  service = new DocumentReviewService(
    documentRepo as unknown as DocumentRepository,
    reviewRepo as unknown as DocumentReviewRepository,
    indexSync as unknown as DocumentIndexSyncService,
    config as unknown as ConfigService,
  );
});

describe('DocumentReviewService.isApprovalRequired', () => {
  it('defaults to enabled when the switch is absent', () => {
    config.get.mockReturnValue(undefined);
    expect(service.isApprovalRequired()).toBe(true);
  });

  it('follows the normalized switch', () => {
    config.get.mockReturnValue(false);
    expect(service.isApprovalRequired()).toBe(false);
  });
});

describe('DocumentReviewService.submit', () => {
  it.each([DocumentStatus.Draft, DocumentStatus.Archived])(
    'moves status %s to pending review without touching the index',
    async (status) => {
      documentRepo.findActiveById.mockResolvedValue(doc(status));

      const result = await service.submit('10001');

      expect(result.status).toBe(DocumentStatus.PendingReview);
      expect(reviewRepo.createPending).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: '10001', beforeStatus: status }),
        result,
      );
      expect(indexSync.unpublish).not.toHaveBeenCalled();
    },
  );

  it('clears the index when a published document is submitted', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      doc(DocumentStatus.Published),
    );

    await service.submit('10001');

    expect(indexSync.unpublish).toHaveBeenCalledWith('10001');
  });

  it('rejects a document already under review', async () => {
    documentRepo.findActiveById.mockResolvedValue(
      doc(DocumentStatus.PendingReview),
    );

    await expectCode(
      service.submit('10001'),
      'DOCUMENT_REVIEW_ALREADY_PENDING',
    );
    expect(reviewRepo.createPending).not.toHaveBeenCalled();
  });

  it('reports a concurrent pending review and restores the in-memory status', async () => {
    const draft = doc(DocumentStatus.Published);
    documentRepo.findActiveById.mockResolvedValue(draft);
    reviewRepo.createPending.mockResolvedValue(false);

    await expectCode(
      service.submit('10001'),
      'DOCUMENT_REVIEW_ALREADY_PENDING',
    );
    expect(draft.status).toBe(DocumentStatus.Published);
    expect(indexSync.unpublish).not.toHaveBeenCalled();
  });
});

describe('DocumentReviewService.approve', () => {
  it('publishes the document in the closing transaction, then indexes it', async () => {
    reviewRepo.findById.mockResolvedValue(pendingReview());
    documentRepo.findActiveById.mockResolvedValue(
      doc(DocumentStatus.PendingReview),
    );

    const result = await service.approve(
      '90001',
      { reviewComment: '  符合规范  ' },
      reviewer,
    );

    expect(result.status).toBe(DocumentStatus.Published);
    expect(result.publishTime).toBeInstanceOf(Date);
    expect(reviewRepo.close).toHaveBeenCalledWith(
      {
        reviewId: '90001',
        result: DocumentReviewResult.Approved,
        reviewerId: '20001',
        reviewerName: '审核员张三',
        reviewComment: '符合规范',
      },
      result,
    );
    expect(indexSync.publish).toHaveBeenCalledWith(result);
  });

  it('returns a stable 404 code for an unknown review', async () => {
    reviewRepo.findById.mockResolvedValue(null);

    await expectCode(
      service.approve('missing', {}, reviewer),
      'DOCUMENT_REVIEW_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  });

  it('rejects a review that is already closed', async () => {
    reviewRepo.findById.mockResolvedValue(
      pendingReview({ reviewResult: DocumentReviewResult.Rejected }),
    );

    await expectCode(
      service.approve('90001', {}, reviewer),
      'DOCUMENT_REVIEW_ALREADY_CLOSED',
    );
    expect(reviewRepo.close).not.toHaveBeenCalled();
  });

  it('does not index when a concurrent decision closed the review first', async () => {
    reviewRepo.findById.mockResolvedValue(pendingReview());
    documentRepo.findActiveById.mockResolvedValue(
      doc(DocumentStatus.PendingReview),
    );
    reviewRepo.close.mockResolvedValue(false);

    await expectCode(
      service.approve('90001', {}, reviewer),
      'DOCUMENT_REVIEW_ALREADY_CLOSED',
    );
    expect(indexSync.publish).not.toHaveBeenCalled();
  });

  it('rejects when the document is no longer pending review', async () => {
    reviewRepo.findById.mockResolvedValue(pendingReview());
    documentRepo.findActiveById.mockResolvedValue(doc(DocumentStatus.Draft));

    await expectCode(
      service.approve('90001', {}, reviewer),
      'DOCUMENT_TRANSITION_NOT_ALLOWED',
    );
    expect(reviewRepo.close).not.toHaveBeenCalled();
  });
});

describe('DocumentReviewService.reject', () => {
  it('requires a non-blank comment', async () => {
    await expectCode(
      service.reject('90001', { reviewComment: '   ' }, reviewer),
      'DOCUMENT_REVIEW_COMMENT_REQUIRED',
    );
    expect(reviewRepo.findById).not.toHaveBeenCalled();
  });

  it('moves the document back to draft without indexing', async () => {
    reviewRepo.findById.mockResolvedValue(pendingReview());
    documentRepo.findActiveById.mockResolvedValue(
      doc(DocumentStatus.PendingReview),
    );

    const result = await service.reject(
      '90001',
      { reviewComment: ' 缺少附件 ' },
      { ...reviewer, realName: null },
    );

    expect(result.status).toBe(DocumentStatus.Draft);
    expect(reviewRepo.close).toHaveBeenCalledWith(
      expect.objectContaining({
        result: DocumentReviewResult.Rejected,
        reviewComment: '缺少附件',
        // 没有显示名时用用户名
        reviewerName: 'reviewer',
        reviewerId: '20001',
      }),
      result,
    );
    expect(indexSync.publish).not.toHaveBeenCalled();
    expect(indexSync.unpublish).not.toHaveBeenCalled();
  });
});

describe('DocumentReviewService.listTasks', () => {
  it.each([
    [undefined, null],
    ['pending', null],
    ['approved', DocumentReviewResult.Approved],
    ['rejected', DocumentReviewResult.Rejected],
  ] as const)('maps filter %s to result %s', async (status, result) => {
    reviewRepo.findPage.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    await service.listTasks({ status, page: 2, pageSize: 10 });

    expect(reviewRepo.findPage).toHaveBeenCalledWith({
      result,
      page: 2,
      pageSize: 10,
    });
  });
});
