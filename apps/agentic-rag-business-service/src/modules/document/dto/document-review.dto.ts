import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DOCUMENT_REVIEW_TASK_FILTERS } from '../constants/document-review.constants';
import type { DocumentReviewTaskFilter } from '../type/document-lifecycle.types';

/** 审核任务列表查询（审核员工作台） */
export class QueryReviewTasksDto {
  /** pending 待办 | approved 已通过 | rejected 已驳回；默认 pending */
  @IsOptional()
  @IsIn(DOCUMENT_REVIEW_TASK_FILTERS)
  status?: DocumentReviewTaskFilter;

  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** 每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

/**
 * 审核通过请求体
 * 审核人取自登录用户，请求体不接受 reviewerId / reviewerName（传了会被全局校验拒绝）
 */
export class ApproveReviewDto {
  /** 审核意见 */
  @IsOptional()
  @IsString()
  reviewComment?: string;
}

/** 审核驳回请求体：意见必填（服务端再去空白校验） */
export class RejectReviewDto {
  @IsString()
  @IsNotEmpty()
  reviewComment: string;
}
