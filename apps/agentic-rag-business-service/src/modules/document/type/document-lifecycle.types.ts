import type { z } from 'zod';
import type { documentLifecycleErrorCodeSchema } from '../schemas/document-lifecycle.zod';
import type { DocumentReviewResult } from '../entities/document-review.entity';

/** 文档状态流转 / 审核错误码 */
type DocumentLifecycleErrorCode = z.infer<
  typeof documentLifecycleErrorCodeSchema
>;

/** 审核任务列表筛选值 */
type DocumentReviewTaskFilter = 'pending' | 'approved' | 'rejected';

/** 审核任务分页查询（Repository 入参） */
type DocumentReviewPageQuery = {
  /** NULL 表示待审 */
  result: DocumentReviewResult | null;
  page: number;
  pageSize: number;
};

/** 审核结案入参：只会更新仍处于待审的记录 */
type CloseDocumentReviewInput = {
  reviewId: string;
  result: DocumentReviewResult;
  reviewerId: string | null;
  reviewerName: string;
  reviewComment: string | null;
};

export type {
  CloseDocumentReviewInput,
  DocumentLifecycleErrorCode,
  DocumentReviewPageQuery,
  DocumentReviewTaskFilter,
};
