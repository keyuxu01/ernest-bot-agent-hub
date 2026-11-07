import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModelModule } from '../../infrastructure/chat-model/chat-model.module';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from '../../infrastructure/embedding/embedding.module';
import { RerankModule } from '../../infrastructure/rerank/rerank.module';
import { AiChatService } from './ai-chat.service';
import { AiController } from './ai.controller';
import { ChatSessionService } from './chat-session.service';
import { AiMessageEntity } from './entities/ai-message.entity';
import { AiSessionEntity } from './entities/ai-session.entity';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import { ChatSessionRepository } from './repository/chat-session.repository';

/** RAG 检索、问答与用户 AI 会话 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiSessionEntity, AiMessageEntity]),
    ElasticsearchModule,
    EmbeddingModule,
    RerankModule,
    ChatModelModule,
  ],
  controllers: [AiController],
  providers: [
    HybridRetrievalService,
    ChatSessionRepository,
    ChatSessionService,
    AiChatService,
  ],
})
class AiModule {}

export { AiModule };
