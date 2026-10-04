import { Module } from '@nestjs/common';
import { VectorIndexService } from './vector-index.service';

/** Elasticsearch 向量索引基础设施 */
@Module({
  providers: [VectorIndexService],
  exports: [VectorIndexService],
})
class ElasticsearchModule {}

export { ElasticsearchModule };
