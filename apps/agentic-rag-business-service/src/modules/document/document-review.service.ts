import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nextSnowflakeId } from '../../common/helpers/snowflake-id';
import type { AuthUser } from '../user/type/user.types';
import { DOCUMENT_REQUIRE_APPROVAL_KEY } from './constants/document-review.constants';
import { DocumentIndexSyncService } from './document-index-sync.service';
import type {
  ApproveReviewDto,
  QueryReviewTasksDto,
  RejectReviewDto,
} from './dto/document-review.dto';
import {
  DocumentReviewResult,
  type DocumentReviewEntity,
} from './entities/document-review.entity';
import {
  DocumentStatus,
  type DocumentEntity,
} from './entities/document.entity';
import { documentLifecycleError } from './helpers/document-lifecycle-error';
import { canSubmitReviewFrom } from './helpers/document-status-rules';
import { DocumentReviewRepository } from './repository/document-review.repository';
import { DocumentRepository } from './repository/document.repository';
import type { DocumentReviewTaskFilter } from './type/document-lifecycle.types';

/** 列表筛选值 → review_result；pending 对应 NULL */
const RESULT_BY_FILTER: Record<
  DocumentReviewTaskFilter,
  DocumentReviewResult | null
> = {
  pending: null,
  approved: DocumentReviewResult.Approved,
  rejected: DocumentReviewResult.Rejected,
};

/**
 * 文档发布审核
 *
 * 流程：提交审核（Draft / Published / Archived → PendingReview，记一条 kh_document_review）
 * → 通过（→ Published 并建索引）或驳回（→ Draft）。
 * 审核记录与文档状态在同一 PG 事务提交；索引投递在事务之后，失败不回滚。
 *
 * 开关：DOCUMENT_REQUIRE_APPROVAL（默认开启）。关闭时 publish 不经过本服务，
 * 但单独的提交审核接口仍可用。
 *
 * 权限：通过 / 驳回由 Controller 的 @Roles 限定为审核员或管理员，审核人取自登录用户（ADR-0024）。
 * 不限制「作者审核自己的文档」，也不校验提审人是否为文档作者。
 */
@Injectable()
class DocumentReviewService {
  private readonly logger = new Logger(DocumentReviewService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly reviewRepo: DocumentReviewRepository,
    private readonly indexSync: DocumentIndexSyncService,
    private readonly config: ConfigService,
  ) {}

  /** 是否开启发布审核（环境校验已把开关规范为 boolean，缺省 true） */
  isApprovalRequired(): boolean {
    return this.config.get<boolean>(DOCUMENT_REQUIRE_APPROVAL_KEY) ?? true;
  }

  /**
   * 提交审核：Draft / Published / Archived → PendingReview
   * 来自 Published 时先清索引：审核期间不可检索。
   */
  async submit(documentId: string): Promise<DocumentEntity> {
    const doc = await this.findDocumentOrThrow(documentId);
    if (doc.status === DocumentStatus.PendingReview) {
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_ALREADY_PENDING',
        '该文档已有待审核任务',
      );
    }
    if (!canSubmitReviewFrom(doc.status)) {
      throw documentLifecycleError(
        'DOCUMENT_TRANSITION_NOT_ALLOWED',
        '当前文档状态不允许提交审核',
      );
    }

    const beforeStatus = doc.status;
    const reviewId = nextSnowflakeId();
    doc.status = DocumentStatus.PendingReview;
    const created = await this.reviewRepo.createPending(
      { id: reviewId, documentId, beforeStatus },
      doc,
    );
    if (!created) {
      // 并发提审：另一请求已插入待审记录，本次事务已回滚
      doc.status = beforeStatus;
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_ALREADY_PENDING',
        '该文档已有待审核任务',
      );
    }

    if (beforeStatus === DocumentStatus.Published) {
      await this.indexSync.unpublish(documentId);
    }
    this.logger.log(
      `文档已提交审核：documentId=${documentId}, reviewId=${reviewId}, beforeStatus=${beforeStatus}`,
    );
    return doc;
  }

  /** 审核通过 → Published，刷新 publishTime 并建索引；审核人取自登录用户 */
  async approve(
    reviewId: string,
    dto: ApproveReviewDto,
    reviewer: AuthUser,
  ): Promise<DocumentEntity> {
    const doc = await this.findReviewedDocument(reviewId);
    doc.status = DocumentStatus.Published;
    doc.publishTime = new Date();
    await this.closeOrThrow(
      {
        reviewId,
        result: DocumentReviewResult.Approved,
        reviewerId: reviewer.userId,
        reviewerName: reviewerDisplayName(reviewer),
        reviewComment: dto.reviewComment?.trim() || null,
      },
      doc,
    );

    await this.indexSync.publish(doc);
    this.logger.log(`审核通过：reviewId=${reviewId}, documentId=${doc.id}`);
    return doc;
  }

  /** 审核驳回 → Draft；提审前已清过索引，这里不再投递 */
  async reject(
    reviewId: string,
    dto: RejectReviewDto,
    reviewer: AuthUser,
  ): Promise<DocumentEntity> {
    const comment = dto.reviewComment?.trim();
    if (!comment) {
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_COMMENT_REQUIRED',
        '驳回意见不能为空',
      );
    }

    const doc = await this.findReviewedDocument(reviewId);
    doc.status = DocumentStatus.Draft;
    await this.closeOrThrow(
      {
        reviewId,
        result: DocumentReviewResult.Rejected,
        reviewerId: reviewer.userId,
        reviewerName: reviewerDisplayName(reviewer),
        reviewComment: comment,
      },
      doc,
    );

    this.logger.log(`审核驳回：reviewId=${reviewId}, documentId=${doc.id}`);
    return doc;
  }

  /** 待办 / 已通过 / 已驳回 分页列表 */
  async listTasks(query: QueryReviewTasksDto) {
    return this.reviewRepo.findPage({
      result: RESULT_BY_FILTER[query.status ?? 'pending'],
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  async countPending(): Promise<number> {
    return this.reviewRepo.countPending();
  }

  /** 文档当前待审任务（无则 null） */
  async getCurrent(documentId: string): Promise<DocumentReviewEntity | null> {
    return this.reviewRepo.findPendingByDocumentId(documentId);
  }

  /** 文档全部审核记录（含通过 / 驳回 / 撤销） */
  async getHistory(documentId: string): Promise<DocumentReviewEntity[]> {
    return this.reviewRepo.findHistory(documentId);
  }

  /**
   * 读待审任务及其文档；文档必须仍处于 PendingReview
   * 任务已结案、或文档状态已被改动时拒绝，避免覆盖别处的流转结果
   */
  private async findReviewedDocument(
    reviewId: string,
  ): Promise<DocumentEntity> {
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_NOT_FOUND',
        `Review ${reviewId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (review.reviewResult != null) {
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_ALREADY_CLOSED',
        '该审核任务已处理',
      );
    }

    const doc = await this.findDocumentOrThrow(review.documentId);
    if (doc.status !== DocumentStatus.PendingReview) {
      throw documentLifecycleError(
        'DOCUMENT_TRANSITION_NOT_ALLOWED',
        '文档当前不在待审核状态',
      );
    }
    return doc;
  }

  /** 条件结案；并发下已被另一请求结案时抛错 */
  private async closeOrThrow(
    input: Parameters<DocumentReviewRepository['close']>[0],
    doc: DocumentEntity,
  ): Promise<void> {
    const closed = await this.reviewRepo.close(input, doc);
    if (!closed) {
      throw documentLifecycleError(
        'DOCUMENT_REVIEW_ALREADY_CLOSED',
        '该审核任务已处理',
      );
    }
  }

  private async findDocumentOrThrow(id: string): Promise<DocumentEntity> {
    const doc = await this.documentRepo.findActiveById(id);
    if (!doc) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return doc;
  }
}

/** 审核记录上的审核人名：realName ?? username */
function reviewerDisplayName(reviewer: AuthUser): string {
  return reviewer.realName ?? reviewer.username;
}

export { DocumentReviewService };
