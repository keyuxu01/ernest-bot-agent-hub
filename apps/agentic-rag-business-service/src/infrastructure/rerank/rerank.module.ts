import { Module } from '@nestjs/common';
import { RerankerService } from './reranker.service';

/** DashScope 文本重排客户端（RAG 混合检索精排） */
@Module({
  providers: [RerankerService],
  exports: [RerankerService],
})
class RerankModule {}

export { RerankModule };
