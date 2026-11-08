import { Module } from '@nestjs/common';
import { BochaWebSearchService } from './bocha-web-search.service';

/** 博查公开网页搜索基础设施 */
@Module({
  providers: [BochaWebSearchService],
  exports: [BochaWebSearchService],
})
class WebSearchModule {}

export { WebSearchModule };
