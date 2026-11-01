import { Module } from '@nestjs/common';
import { Neo4jModule } from '../../infrastructure/neo4j/neo4j.module';
import { GraphController } from './graph.controller';

/** 知识图谱只读查询接口（读 Neo4j） */
@Module({
  imports: [Neo4jModule],
  controllers: [GraphController],
})
class GraphModule {}

export { GraphModule };
