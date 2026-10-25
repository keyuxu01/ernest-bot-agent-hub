import { Injectable, Logger } from '@nestjs/common';
import { DocumentPipelinePublisher } from '../../infrastructure/rabbitmq/document-pipeline.publisher';
import type { DocumentEntity } from './entities/document.entity';
import { buildSearchIndexData } from './helpers/build-search-index-data';
import { DocumentContentRepository } from './repository/document-content.repository';

/**
 * 文档状态变化后投递 RAG / Search / KG 索引命令
 *
 * 只在进入或离开 Published 时调用：进入 → index，离开（归档 / 存草稿 / 提审 / 删除）→ unpublish。
 * 投递失败只记日志，不回滚文档状态；与 ADR-0021 一致，没有 outbox 与自动补偿，
 * 重新发布即可重建。日志只带 documentId，不记正文。
 */
@Injectable()
class DocumentIndexSyncService {
  private readonly logger = new Logger(DocumentIndexSyncService.name);

  constructor(
    private readonly contentRepo: DocumentContentRepository,
    private readonly pipelinePublisher: DocumentPipelinePublisher,
  ) {}

  /**
   * 建 / 重建索引
   * @param content 已在手的正文；未传时按 contentId 读 Mongo
   */
  async publish(document: DocumentEntity, content?: string): Promise<void> {
    try {
      const body =
        content ??
        (await this.contentRepo.findActiveContentById(document.contentId))
          ?.content;
      await this.pipelinePublisher.afterPublish(
        buildSearchIndexData(document, body),
      );
    } catch (error) {
      this.logger.warn(
        `索引投递失败（不影响文档状态）：documentId=${document.id}, error=${toMessage(error)}`,
      );
    }
  }

  /** 清理该文档在 ES / Neo4j 的索引数据 */
  async unpublish(documentId: string): Promise<void> {
    try {
      await this.pipelinePublisher.afterUnpublish(documentId);
    } catch (error) {
      this.logger.warn(
        `索引清理投递失败（不影响文档状态）：documentId=${documentId}, error=${toMessage(error)}`,
      );
    }
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { DocumentIndexSyncService };
