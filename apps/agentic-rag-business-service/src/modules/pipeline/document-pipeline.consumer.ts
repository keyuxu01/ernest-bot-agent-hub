import { Injectable, Logger } from '@nestjs/common';
import {
  RagBusinessKgBuildMessageV1Schema,
  RagBusinessReindexMessageV1Schema,
  RagBusinessSearchIndexMessageV1Schema,
} from '@repo/contracts';
import type { ConsumeMessage } from 'amqplib';
import {
  KG_GRAPH_QUEUE,
  RAG_REINDEX_QUEUE,
  SEARCH_INDEX_QUEUE,
} from '../../infrastructure/rabbitmq/constants/rabbitmq.constants';
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
    this.rabbit.registerHandler(SEARCH_INDEX_QUEUE, (msg) =>
      this.handleSearch(msg),
    );
    // KG 建图走独立队列：LLM 抽取慢，不能堵住 RAG / Search 消息
    this.rabbit.registerHandler(KG_GRAPH_QUEUE, (msg) => this.handleKg(msg));
  }

  /** KG：分块 → LLM 抽实体关系 → Neo4j；只记 ID，不记正文 */
  private async handleKg(msg: ConsumeMessage): Promise<void> {
    const body = RagBusinessKgBuildMessageV1Schema.parse(
      JSON.parse(msg.content.toString('utf8')),
    );
    this.logger.log(
      `[KG] type=${body.type}, taskId=${body.taskId}, documentIds=${JSON.stringify(body.documentIds)}`,
    );
    await this.orchestrator.handleKgBuild(body.type, body.documentIds);
  }

  /** Search 边界校验：拒绝缺失快照、错误版本及 ID 不一致的消息，不记录正文。 */
  private async handleSearch(msg: ConsumeMessage): Promise<void> {
    const body = RagBusinessSearchIndexMessageV1Schema.parse(
      JSON.parse(msg.content.toString('utf8')),
    );
    this.logger.log(
      `[Search] type=${body.type}, taskId=${body.taskId}, documentId=${body.documentId}`,
    );
    await this.orchestrator.handleSearchIndex(body);
  }

  /** RAG：分块 → 向量化 → ES kh_chunk（dense_vector） */
  private async handleRag(msg: ConsumeMessage): Promise<void> {
    const body = RagBusinessReindexMessageV1Schema.parse(
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
