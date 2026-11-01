import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '../../infrastructure/elasticsearch/elasticsearch.module';
import { SearchController } from './search.controller';

/** 文档关键词搜索接口（读 ES kh_document） */
@Module({
  imports: [ElasticsearchModule],
  controllers: [SearchController],
})
class SearchModule {}

export { SearchModule };
