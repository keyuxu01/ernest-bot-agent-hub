import { Injectable, Logger } from '@nestjs/common';
import {
  RagBusinessReindexMessageV1Schema,
  type RagBusinessReindexMessageV1Input,
} from '@repo/contracts';
import { randomUUID } from 'crypto';
import {
  RAG_REINDEX_EXCHANGE,
  RAG_RK_BY_IDS,
} from './constants/rabbitmq.constants';
import { RabbitMqService } from './rabbitmq.service';

/**
 * 文档发布后的 RAG 命令生产者
 *
 * 只负责组版本化消息并通过 publisher confirm 投递。
 * 投递失败只打日志，不回滚「已发布」状态（由 DocumentService 约定）。
 */
@Injectable()
class DocumentPipelinePublisher {
  private readonly logger = new Logger(DocumentPipelinePublisher.name);

  constructor(private readonly rabbit: RabbitMqService) {}

  /** 发布成功后调用：按文档 ID 投递 RAG 重建任务 */
  async afterPublish(documentId: string): Promise<void> {
    const message = RagBusinessReindexMessageV1Schema.parse({
      taskId: randomUUID(),
      type: 'BY_DOC_IDS',
      documentIds: [documentId],
    } satisfies RagBusinessReindexMessageV1Input);
    const ok = await this.rabbit.publish(
      RAG_REINDEX_EXCHANGE,
      RAG_RK_BY_IDS,
      message,
    );
    this.logger.log(
      `RAG 重建索引${ok ? '已投递' : '投递失败'}：documentId=${documentId}, taskId=${message.taskId}`,
    );
  }
}

export { DocumentPipelinePublisher };
