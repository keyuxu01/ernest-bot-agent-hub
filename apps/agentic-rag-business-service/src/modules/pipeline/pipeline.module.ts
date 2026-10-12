import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from '../../infrastructure/embedding/embedding.module';
import { RabbitmqModule } from '../../infrastructure/rabbitmq/rabbitmq.module';
import { DocumentModule } from '../document/document.module';
import { ChunkingService } from './chunking.service';
import { DocumentPipelineConsumer } from './document-pipeline.consumer';
import { PipelineOrchestrator } from './pipeline.orchestrator';

/**
 * 发布后 RAG / Search 管线
 *
 * 消费 RabbitMQ 命令，编排分块 / Embedding / 文档快照索引与删除。
 * 不反向依赖 DocumentModule 的 HTTP 入口，只复用其 Repository。
 */
@Module({
  imports: [
    DocumentModule,
    ElasticsearchModule,
    EmbeddingModule,
    RabbitmqModule,
  ],
  providers: [ChunkingService, PipelineOrchestrator, DocumentPipelineConsumer],
})
class PipelineModule {}

export { PipelineModule };
