import { Module } from '@nestjs/common';
import { ChatModelModule } from '../../infrastructure/chat-model/chat-model.module';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from '../../infrastructure/embedding/embedding.module';
import { RerankModule } from '../../infrastructure/rerank/rerank.module';
import { AiChatService } from './ai-chat.service';
import { AiController } from './ai.controller';
import { HybridRetrievalService } from './hybrid-retrieval.service';

/** RAG 检索与问答：/rag/search、/ai/chat */
@Module({
  imports: [
    ElasticsearchModule,
    EmbeddingModule,
    RerankModule,
    ChatModelModule,
  ],
  controllers: [AiController],
  providers: [HybridRetrievalService, AiChatService],
})
class AiModule {}

export { AiModule };
