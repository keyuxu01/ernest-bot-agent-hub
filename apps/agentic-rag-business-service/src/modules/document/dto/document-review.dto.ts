import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
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
 * reviewerId / reviewerName 暂由调用方传入、不做身份校验；接入用户模块后改取登录用户。
 */
export class ApproveReviewDto {
  /** 审核意见 */
  @IsOptional()
  @IsString()
  reviewComment?: string;

  /** 审核人 ID（雪花 ID 字符串，写入 BIGINT 列） */
  @IsOptional()
  @Matches(/^\d+$/)
  reviewerId?: string;

  /** 审核人姓名 */
  @IsOptional()
  @IsString()
  reviewerName?: string;
}

/**
 * 审核驳回请求体：意见必填
 * 不继承 ApproveReviewDto：class-validator 会合并父类的 @IsOptional，必填校验失效
 */
export class RejectReviewDto {
  /** 驳回意见（必填，服务端再去空白校验） */
  @IsString()
  @IsNotEmpty()
  reviewComment: string;

  /** 审核人 ID（雪花 ID 字符串，写入 BIGINT 列） */
  @IsOptional()
  @Matches(/^\d+$/)
  reviewerId?: string;

  /** 审核人姓名 */
  @IsOptional()
  @IsString()
  reviewerName?: string;
}
