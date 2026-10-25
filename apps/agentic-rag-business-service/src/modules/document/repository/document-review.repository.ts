import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { DOCUMENT_REVIEW_PENDING_UNIQUE_INDEX } from '../constants/document-review.constants';
import {
  DocumentReviewEntity,
  DocumentReviewResult,
} from '../entities/document-review.entity';
import { DocumentEntity } from '../entities/document.entity';
import type {
  CloseDocumentReviewInput,
  DocumentReviewPageQuery,
} from '../type/document-lifecycle.types';

/**
 * PostgreSQL `kh_document_review` 数据访问
 *
 * 职责：审核记录的查询，以及「审核记录 + 文档状态」必须同时成功的 PG 事务。
 * 两张表同在 PostgreSQL，事务内一起提交，避免「审核已通过但文档仍待审」的中间态。
 * 不包含业务规则（能否提审 / 结案后文档变成什么状态由 DocumentReviewService 决定）。
 *
 * 事务边界（createPending / close / saveDeletedDocument）：
 * - 事务内：只包含 kh_document_review 与 kh_document 两张 PG 表的写入。
 * - 事务外：Mongo 正文写入（无跨库事务，见 ADR-0013）；MQ 索引投递由调用方在提交后发出，
 *   失败不回滚（无 outbox，见 ADR-0023）。
 * - 调用方传入的 document 是事务外读到的实体，事务内没有 `SELECT ... FOR UPDATE` 重读加锁。
 *   并发防护只靠两点：部分唯一索引（防重复提审）、`review_result IS NULL` 条件更新（防重复结案）。
 *   推断仍有边缘竞态：审核通过与删除几乎同时、且通过先提交时，删除事务用旧状态
 *   （PendingReview）保存文档，可能把 status 写回 PendingReview。尚未复现，后续可在事务内
 *   加行锁重读文档消除。
 * - 以上事务行为目前只有单测（仓储被 mock），未在真实 PostgreSQL 上验证回滚与条件更新。
 */
@Injectable()
class DocumentReviewRepository {
  constructor(
    /** TypeORM 实体仓库，对应表 `kh_document_review` */
    @InjectRepository(DocumentReviewEntity)
    private readonly repo: Repository<DocumentReviewEntity>,
  ) {}

  /**
   * 事务内：插入待审记录 + 保存文档（status 已由调用方改为 PendingReview）
   * @returns false 表示该文档已有待审记录（部分唯一索引拒绝），事务整体回滚
   */
  async createPending(
    review: Pick<DocumentReviewEntity, 'id' | 'documentId' | 'beforeStatus'>,
    document: DocumentEntity,
  ): Promise<boolean> {
    try {
      // 两条写入同一事务：插入被拒时文档状态也不会改成 PendingReview
      await this.repo.manager.transaction(async (em) => {
        // 先插审核记录：并发提审时第二个请求在这里被部分唯一索引拒绝
        await em.insert(DocumentReviewEntity, review);
        await em.save(document);
      });
      return true;
    } catch (error) {
      // 只把「待审唯一」冲突转成业务结果；其他数据库错误照常上抛
      if (isPendingUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 事务内：结案仍处于待审的记录 + 保存文档
   * 条件更新 `review_result IS NULL`，并发通过 / 驳回同一任务时只有一个成功。
   * @returns false 表示任务已被结案，文档不做修改
   */
  async close(
    input: CloseDocumentReviewInput,
    document: DocumentEntity,
  ): Promise<boolean> {
    return this.repo.manager.transaction(async (em) => {
      // 条件更新兼作「抢占」：两个请求同时结案，第二个的 UPDATE 会等第一个提交，
      // 重新检查 WHERE 时 review_result 已非空，影响 0 行
      const result = await em
        .createQueryBuilder()
        .update(DocumentReviewEntity)
        .set({
          reviewResult: input.result,
          reviewerId: input.reviewerId,
          reviewerName: input.reviewerName,
          reviewComment: input.reviewComment,
          reviewedAt: new Date(),
        })
        .where('id = :id AND review_result IS NULL', { id: input.reviewId })
        .execute();
      // 没抢到：直接返回，文档不做修改（事务内无写入，提交即空操作）
      if (!result.affected) {
        return false;
      }
      // 抢到后才改文档状态，与审核记录同一事务提交
      await em.save(document);
      return true;
    });
  }

  /**
   * 事务内：保存已软删的文档 + 撤销其待审任务（若有）
   * 避免已删除文档的任务留在待办里、审核时才报文档不存在
   */
  async saveDeletedDocument(
    document: DocumentEntity,
    cancelComment: string,
  ): Promise<void> {
    await this.repo.manager.transaction(async (em) => {
      // document.deleted 已由调用方置为 true
      await em.save(document);
      // 撤销仍在待审的任务；没有待审任务时影响 0 行，属正常情况
      await em
        .createQueryBuilder()
        .update(DocumentReviewEntity)
        .set({
          reviewResult: DocumentReviewResult.Cancelled,
          reviewComment: cancelComment,
          reviewedAt: new Date(),
        })
        .where('document_id = :documentId AND review_result IS NULL', {
          documentId: document.id,
        })
        .execute();
    });
  }

  async findById(id: string): Promise<DocumentReviewEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 文档当前待审记录（部分唯一索引保证至多一条） */
  async findPendingByDocumentId(
    documentId: string,
  ): Promise<DocumentReviewEntity | null> {
    return this.repo.findOne({
      where: { documentId, reviewResult: IsNull() },
    });
  }

  /** 文档全部审核记录，按提交时间倒序 */
  async findHistory(documentId: string): Promise<DocumentReviewEntity[]> {
    return this.repo.find({
      where: { documentId },
      order: { createdAt: 'DESC' },
    });
  }

  async countPending(): Promise<number> {
    return this.repo.count({ where: { reviewResult: IsNull() } });
  }

  /** 按结果分页；result 为 null 时查待审 */
  async findPage(query: DocumentReviewPageQuery): Promise<{
    items: DocumentReviewEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [items, total] = await this.repo.findAndCount({
      where: {
        reviewResult: query.result === null ? IsNull() : query.result,
      },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

/** PG 唯一约束冲突（23505）且命中「待审唯一」索引 */
function isPendingUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as
    { code?: string; constraint?: string } | undefined;
  return (
    driverError?.code === '23505' &&
    driverError.constraint === DOCUMENT_REVIEW_PENDING_UNIQUE_INDEX
  );
}

export { DocumentReviewRepository };
