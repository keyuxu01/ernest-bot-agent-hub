import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  RagBusinessKgBuildMessageV1Schema,
  RagBusinessReindexMessageV1Schema,
  RagBusinessSearchIndexMessageV1Schema,
  type RagBusinessKgBuildMessageV1Input,
  type RagBusinessReindexMessageV1Input,
  type RagBusinessSearchIndexMessageV1Input,
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
   * @description 发布成功后调用：并行投递 RAG / Search / KG，三条消息都只带文档 ID
   * @param documentId string，已进入 Published 的文档 ID
   * @returns Promise<void>，单条投递失败只记日志
   */
  async afterPublish(documentId: string) {
    await Promise.all([
      this.triggerRagReindex(documentId),
      this.triggerSearchIndex(documentId),
      this.triggerKgBuild(documentId),
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
   * @description Search：只投 documentId，消费者从 Postgres + Mongo 拉全文再写 ES，
   * 避免 MQ 塞正文、也不再截断前 1000 字
   * @param documentId string，文档 ID
   * @returns Promise<void>，投递失败只记日志
   */
  private async triggerSearchIndex(documentId: string) {
    const message: RagBusinessSearchIndexMessageV1Input = {
      taskId: randomUUID(),
      type: 'INDEX',
      documentId,
    };
    const ok = await this.rabbit.publish(
      SEARCH_INDEX_EXCHANGE,
      SEARCH_RK_INDEX,
      RagBusinessSearchIndexMessageV1Schema.parse(message),
    );
    this.logger.log(
      `ES 搜索索引${ok ? '已投递' : '投递失败'}：documentId=${documentId}, taskId=${message.taskId}`,
    );
  }

  /**
   * @description Search：投递按文档 ID 删除 kh_document 记录的命令
   * @param documentId string，文档 ID
   * @returns Promise<void>，投递失败只记日志
   */
  private async triggerSearchDelete(documentId: string) {
    const message: RagBusinessSearchIndexMessageV1Input = {
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
