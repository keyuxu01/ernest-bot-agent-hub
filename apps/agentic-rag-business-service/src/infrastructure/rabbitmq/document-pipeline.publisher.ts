import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  RagBusinessKgBuildMessageV1Schema,
  RagBusinessReindexMessageV1Schema,
  RagBusinessSearchIndexMessageV1Schema,
  type RagBusinessKgBuildMessageV1Input,
  type RagBusinessReindexMessageV1Input,
  type RagBusinessSearchDocument,
} from '@repo/contracts';
import {
  KG_GRAPH_EXCHANGE,
  KG_RK_BUILD_BY_IDS,
  KG_RK_DELETE,
  RAG_REINDEX_EXCHANGE,
  RAG_RK_BY_IDS,
  RAG_RK_DELETE,
  SEARCH_INDEX_EXCHANGE,
  SEARCH_RK_DELETE,
  SEARCH_RK_INDEX,
} from './constants/rabbitmq.constants';
import { RabbitMqService } from './rabbitmq.service';

/**
 * 文档发布后的知识管线「生产者」
 *
 * <p>触发：RAG 向量化 + Search 全文索引 + KG 建图。</p>
 * <p>约定：投递失败只打日志，<b>不回滚</b>文档已发布状态。</p>
 * <p>三条命令相互独立，任一条投递失败不影响其余两条。</p>
 */
@Injectable()
class DocumentPipelinePublisher {
  private readonly logger = new Logger(DocumentPipelinePublisher.name);

  constructor(private readonly rabbit: RabbitMqService) {}

  /**
   * 发布成功后调用：并行投递 RAG / Search / KG。
   * @param document 业务层已截断正文的快照；基础设施不依赖 DocumentEntity。
   */
  async afterPublish(document: RagBusinessSearchDocument) {
    await Promise.all([
      this.triggerRagReindex(document.id),
      this.triggerSearchIndex(document),
      this.triggerKgBuild(document.id),
    ]);
  }

  /** 归档/删除后：通知 RAG / Search / KG 按文档 ID 清理 */
  async afterUnpublish(documentId: string) {
    await Promise.all([
      this.triggerRagDelete(documentId),
      this.triggerSearchDelete(documentId),
      this.triggerKgDelete(documentId),
    ]);
  }

  /**
   * KG：按文档 ID 建图（迁自 knowledge-hub-backend `bb867d5e`）。
   * 与 RAG 一样只带 ID，消费者自行读正文，正文不进 broker。
   */
  private async triggerKgBuild(documentId: string) {
    const message: RagBusinessKgBuildMessageV1Input = {
      taskId: randomUUID(),
      type: 'BY_DOC_IDS',
      documentIds: [documentId],
    };
    const ok = await this.rabbit.publish(
      KG_GRAPH_EXCHANGE,
      KG_RK_BUILD_BY_IDS,
      RagBusinessKgBuildMessageV1Schema.parse(message),
    );
    this.logger.log(
      `KG 建图${ok ? '已投递' : '投递失败'}：documentId=${documentId}, taskId=${message.taskId}`,
    );
  }

  /** KG：删除文档图谱（文档节点、块、孤儿实体） */
  private async triggerKgDelete(documentId: string) {
    const message: RagBusinessKgBuildMessageV1Input = {
      taskId: randomUUID(),
      type: 'DELETE_BY_DOC_IDS',
      documentIds: [documentId],
    };
    const ok = await this.rabbit.publish(
      KG_GRAPH_EXCHANGE,
      KG_RK_DELETE,
      RagBusinessKgBuildMessageV1Schema.parse(message),
    );
    if (!ok) this.logger.warn(`KG 删除投递失败：documentId=${documentId}`);
  }

  /** RAG：按文档 ID 重建向量块 */
  private async triggerRagReindex(documentId: string) {
    const message: RagBusinessReindexMessageV1Input = {
      taskId: randomUUID(),
      type: 'BY_DOC_IDS',
      documentIds: [documentId],
    };
    const ok = await this.rabbit.publish(
      RAG_REINDEX_EXCHANGE,
      RAG_RK_BY_IDS,
      RagBusinessReindexMessageV1Schema.parse(message),
    );
    this.logger.log(
      `RAG 重建索引${ok ? '已投递' : '投递失败'}：documentId=${documentId}, taskId=${message.taskId}`,
    );
  }

  private async triggerRagDelete(documentId: string) {
    const message: RagBusinessReindexMessageV1Input = {
      taskId: randomUUID(),
      type: 'DELETE_BY_DOC_IDS',
      documentIds: [documentId],
    };
    const ok = await this.rabbit.publish(
      RAG_REINDEX_EXCHANGE,
      RAG_RK_DELETE,
      RagBusinessReindexMessageV1Schema.parse(message),
    );
    if (!ok) this.logger.warn(`RAG 删除投递失败：documentId=${documentId}`);
  }

  /**
   * Search：消息内直接带文档快照，消费者无需再查库也能写索引。
   * content 只截前 1000 字，控制消息体积。
   */
  private async triggerSearchIndex(document: RagBusinessSearchDocument) {
    const message = {
      taskId: randomUUID(),
      type: 'INDEX',
      documentId: document.id,
      document: document,
    };
    const ok = await this.rabbit.publish(
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_INDEX,
      RagBusinessSearchIndexMessageV1Schema.parse(message),
    );
    this.logger.log(
      `ES 搜索索引${ok ? '已投递' : '投递失败'}：documentId=${document.id}, taskId=${message.taskId}`,
    );
  }

  private async triggerSearchDelete(documentId: string) {
    const message = {
      taskId: randomUUID(),
      type: 'DELETE',
      documentId,
    };
    const ok = await this.rabbit.publish(
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_DELETE,
      RagBusinessSearchIndexMessageV1Schema.parse(message),
    );
    if (!ok) this.logger.warn(`Search 删除投递失败：documentId=${documentId}`);
  }
}

export { DocumentPipelinePublisher };
