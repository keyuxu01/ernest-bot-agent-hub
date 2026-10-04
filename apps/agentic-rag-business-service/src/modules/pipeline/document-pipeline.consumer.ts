import { Injectable, Logger } from '@nestjs/common';
import { RagReindexMessageV1Schema } from '@repo/contracts';
import type { ConsumeMessage } from 'amqplib';
import { RAG_REINDEX_QUEUE } from '../../infrastructure/rabbitmq/constants/rabbitmq.constants';
import { RabbitMqService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { PipelineOrchestrator } from './pipeline.orchestrator';

/**
 * 文档发布后管线的 MQ 消费者
 *
 * 只做边界适配：解析版本化消息 → 调用 PipelineOrchestrator。
 * 注册时机：构造函数里 `registerHandler`。消费者模块依赖 RabbitmqModule，
 * MQ 的 onModuleInit 必然先结束，本队列此时还没登记；
 * 登记时 channel 已在，registerHandler 立刻 consume。
 */
@Injectable()
class DocumentPipelineConsumer {
  private readonly logger = new Logger(DocumentPipelineConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly orchestrator: PipelineOrchestrator,
  ) {
    this.rabbit.registerHandler(RAG_REINDEX_QUEUE, (msg) =>
      this.handleRag(msg),
    );
  }

  /** RAG：分块 → 向量化 → ES kh_chunk（dense_vector） */
  private async handleRag(msg: ConsumeMessage): Promise<void> {
    const body = RagReindexMessageV1Schema.parse(
      // Publish 时候是 JSON 字符串，这里转回 JS 对象
      // 再校验解析结果
      JSON.parse(msg.content.toString('utf8')),
    );
    this.logger.log(
      `[RAG] type=${body.type}, taskId=${body.taskId}, documentIds=${JSON.stringify(body.documentIds)}`,
    );
    await this.orchestrator.handleRagReindex(body.type, body.documentIds);
  }
}

export { DocumentPipelineConsumer };
