import { Injectable, Logger } from '@nestjs/common';
import { SearchIndexService } from '../../infrastructure/elasticsearch/search-index.service';
import { VectorIndexService } from '../../infrastructure/elasticsearch/vector-index.service';
import { GraphStoreService } from '../../infrastructure/neo4j/graph-store.service';
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

  /**
   * @description 注入异步投递器和三套索引存储，用于发布/下架与即时可见性同步
   * @param pipelinePublisher DocumentPipelinePublisher，投递完整建索引和删索引消息
   * @param searchIndex SearchIndexService，更新文档搜索可见性
   * @param vectorIndex VectorIndexService，更新向量块可见性
   * @param graphStore GraphStoreService，更新图谱文档节点可见性
   */
  constructor(
    private readonly pipelinePublisher: DocumentPipelinePublisher,
    private readonly searchIndex: SearchIndexService,
    private readonly vectorIndex: VectorIndexService,
    private readonly graphStore: GraphStoreService,
  ) {}

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

  /**
   * @description 已发布文档只改公开或所属团队时，立即同步三套索引的可见性字段，不重算向量或实体
   * @param document DocumentEntity，保存后的已发布文档
   * @returns Promise<void>，单个存储更新失败由各基础设施服务记录，不回滚文档保存
   */
  async updateVisibility(document: DocumentEntity): Promise<void> {
    const visibility = {
      isPublic: document.isPublic ?? false,
      teamId: document.teamId ?? null,
      authorId: document.authorId ?? null,
    };
    this.logger.log(
      `同步可见性：documentId=${document.id}, isPublic=${visibility.isPublic}, teamId=${visibility.teamId ?? '-'}`,
    );
    await Promise.all([
      this.searchIndex.updateVisibility(document.id, visibility),
      this.vectorIndex.updateVisibility(document.id, visibility),
      this.graphStore.updateVisibility(document.id, visibility),
    ]);
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
