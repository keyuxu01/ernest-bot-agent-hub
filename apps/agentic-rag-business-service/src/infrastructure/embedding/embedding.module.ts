import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

/** 通义千问 Embedding 客户端 */
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
class EmbeddingModule {}

export { EmbeddingModule };
