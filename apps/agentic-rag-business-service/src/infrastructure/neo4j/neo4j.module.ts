import { Module } from '@nestjs/common';
import { GraphStoreService } from './graph-store.service';

/** Neo4j 知识图谱存储基础设施（KG 建图写入 / 删除） */
@Module({
  providers: [GraphStoreService],
  exports: [GraphStoreService],
})
class Neo4jModule {}

export { Neo4jModule };
