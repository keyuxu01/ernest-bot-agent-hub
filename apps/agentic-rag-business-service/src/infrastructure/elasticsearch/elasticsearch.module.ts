import { SearchIndexService } from './search-index.service';
import { Module } from '@nestjs/common';
import { VectorIndexService } from './vector-index.service';

/** Elasticsearch 向量块与文档关键词索引基础设施 */
@Module({
  providers: [VectorIndexService, SearchIndexService],
  exports: [VectorIndexService, SearchIndexService],
})
class ElasticsearchModule {}

export { ElasticsearchModule };
