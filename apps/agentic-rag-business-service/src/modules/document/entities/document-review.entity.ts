import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';
import { DocumentStatus } from './document.entity';

/** 审核结果；NULL 表示待审 */
enum DocumentReviewResult {
  /** 通过：文档 → Published */
  Approved = 1,
  /** 驳回：文档 → Draft */
  Rejected = 2,
  /** 撤销：待审期间文档被删除，任务随之关闭 */
  Cancelled = 3,
}

/**
 * 文档发布审核记录（PostgreSQL kh_document_review）
 *
 * 生命周期：提交审核时插入（review_result = NULL）→ 通过 / 驳回 / 撤销时回填结果结案。
 * 同一 document_id 可有多条历史，但同时最多一条待审（部分唯一索引兜底并发提审）。
 * 关联键：document_id → kh_document.id。
 */
@Entity('kh_document_review')
class DocumentReviewEntity {
  /** 雪花 ID */
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  /** 被审文档 ID */
  @Column({
    name: 'document_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  documentId: string;

  /** 审核人 ID；待审时为 NULL（暂由请求体传入，接入用户模块后改取登录用户） */
  @Column({
    name: 'reviewer_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  reviewerId?: string | null;

  /** 审核人姓名 */
  @Column({ name: 'reviewer_name', type: 'varchar', nullable: true })
  reviewerName?: string | null;

  /** NULL 待审 / 1 通过 / 2 驳回 / 3 撤销 */
  @Column({ name: 'review_result', type: 'smallint', nullable: true })
  reviewResult?: DocumentReviewResult | null;

  /** 审核意见（驳回必填） */
  @Column({ name: 'review_comment', type: 'varchar', nullable: true })
  reviewComment?: string | null;

  /** 提审前的文档状态（Draft / Published / Archived） */
  @Column({ name: 'before_status', type: 'smallint' })
  beforeStatus: DocumentStatus;

  /** 结案时间 */
  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date | null;

  /** 提交审核时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

export { DocumentReviewEntity, DocumentReviewResult };
