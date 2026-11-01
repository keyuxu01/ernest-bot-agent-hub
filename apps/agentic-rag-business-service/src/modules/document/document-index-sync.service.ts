import { Injectable, Logger } from '@nestjs/common';
import { DocumentPipelinePublisher } from '../../infrastructure/rabbitmq/document-pipeline.publisher';
import type { DocumentEntity } from './entities/document.entity';
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

  constructor(private readonly pipelinePublisher: DocumentPipelinePublisher) {}

  /**
   * @description 建 / 重建索引：只投递文档 ID，RAG / Search / KG 消费者各自从 PG + Mongo 读正文
   * @param document DocumentEntity，已进入 Published 的文档
   * @returns Promise<void>，投递失败只记日志，不抛
   */
  async publish(document: DocumentEntity): Promise<void> {
    try {
      await this.pipelinePublisher.afterPublish(document.id);
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
