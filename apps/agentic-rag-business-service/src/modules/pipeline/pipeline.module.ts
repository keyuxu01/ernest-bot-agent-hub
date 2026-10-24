import { Module } from '@nestjs/common';
import { ChatModelModule } from '../../infrastructure/chat-model/chat-model.module';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from '../../infrastructure/embedding/embedding.module';
import { Neo4jModule } from '../../infrastructure/neo4j/neo4j.module';
import { RabbitmqModule } from '../../infrastructure/rabbitmq/rabbitmq.module';
import { DocumentModule } from '../document/document.module';
import { ChunkingService } from './chunking.service';
import { DocumentPipelineConsumer } from './document-pipeline.consumer';
import { GraphBuildService } from './graph-build.service';
import { KgExtractionService } from './kg-extraction.service';
import { PipelineOrchestrator } from './pipeline.orchestrator';

/**
 * 发布后 RAG / Search / KG 管线
 *
 * 消费 RabbitMQ 命令，编排分块 / Embedding / 文档快照索引 / KG 建图与删除。
 * KG 依赖 ChatModelModule（LLM 抽取）与 Neo4jModule（图存储）。
 * 不反向依赖 DocumentModule 的 HTTP 入口，只复用其 Repository。
 */
@Module({
  imports: [
    DocumentModule,
    ElasticsearchModule,
    EmbeddingModule,
    ChatModelModule,
    Neo4jModule,
    RabbitmqModule,
  ],
  providers: [
    ChunkingService,
    KgExtractionService,
    GraphBuildService,
    PipelineOrchestrator,
    DocumentPipelineConsumer,
  ],
})
class PipelineModule {}

export { PipelineModule };
