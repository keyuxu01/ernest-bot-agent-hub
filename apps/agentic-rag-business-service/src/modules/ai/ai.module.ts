import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModelModule } from '../../infrastructure/chat-model/chat-model.module';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { EmbeddingModule } from '../../infrastructure/embedding/embedding.module';
import { RerankModule } from '../../infrastructure/rerank/rerank.module';
import { WebSearchModule } from '../../infrastructure/web-search/web-search.module';
import { Mem0Module } from '../../infrastructure/mem0/mem0.module';
import { AiChatService } from './ai-chat.service';
import { AiStreamService } from './ai-stream.service';
import { AiController } from './ai.controller';
import { ChatSessionService } from './chat-session.service';
import { ChatShortMemoryService } from './chat-short-memory.service';
import { ChatLongMemoryService } from './chat-long-memory.service';
import { ChatQueryRewriteService } from './chat-query-rewrite.service';
import { AiMessageEntity } from './entities/ai-message.entity';
import { AiSessionEntity } from './entities/ai-session.entity';
import { HybridRetrievalService } from './hybrid-retrieval.service';
import { ChatSessionRepository } from './repository/chat-session.repository';

/** RAG 检索、两级对话记忆、查询改写、非流式/流式问答和联网搜索 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiSessionEntity, AiMessageEntity]),
    ElasticsearchModule,
    EmbeddingModule,
    RerankModule,
    ChatModelModule,
    WebSearchModule,
    Mem0Module,
  ],
  controllers: [AiController],
  providers: [
    HybridRetrievalService,
    ChatSessionRepository,
    ChatShortMemoryService,
    ChatLongMemoryService,
    ChatQueryRewriteService,
    ChatSessionService,
    AiChatService,
    AiStreamService,
  ],
})
class AiModule {}

export { AiModule };
